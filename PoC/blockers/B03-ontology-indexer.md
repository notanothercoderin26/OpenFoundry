# B03 — Ontology indexer is a stub

> Severity: **High** — breaks the "search aircraft N12345" / "filter
> objects" interactions in Act 2 and Act 4. Without indexing, ontology
> writes do not become searchable in Vespa (or the chosen search backend),
> and Object Explorer / Workshop filters fall back to slow scans or
> empty results.

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
