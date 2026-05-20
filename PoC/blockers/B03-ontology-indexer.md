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
> below). Severity is now **Resolved** for end-to-end emission;
> luxury items (per-type indexing status endpoint, reindex backfill,
> schema-aware mapping registration) remain as Phase 2.

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
| **G4** Per-type indexing status endpoint | ⏳ Phase 2 | Requires adding a Postgres-backed `index_status` table or scraping the existing Prometheus counters via a thin /status handler. Not blocking the PoC narrative. |
| **G5** Schema-aware mapping registration (consume `ontology.object_type.changed.v1`) | ⏳ Phase 2 | The indexer today uses a generic JSONB document shape; per-type Vespa schemas would let it leverage typed fields and full-text tokenizers. Useful for Vespa quality at scale; not blocking the PoC narrative. |

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
