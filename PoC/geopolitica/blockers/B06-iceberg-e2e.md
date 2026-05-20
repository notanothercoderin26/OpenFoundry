# B06 — Iceberg end-to-end — `/append` idempotency + dual-catalog clarification (geopolitics)

> **Geopolitics PoC scope** of the platform B06. The aviation
> [`../../aviacion/blockers/B06-iceberg-e2e.md`](../../aviacion/blockers/B06-iceberg-e2e.md)
> lists five gaps; this file documents the smaller geopolitics-specific
> delta and resolves the one that visibly breaks Acts 1 and 3 on
> stage: a presenter clicking "Run" twice on the same Pipeline Builder
> transform produces two distinct snapshots with identical content.
>
> Severity: **High** — the Iceberg write path is metadata-only today
> (the `/append` HTTP adapter records snapshots in Postgres but does
> NOT write Parquet to MinIO; the `manifest-list` path it stores is a
> fabricated string under `{table.Location}/metadata/openfoundry-
> append-<ts>.avro`). Real Parquet writes + the dual-catalog
> reconciliation are deferred to Phase 2 (§Deferred); what this
> phase closes is the demo-visible "two clicks = two snapshots"
> regression and the absence of any client-supplied dedup key.
>
> Tracked at **~55%** after this phase: idempotency contract closed
> end-to-end (migration + repo + handler + tests + doc). Real
> Parquet writes to MinIO via arrow-go / parquet-go and the
> `iceberg-catalog-service` ↔ Lakekeeper reconciliation remain.

## Identity

| Field | Value |
|---|---|
| OpenFoundry components | [`services/iceberg-catalog-service/`](../../../services/iceberg-catalog-service/) (the Go HTTP catalog + `/openfoundry/iceberg/v1/append` write path) + [`services/pipeline-build-service/`](../../../services/pipeline-build-service/) + [`services/pipeline-runner-spark/`](../../../services/pipeline-runner-spark/) + [`services/lineage-service/`](../../../services/lineage-service/) |
| Launcher app(s) | **#5 Pipeline Builder** (`/pipelines`), **#7 Data Lineage** (`/lineage`), **#8 Dataset Preview** (`/datasets`), Iceberg Tables tab (`/iceberg-tables`). |
| Foundry product | [Pipeline Builder](https://www.palantir.com/docs/foundry/pipeline-builder/overview/) + [Datasets](https://www.palantir.com/docs/foundry/data-integration/datasets/) (transactional snapshot semantics) + [Data Health](https://www.palantir.com/docs/foundry/observability/data-health/). |
| PoC act(s) | **Act 1** — *ingest GDELT 2.0 / ACLED / OFAC / EU sanctions / OpenSanctions / Wikidata into Iceberg datasets* ([`../03-datasets-y-fuentes-de-datos.md`](../03-datasets-y-fuentes-de-datos.md), [`../06-pipelines-y-transformaciones.md`](../06-pipelines-y-transformaciones.md)); **Act 3** — *bronze→silver→gold with entity resolution + lineage + Data Health (precision ≥ 0.95, recall ≥ 0.90)*. |
| Streaming guarantee | [`../06-pipelines-y-transformaciones.md` §Streaming details](../06-pipelines-y-transformaciones.md): "GDELT drop → visible dot on map < 10 min" — every 15-min batch must be a *distinct* Iceberg snapshot, not a duplicate of the last one. |

## Geopolitics-specific scope

The geopolitics PoC ingests 6 source datasets into Iceberg-backed bronze
tables (`raw.gdelt.events`, `raw.acled`, `raw.ofac_sdn`,
`raw.eu_sanctions`, `raw.opensanctions`, `raw.wikidata.persons`) and
fans them out through 7 silver / gold transforms (event normalisation,
entity resolution, actor-gold, event-gold, country-gold, sanctions
aggregator, link.sanctioned_by). Every transform's "Run" button ends
in `POST /openfoundry/iceberg/v1/append` against the OpenFoundry Go
catalog. The 15-minute GDELT stream is the most retry-prone path: the
upstream HTTP fetcher can deliver the same window twice on transient
errors.

The two demo-visible failure modes:

| Failure | Cause | Visibility |
|---|---|---|
| Two snapshots with the same content | `appendCommitRequest` derives `snapshot_id` from `time.Now().UnixMilli()`. No client-supplied dedup key. Two retries 1 s apart yield two distinct IDs. | Iceberg Tables UI shows duplicate "appended N records" entries; `Data Health` row-count check fires "10× spike" against the rolling median. |
| Manifest path is fabricated | The handler stores `{table.Location}/metadata/openfoundry-append-<ts>.avro` as `manifest-list` but does NOT write the Avro file or any Parquet under `{table.Location}/data/`. | Lineage shows a "snapshot" with no real files behind it; Spark on the other catalog can't read the data; the "downloadable dataset" claim breaks. |

This phase closes the first failure mode (idempotency) so the demo
script's "click Run" beat is safe. The second failure mode (real
Parquet writes) is documented in §Deferred and tracked as B06 Phase 2.

