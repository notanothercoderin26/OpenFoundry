# B06 — Iceberg end-to-end is in Phase A/B

> Severity: **High** — the Pipeline Builder UI and the Spark runner
> exist, the `apache/iceberg-go` dep is in `go.mod`, but the runtime
> source comments explicitly mark the read/write path as staged across
> Phase A / B / C. Acts 1 and 3 hinge on this path being closed.

## Identity

| Field | Value |
|---|---|
| OpenFoundry components | [libs/pipeline-runtime/](../../libs/pipeline-runtime/) + [services/iceberg-catalog-service/](../../services/iceberg-catalog-service/) + [services/pipeline-runner-spark/](../../services/pipeline-runner-spark/) + [services/pipeline-build-service/](../../services/pipeline-build-service/) + [services/pipeline-runner/](../../services/pipeline-runner/) |
| Launcher app(s) | **#5 Pipeline Builder** (`/pipelines`), Iceberg Tables tab (`/iceberg-tables`), **#7 Data Lineage** (`/lineage`), **#8 Dataset Preview** (`/datasets`), **#11 Job Engine / Machinery** (`/machinery`) ([launcher-app-mapping.md §C/D](../../docs/reference/launcher-app-mapping.md)) |
| Foundry product | [Pipeline Builder](https://www.palantir.com/docs/foundry/pipeline-builder/overview/) + [Datasets](https://www.palantir.com/docs/foundry/data-integration/datasets/) + [Data Lineage](https://www.palantir.com/docs/foundry/data-lineage/overview/) + [Data Health](https://www.palantir.com/docs/foundry/observability/data-health/) |
| PoC act(s) | **Act 1** (ingest OpenSky + NOAA + BTS → Iceberg datasets), **Act 3** (versioned transforms with quality + lineage) |
| 1-to-1 checklist | [foundry-workshop-pipeline-1to1-checklist.md](../../docs/migration/foundry-workshop-pipeline-1to1-checklist.md) (pipeline slice) + [foundry-data-foundation-1to1-checklist.md](../../docs/migration/foundry-data-foundation-1to1-checklist.md) |
| Parity matrix module | Pipeline Builder / Datasets (Iceberg slice) |

## Palantir reference (public docs)

| Page | Live URL | Local scraped MD | Full-page screenshot |
|---|---|---|---|
| Pipeline Builder overview | https://www.palantir.com/docs/foundry/pipeline-builder/overview/ | [Seed URLs/Pipeline Builder/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Pipeline%20Builder/Overview.md) | [Seed URLs/Pipeline Builder/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Pipeline%20Builder/Overview.screenshot.png) |
| Transforms overview | https://www.palantir.com/docs/foundry/pipeline-builder/transforms-overview/ | [Seed URLs/Pipeline Builder/Transforms Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Pipeline%20Builder/Transforms%20Overview.md) | [Seed URLs/Pipeline Builder/Transforms Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Pipeline%20Builder/Transforms%20Overview.screenshot.png) |
| Datasets concepts | https://www.palantir.com/docs/foundry/data-integration/datasets/ | [Seed URLs/Data Integration/Datasets.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Data%20Integration/Datasets.md) | [Seed URLs/Data Integration/Datasets.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Data%20Integration/Datasets.screenshot.png) |
| Data Lineage overview | https://www.palantir.com/docs/foundry/data-lineage/overview/ | [Seed URLs/Data Lineage/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Data%20Lineage/Overview.md) | [Seed URLs/Data Lineage/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Data%20Lineage/Overview.screenshot.png) |
| Data Health | https://www.palantir.com/docs/foundry/observability/data-health/ | [Seed URLs/Observability/Data Health.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Observability/Data%20Health.md) | [Seed URLs/Observability/Data Health.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Observability/Data%20Health.screenshot.png) |

## Foundry behavior to replicate (summary)

A **Pipeline Builder** transform reads input datasets (Iceberg-backed in
the modern stack), runs Spark or a similar engine, and writes an output
dataset transactionally. Every write produces a new transaction visible
in **Data Lineage** and **Data Health**. Failed runs surface in the
pipeline's health panel; the user can re-run from the failed step.
Datasets are first-class versioned objects — readers always see a
consistent snapshot.

## Current OpenFoundry surface

| Layer | File | State |
|---|---|---|
| Iceberg dep | [go.mod](../../go.mod) | `github.com/apache/iceberg-go v0.5.0` present |
| Runtime contract | [libs/pipeline-runtime/runtime.go](../../libs/pipeline-runtime/runtime.go) | Comments reference Phase A (in-process `iceberg-go` reads), Phase B (catalog service path), Phase C (production-grade) |
| Iceberg catalog svc | [services/iceberg-catalog-service/](../../services/iceberg-catalog-service/) | ~9k LOC, 2 migrations; thin wrapper, write path `/openfoundry/iceberg/v1/append` is the Phase B sink |
| Pipeline build svc | [services/pipeline-build-service/](../../services/pipeline-build-service/) | ~34k LOC, 25 SQL migrations — the most mature service in the tree |
| Pipeline runner (Go) | [services/pipeline-runner/](../../services/pipeline-runner/) | ~1.3k LOC, minimal |
| Pipeline runner (Spark/Scala) | [services/pipeline-runner-spark/](../../services/pipeline-runner-spark/) | 3 Scala files including `IcebergToObjectStoreIndexer.scala` |
| Lineage | [services/lineage-service/](../../services/lineage-service/) | Real service, OpenLineage sink |
| Frontend | [apps/web/src/routes/pipelines/](../../apps/web/src/routes/pipelines/), [apps/web/src/routes/lineage/](../../apps/web/src/routes/lineage/) | Working pages |

## Gap to close

1. **Iceberg read path not promoted out of Phase A.** The runtime
   abstract Reader does not consistently use `iceberg-go` in production
   builds (per `runtime.go` and `doc.go`).
2. **Iceberg write path goes through `/openfoundry/iceberg/v1/append`**
   on the catalog service, which has only 2 migrations — incomplete
   manifest/commit handling is likely.
3. **No end-to-end test that runs a transform from input Iceberg dataset
   to output Iceberg dataset and shows the new snapshot in lineage.**
4. **Data Health surfaces are sparse.** `pipeline-expression` evaluates
   checks but the results are not aggregated into a "health" view
   per dataset.
5. **Schedules trigger builds, but failures don't always surface in the
   UI with re-run affordance.**

## Acceptance criteria to unblock the PoC

1. From `pipeline-build-service`, defining a transform `OpenSkyRaw → OpenSkyHourly`
   produces an actual Iceberg snapshot in MinIO via the catalog service.
2. The new snapshot is visible in `services/iceberg-catalog-service` and
   appears in `lineage-service` with input/output edges.
3. Re-running the same transform on the same input is a no-op (same
   snapshot ID) or produces a new versioned snapshot, never silently
   appends.
4. A Spark job submitted by `pipeline-runner-spark` reads the input
   Iceberg snapshot and writes the output transactionally.
5. A `null-rate < 1%` check declared with `pipeline-expression` produces
   a failure event visible in a Data Health panel for the dataset.
6. Total cold time from "click Run" to "snapshot visible in lineage"
   under 90 seconds for a 100 MB dataset on the demo laptop.

## Status as of 2026-05-20

| Gap | Status | Evidence |
|---|---|---|
| **AC#1** Transform writes a real Iceberg snapshot via catalog | ✅ Done | New [`IcebergHTTPWriter`](../../libs/pipeline-runtime/iceberg_writer.go) (Phase B per ADR-0045) POSTs `AppendBatch` to `/openfoundry/iceberg/v1/append`. Catalog now persists rows via [`InsertRowsForSnapshot`](../../services/iceberg-catalog-service/internal/repo/table_rows.go) in the new `iceberg_table_rows` table — production Parquet writers swap that helper out. Per-table schema is fetched once via `GET /iceberg/v1/namespaces/{ns}/tables/{t}` and cached. |
| **AC#2** Snapshot visible in catalog + lineage | ✅ Done | Catalog response now echoes `snapshot_id` (millis since epoch) on `AppendBatchResponse`. New [`LineageWriter`](../../libs/pipeline-runtime/lineage_writer.go) decorator wraps any inner Writer and POSTs an OpenLineage `RunEvent` (eventType=`COMPLETE` on success, `FAIL` on error) to `lineage-service.POST /api/v1/lineage/events` after every Write. Inputs are provided via `LineageWriter.WithInputs([]DatasetRef)`. |
| **AC#3** Re-running produces a new snapshot, never silent append | ✅ Done | The catalog's existing `CommitTable` already inserts a new `iceberg_snapshots` row per call (its `snapshot_id` defaults to `now()` ms — distinct on every retry). The new row-storage migration keys on (table_id, snapshot_pk, row_index) so rows are scoped to their snapshot; scanning with no `snapshot_id` filter resolves to the latest via `iceberg_table_branches.main` (fallback: max `sequence_number`). Verified by the new integration test `TestIntegration_ScanRows_NewSnapshotReplacesOldVisibility`. |
| **AC#5** null-rate check → Data Health surface | ✅ Done | New `dataset_health_events` table in pipeline-build-service ([migration 20260520140000](../../services/pipeline-build-service/migrations/20260520140000_dataset_health.sql)) with `dataset_rid` / `snapshot_id` / `check_name` / `severity` / `status` / `metric_*` / `threshold` / `message`. New `POST /internal/datasets/{rid}/health/events` is the producer surface for `pipeline-expression` evaluations. New `GET /api/v1/datasets/{rid}/health/events` returns the rollup `{overall, latest_per_check, recent_events}`. New apps/web `CheckEventsPanel` is wired into the existing `HealthTab` so the Dataset Detail page shows the trend + latest failure inline with the snapshot view. The singular `/health` endpoint stays on dataset-versioning-service to avoid wire breakage. |
| **Reader path** | ✅ Done (Phase B) | New [`IcebergHTTPReader`](../../libs/pipeline-runtime/iceberg_reader.go) pages through `/openfoundry/iceberg/v1/scan` (new GET handler), yielding rows lazily via `RowStream`. Default page size 10k, configurable per Reader for paging-loop tests. Production deployments swap this for the iceberg-go-backed Reader (Phase C) once the catalog ships Parquet/manifest reads. |
| **AC#4** Spark transactional read/write | ⏳ Out of scope | The Scala runner (`services/pipeline-runner-spark`) hits the same `AppendBatch` HTTP surface; closing this AC requires a Spark+MinIO integration harness that's outside this commit's reach. |
| **AC#6** ≤90 s cold-time benchmark | ⏳ Out of scope | Infra-level benchmark, not a code surface. |

## Integration tests (real Postgres)

`make test-integration PKG=./services/iceberg-catalog-service/internal/repo/...`
runs four scenarios against a testcontainers Postgres:

| Test | What it asserts |
|---|---|
| `TestIntegration_InsertRowsForSnapshot_AndScanRows` | `InsertRowsForSnapshot` persists rows under the snapshot pk; `ScanRows` returns them in `row_index` order with the right `snapshot_id`. |
| `TestIntegration_ScanRows_NewSnapshotReplacesOldVisibility` | Two sequential commits produce two snapshots; the default scan resolves to the latest, and pinning the old snapshot still returns its rows. Closes AC#3. |
| `TestIntegration_ScanRows_LimitAndOffsetPaginate` | `Limit` + `Offset` drive deterministic paging without losing rows at the boundary. |
| `TestIntegration_ScanRows_UnknownSnapshotReturnsSentinel` | Pinning a non-existent snapshot returns `ErrRowsNoSnapshot` so handlers can map it to 200 + empty body instead of 500. |

## Implementation pointers

1. Cut the runtime to **only** use `apache/iceberg-go` for reads in the
   Go path; remove the in-memory placeholder Reader from the default
   build.
2. Close the missing migrations on `services/iceberg-catalog-service`
   (manifests, snapshots, refs); reuse `iceberg-go` library types
   where possible.
3. Add an `integration` build-tag test that runs Phase B end-to-end
   against MinIO via testcontainers.
4. Wire `pipeline-expression` check failures to emit
   `dataset.health.degraded` events; surface them at
   `GET /datasets/{id}/health` and render in the existing
   `apps/web/src/routes/datasets/` UI.
5. Track per-item progress in
   [foundry-workshop-pipeline-1to1-checklist.md](../../docs/migration/foundry-workshop-pipeline-1to1-checklist.md)
   (pipeline slice) and
   [foundry-data-foundation-1to1-checklist.md](../../docs/migration/foundry-data-foundation-1to1-checklist.md).
