# `pipeline-build-service` (Go)

Build / execution side of Pipeline Builder. The Rust crate is the
largest in the workspace (≈36 KLOC of source + 86 integration tests
covering DAG resolution, branch lock acquisition, multi-output
atomicity, log streaming, Spark / Iceberg orchestration). This Go
port now includes the resolver domain and wires the critical
`CreateBuild` / `DryRunResolve` HTTP paths through injectable
JobSpec, dataset-versioning, lock and build-persistence ports while
the executor and external production adapters continue to migrate.

## Port status

| Component | Status |
|---|---|
| Health (`/health`, `/healthz`) + Prometheus (`/metrics`) | ✅ |
| URL grid (every Rust route mounted under `/api/v1`) | ✅ paths + verbs match the Rust router |
| `internal/models` (`Build`, `BuildState`, `AbortPolicy`, `Job`, `JobState`, `Pipeline*`, `PipelineRun`) | ✅ ported 1:1 with the Rust enums + JSON tags |
| `internal/domain/joblifecycle` (Job state machine + `IsValidTransition` + `TransitionJob` + audit-log insert) | ✅ ported 1:1 with the four Rust unit tests |
| `internal/domain/markings` (T3.4 marking propagation SQL + transaction wrapper) | ✅ ported 1:1; idempotency via `ON CONFLICT DO NOTHING` |
| Build resolution domain (`resolve_build`, input validation, branch lock acquisition, fan-out) | ✅ ported under `internal/domain/resolver` |
| HTTP build resolution (`POST /api/v1/builds`) | ✅ wired to resolver through injected ports; returns Rust-compatible `202 Accepted` / `400` resolution failures |
| Dry-run resolution (`POST /api/v1/dry-run/resolve`) | ✅ uses resolver load/cycle/branch-resolution steps without opening build records, output transactions or locks |
| Production repo adapters for JobSpec / dataset-versioning / build persistence | ⏳ pending — handlers return explicit `503` until ports are injected; no silent stubs |
| Build executor (DAG runner, multi-output transactions) | ⏳ pending |
| Iceberg output client (ADR-0041) | ⏳ pending |
| SparkApplication / kube-rs CR submission (FASE 3 / Tarea 3.4) | ✅ CR rendering/submission surface ported; returns 503 when kube client is unavailable |
| SSE log streaming | ✅ live history/follow stream wired via injected log service |

The endpoint shape is identical to the Rust crate so dashboards,
clients and the Spark CR template can talk to either binary. Resolver-backed
handlers no longer return `501`; remaining unported surfaces still respond
with `501 Not Implemented` carrying a machine-parseable detail field.

## Build & run

```sh
go build -o bin/pipeline-build-service ./services/pipeline-build-service/cmd/pipeline-build-service
go test ./services/pipeline-build-service/...
```

## Configuration

| Variable | Default |
|---|---|
| `HOST` | `0.0.0.0` |
| `PORT` | `50081` |
| `JWT_SECRET` | (required) |
| `DATABASE_URL` | unset (production build repositories still need explicit adapter wiring) |
| `DATA_DIR` | `/var/lib/openfoundry/pipeline-build` |
| `DATASET_SERVICE_URL` | `http://localhost:50079` |
| `WORKFLOW_SERVICE_URL` | `http://localhost:50080` |
| `AI_SERVICE_URL` | `http://localhost:50127` |
| `STORAGE_BACKEND` | `local` |
| `STORAGE_BUCKET` | unset |
| `S3_*` | unset |
| `LOCAL_STORAGE_ROOT` | unset |
| `DISTRIBUTED_PIPELINE_WORKERS` | `4` |
| `DISTRIBUTED_COMPUTE_POLL_INTERVAL_MS` | `1000` |
| `DISTRIBUTED_COMPUTE_TIMEOUT_SECS` | `1800` |
| `SPARK_NAMESPACE` | `openfoundry-spark` |
| `PIPELINE_RUNNER_IMAGE` | `openfoundry/pipeline-runner:dev` |
| `FOUNDRY_ICEBERG_CATALOG_URL` | unset (boot-time warn matches Rust) |
| `FOUNDRY_ICEBERG_CATALOG_BEARER` | unset |