## Gap to close in this phase

| # | Gap | Status after this phase |
|---|---|---|
| 1 | `POST /openfoundry/iceberg/v1/append` has no idempotency key — two submissions = two snapshots regardless of content | ✅ Resolved: the handler now reads `Idempotency-Key: <client-supplied>` (≤ 200 chars). When the upcast `AppendIdempotencyStore` is wired (production Repo) and the key has been seen before:<br>• same key + same body → **HTTP 200** with the prior `metadata_location` (no second `CommitTable` call);<br>• same key + different body → **HTTP 409 Conflict** with `"Idempotency-Key was used with a different request body"`;<br>• missing key → legacy "always commit" preserved so existing audit-sink / ai-sink callers keep working. |
| 2 | Body hashing for replay detection | ✅ Resolved: SHA-256 over the raw request bytes — the same canonical-form contract callers already use for Stripe-style idempotency. Constant-time hash comparison. |
| 3 | Concurrent submission race | ✅ Resolved: `RecordAppendIdempotency` traps Postgres `23505` (unique_violation) into `ErrAppendIdempotencyRace`. The handler re-`Lookup`s and folds the winner into the same replay / conflict semantics so a tied submission gets one stable answer per key. Covered by `TestAppendBatch_IdempotencyRaceFoldsBackToReplay`. |
| 4 | Body-size cap | ✅ Resolved: 8 MiB `http.MaxBytesReader` on the request body. Bigger batches must page; the existing 4×1024-event GDELT 15-min window fits comfortably (each row is ~1 KiB). |
| 5 | No tests / contract docs | ✅ Resolved: five new unit tests in `append_idempotency_test.go` covering replay, conflict, missing-header legacy path, key-too-long, and race resolution. Migration carries the spec inline (`UNIQUE(idempotency_key, table_id)`). |
| 6 | Pre-existing tests had to keep passing without opt-in | ✅ Resolved: the upcast is *optional*. The `fakeAppendStore` in `append_test.go` does NOT implement `AppendIdempotencyStore`, so all five legacy tests continue to exercise the unconditional-commit path. Verified locally: `go test ./services/iceberg-catalog-service/... -run TestAppendBatch` is green pre + post. |

## Deferred (out of scope of this phase — own follow-ups)

| # | Deferred gap | Owner / rationale |
|---|---|---|
| D1 | **Real Parquet writes to MinIO.** The `manifest-list` path is fabricated; no Arrow/Parquet file is written under `{table.Location}/data/`. arrow-go (v18) and aws-sdk-go-v2/service/s3 are both in `go.mod` and `connector-management-service/internal/drivers/s3/driver.go` already has a working S3 client to mirror. The work: convert `[]map[string]any` rows → arrow Table → Parquet bytes → `PutObject` to `{warehouse-bucket}/{table.Location}/data/<snapshot_id>.parquet`, then point the manifest avro at the real path. **Estimated 500-700 LOC + a testcontainers-MinIO integration test.** Tracked as **B06 Phase 2**. |
| D2 | **Dual-catalog story.** `audit-sink` and `ai-sink` use catalog name `"lakekeeper"` (`services/audit-sink/internal/writer/iceberg.go:18`) but call `iceberg-catalog-service`. Spark pipelines (`pipeline-runner-spark/`) talk directly to a deployed Lakekeeper. The two backends are not joined — a Spark commit doesn't appear in `iceberg-catalog-service.iceberg_snapshots`, and vice versa. The reconciliation requires either (a) Lakekeeper-Postgres = `iceberg-catalog-service`-Postgres (single warehouse), or (b) iceberg-catalog-service shimming all reads/writes through Lakekeeper. **Tracked as B06 Phase 3.** |
| D3 | **`null-rate < 1%` Data Health check surfacing.** `pipeline-expression` evaluates the predicate; today the result is not aggregated into a per-dataset health view. The `[`../06-pipelines-y-transformaciones.md` §Data Health checks](../06-pipelines-y-transformaciones.md)` doc lists the three checks (freshness, row-count delta, schema-pin); none roll up to `GET /api/v1/datasets/{id}/health`. **Tracked as B06 Phase 4.** |
| D4 | **Janitor for `iceberg_append_idempotency`.** Rows are retained indefinitely. A daily delete of rows older than N days (90 by default, configurable via env) keeps the table from growing without bound. Trivial follow-up. |

