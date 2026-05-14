# CLAUDE.md — services/pipeline-build-service

Pipeline authoring, build orchestration, dataset commits, and the
Spark/Iceberg execution plane. **The biggest single service in the
repo (~21k LOC).**

## Where to look first

| Concern | Open this |
|---|---|
| HTTP routes / handlers | `internal/handler/handlers.go` (1346 LOC — index by `grep -n 'func '`) |
| Build lifecycle (queue, run, cancel, retry) | `internal/handler/execution.go` (1375 LOC) |
| Schema validation + dry-run resolve | `internal/handler/schema_validation.go` (1508 LOC) |
| Lightweight (local) runtime | `internal/handler/lightweight_runtime.go` (1247 LOC) |
| Pipeline authoring CRUD (drafts, branches, publish) | `internal/handler/handlers.go` + `internal/postgres/pipelines.go` |
| Spark dispatcher (SparkApplication CRs) | `internal/spark/spark.go` |
| Run/job/log persistence | `internal/postgres/repository.go` (1097 LOC) |
| Per-kind job runners (SYNC/TRANSFORM/HEALTH_CHECK/ANALYTICAL/EXPORT) | `internal/domain/runners/runners.go` |
| DAG topological sort + execution stages | `internal/domain/engine/dag.go` |
| Pipeline orchestrator (`ExecutePipeline`) | `internal/domain/engine/engine.go` |
| Iceberg output commits | `internal/handler/ontology_object_output_committer.go` (830 LOC) |
| Live logs (SSE / WS) | `internal/logs/` |
| Lineage emission | `internal/domain/lineage/lineage.go` |
| Transform catalog (reusable UDFs, expression library) | `internal/handler/transform_catalog.go` |
| Wire types | `internal/models/` |
| Router wiring | `internal/server/` |

## Files to handle with care (size warning)

These exceed any reasonable attention window — navigate by `grep -n`:

| File | Lines |
|---|---:|
| `internal/handler/schema_validation.go` | 1508 |
| `internal/handler/execution.go` | 1375 |
| `internal/handler/handlers.go` | 1346 |
| `internal/handler/lightweight_runtime.go` | 1247 |
| `internal/postgres/repository.go` | 1097 |
| `internal/handler/ontology_object_output_committer.go` | 830 |
| `internal/domain/lineage/lineage.go` | 745 |
| `internal/domain/runners/runners.go` | 729 |

## Architecture

- **Two execution paths** coexist:
  - **Distributed** (`pipeline_type=DISTRIBUTED`) — Spark Operator
    submits a `SparkApplication` CR, image is `pipeline-runner` (Scala).
  - **Lightweight / FASTER** (`pipeline_type=FASTER`) — local table
    runtime via `pipeline-expression`. No DuckDB, no DataFusion.
- **Authoring lifecycle**: `draft_dag` → `published_dag` per branch;
  builds prefer published when present. State lives in
  `pg-pipeline.pipeline_authoring`.
- **Build state machine**: `queued` → `running` → `succeeded` |
  `failed` | `cancelled`. See `internal/handler/execution.go`.
- **Output kinds**: Dataset (non-Iceberg POST to dataset-versioning),
  Iceberg (config-gated by `FOUNDRY_ICEBERG_CATALOG_URL`), Object
  outputs (ontology-definition object types + object-database).

## Conventions

- **Sentinel errors** in `internal/postgres/` map to HTTP statuses in
  handlers. Don't return raw repo errors.
- **Idempotency**: `POST /pipelines/{id}/builds` should accept
  `Idempotency-Key`; deterministic event IDs collapse retries via
  `libs/idempotency`.
- **Outbox + Debezium** is the only sanctioned event-emission path
  for `pipeline.build.*` topics — see [ADR-0022](../../docs/architecture/adr/ADR-0022-transactional-outbox-postgres-debezium.md)
  and [foundry-pattern-orchestration.md](../../docs/architecture/foundry-pattern-orchestration.md).
- **Spark runs are persisted** in `pipeline_run_submissions`
  (config-gated on `DATABASE_URL`).

## Testing

```sh
go test ./services/pipeline-build-service/...
go test -tags integration ./services/pipeline-build-service/...   # needs Docker
```

Use `go run ./tools/route-audit --services pipeline-build-service`
to regenerate the handler-classification snapshot before claiming a
status change in the README.

## Don't

- Don't add a new pipeline node type without updating the DAG validator
  + the runtime dispatch in `runners/runners.go`.
- Don't bypass the build state machine — every transition must go
  through `execution.go`.
- Don't introduce a third execution path; pick `DISTRIBUTED` (Spark)
  or `FASTER` (lightweight) and add the node-type to the existing dispatcher.
- Don't write to Iceberg directly; route through the Iceberg catalog
  service per [ADR-0041](../../docs/architecture/adr/ADR-0041-iceberg-catalog-service-foundry-flavoured.md).
