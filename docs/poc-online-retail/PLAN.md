# End-to-end PoC: anomaly detection on Online Retail II

Living, checkable plan. Each block is an atomic commit.

## Stack (identical across dev / stg / prod)

| Piece | Software | Image / version |
|---|---|---|
| S3 storage | Rook-Ceph + CephObjectStore (RGW) | `rook/ceph` `v1.19.5`, `quay.io/ceph/ceph:v19.2.1` |
| REST catalog | Lakekeeper | `quay.io/lakekeeper/catalog:v0.12.0` |
| Compute | Spark on k8s via Spark Operator | `apache/spark:3.5.4-scala2.12-java17-python3-ubuntu`, `kubeflow/spark-operator:2.5.0` |
| Table format | Apache Iceberg | `iceberg-spark-runtime-3.5_2.12:1.5.2` + `iceberg-aws-bundle:1.5.2` |
| Pipeline DAG engine | `pipeline-build-service` (Go) | local image `localhost:5001/pipeline-build-service:dev` |
| Pipeline runner orchestrator | `pipeline-runner` (Go) + `pipeline-runner-spark` (Scala JAR baked-in) | local image |

Difference between environments: replicas/resources/redundancy. Technologies are identical.

---

## Phases

> **Final state**: F1–F7.4 verified end-to-end. F7.5 shipped as the fixture
> [`dashboard-app-definition.json`](../../tools/online-retail/dashboard-app-definition.json)
> because `/api/v1/apps` is not yet implemented. See [README.md](README.md)
> for the operational guide.

### F0 · Platform — `git log a06eadce` ✅
- [x] Reverse the SeaweedFS / Hadoop catalog shortcut
- [x] `infra/dev/ceph-single-node.yaml` (Rook v1.19, Ceph v19.2.1, 1 mon/mgr/RGW)
- [x] `services/pipeline-runner-spark/` (Scala 2.12 + sbt-assembly + Dockerfile)
- [x] `services/pipeline-runner/Dockerfile` extended with `scala-jar` stage
- [x] Spark Operator deployed in `spark-operator` namespace
- [x] Rook-Ceph operator deployed (CSI disabled, not needed)

### F1 · Ceph HEALTH_OK + S3 credentials
- [x] 3 Lima nodes detected → OSD on each via `/dev/loop0` (25G)
- [x] `infra/dev/bootstrap-osd-loopback.sh` (idempotent)
- [ ] `kubectl apply -f infra/dev/ceph-single-node.yaml` → Ready
- [ ] CephObjectStore `openfoundry-store` active (3 OSDs up)
- [ ] OBC `openfoundry-iceberg` Bound → secret `openfoundry-iceberg` with `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
- [ ] S3 smoke: `mc ls` lists the bucket

**Expected output**: secret consumable by Lakekeeper + Spark.

### F2 · Lakekeeper deploy (same prod helm chart, values-dev)
- [ ] `infra/dev/lakekeeper-dev-values.yaml` (1 replica, OIDC stub or disabled, no podDisruptionBudget, no topologySpreadConstraints)
- [ ] Mirror the `openfoundry-iceberg` secret to the `lakekeeper` ns
- [ ] Create `lakekeeper-encryption-key` and `pg-lakekeeper-app` if they don't exist
- [ ] `helm upgrade --install lakekeeper infra/helm/infra/lakekeeper -f infra/dev/lakekeeper-dev-values.yaml`
- [ ] Pod `lakekeeper-catalog-*` Running 1/1
- [ ] `curl http://lakekeeper.lakekeeper.svc:8181/health` 200

### F3 · Bootstrap warehouse in Lakekeeper
- [ ] Create warehouse `openfoundry` pointing to `s3://openfoundry-iceberg/warehouse/` with the OBC creds
- [ ] Create namespace `default` (or `poc`) in the warehouse
- [ ] Smoke: `curl /iceberg/v1/config?warehouse=openfoundry`