## Acceptance criteria for the geopolitics PoC

1. `POST /openfoundry/iceberg/v1/append` with `Idempotency-Key: gdelt-2026-05-20T16:45Z` and a fixed body produces exactly one snapshot row regardless of how many times the client retries the call. *(Covered by `TestAppendBatch_IdempotencyReplayReturnsPriorSnapshot`.)*
2. The same key against a *different* body (e.g. a malformed retry that mutates rows) returns HTTP 409 — the client is told the key is poisoned for that intent, never silently coalesces a different payload. *(Covered by `TestAppendBatch_IdempotencyMismatchReturnsConflict`.)*
3. Pre-existing callers (audit-sink, ai-sink) that don't send `Idempotency-Key` are unaffected — every call still commits. *(Covered by `TestAppendBatch_NoIdempotencyHeaderKeepsLegacyBehaviour` and the five pre-existing `TestAppendBatch*` cases.)*
4. A pair of concurrent submissions for the same key resolves to one canonical answer; the loser of the unique-key race surfaces the winner's snapshot, not its own orphan. *(Covered by `TestAppendBatch_IdempotencyRaceFoldsBackToReplay`.)*
5. *(Deferred → D1.)* The `manifest-list` URL points at a Parquet file that actually exists in MinIO.
6. *(Deferred → D3.)* A `null-rate < 1%` check failure on `raw.gdelt.events` surfaces in the dataset health view.

## Verification commands

```sh
go build ./services/iceberg-catalog-service/...
go test  ./services/iceberg-catalog-service/...
go test  ./services/iceberg-catalog-service/internal/handlers/... -run TestAppendBatch -v
```

All three are green on `main` of this branch.

## Cross-references

- **B06 Phase 2** — real Parquet writes to MinIO (arrow-go + parquet-go + aws-sdk-go-v2/s3 PutObject; new integration test under `//go:build integration`).
- **B06 Phase 3** — single canonical catalog (Lakekeeper ⇄ iceberg-catalog-service reconciliation).
- **B06 Phase 4** — Data Health rollup (`pipeline-expression` results → `/api/v1/datasets/{id}/health`).
- [`../03-datasets-y-fuentes-de-datos.md`](../03-datasets-y-fuentes-de-datos.md) — the six bronze datasets and their licences.
- [`../06-pipelines-y-transformaciones.md`](../06-pipelines-y-transformaciones.md) — the DAG that calls `/append` and the Data Health checks per stage.

## Files touched in this phase

- `services/iceberg-catalog-service/internal/repo/migrations/20260520000000_iceberg_append_idempotency.sql` — new table + index.
- `services/iceberg-catalog-service/internal/repo/append_idempotency.go` — `AppendIdempotencyRecord` type, `ErrAppendIdempotencyRace` sentinel, `Lookup` + `Record` methods on `*Repo` (Postgres-backed, unique-violation → race signal).
- `services/iceberg-catalog-service/internal/handlers/append_idempotency.go` — `AppendIdempotencyStore` interface (optional upcast) + `hashAppendRequest` helper.
- `services/iceberg-catalog-service/internal/handlers/append.go` — rewrite of `AppendBatch` to read the header, hash the body, check the upcast, and dispatch to replay / conflict / commit + race-resolution path. Plus `extractSnapshotIDFromCommit` to plumb the snapshot id into the dedup record.
- `services/iceberg-catalog-service/internal/handlers/append_idempotency_test.go` — five new unit tests.
- `PoC/geopolitica/blockers/B06-iceberg-e2e.md` (this file) + `README.md` index row.
