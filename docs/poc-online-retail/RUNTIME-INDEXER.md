# Iceberg → ObjectStore indexer + writeback (architecture)

> Companion to `docs/poc-online-retail/README.md`. The PoC pipeline lands
> data in Iceberg tables on Ceph RGW (`lakekeeper.default.online_retail_*`).
> The Workshop dashboard reads object instances from `object-database-service`
> (Cassandra-backed in production, in-memory in the PoC). This document
> captures the architectural decision for the indexer that bridges those
> two layers, and the writeback path for action-driven mutations.

## What ships in this PoC slice

| Component | Status | Location |
|---|---|---|
| Bridge endpoint `/api/v1/ontology/types/{id}/objects` (List/Get/Create) on object-database-service | **Live** | `services/object-database-service/internal/handlers/objects_bridge.go` |
| `application-composition-service` `/api/v1/apps` CRUD + publish | **Live** | `services/application-composition-service/internal/{handlers/apps.go,repo/repo.go,server/server.go}` |
| Ontology properties + link types HTTP routes | **Live** | `services/ontology-definition-service/internal/handlers/properties_links.go` |
| PoC seeder (CSV → ObjectStore via bridge) | **Live, dev-only** | `tools/online-retail/seed_object_database.py` |
| Production indexer (Iceberg → ObjectStore) | **Designed, not built** | This document |
| Action writeback (Workshop → Iceberg log) | **Designed, not built** | This document |

The seeder is intentionally a *Python tool*, not a service: it lets the
dashboard show real data today while the real indexer is built. It hits
the same bridge endpoint the dashboard reads through, so once the indexer
lands the wire shape doesn't change.

## P3 — Production indexer design

### Decision: Spark-driven, control-plane Go service

```
                ┌─────────────────────────┐
                │ iceberg-indexer-service │  (Go HTTP API,
                │                         │   pg-runtime-config
                │  POST /runs             │   row-per-run)
                │  GET  /runs[/{id}]      │
                └──────────┬──────────────┘
                           │ creates SparkApplication CR
                           ▼
                ┌─────────────────────────┐
                │ Spark Operator          │
                └──────────┬──────────────┘
                           │ launches
                           ▼
                ┌─────────────────────────┐
                │ pipeline-runner-spark   │  (Scala, fat-JAR,
                │  IcebergToObjectStore   │   --class=...)
                │  Indexer                │
                │                         │
                │  read Iceberg via       │
                │   Lakekeeper REST       │
                │  for-each row → HTTP    │
                │   PUT object-database   │
                └──────────┬──────────────┘
                           │ HTTP PUT
                           ▼
                ┌─────────────────────────┐
                │ object-database-service │  (Cassandra ObjectStore;
                │                         │   in-memory in PoC)
                └─────────────────────────┘
```

**Why this shape:**

- **Same operator pattern as the existing pipeline-runner.** The Spark
  Operator + `_pipeline-run-template.yaml` machinery is already wired,
  battle-tested for the 4 PoC transforms, and ships Iceberg + Lakekeeper
  REST + Hadoop-AWS support. Reusing it avoids a second runtime stack.
- **Scala for Iceberg reads.** PyIceberg and iceberg-go are immature for
  hidden partitioning, time-travel, and the Lakekeeper REST flavour we
  use. The Scala/Java runtime is the canonical client.
- **Go control plane for orchestration.** Run records, watermarks per
  table, retries, status — these are HTTP/DB problems Go handles
  cleanly. The Spark JAR stays a pure transform.
- **HTTP PUT to object-database-service** (rather than direct Cassandra
  writes) preserves invariants: version stamping, owner enforcement,
  marking enforcement. PoC scale is ~10⁴ rows; at 10⁸+ a direct
  Cassandra path becomes a follow-up optimisation.

### Wire contract

```
POST /api/v1/iceberg-indexer/runs
{
  "table":          "lakekeeper.default.online_retail_clean",
  "tenant":         "default",
  "object_type_id": "678b55fe-db5f-4d3a-bbf2-8cb643af8d32",
  "id_column":      "transaction_id",
  "since_snapshot": null   // null = full scan; otherwise incremental
}
→ 202 Accepted
{ "run_id": "...", "status": "queued", "spark_app_name": "indexer-..." }
```

The indexer Spark JAR receives:

