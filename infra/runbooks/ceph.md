# Ceph (Rook) Runbook

Date: April 29, 2026

OpenFoundry uses **Ceph RGW** operated by **Rook** as the S3-compatible
backend in production. The `libs/storage-abstraction` layer does not change:
it is simply pointed at a different endpoint. In development, **RustFS** is
used, not MinIO.

Manifests: `infra/k8s/platform/manifests/rook/`
Terraform module: `infra/terraform/modules/ceph/`
Helm prod values: `infra/k8s/helm/profiles/values-prod.yaml`

## 1. Deployed architecture

| Component             | Configuration                                             |
|-----------------------|-----------------------------------------------------------|
| `CephCluster`         | mon=5, mgr=2, `dataDirHostPath=/var/lib/rook`, discovery on |
| `CephObjectStore`     | metadata pool replicated=3, data pool EC 8+3, RGW=3        |
| `StorageClass`        | `ceph-bucket` (provisioner `rook-ceph.ceph.rook.io/bucket`)|
| In-cluster S3 endpoint| `http://rook-ceph-rgw-openfoundry.rook-ceph.svc:80`        |
| Buckets               | `openfoundry-datasets`, `openfoundry-models`, `openfoundry-iceberg` |

## 2. Installation

### 2.1 Via Terraform (recommended)

```hcl
module "ceph" {
  source               = "../../modules/ceph"
  chart_version        = "v1.15.5"
  namespace            = "rook-ceph"
  app_namespace        = "openfoundry"
  create_app_namespace = true
}
```

```bash
cd infra/terraform/<env>
terraform init
terraform validate
terraform apply -target=module.ceph
```

The module:

1. Creates the `rook-ceph` namespace.
2. Installs the official `rook-ceph` chart (repo
   `https://charts.rook.io/release`, see chart_version).
3. Applies `cluster.yaml`, waits for `status.phase=Ready`.
4. Applies `objectstore.yaml` (CephObjectStore + `ceph-bucket` StorageClass).
5. Applies the `ObjectBucketClaim` resources for the three OpenFoundry buckets.

### 2.2 Via kubectl (manual / DR)

```bash
helm repo add rook-release https://charts.rook.io/release
helm repo update
helm upgrade --install --create-namespace -n rook-ceph rook-ceph \
  rook-release/rook-ceph --version v1.15.5 \
  --set crds.enabled=true --set enableDiscoveryDaemon=true

kubectl apply -f infra/k8s/platform/manifests/rook/cluster.yaml
kubectl -n rook-ceph wait --for=jsonpath='{.status.phase}'=Ready \
  cephcluster/openfoundry --timeout=30m

kubectl apply -f infra/k8s/platform/manifests/rook/objectstore.yaml
kubectl -n rook-ceph wait --for=jsonpath='{.status.phase}'=Ready \
  cephobjectstore/openfoundry --timeout=15m

kubectl apply -f infra/k8s/platform/manifests/rook/bucket.yaml
```

### 2.3 Health verification

```bash
# Toolbox pod for talking to the Ceph cluster
kubectl -n rook-ceph exec -it deploy/rook-ceph-tools -- ceph status
kubectl -n rook-ceph exec -it deploy/rook-ceph-tools -- ceph osd tree
kubectl -n rook-ceph exec -it deploy/rook-ceph-tools -- ceph df

# RGW endpoint
kubectl -n rook-ceph get svc rook-ceph-rgw-openfoundry
```

A healthy cluster reports `HEALTH_OK` and `n osds: n up, n in`.

## 3. End-to-end command to create an OBC and obtain credentials

Each `ObjectBucketClaim` (OBC) declares a bucket in the `CephObjectStore`.
When the provisioner binds it, it creates, in the same namespace as the OBC:

- `Secret` `<bucketName>` with keys `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `ConfigMap` `<bucketName>` with `BUCKET_HOST`, `BUCKET_PORT`, `BUCKET_NAME`, `BUCKET_REGION`

End-to-end workflow (example with `openfoundry-datasets`):

```bash
# 1. Create the OBC (idempotent)
kubectl apply -f infra/k8s/platform/manifests/rook/bucket.yaml

