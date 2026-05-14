# Apache Flink Kubernetes Operator Runbook

Date: April 29, 2026

OpenFoundry uses the [**Apache Flink Kubernetes Operator**][fko] (Apache-2.0,
a top-level ASF project) to run streaming Flink jobs on the cluster. The
operator is responsible for reconciling `FlinkDeployment` /
`FlinkSessionJob` in `mode: native`, handling HA, periodic savepoints, and
upgrades without state loss.

Manifests: `infra/k8s/platform/manifests/flink/`
Helm values: `infra/k8s/platform/manifests/flink/values.yaml`
Example: `infra/k8s/platform/manifests/flink/flinkdeployment-cdc-iceberg.yaml`
State backend: bucket `openfoundry-iceberg` on Ceph RGW (see
[`infra/runbooks/ceph.md`](./ceph.md))

[fko]: https://nightlies.apache.org/flink/flink-kubernetes-operator-docs-release-1.10/

## 0. Supported versions

| Component                    | Version           | Notes                                    |
|------------------------------|-------------------|------------------------------------------|
| flink-kubernetes-operator    | `1.10.0`          | Apache-2.0, released 2024-11-19          |
| Flink runtime                | `v1_19` (default) | operator 1.10 supports `v1_16..v1_20`    |
| Kubernetes                   | `>= 1.27`         | requires `cert-manager` for the webhook  |
| cert-manager                 | `>= v1.13`        | prior install, *cluster-wide*            |

> **Verify the current version** before upgrading:
>
> ```bash
> helm repo add flink-operator-repo \
>   https://downloads.apache.org/flink/flink-kubernetes-operator-1.10.0/
> helm repo update
> helm search repo flink-operator-repo --versions | head
> ```

## 1. Deployed architecture

| Component             | Configuration                                                      |
|-----------------------|--------------------------------------------------------------------|
| Operator              | 2 replicas, leader election, watched namespaces: `flink`, `openfoundry` |
| Webhook               | 2 replicas, certificates issued by cert-manager                    |
| `FlinkDeployment`     | `mode: native`, `flinkVersion: v1_19`, JM=2, TM on demand          |
| State / HA            | `high-availability.type: kubernetes` + `s3://openfoundry-iceberg/flink/ha/<job>` |
| Checkpoints           | RocksDB incremental → `s3://openfoundry-iceberg/flink/checkpoints/<job>` |
| Savepoints            | `s3://openfoundry-iceberg/flink/savepoints/<job>`, periodic every 6h |
| Metrics               | Prometheus reporter on `:9249` (scraped via `PodMonitor`)          |

## 2. Prerequisites

1. **cert-manager** installed on the cluster (the operator chart deploys
   a `Certificate` for the webhook):

   ```bash
   helm repo add jetstack https://charts.jetstack.io
   helm upgrade --install cert-manager jetstack/cert-manager \
     -n cert-manager --create-namespace \
     --version v1.16.1 --set crds.enabled=true
   ```

2. **Ceph RGW** available and bucket `openfoundry-iceberg` provisioned via
   an OBC (see `infra/runbooks/ceph.md` §3).

3. Namespace `flink`:

   ```bash
   kubectl apply -f infra/k8s/platform/manifests/flink/namespace.yaml
   ```

## 3. S3 (Ceph) credentials for the Flink pods

Flink pods consume `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from the
`flink-s3-credentials` Secret (referenced by `envFrom` in the example). It
is materialized from the `openfoundry-iceberg` OBC:

```bash
ACCESS_KEY=$(kubectl -n openfoundry get secret openfoundry-iceberg \
  -o jsonpath='{.data.AWS_ACCESS_KEY_ID}' | base64 -d)
SECRET_KEY=$(kubectl -n openfoundry get secret openfoundry-iceberg \
  -o jsonpath='{.data.AWS_SECRET_ACCESS_KEY}' | base64 -d)

kubectl -n flink create secret generic flink-s3-credentials \
  --from-literal=AWS_ACCESS_KEY_ID="${ACCESS_KEY}" \
  --from-literal=AWS_SECRET_ACCESS_KEY="${SECRET_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f -
```

> Repeat the procedure in every namespace where you deploy a
> `FlinkDeployment` (including `openfoundry`).

## 4. Operator installation

```bash
# 1. Official Apache repo (Apache-2.0)
helm repo add flink-operator-repo \
  https://downloads.apache.org/flink/flink-kubernetes-operator-1.10.0/
helm repo update

# 2. Local render for validation
helm template flink-kubernetes-operator \
  flink-operator-repo/flink-kubernetes-operator \
  --version 1.10.0 \
  -n flink \
  -f infra/k8s/platform/manifests/flink/values.yaml > /tmp/flink-operator.rendered.yaml

# 3. Install / upgrade
helm upgrade --install --create-namespace -n flink flink-kubernetes-operator \
  flink-operator-repo/flink-kubernetes-operator \
  --version 1.10.0 \
  -f infra/k8s/platform/manifests/flink/values.yaml

# 4. Wait for the operator and webhook to be Ready
kubectl -n flink rollout status deploy/flink-kubernetes-operator --timeout=5m
kubectl -n flink get pods -l app.kubernetes.io/name=flink-kubernetes-operator
```

## 5. Deploy the CDC → Iceberg example

```bash
# Pre-validation (no cluster changes)
kubectl apply --dry-run=client -f infra/k8s/platform/manifests/flink/flinkdeployment-cdc-iceberg.yaml
kubectl apply --dry-run=server  -f infra/k8s/platform/manifests/flink/flinkdeployment-cdc-iceberg.yaml