```
--source-table       <iceberg ref>
--target-tenant      <string>
--target-type-id     <uuid>
--id-column          <string>
--object-database-url http://object-database-service.openfoundry.svc:8080
--callback-url       http://iceberg-indexer-service.openfoundry.svc:8080/runs/{id}/complete
```

### Mapping from rows to ObjectInstance

For each Iceberg row, the indexer projects:

```
{
  "tenant":   "<target-tenant>",
  "id":       "<value of id_column>",
  "type_id":  "<target-type-id>",
  "version":  "<iceberg snapshot_id>",          // monotonic
  "payload":  { /* all other columns as JSON */ },
  "created_at_ms": <iceberg row create_ts>,
  "updated_at_ms": <iceberg row update_ts>
}
```

then PUTs to `/api/v1/object-database/objects/{tenant}/{id}`.

### Watermarking

`iceberg_indexer_runs(id, table, target_type_id, status, snapshot_id_low,
snapshot_id_high, rows_processed, started_at, completed_at, error)` in
pg-runtime-config. Subsequent runs default to `since_snapshot =
snapshot_id_high` of the last successful run for the same table; full
re-index requested via `?since_snapshot=null`.

### Why not a one-shot Job?

Tempting at PoC scale, but kills observability: no run history, no
retries, no concurrency control between overlapping writes from
different Iceberg tables to the same Cassandra row.

## P4 — Writeback decision: hybrid (Cassandra-canonical + Iceberg audit log)

The user flagged the writeback question as architecturally open:

> **Writeback Iceberg para actions (decisión arquitectónica abierta:
> Iceberg row-level vs Cassandra-as-cache).**

### Decision: **Cassandra is canonical for object state; Iceberg is
canonical for derived/batch state and the audit log.**

| Path | Where it goes |
|---|---|
| Action mutations (Workshop "Mark resolved", form submissions) | **Cassandra** via `object-database-service` PUT (creates v2, v3, …) |
| Append-only action audit (who, when, before/after) | **Iceberg** `lakekeeper.default.action_log` via Kafka → Spark sink |
| Pipeline-derived state (anomaly score, top-customer rank) | **Iceberg** → indexer above → **Cassandra** |
| Query/aggregation in Workshop charts | **Cassandra** (reads via bridge) |

### Why not Iceberg row-level updates (Foundry's "OSv2" path)?

- Iceberg row-level deletes need v2-format tables + delete files; the
  read amplification is real for hot rows.
- Latency target for Workshop actions is **p50 < 100ms**. Iceberg
  metadata round-trips add 100–500ms even on warm caches.
- Cassandra LWT gives us optimistic concurrency (`expected_version`)
  that we already exploit in the ObjectStore Put contract.

### Why not Cassandra-only?

- We lose time-travel and snapshot-based reproducibility for analyses.
- Ontology actions are auditable events; they belong in an
  append-only log with bitemporal semantics — exactly what Iceberg gives
  us for free.

### Implementation outline (deferred)

```
Workshop action submission
       │
       ▼
ontology-actions-service.execute()
       ├── PUT object-database-service                        ← canonical
       └── publish Kafka topic ontology.actions.applied.v1
                                  │
                                  ▼
                    ai-sink / audit-sink (existing Kafka consumer)
                                  │
                                  ▼
              SparkStructuredStreaming → append to
              `lakekeeper.default.action_log` Iceberg table
```

The Kafka topic + the consumer scaffolding already exist
(`audit-sink`, `ai-sink`); the missing piece is the
`SparkStructuredStreaming` writer. This belongs in a follow-up PoC slice.

### What this means for the PoC dashboard today

The dashboard reads from the bridge → in-memory ObjectStore. Action
buttons (`review_anomaly`, `mark_resolved`) hit
`ontology-actions-service`, which writes back via the same
ObjectStore. Iceberg audit-log writeback is a future commit.

## Operational notes

- **Memory budget on Lima**: `object-database-service` is small (~30Mi).
  The cost driver is `pipeline-runner` Spark drivers (1.5Gi each). Run
  the indexer on idle nodes.
- **Auth**: the SPA reaches the bridge through `edge-gateway-service`
  with a JWT; `object-database-service` itself is intentionally
  unauthed — it trusts the gateway. The future indexer service should
  mint a service-to-service token, not reuse user JWTs.
- **Pagination**: the bridge currently emits `total = len(items)` (the
  page size, not the full count). Until we have a separate count
  endpoint on `ObjectStore`, the PoC dashboard fetches a large page
  (`per_page=5000`).