# 2. Wait for the bucket to be provisioned
kubectl -n openfoundry wait --for=jsonpath='{.status.phase}'=Bound \
  obc/openfoundry-datasets --timeout=5m

# 3. Retrieve credentials and metadata
ACCESS_KEY=$(kubectl -n openfoundry get secret openfoundry-datasets \
  -o jsonpath='{.data.AWS_ACCESS_KEY_ID}' | base64 -d)
SECRET_KEY=$(kubectl -n openfoundry get secret openfoundry-datasets \
  -o jsonpath='{.data.AWS_SECRET_ACCESS_KEY}' | base64 -d)
BUCKET_HOST=$(kubectl -n openfoundry get cm openfoundry-datasets \
  -o jsonpath='{.data.BUCKET_HOST}')
BUCKET_PORT=$(kubectl -n openfoundry get cm openfoundry-datasets \
  -o jsonpath='{.data.BUCKET_PORT}')
BUCKET_NAME=$(kubectl -n openfoundry get cm openfoundry-datasets \
  -o jsonpath='{.data.BUCKET_NAME}')

echo "endpoint=http://${BUCKET_HOST}:${BUCKET_PORT}"
echo "bucket=${BUCKET_NAME}"
echo "access_key=${ACCESS_KEY}"
echo "secret_key=${SECRET_KEY}"

# 4. S3 smoke test (use awscli or mc pointed at the in-cluster endpoint)
kubectl -n openfoundry run s3-smoke --rm -it --restart=Never \
  --image=amazon/aws-cli --env="AWS_ACCESS_KEY_ID=${ACCESS_KEY}" \
  --env="AWS_SECRET_ACCESS_KEY=${SECRET_KEY}" -- \
  --endpoint-url "http://${BUCKET_HOST}:${BUCKET_PORT}" \
  s3 ls "s3://${BUCKET_NAME}"
```

### Project credentials into `open-foundry-prod-env`

Services consume `OBJECT_STORE_ACCESS_KEY` / `OBJECT_STORE_SECRET_KEY`
from the Secret referenced by `global.existingSecret` (in prod:
`open-foundry-prod-env`). To materialize them from the primary OBC
(`openfoundry-datasets`):

```bash
kubectl -n openfoundry create secret generic open-foundry-prod-env \
  --from-literal=OBJECT_STORE_ENDPOINT=http://rook-ceph-rgw-openfoundry.rook-ceph.svc:80 \
  --from-literal=OBJECT_STORE_ACCESS_KEY="${ACCESS_KEY}" \
  --from-literal=OBJECT_STORE_SECRET_KEY="${SECRET_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f -
```

> The three OBCs share the same CephObjectStore, so the keys of any of
> them are valid to access all three buckets *if* the user has policies
> for the others (by default, each OBC generates a user with permissions
> only on its own bucket). For centralized multi-bucket access, create a
> dedicated RGW user with `radosgw-admin user create` and bind it to the
> secret.

## 4. OSD expansion

### 4.1 Add new disks to existing nodes

1. Insert/attach the disk into the node (it must show up as a raw
   device, with no filesystem).
2. The discovery daemon (`enableDiscoveryDaemon=true`) detects the new
   device in ≤ 60 s.
3. If the device matches the `deviceFilter` in `cluster.yaml` (by
   default `^(sd[b-z]|nvme[0-9]+n[0-9]+)$`), the operator creates a new
   OSD automatically.
4. Verify:

   ```bash
   kubectl -n rook-ceph exec deploy/rook-ceph-tools -- ceph osd tree
   kubectl -n rook-ceph exec deploy/rook-ceph-tools -- ceph status
   ```

5. PG balancing is performed by the `pg_autoscaler` module (already active).

### 4.2 Add new nodes to the cluster

1. Label the node:

   ```bash
   kubectl label node <node> role=storage
   kubectl taint node <node> storage-node=true:NoSchedule  # optional
   ```

   (Matches the `nodeAffinity` and `tolerations` in `cluster.yaml`.)

2. The operator schedules new mons/mgrs/osds as appropriate.
3. To limit which devices to consume, edit `spec.storage` in
   `cluster.yaml` and reapply.

### 4.3 Replace a failed OSD

```bash
# 1. Identify the failed OSD
kubectl -n rook-ceph exec deploy/rook-ceph-tools -- ceph osd tree | grep down