# Apply
kubectl apply -f infra/k8s/platform/manifests/flink/flinkdeployment-cdc-iceberg.yaml

# Observe the lifecycle
kubectl -n flink get flinkdeployment cdc-iceberg -w
kubectl -n flink describe flinkdeployment cdc-iceberg
kubectl -n flink logs deploy/cdc-iceberg -c flink-main-container --tail=200
```

Expected `status` output:

```text
jobManagerDeploymentStatus: READY
jobStatus.state: RUNNING
lifecycleState: STABLE
```

## 6. Day-to-day operations

### 6.1 Force a savepoint

```bash
kubectl -n flink patch flinkdeployment cdc-iceberg --type=merge \
  -p '{"spec":{"job":{"savepointTriggerNonce":'"$(date +%s)"'}}}'

# Verify retained savepoints
kubectl -n flink get flinkdeployment cdc-iceberg \
  -o jsonpath='{.status.jobStatus.savepointInfo}' | jq .
```

### 6.2 Upgrade (image / config change) without state loss

`upgradeMode: savepoint` (configured in the example) makes the operator:

1. trigger a final savepoint,
2. stop the job,
3. relaunch the new version from that savepoint.

```bash
# Edit the image
kubectl -n flink patch flinkdeployment cdc-iceberg --type=merge \
  -p '{"spec":{"image":"ghcr.io/unnamedlab/openfoundry/flink-cdc-iceberg:1.19.1-0.1.1"}}'

kubectl -n flink get flinkdeployment cdc-iceberg -w
```

### 6.3 Suspend / resume a job

```bash
# Suspend (triggers savepoint, keeps the CR)
kubectl -n flink patch flinkdeployment cdc-iceberg --type=merge \
  -p '{"spec":{"job":{"state":"suspended"}}}'

# Resume from the last savepoint
kubectl -n flink patch flinkdeployment cdc-iceberg --type=merge \
  -p '{"spec":{"job":{"state":"running"}}}'
```

### 6.4 Restore from a specific savepoint (rollback)

```bash
SP="s3://openfoundry-iceberg/flink/savepoints/cdc-iceberg/savepoint-xxx"

kubectl -n flink patch flinkdeployment cdc-iceberg --type=merge \
  -p '{"spec":{"job":{"initialSavepointPath":"'"${SP}"'","upgradeMode":"savepoint","state":"running"}}}'
```

## 7. Disaster Recovery

### 7.1 Loss of the active JobManager

JM=2 with Kubernetes HA: the standby takes over leadership within seconds
and no state is lost. No manual action required.

### 7.2 Total loss of the `flink` namespace

1. Reinstall the operator (§4) and re-apply the `FlinkDeployment` (§5).
2. The operator will detect the `high-availability.storageDir` on S3 and
   rebuild the job from the latest checkpoint.
3. If the HA `ConfigMap` was purged but the S3 bucket is still intact,
   you can force the start from the last savepoint using
   `spec.job.initialSavepointPath` (§6.4).

### 7.3 Loss of the `openfoundry-iceberg` bucket

With no state in S3 there is no possible recovery. First restore the data
from the external mirror (see `infra/runbooks/ceph.md` §5.4), then follow
§7.2.

### 7.4 Loss of the operator (CRDs intact)

```bash
# Reinstall (idempotent)
helm upgrade --install -n flink flink-kubernetes-operator \
  flink-operator-repo/flink-kubernetes-operator \
  --version 1.10.0 -f infra/k8s/platform/manifests/flink/values.yaml
```

The existing `FlinkDeployment` resources are reconciled on the first
cycle (60s).

## 8. Operator upgrades

1. Review the [release notes][rel].
2. Pre-flight with dry-run:

   ```bash
   helm repo update
   helm upgrade --install -n flink flink-kubernetes-operator \
     flink-operator-repo/flink-kubernetes-operator \
     --version <NEW> -f infra/k8s/platform/manifests/flink/values.yaml --dry-run
   ```

3. Apply new CRDs (Helm does not update them automatically):

   ```bash
   helm pull flink-operator-repo/flink-kubernetes-operator \
     --version <NEW> --untar -d /tmp
   kubectl apply -f /tmp/flink-kubernetes-operator/crds/
   ```

4. `helm upgrade ...` without `--dry-run`.
5. Verify reconciliation of a test `FlinkDeployment`.

[rel]: https://github.com/apache/flink-kubernetes-operator/releases

## 9. Cleanup

```bash
# Deletes the job and triggers a final savepoint (upgradeMode: savepoint)
kubectl -n flink delete flinkdeployment cdc-iceberg

# Uninstall operator
helm -n flink uninstall flink-kubernetes-operator

# CRDs (deletes ALL FlinkDeployment resources in the cluster!)
kubectl delete crd flinkdeployments.flink.apache.org \
                   flinksessionjobs.flink.apache.org

kubectl delete ns flink
```

## 10. Manifest validation (CI)

Both commands are part of the PR check (`infra/k8s/platform/manifests/flink/` modified):

```bash
# Chart render with our values
helm template flink-kubernetes-operator \
  flink-operator-repo/flink-kubernetes-operator \
  --version 1.10.0 -n flink -f infra/k8s/platform/manifests/flink/values.yaml > /dev/null

# Validation of the static manifests
kubectl apply --dry-run=client -f infra/k8s/platform/manifests/flink/namespace.yaml
kubectl apply --dry-run=client -f infra/k8s/platform/manifests/flink/flinkdeployment-cdc-iceberg.yaml
```