### F4 · Build + push `pipeline-runner` image (with JAR)
- [ ] `docker buildx build -f services/pipeline-runner/Dockerfile -t localhost:5001/pipeline-runner:dev`
- [ ] `docker push localhost:5001/pipeline-runner:dev`
- [ ] Smoke: `docker run --rm localhost:5001/pipeline-runner:dev --pipeline-id smoke --run-id smoke --output-dataset x --inline-sql "SELECT 1" --smoke`
- [ ] Verify that `/opt/spark/jars/pipeline-runner-spark.jar` exists in the image

### F5 · Wire `executeDistributedComputeTransform` + k8s client
Files to touch:
- `services/pipeline-build-service/internal/domain/engine/runtime.go` (replace the `transform_runtime_not_wired:distributed` stub)
- `services/pipeline-build-service/internal/handler/...` (k8s client + template render)
- `services/pipeline-build-service/cmd/.../main.go` (k8s client boot if `KUBERNETES_API_URL` or in-cluster)

Sub-tasks:
- [ ] `internal/spark/template.go`: load the YAML template, substitute `${...}` placeholders.
- [ ] `internal/spark/dispatcher.go`: k8s client (Rook-Spark clientset), `Create()` the SparkApplication CR.
- [ ] `internal/spark/watcher.go`: watch the CR until `state in {COMPLETED, FAILED}`, return an error if FAILED.
- [ ] `engine/runtime.go::executeDistributedComputeTransform`: wires dispatcher + watcher, returns `TransformResult`.
- [ ] Boot wiring: if `KUBERNETES_API_URL` or an in-cluster ServiceAccount is present, instantiate the dispatcher; otherwise return `transform_runtime_not_wired:distributed` with a clear message.
- [ ] Test: `go test ./services/pipeline-build-service/internal/domain/engine/...` with a fake dispatcher.

### F6 · E2E engine smoke test
- [ ] Create a pipeline DAG with one node `transform_type: "spark"` and `inline_sql: "SELECT 1 AS one"`
- [ ] `curl POST /api/v1/pipelines/<id>/runs` → SparkApplication CR created
- [ ] `kubectl get sparkapplication -n openfoundry pipeline-run-<id>-<run>` → Running → COMPLETED
- [ ] `curl GET /api/v1/iceberg/v1/namespaces/default/tables/<output>` (via Lakekeeper) → table with 1 row
- [ ] Logs: `kubectl logs <driver pod>` shows the prefix `[pipeline-runner-spark pipeline_id=… run_id=…]`

### F7 · End-to-end Online Retail II PoC

#### F7.1 Ingestion
- [ ] `tools/online-retail/convert.py` — downloads UCI .xlsx, combines sheets 2009-2010 + 2010-2011, normalises types (`InvoiceDate` ISO timestamp, `Quantity` int, `Price` double), writes `online_retail.csv`.
- [ ] `tools/online-retail/ingest.sh` — uploads as dataset `online_retail_raw` via the `/api/v1/datasets` API + presigned upload. Idempotent.
- [ ] `previewDataset` confirms schema and `row_count > 0`.

#### F7.2 Pipeline (4 outputs)
- [ ] Node `transactions_clean` — filter `Quantity > 0 AND Price > 0`, compute `revenue = Quantity * Price`.
- [ ] Node `returns` — filter `Quantity < 0`.
- [ ] Node `customer_metrics` — aggregate `GROUP BY customer_id` with sum(revenue), count(distinct invoice), count(distinct country).
- [ ] Node `transactions_anomalies` — adds `revenue_zscore` (window) and `is_anomaly = ABS(zscore) > 3`. **Full table with the flag**, not just the anomalies.
- [ ] Pipeline persisted + executed via Spark + 4 Iceberg tables populated with rows.