# 2. Mark the OSD as out and purge it
OSD_ID=<id>
kubectl -n rook-ceph exec deploy/rook-ceph-tools -- ceph osd out osd.${OSD_ID}
# Wait for the cluster to recover the PGs
kubectl -n rook-ceph exec deploy/rook-ceph-tools -- ceph status
kubectl -n rook-ceph exec deploy/rook-ceph-tools -- \
  ceph osd purge ${OSD_ID} --yes-i-really-mean-it

# 3. Remove the leftover OSD deployment
kubectl -n rook-ceph delete deploy rook-ceph-osd-${OSD_ID}

# 4. Physically replace the disk; the operator re-provisions the OSD.
```

## 5. Disaster Recovery

### 5.1 Loss of a single node (mon/osd)

- mon=5 tolerates the loss of up to 2 mons without losing quorum.
- EC 8+3 tolerates the loss of up to 3 chunks per PG.
- Actions: replace the node, label it as `role=storage`, wait for the
  operator. No RPO and no intervention on data.

### 5.2 Loss of mon quorum

```bash
# 1. List the surviving mons
kubectl -n rook-ceph get pods -l app=rook-ceph-mon

# 2. Force quorum rebuild from the surviving mon
#    (`rook-ceph mons restore-quorum` procedure in the toolbox)
kubectl -n rook-ceph rollout restart deploy/rook-ceph-operator
# If it persists: follow https://rook.io/docs/rook/latest/Troubleshooting/disaster-recovery/
```

### 5.3 Total loss of the object store (RGW)

The RGW pools are persistent; the RGW pods are stateless.

```bash
kubectl -n rook-ceph delete pod -l app=rook-ceph-rgw
# The operator recreates the 3 instances (gateway.instances=3).
```

### 5.4 Total loss of the Ceph cluster (catastrophic)

1. Restore storage nodes from base images with `/var/lib/rook` intact
   if available. Reapply manifests:

   ```bash
   terraform apply -target=module.ceph
   ```

2. If `/var/lib/rook` is also lost but you have an external S3 backup
   of the buckets (recommended for `openfoundry-datasets`):

   ```bash
   # Reinstall the empty cluster
   terraform apply -target=module.ceph

   # Wait for HEALTH_OK
   kubectl -n rook-ceph exec deploy/rook-ceph-tools -- ceph status

   # Re-hydrate buckets from the external backup (e.g. offsite snapshots)
   aws s3 sync s3://openfoundry-dr-mirror/datasets \
     s3://openfoundry-datasets \
     --endpoint-url http://rook-ceph-rgw-openfoundry.rook-ceph.svc:80
   ```

3. Resume services — the S3 endpoint does not change; the new OBC
   credentials are projected into `open-foundry-prod-env` using the
   procedure in §3.

### 5.5 Recommended backups

- `radosgw-admin metadata list bucket` → export the bucket list every
  hour.
- Daily S3-to-S3 snapshot to an external bucket (another region, another
  provider) for critical data (`openfoundry-datasets`).
- Periodic backup of the `openfoundry-*` Secrets in `openfoundry`
  (they contain the OBC credentials) to an offline vault.

## 6. Cleanup

To destroy the cluster and the data (irreversible!):

```bash
kubectl -n openfoundry delete obc --all
kubectl -n rook-ceph delete cephobjectstore openfoundry
kubectl -n rook-ceph patch cephcluster openfoundry --type=merge \
  -p '{"spec":{"cleanupPolicy":{"confirmation":"yes-really-destroy-data"}}}'
kubectl -n rook-ceph delete cephcluster openfoundry
helm -n rook-ceph uninstall rook-ceph
kubectl delete ns rook-ceph
# Clean /var/lib/rook on each storage node.
```
