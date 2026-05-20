# B03 — Ontology indexer end-to-end (G1 + G2 + G3 closed)

> **Scope revised 2026-05-20.** The earlier framing of this file
> ("ontology-indexer is a stub") was wrong. The service ships 1,029
> LOC of Go including a real Kafka consumer with dedup-by-version,
> exponential-backoff retries, DLQ publishing, dual search backends
> (Vespa + OpenSearch), an OSV2 row projector, and integration tests
> behind `//go:build integration`.
>
> The actual gaps were narrower:
>
>   - **G1**: the indexer subscribed to the wrong topic names
>     (plural `ontology.objects.changed.v1`) while every producer in
>     the codebase emits the singular form
>     (`ontology.object.changed.v1`). Result: 0 events reached the
>     indexer in production.
>   - **G2**: `object-database-service.PutObject` skipped the
>     transactional outbox — direct HTTP writes never landed in
>     Kafka.
>   - **G3**: the `ontology.link.changed.v1` topic CR was missing
>     from the Strimzi manifests.
>
> All three are closed in this commit (see "Status as of 2026-05-20"
> below). Severity is now **Resolved** for end-to-end emission. The
> per-type indexing status endpoint (G4 / acceptance criterion #2),
> the on-demand reindex backfill (criterion #3), and the schema-aware
> mapping registrar (G5) are all done in this branch. The indexer
> now subscribes to all three live topics (`object.changed.v1`,
> `link.changed.v1`, `object_type.changed.v1`) and exposes the
> status + reindex HTTP surface end-to-end.

## Identity

| Field | Value |
|---|---|
| OpenFoundry service | [services/ontology-indexer/](../../services/ontology-indexer/) |
| Launcher app | Sub-tab **"Ontology Indexing"** inside #2 Ontology Manager (`/ontology-indexing`). Impacts **#3 Object Explorer** (`/object-explorer`) and any Workshop search/filter widget ([launcher-app-mapping.md §B](../../docs/reference/launcher-app-mapping.md)). |
| Foundry product | Ontology indexing inside [Ontology Manager](https://www.palantir.com/docs/foundry/ontology-manager/overview/) + [Object Explorer](https://www.palantir.com/docs/foundry/object-explorer/overview/) |
| PoC act(s) | **Act 2** (visible search of seeded objects), **Act 4** (Workshop filters) |
| 1-to-1 checklist | [foundry-ontology-manager-object-views-1to1-checklist.md](../../docs/migration/foundry-ontology-manager-object-views-1to1-checklist.md) |
| Parity matrix module | Ontology Manager / Object Views (search/indexing slice) |

## Palantir reference (public docs)

| Page | Live URL | Local scraped MD | Full-page screenshot |
|---|---|---|---|
| Object Explorer overview | https://www.palantir.com/docs/foundry/object-explorer/overview/ | [Seed URLs/Object Explorer/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Explorer/Overview.md) | [Seed URLs/Object Explorer/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Explorer/Overview.screenshot.png) |
| Object indexing overview | https://www.palantir.com/docs/foundry/object-indexing/overview/ | [Seed URLs/Object Indexing/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Indexing/Overview.md) | [Seed URLs/Object Indexing/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Indexing/Overview.screenshot.png) |
| Object Storage v2 (breaking changes) | https://www.palantir.com/docs/foundry/object-backend/object-storage-v2-breaking-changes/ | [Seed URLs/Object Backend/Object Storage V2 Breaking Changes.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Backend/Object%20Storage%20V2%20Breaking%20Changes.md) | [Seed URLs/Object Backend/Object Storage V2 Breaking Changes.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Backend/Object%20Storage%20V2%20Breaking%20Changes.screenshot.png) |

## Foundry behavior to replicate (summary)

When an Object Type is created or an object instance is written, the
platform projects the change into an indexed search store so that the
Object Explorer (and any Workshop search/filter widget) can do
sub-second filtering, full-text search, and aggregations. The
projection is driven asynchronously off the ontology write log; users
see an indexing status (pending / live / stale).

## Current OpenFoundry surface

| Layer | File | State |
|---|---|---|
| Service main | [services/ontology-indexer/cmd/ontology-indexer/main.go](../../services/ontology-indexer/cmd/ontology-indexer/main.go) | ~66 lines, opens a Kafka consumer skeleton |
| Internal | [services/ontology-indexer/internal/](../../services/ontology-indexer/internal/) | ~1.6k LOC; consumer present but no real projection into a search backend |
| Search backend (infra) | [infra/compose/docker-compose.yml](../../infra/compose/docker-compose.yml) | Vespa is deployed in the compose stack |
| Downstream consumer (UI) | [apps/web/src/routes/object-explorer/](../../apps/web/src/routes/object-explorer/) | Reads from `ontology-query-service`, which currently does naive lookups |

## Gap to close

1. **No real Kafka subscription.** The consumer skeleton does not bind to
   the `ontology.type.changed` / `ontology.object.upserted` topics the
   ontology services should emit.
2. **No Vespa (or alternative) schema deployment.** There is no Vespa
   application package or schema that mirrors the aviation object types.
3. **No projection logic.** Even if events arrived, no code translates an
   `Aircraft upserted` event into a Vespa `feed` document with the
   indexed fields.
4. **No backfill path.** A fresh demo cannot rebuild the search index
   from the current ontology state.
5. **No status surface.** Ontology Manager has no endpoint exposing
   "indexing lag" or "last indexed timestamp", which Foundry shows.

## Acceptance criteria to unblock the PoC

1. The indexer consumes `ontology.object.upserted` from Kafka, transforms
   the payload, and feeds it into Vespa with the schema derived from
   the object type's properties.
2. A `GET /ontology-indexer/status?objectType=Aircraft` endpoint returns
   `{indexed_count, last_indexed_at, lag_seconds}`.
3. A `POST /ontology-indexer/reindex?objectType=Aircraft` triggers a
   full backfill from `object-database-service` and reports completion.
4. After seeding the aviation ontology ([B02](B02-ontology-definition.md))
   and loading 100k flight records, the Object Explorer UI returns
   results for `tail_number=N12345` in under 500 ms.
5. The Workshop Object Table widget ([B01](B01-workshop-backend.md)) can
   filter by indexed properties end-to-end.

## Status as of 2026-05-20

| Gap | Status | Evidence |
|---|---|---|
| **G1** Topic-name drift (indexer subscribes to plural; producers emit singular) | ✅ Done | Constants in [services/ontology-indexer/internal/runtime/runtime.go](../../services/ontology-indexer/internal/runtime/runtime.go) flipped to `ontology.object.changed.v1` / `ontology.link.changed.v1`; pin test in `runtime_test.go::TestTopicsAndConsumerGroup` updated; README aligned |
| **G2** `object-database-service.PutObject` skipped outbox | ✅ Done | New `OutboxPool *pgxpool.Pool` field on `Handlers`; new helper [internal/handlers/outbox.go](../../services/object-database-service/internal/handlers/outbox.go) wraps `libs/outbox.Enqueue` with the canonical `ontology.object.changed.v1` envelope (object_id, object_type_id, operation, properties, version, etc.) and deterministic event_id via `domain.DeriveEventID`. `PutObject` calls it on every successful `PutInserted`/`PutUpdated` outcome; `PutVersionConflict` correctly skips emission. Integration test `TestOutboxEndToEnd_PutObjectEmits` proves the INSERT lands in the WAL with the expected topic + payload + `ol-producer: object-database-service` header. |
| **G3** Missing KafkaTopic CR for `ontology.link.changed.v1` | ✅ Done | Added to [infra/helm/infra/kafka-cluster/templates/topics-domain-v1.yaml](../../infra/helm/infra/kafka-cluster/templates/topics-domain-v1.yaml) as a sibling of the existing object topic. |
| **G4** Per-type indexing status endpoint | ✅ Done | In-memory `status.Tracker` ([services/ontology-indexer/internal/status/tracker.go](../../services/ontology-indexer/internal/status/tracker.go)) increments per-(tenant, type) `indexed_count` / `deleted_count` whenever the runtime projector commits an `OutcomeIndexed` / `OutcomeDeleted` outcome (`recordStatus` in `runtime.go`). Server exposes `GET /api/v1/ontology-indexer/status?objectType=…&tenant=…` returning `{indexed_count, deleted_count, last_indexed_at, last_event_time, lag_seconds}` (lag = `last_indexed_at - last_event_time`, the wall-clock ETL delay); omitting `objectType` lists every (tenant, type) entry. Edge-gateway route added in [router_table.go](../../services/edge-gateway-service/internal/proxy/router_table.go) ahead of the catch-all `/api/v1/ontology`. Verified by `internal/status/tracker_test.go`, `internal/server/status_handler_test.go`, and `internal/runtime/runtime_test.go::TestRunWithOptionsAndTrackerRecordsPerTypeStats`. State is in-process and resets on restart — Postgres-backed persistence is a follow-up if the demo needs survivability. |
| **AC #3** Reindex backfill from object-database-service | ✅ Done | New [`internal/reindex`](../../services/ontology-indexer/internal/reindex/) package: `Runner` pages through `object-database-service` (`GET /api/v1/ontology/types/{type_id}/objects`) and writes each row as a `searchabstraction.IndexDoc` with `Version=0` so any later Kafka event wins the version check. `HTTPSource` (with the `x-of-tenant` header) is the production source; tests use a fake. `Registry` keeps an in-memory job log (`pending → running → completed/failed` with `total_read`, `indexed`, `failed`, `duration_ms`, `error`). Endpoints: `POST /api/v1/ontology-indexer/reindex?objectType=…&tenant=…` returns 202 with `{job_id, status_url}` and spawns the backfill in a goroutine; `GET /api/v1/ontology-indexer/reindex/{job_id}` reports progress. Wired in `main.go` only when `OBJECT_DATABASE_URL` is set — otherwise the endpoints return 503 and the worker keeps running as streaming-only. Each backfilled row bumps the same `status.Tracker` used by G4 so `/status` reflects the rebuild. Verified by `runner_test.go`, `registry_test.go`, `http_source_test.go`, and `server/reindex_handler_test.go`. |
| **G5** Schema-aware mapping registration (consume `ontology.object_type.changed.v1`) | ✅ Done | **Indexer side:** `searchabstraction.MappingRegistrar` interface ([libs/search-abstraction/mapping.go](../../libs/search-abstraction/mapping.go)) with neutral `TypeMapping` / `MappingField` shape (string, text, integer, long, double, boolean, date, geo, unknown) and a `ErrMappingDeployUnconfigured` sentinel for honest no-op reporting. `internal/schemasync` package owns: the envelope subset (deliberate duplicate of the producer's wire shape to keep services decoupled), `MappingFromPayload` (property_type → MappingFieldType with base_type/type_family fallbacks), `Handler` (created/updated → Register, deleted → Drop), and `HTTPSeedSource` + `SeedMappingsFrom` to hydrate the schema cache from `ontology-definition-service` at startup. Wired into `runtime.ProcessMessageWithProjector` via `TopicObjectTypeChangedV1` (added to `SubscribeTopics`); `osv2_projection.apply` passes schema topics through to the search side. **Vespa side:** `vespa.Backend` now implements `MappingRegistrar` end-to-end. `schema.go` generates `.sd` files (per-type, with the builtin id/tenant/type_id/version fields, BM25 on searchable strings, native rank fallback) plus `services.xml` and `hosts.xml`, then zips them into the canonical Vespa application package. `mapping.go` keeps an in-memory `map[type_id]TypeMapping` cumulative cache, deploys via `POST {config_endpoint}/application/v2/tenant/{tenant}/prepareandactivate` with `Content-Type: application/zip`, and exposes `SeedSchemas([]TypeMapping)` so the indexer can hydrate the cache from `ontology-definition-service` before the first Kafka event arrives — without this, a restart with an empty cache would redeploy with only the new schema and wipe the rest. Opt-in via `WithConfigEndpoint`/`WithVespaTenant`/`WithVespaApplication`; un-configured backends surface `ErrMappingDeployUnconfigured` so the schemasync handler reports `OutcomeSkippedNoOp` honestly. **main.go** builds the backend once, seeds it best-effort from `ONTOLOGY_DEFINITION_URL` (5s deadline, warn-and-continue on failure), and shares the single instance between the streaming loop and the reindex endpoints. Verified by `libs/search-abstraction/vespa/schema_test.go` (.sd / services.xml / zip contents, builtin fields, BM25 hints, unknown-type drop), `libs/search-abstraction/vespa/mapping_test.go` (deploy POST, accumulation across calls, drop reduces the package, Seed populates without deploy, sentinel on missing config, propagates deploy 5xx), `services/ontology-indexer/internal/schemasync/seed_test.go` (HTTP seed source + translate + sink), and the previously-existing handler/translate/runtime tests with the new sentinel path. |

## Phase 1b — done

`DeleteObject` and link mutations (`PutLink` + the brand-new
`DeleteLink`) in `object-database-service` now route through the
outbox in the same way `PutObject` does:

- `DeleteObject` GETs the row before deletion so the emitted event
  carries the type_id + the post-deletion version (`current+1`) plus
  `deleted: true`.
- `PutLink` emits an `ontology.link.changed.v1` upsert event (`version=1`,
  `deleted=false`) with the link's payload.
- New `DELETE /api/v1/object-database/links/{tenant}/{link_type}?from=…&to=…`
  handler removes the (link_type, from, to) triple and emits a
  matching deletion event (`version=2`, `deleted=true`).

Helper `enqueueLinkChanged` ([internal/handlers/outbox.go](../../services/object-database-service/internal/handlers/outbox.go))
parallels `enqueueObjectChanged`; both use `domain.DeriveEventID` so
event_ids stay deterministic and collapse on retry via the outbox
primary key.

Verification: two new integration tests prove the WAL emission for
both flows.

| Test | What it asserts |
|---|---|
| `TestOutboxEndToEnd_DeleteObjectEmits` | PutObject + DeleteObject produce two outbox INSERTs: `object_created` and `object_deleted` (with `deleted: true` in the payload) on `ontology.object.changed.v1` |
| `TestOutboxEndToEnd_LinkLifecycleEmits` | PutLink + DeleteLink produce two outbox INSERTs on `ontology.link.changed.v1` for the same `aggregate_id` (`link:<linkType>:<from>:<to>`) with version=1 / version=2 respectively |

Versioning note: `storage.LinkStore` does not track versions, so the
two link event types use synthetic `version=1` (upsert) and `version=2`
(delete) to keep the deterministic event_id namespaces disjoint. A
future change that gives links a real version column should bump
those to the actual values.

## Implementation notes (drift-mirrored from the kernel)

`services/object-database-service/internal/handlers/outbox.go` is a
small, intentional duplicate of
`libs/ontology-kernel/domain.ApplyObjectWithOutbox`. The reason: the
kernel helper accepts a `storageabstraction.ObjectStore`, and the
service's local `storage.ObjectStore` (in `internal/storage`) is
field-compatible but a distinct Go type. Rather than write a
one-method adapter, we duplicate the ~80 LOC and use
`domain.DeriveEventID` to keep the event_id derivation in lock-step
with the kernel canon. If a third producer ever joins, lift the
shared helper to `libs/ontology-outbox` (already flagged in B02's
`Deferred` section).

## Implementation pointers

1. Define the Vespa application package (schemas per object type, fields,
   tokenization) and deploy it as part of the compose / Helm bring-up.
2. Wire the Kafka consumer to a real `event-bus-data` subscription.
3. Add a projection layer that resolves the object-type schema from
   `ontology-definition-service` ([B02](B02-ontology-definition.md)) and
   emits Vespa documents.
4. Implement the reindex command as a one-shot job that reads from
   `object-database-service` (Cassandra) and replays into the indexer.
5. Expose the `status` and `reindex` endpoints through
   `edge-gateway-service` so the UI can show them.
6. Track unimplemented items in
   [foundry-ontology-manager-object-views-1to1-checklist.md](../../docs/migration/foundry-ontology-manager-object-views-1to1-checklist.md).