#### F7.3 Ontology + relations
- [ ] `Customer` — backing dataset `customer_metrics`, PK `customer_id`.
- [ ] `Transaction` — backing `transactions_anomalies`, PK = derived column `concat(invoice,'_',stockcode)`.
- [ ] `Product` — backing `distinct(stockcode, description)` (SQL in the pipeline if needed), PK `stockcode`.
- [ ] Editable enum property `review_status` on Transaction (default `pending`).
- [ ] Allow edits ON on Transaction (real backend, no localStorage).
- [ ] LinkType `Customer→Transaction` (FK customer_id), `Transaction→Product` (FK stockcode).
- [ ] Smoke: navigate from a Customer to its Transactions via the link.

#### F7.4 Actions
- [ ] `MarkAsReviewed` (Modify object) → `review_status = 'reviewed'`.
- [ ] `EscalateAnomaly` (Modify object) → `review_status = 'escalated'`.
- [ ] Smoke: execute the action via the API against a row + re-fetch confirms persistence.

#### F7.5 Dashboard (3 pages)
- [ ] Page 1 Overview — KPIs (total tx, total anomalies, %, revenue) + Pie by status + XY anomalies per day.
- [ ] Page 2 Anomalies list — filter list (Order ID, status, date) + Object table over Transaction (filtered `is_anomaly=true`) + Property list for the active object + Button group with `MarkAsReviewed` / `EscalateAnomaly`.
- [ ] Page 3 Customer drilldown — Object table Customer → click → Property list customer + Object table of their Transactions.
- [ ] Smoke: end-to-end click action → toast + table refreshes with new `review_status`.

#### F7.6 README + reproducibility
- [ ] `docs/poc-online-retail/README.md` with: requirements, `make poc-bootstrap` (1 command), screenshots, troubleshooting.
- [ ] `Makefile` target `poc-bootstrap`: runs convert.py + ingest.sh + creates pipeline + ontology + app.
- [ ] Idempotency verified: re-running the bootstrap doesn't break anything.

---

## Key commands (cheatsheet)

```sh
# F1 - bootstrap loopback OSDs
./infra/dev/bootstrap-osd-loopback.sh

# F1 - apply Ceph
kubectl apply -f infra/dev/ceph-single-node.yaml

# F1 - watch Ceph health
watch 'kubectl get cephcluster -n rook-ceph; kubectl get obc -n rook-ceph'

# F4 - build runner image (includes the Scala JAR via the scala-jar stage)
docker buildx build --platform linux/arm64 --builder orbstack \
  -f services/pipeline-runner/Dockerfile \
  -t localhost:5001/pipeline-runner:dev --load .
docker push localhost:5001/pipeline-runner:dev

# F4 - local runner smoke (no Spark, orchestrator only)
docker run --rm localhost:5001/pipeline-runner:dev \
  --pipeline-id smoke --run-id smoke \
  --output-dataset lakekeeper.default.smoke \
  --inline-sql "SELECT 1 AS one" --smoke

# F6 - launch SparkApplication smoke from inside the cluster
kubectl apply -f infra/dev/spark-smoke.yaml
kubectl get sparkapplication -n openfoundry -w
```

## Identified risks (in order of likelihood)

1. **Ceph OSD prepare fails on loopback** (medium) — if the host losetup isn't persistent after reboot, the OSDs are lost. Mitigation: bootstrap script docs.
2. **Lakekeeper requires a valid OIDC** (high) — the upstream chart may not allow disabling it. Mitigation: if it fails, deploy a minimal Keycloak stub or fork the chart.
3. **Iceberg AWS bundle vs Hadoop AWS classpath** (medium) — the first execution usually throws `NoClassDefFoundError`. Mitigation: ship both JARs in `/opt/spark/jars/` and verify compatible versions (Hadoop 3.3.4 / aws-java-sdk 1.12.x).
4. **k8s client in pipeline-build-service** (medium) — needs a ServiceAccount with permission to create SparkApplication CRs in the `openfoundry` ns. Mitigation: the pipeline-build-service helm chart already has sa-account.yaml; verify the Role.
