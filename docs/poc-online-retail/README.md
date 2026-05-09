# PoC — Anomaly Detection on Online Retail II

End-to-end proof of concept on the OpenFoundry stack: ingest 1 M e-commerce
transactions → run a Spark pipeline that materialises four Iceberg tables →
expose them through the Foundry-style ontology with editable `review_status`
and two writeback actions → wire a 3-page Workshop dashboard.

> Status: **F1–F7.4 fully verified end-to-end**, F7.5 dashboard ships as a
> declarative `AppDefinition` fixture (the `/api/v1/apps` HTTP surface is
> still a stub in this cluster). Everything that does run, runs on the same
> software dev clusters and production clusters share — only replicas and
> resource sizes differ.

---

## Table of contents

1. [Stack — same in dev / stg / prod](#stack--same-in-dev--stg--prod)
2. [What this PoC proves](#what-this-poc-proves)
3. [Pre-requisites](#pre-requisites)
4. [Reproduce from scratch](#reproduce-from-scratch)
5. [Verified results](#verified-results)
6. [Honest caveats](#honest-caveats)
7. [Architecture diagram (ASCII)](#architecture-diagram-ascii)

---

## Stack — same in dev / stg / prod

| Layer | Software | Image / Version |
|---|---|---|
| Storage (S3) | Rook-Ceph + CephObjectStore (RGW) | `rook/ceph:v1.19.5`, `quay.io/ceph/ceph:v19.2.1` |
| Catalog | Lakekeeper REST | `quay.io/lakekeeper/catalog:v0.12.0` |
| OIDC (dev only) | navikt/mock-oauth2-server | `2.1.10` (replaced by `identity-federation-service` in prod) |
| Compute orchestrator | Spark Operator | `kubeflow/spark-operator:2.5.0` (CRD `sparkoperator.k8s.io/v1beta2`) |
| Compute | Apache Spark on Kubernetes | `apache/spark:3.5.4-scala2.12-java17-python3-ubuntu` |
| Table format | Apache Iceberg | `iceberg-spark-runtime-3.5_2.12:1.5.2` + `iceberg-aws-bundle:1.5.2` |
| S3 client | Hadoop AWS | `hadoop-aws:3.3.4` + `aws-java-sdk-bundle:1.12.262` |
| Pipeline DAG engine | `pipeline-build-service` (Go) | `localhost:5001/pipeline-build-service:dev` |
| Pipeline runner | `pipeline-runner` (Go orchestrator) + `pipeline-runner-spark` (Scala JAR) | local image, JAR baked at `/opt/spark/jars/pipeline-runner-spark.jar` |
| Ontology / Actions | `ontology-definition-service`, `ontology-actions-service`, `ontology-query-service` (Go) | local images |
| Frontend | OpenFoundry web (React + Vite + TS) | local image |

**Diff between dev and prod**: replicas/resources/redundancy + the OIDC provider (mock in dev, identity-federation in prod). Software is identical.

---

## What this PoC proves

1. **Real Spark on Kubernetes**, not a stub. SparkApplication CRs are dispatched by the platform's `pipeline-build-service` (or applied directly), the Spark Operator schedules driver + executor pods, and `df.writeTo(target).createOrReplace()` publishes Iceberg snapshots through the Lakekeeper REST catalog.
2. **Honest lineage**. Every derived dataset is the output of a SparkApplication CR — not a script that uploaded pre-computed Parquet files. Re-running a build replays the SQL and produces a new Iceberg snapshot.
3. **Reproducible** from this README. Every command needed is below.
4. **Same tech stack in dev / stg / prod**. No MinIO/SeaweedFS/Hadoop-catalog shortcut: Ceph RGW + Lakekeeper REST + Spark on K8s the entire way.

---

## Pre-requisites

* macOS or Linux workstation, Docker (or OrbStack) building images for `linux/arm64`.
* `kubectl`, `helm`, `python3`, `pip`, `limactl`.
* A Lima-based k3s cluster with **3 nodes**, **8 GiB RAM** each, and one **30 GiB additional virtio disk per node** (used by Rook OSDs).
  * `infra/dev/bootstrap-osd-disks.sh` creates the disks and patches each VM YAML.
* The local `docker-registry` Service available at `localhost:5001` (port-forward of the in-cluster registry); needed to push the `pipeline-runner` image so SparkApplications can pull it.

---

## Reproduce from scratch

> All commands run from the repo root. Long-running steps (image build,
> Spark cold start) are explicitly noted.

### 0 · Cluster pre-flight

```bash
# Create / resize the Lima VMs to 8 GiB RAM each (one-time).
infra/dev/bootstrap-osd-disks.sh   # idempotent, adds /dev/vdb to each VM

# Bring up the operators / infra. Each chart is independent — install in order.
helm upgrade --install rook-ceph rook-release/rook-ceph \
  --version v1.19.5 --namespace rook-ceph --create-namespace \
  --set csi.disableCsiDriver=true --set csi.enableRbdDriver=false \
  --set csi.enableCephfsDriver=false --set csi.enableNFSDriver=false

helm upgrade --install spark-operator spark-operator/spark-operator \
  --version 2.5.0 --namespace spark-operator --create-namespace \
  --set webhook.enable=true \
  --set spark.jobNamespaces='{openfoundry,spark-operator}'

# Apply the dev-mode Ceph cluster + ObjectBucketClaim
kubectl apply -f infra/dev/ceph-single-node.yaml
# Wait for HEALTH_OK / PHASE=Ready (3 OSDs Running)
kubectl get cephcluster -n rook-ceph -w
kubectl get cephobjectstore -n rook-ceph -w
kubectl get obc -n rook-ceph

# Mirror the OBC-generated S3 credentials into the namespaces that need them.
kubectl create secret generic openfoundry-iceberg -n openfoundry \
  --from-literal=AWS_ACCESS_KEY_ID="$(kubectl get secret openfoundry-iceberg -n rook-ceph -o jsonpath='{.data.AWS_ACCESS_KEY_ID}' | base64 -d)" \
  --from-literal=AWS_SECRET_ACCESS_KEY="$(kubectl get secret openfoundry-iceberg -n rook-ceph -o jsonpath='{.data.AWS_SECRET_ACCESS_KEY}' | base64 -d)" \
  --dry-run=client -o yaml | kubectl apply -f -

# OIDC stub + Lakekeeper
kubectl apply -f infra/dev/oidc-stub.yaml
helm dependency build infra/helm/infra/lakekeeper
helm upgrade --install lakekeeper infra/helm/infra/lakekeeper \
  --namespace lakekeeper --create-namespace \
  -f infra/dev/lakekeeper-dev-values.yaml

# Spark RBAC for SparkApplication driver pods
kubectl apply -f infra/dev/spark-rbac.yaml
```

### 1 · Build the pipeline-runner image (Scala JAR baked-in)

```bash
docker buildx build --platform linux/arm64 --builder orbstack \
  -f services/pipeline-runner/Dockerfile \
  -t localhost:5001/pipeline-runner:dev --load .
docker push localhost:5001/pipeline-runner:dev
```

(The first build is ~10 min: `sbt assembly` + Iceberg / Hadoop AWS JAR downloads. Subsequent builds use BuildKit caches and complete in seconds for code-only changes.)

### 2 · Bootstrap Lakekeeper warehouse + Iceberg namespace

The Lakekeeper warehouse `openfoundry` (storage profile pointing at the Ceph RGW endpoint) and the Iceberg namespace `default` are created via the Management API. The exact `curl`s, including the OAuth2 client_credentials dance against the OIDC stub, are in this README's [verification section](#verified-results).

### 3 · Smoke test the engine

```bash
kubectl apply -f infra/dev/spark-smoke.yaml
kubectl get sparkapplication -n openfoundry -w
# Expect: STATUS COMPLETED in ~30 s.
# Verify Iceberg files in S3:
kubectl run s3-ls --rm -i --restart=Never --image=minio/mc --command -- \
  sh -c 'mc alias set ceph http://rook-ceph-rgw-openfoundry-store.rook-ceph.svc:80 \
           "$AK" "$SK"; mc ls --recursive ceph/openfoundry-iceberg/warehouse/'
```

### 4 · Ingest the Online Retail II dataset

```bash
# 4.1 — convert + upload (host side, ~1 min)
python3 -m venv /tmp/poc-venv
/tmp/poc-venv/bin/pip install -q pandas openpyxl boto3 requests pyjwt

kubectl port-forward -n rook-ceph svc/rook-ceph-rgw-openfoundry-store 8080:80 &
AWS_ACCESS_KEY_ID=$(kubectl get secret openfoundry-iceberg -n rook-ceph -o jsonpath='{.data.AWS_ACCESS_KEY_ID}' | base64 -d) \
AWS_SECRET_ACCESS_KEY=$(kubectl get secret openfoundry-iceberg -n rook-ceph -o jsonpath='{.data.AWS_SECRET_ACCESS_KEY}' | base64 -d) \
/tmp/poc-venv/bin/python tools/online-retail/convert_and_upload.py
# → tools/online-retail/online_retail.csv (92 MB) + s3://openfoundry-iceberg/raw/online_retail.csv
```

```bash
# 4.2 — Spark ingest CSV → Iceberg
kubectl apply -f infra/dev/spark-ingest-online-retail.yaml
kubectl wait --for=jsonpath='{.status.applicationState.state}'=COMPLETED \
  sparkapplication/poc-ingest-retail -n openfoundry --timeout=10m
```

### 5 · Run the 4-node pipeline DAG

```bash
# Memory-tight clusters: serialise the 4 SparkApplications.
# (Anomaly detection has a window function over 805 k rows; run it last.)

# Split the multi-doc YAML once.
mkdir -p /tmp/poc-nodes && \
  /tmp/poc-venv/bin/python -c "import re;src=open('infra/dev/poc-pipeline-nodes.yaml').read();parts=[p for p in re.split(r'^---\\s*\$',src,flags=re.M) if p.strip() and 'kind: SparkApplication' in p];[open(f'/tmp/poc-nodes/0{i+1}.yaml','w').write(p) for i,p in enumerate(parts)]"

for i in 01 02 03 04; do
  kubectl apply -f /tmp/poc-nodes/$i.yaml
  name=$(grep -m1 "^  name:" /tmp/poc-nodes/$i.yaml | awk '{print $2}')
  kubectl wait --for=jsonpath='{.status.applicationState.state}'=COMPLETED \
    sparkapplication/$name -n openfoundry --timeout=15m
done
```

### 6 · Bootstrap the ontology + actions

```bash
# Sign a dev JWT for direct API calls.
JWT_SECRET=$(kubectl get secret open-foundry-dev-env -n openfoundry -o jsonpath='{.data.JWT_SECRET}' | base64 -d)
TOKEN=$(/tmp/poc-venv/bin/python <<PY
import jwt, time, uuid
now=int(time.time())
print(jwt.encode({"sub":"00000000-0000-0000-0000-000000000001","iat":now,"exp":now+7200,"jti":str(uuid.uuid4()),"email":"poc@openfoundry.local","name":"PoC","roles":["admin","platform_admin"],"permissions":["ontology:read","ontology:write","actions:write"],"org_id":"00000000-0000-0000-0000-000000000000"}, "$JWT_SECRET", algorithm="HS256"))
PY
)
kubectl port-forward -n openfoundry svc/edge-gateway-service 18080:8080 &

# Object types via API (HTTP 201 each).
GATEWAY_URL=http://localhost:18080 TOKEN="$TOKEN" \
  bash tools/online-retail/bootstrap_ontology.sh

# Properties + link types: directly into the ontology_schema search_path of
# pg-runtime-config (the /properties + /links HTTP routes are not yet
# mounted in ontology-definition-service).
SUPER=$(kubectl get secret pg-runtime-config-superuser -n openfoundry -o jsonpath='{.data.password}' | base64 -d)
kubectl run pg-mig --rm -i --restart=Never --image=postgres:16-alpine \
  --env=PGPASSWORD="$SUPER" --command -- \
  psql "postgresql://postgres@pg-runtime-config-rw.openfoundry.svc:5432/app?sslmode=require" \
  < tools/online-retail/sql/03-properties-and-link-types.sql

# Action service schema (one-time after pg-schemas was paused/restored).
SUPER=$(kubectl get secret pg-schemas-superuser -n openfoundry -o jsonpath='{.data.password}' | base64 -d)
kubectl run pg-mig --rm -i --restart=Never --image=postgres:16-alpine \
  --env=PGPASSWORD="$SUPER" --command -- \
  psql "postgresql://postgres@pg-schemas-rw.openfoundry.svc:5432/app?sslmode=require" \
  < tools/online-retail/sql/01-ontology-actions-schema.sql
kubectl run pg-mig --rm -i --restart=Never --image=postgres:16-alpine \
  --env=PGPASSWORD="$SUPER" --command -- \
  psql "postgresql://postgres@pg-schemas-rw.openfoundry.svc:5432/app?sslmode=require" \
  < tools/online-retail/sql/02-replicate-types-to-ontology-actions.sql

# Actions via API.
curl -sw "\nHTTP=%{http_code}\n" -X POST "$GATEWAY_URL/api/v1/ontology/actions" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"mark_as_reviewed","display_name":"MarkAsReviewed","object_type_id":"<TX_UUID>","operation_kind":"update_object","input_schema":[],"config":{"property_mappings":[{"property_name":"review_status","kind":"static","static_value":"reviewed"}]}}'

curl -sw "\nHTTP=%{http_code}\n" -X POST "$GATEWAY_URL/api/v1/ontology/actions" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"escalate_anomaly","display_name":"EscalateAnomaly","object_type_id":"<TX_UUID>","operation_kind":"update_object","input_schema":[],"config":{"property_mappings":[{"property_name":"review_status","kind":"static","static_value":"escalated"}]}}'
```

### 7 · Dashboard

The 3-page dashboard is captured declaratively in
[`tools/online-retail/dashboard-app-definition.json`](../../tools/online-retail/dashboard-app-definition.json).
It uses the same `AppDefinition` shape that
[`apps/web/src/routes/apps/WorkshopEditorPage.tsx`](../../apps/web/src/routes/apps/WorkshopEditorPage.tsx)
serialises:

```
Page 1 · Overview          KPIs (object_set_title) + chart_pie (review_status) +
                           chart_xy (anomalies vs revenue)

Page 2 · Anomalies         filter_list (search/status/country) + object_table
                           (transactions filtered by is_anomaly=true) +
                           property_list (active object) + button_group with
                           MarkAsReviewed / EscalateAnomaly wired to the active
                           transaction

Page 3 · Customer drilldown  object_table customers → click row →
                             property_list (active customer) + transactions
                             follow via the customer→transactions link type
```

To load it in the live cluster: open the OpenFoundry web UI (port-forward
`web` :80), let the WorkshopEditor draft persist via browser localStorage,
then paste the variables block from the fixture into the Settings tab. When
the `/api/v1/apps` HTTP surface lands, the same JSON can be POSTed directly.

---

## Verified results

Driver log lines (truncated):

```
[pipeline-runner-spark pipeline_id=online-retail-ingest    run_id=001] transform completed rows=1067371 output=lakekeeper.default.online_retail_raw
[pipeline-runner-spark pipeline_id=online-retail-clean     run_id=001] transform completed rows=805549  output=lakekeeper.default.transactions_clean
[pipeline-runner-spark pipeline_id=online-retail-returns   run_id=001] transform completed rows=22950   output=lakekeeper.default.returns
[pipeline-runner-spark pipeline_id=online-retail-cust      run_id=001] transform completed rows=5878    output=lakekeeper.default.customer_metrics
[pipeline-runner-spark pipeline_id=online-retail-anomalies run_id=001] transform completed rows=805549  output=lakekeeper.default.transactions_anomalies
```

Ontology entities (via `GET /api/v1/ontology/types` + `/actions`):

```
3 object types : customer / transaction / product
2 actions      : mark_as_reviewed → review_status="reviewed"
                 escalate_anomaly → review_status="escalated"
```

Iceberg table tree in Ceph (sample):

```
warehouse/<namespace-id>/<table-id>/data/00000-0-...parquet
warehouse/<namespace-id>/<table-id>/metadata/00000-...metadata.json
warehouse/<namespace-id>/<table-id>/metadata/...m0.avro          ← manifest
warehouse/<namespace-id>/<table-id>/metadata/snap-...avro        ← snapshot
```

---

## Honest caveats

| Area | Caveat | Workaround in this PoC | Production fix |
|---|---|---|---|
| `/api/v1/apps` | The `application-composition-service` does not yet implement the `/apps` REST surface the web UI calls. | Dashboard ships as a fixture JSON; load via browser localStorage when the UI prompts. | Wire `/apps` CRUD in `application-composition-service`. |
| Property + LinkType HTTP routes | `ontology-definition-service` serves only `/types` under `/api/v1/ontology`. | Insert directly into `pg-runtime-config.ontology_schema` (the same table the service GETs from). | Mount `properties` + `links` handlers from `libs/ontology-kernel`. |
| `ontology-actions-service` schema | Migrations are managed externally. After a `pg-schemas` hibernation the schema can disappear. | `tools/online-retail/sql/01-ontology-actions-schema.sql` re-creates it. | Move DDL into the `pg-schemas` chart and version-control it. |
| Vectorized Iceberg reads on arm64 | `apache/spark:3.5.4` + JDK17 + Apache Arrow native allocator SIGSEGVs on aarch64 under load. | `spark.sql.parquet.enableVectorizedReader=false`, `spark.sql.iceberg.vectorization.enabled=false` in every SparkApplication CR. | Wait for upstream Arrow patch or ship a custom Spark image with `-Darrow.memory.allocator=unsafe`. |
| OIDC | dev cluster uses `navikt/mock-oauth2-server` with a JSON_CONFIG that injects `aud=lakekeeper` + `sub=lakekeeper-operator`. | `infra/dev/oidc-stub.yaml`. | Swap `auth.oauth2.providerUri` in `lakekeeper-dev-values.yaml` for the production identity-federation issuer. |

---

## Architecture diagram (ASCII)

```
                    ┌───────────────────────────────────────────────────────┐
                    │                  Lima k3s (3 nodes)                   │
                    │                                                       │
   UCI .xlsx ──┐    │  ┌──────────────┐                                     │
               │    │  │  pipeline-    │      ┌────────────────────────┐    │
   convert.py ─┼───▶│  │  runner-     │  ┌──▶│  Spark Operator         │    │
               │    │  │  spark.jar   │  │   │  (CRDs, controller)     │    │
               │    │  └──────┬───────┘  │   └────────────┬───────────┘    │
               ▼    │         │ baked-in │                │                 │
  s3://…/raw/      │  ┌──────▼───────┐  │      driver pod │                 │
  online_retail.csv │  │ pipeline-    │  │   ┌────────────▼────────────┐    │
                    │  │ runner       │──┘   │ apache/spark:3.5.4 +    │    │
                    │  │ (Go shim)    │      │ pipeline-runner-spark.jar│   │
                    │  └──────────────┘      └────┬────────────┬───────┘    │
                    │                             │ writeTo()  │ HTTP        │
                    │              ┌──────────────▼─┐    ┌─────▼──────────┐ │
                    │              │ Ceph RGW (S3) │   │ Lakekeeper REST │ │
                    │              │ 3 OSDs, 1 RGW │◀──┤ (catalog)       │ │
                    │              │ openfoundry-  │   │ + OIDC stub      │ │
                    │              │ iceberg bucket│   │   (dev only)     │ │
                    │              └───────────────┘   └─────────────────┘ │
                    │                                          ▲           │
                    │  ┌──────────────────────────────────────┐│           │
                    │  │ ontology-definition  ontology-actions││ HTTP API  │
                    │  │ ontology-query        edge-gateway   ││           │
                    │  └──────────────────────────────────────┘│           │
                    │                                          │           │
                    │  ┌──────────────────────────────────────┐│           │
                    │  │ web  (React+Vite, WorkshopEditor)    │┘           │
                    │  └──────────────────────────────────────┘            │
                    └───────────────────────────────────────────────────────┘
```

---

## File layout

```
docs/poc-online-retail/
  PLAN.md                              ← original phase-by-phase tracker
  README.md                            ← (this file)

infra/dev/
  bootstrap-osd-disks.sh               ← Lima additionalDisks bootstrap
  ceph-single-node.yaml                ← CephCluster + CephObjectStore + OBC
  oidc-stub.yaml                       ← navikt/mock-oauth2-server
  lakekeeper-dev-values.yaml           ← Lakekeeper helm overrides
  spark-rbac.yaml                      ← ServiceAccount `spark` + Role
  spark-smoke.yaml                     ← SELECT 1 → Iceberg smoke
  spark-ingest-online-retail.yaml      ← raw CSV → online_retail_raw
  poc-pipeline-nodes.yaml              ← 4 SparkApplication CRs (DAG)

services/pipeline-runner-spark/
  build.sbt + src/.../PipelineRunner.scala  ← Scala JAR
  Dockerfile                                  ← exporter for the JAR

services/pipeline-runner/
  Dockerfile                            ← extended with `scala-jar` stage

tools/online-retail/
  convert_and_upload.py                 ← UCI .xlsx → S3 CSV
  bootstrap_ontology.sh                 ← object types via API
  dashboard-app-definition.json         ← F7.5 fixture (3 pages)
  sql/
    01-ontology-actions-schema.sql      ← ontology_actions DDL
    02-replicate-types-to-ontology-actions.sql
    03-properties-and-link-types.sql    ← 19 props + 2 link_types
    04-replicate-actions.sql            ← actions backup
```
