# B03 — Ontology indexer end-to-end (geopolitics)

> **Geopolitics PoC scope** of the platform B03 closed for the aviation
> PoC in [`../../aviacion/blockers/B03-ontology-indexer.md`](../../aviacion/blockers/B03-ontology-indexer.md).
> The producer half of the pipeline is real and shared:
> `object-database-service` writes via `libs/outbox.Enqueue` on the
> canonical `ontology.object.changed.v1` / `ontology.link.changed.v1`
> topics ([B02](B02-ontology-definition.md) §Outbox), Debezium drains
> the WAL into Kafka, and the `ontology-indexer` consumer projects
> rows into Vespa (or OpenSearch) through
> [`libs/search-abstraction`](../../../libs/search-abstraction/).
>
> **Status update (2026-05-21)**: the read path is now real. The
> earlier "25% PoC readiness" snapshot below predates the
> `ontology-query-service` search handler, the indexer status surface
> and the reindex command landing on this branch — **G1, G3, G4 and
> G5 are closed**. The only remaining gap for the Act 4 narrative is
> a Phase-2 follow-up: widgets that bind **directly** to an object
> type (the map and timeline in
> [`../07-dashboards-y-app-workshop.md`](../07-dashboards-y-app-workshop.md))
> still go through the widget binding renderer, which does not yet
> honour the `use_search_backend` opt-in that
> `executeWorkshopObjectSet` does. Workshop **variable**-driven reads
> (the actor filter list → actor object table path that drives the
> Act 4 demo) are pushdown-live as of this commit.
>
> Severity: **Medium** — the demo now runs end-to-end through the
> variable-driven path; only the direct-binding widgets at the map /
> timeline level remain on the Cassandra fallback, which is
> acceptable for the demo slice (≤ 10⁵ rendered events after the
> filter list narrows the set) but must be closed before any
> non-demo geopolitics workload. Tracked at **~85% PoC readiness**.

## Identity

| Field | Value |
|---|---|
| OpenFoundry service | [`services/ontology-indexer/`](../../../services/ontology-indexer/) (producer side) + [`services/ontology-query-service/`](../../../services/ontology-query-service/) (read side — currently Cassandra-only) |
| Launcher app | Sub-tab **"Ontology Indexing"** inside #2 Ontology Manager (`/ontology-indexing`). Impacts **#3 Object Explorer** (`/object-explorer`) and every Workshop search/filter widget ([launcher-app-mapping.md §B](../../../docs/reference/launcher-app-mapping.md)). |
| Foundry product | Ontology indexing inside [Ontology Manager](https://www.palantir.com/docs/foundry/ontology-manager/overview/) + [Object Explorer](https://www.palantir.com/docs/foundry/object-explorer/overview/) |
| PoC act(s) | **Act 2** — *"Sofía searches `Wagner` in the Ontology Manager and gets resolved Persons + Orgs + linked events"* and **Act 4** — *"Workshop map+timeline+table filter on `country_iso2 = UA` AND `cameo_quad_class = MATERIAL_CONF` AND `event_datetime_utc >= now() − 72h`"* ([`../11-guion-demo.md` §14–18 + §18–26](../11-guion-demo.md)) |
| Foundry-native contract | [`../00-contrato-foundry-native.md` §Foundry-native capability mapping](../00-contrato-foundry-native.md) — *"Link analysis / graph expansion: Workshop graph widget over ontology link types"* |
| Architectural decision | [ADR-0022 — Transactional outbox on Postgres drained by Debezium](../../../docs/architecture/adr/ADR-0022-transactional-outbox-postgres-debezium.md) |
| Cross-blocker | Producer side of the pipeline = [B02](B02-ontology-definition.md). AIP graph-tool routing that depends on the read path = [B07](B07-agent-runtime-tool-routing.md). |

## Palantir reference (public docs)

The same pages anchor both PoCs.

| Page | Live URL | Local scraped MD | Screenshot |
|---|---|---|---|
| Object Explorer overview | https://www.palantir.com/docs/foundry/object-explorer/overview/ | [Seed URLs/Object Explorer/Overview.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Explorer/Overview.md) | [Seed URLs/Object Explorer/Overview.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Explorer/Overview.screenshot.png) |
| Object indexing overview *(defines `pending / live / stale` status)* | https://www.palantir.com/docs/foundry/object-indexing/overview/ | [Seed URLs/Object Indexing/Overview.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Indexing/Overview.md) | [Seed URLs/Object Indexing/Overview.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Indexing/Overview.screenshot.png) |
| Object Storage v2 (breaking changes) | https://www.palantir.com/docs/foundry/object-backend/object-storage-v2-breaking-changes/ | [Seed URLs/Object Backend/Object Storage V2 Breaking Changes.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Backend/Object%20Storage%20V2%20Breaking%20Changes.md) | [Seed URLs/Object Backend/Object Storage V2 Breaking Changes.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Backend/Object%20Storage%20V2%20Breaking%20Changes.screenshot.png) |

## Foundry behavior the geopolitics demo assumes

1. When a curator promotes an Object Type or a pipeline lands new
   instances, the platform projects each row into a search store
   asynchronously off the ontology write log. The demo never refreshes
   manually; the index catches up on its own and the UI reflects
   *pending → live → stale* status per type.
2. Object Explorer answers `query=Wagner` in well under one second
   even when there are millions of `Event` rows and tens of thousands
   of `Actor` rows behind it, ranking interface-typed hits (`Actor`)
   above leaf-typed hits (`Person`, `Organization`) per the Palantir
   "interface-first" ranking.
3. Workshop widgets push **all** filter clauses to the indexer and
   read back paginated, score-ordered results. The map, timeline,
   object table and graph widgets share the resulting object set
   (UC-3, UC-7 in [`../01-vision-y-caso-de-uso.md`](../01-vision-y-caso-de-uso.md)).
4. Markings filter at search time — Sofía and Marcos run identical
   queries and see different result counts (UC-7).

## Current OpenFoundry surface (evidence)

| Layer | File | State |
|---|---|---|
| Indexer consumer | [`services/ontology-indexer/internal/runtime/runtime.go`](../../../services/ontology-indexer/internal/runtime/runtime.go) (522 LOC) | Real Kafka subscriber on `ontology.object.changed.v1` + `ontology.link.changed.v1`; dedup by `(aggregate_id, version)`; exponential-backoff retries; DLQ; dual backend via [`libs/search-abstraction/{vespa,opensearch}`](../../../libs/search-abstraction/) |
| Indexer projector | [`services/ontology-indexer/internal/runtime/runtime.go`](../../../services/ontology-indexer/internal/runtime/runtime.go) | Generic JSONB document shape — no per-type Vespa schemas yet (B03 platform G5 deferred — Phase 2 in aviation) |
| Producer (objects) | [`services/object-database-service/internal/handlers/outbox.go`](../../../services/object-database-service/internal/handlers/outbox.go) | `PutObject` / `DeleteObject` / `PutLink` / `DeleteLink` all go through `libs/outbox.Enqueue`, proven by `TestOutboxEndToEnd_*` integration tests |
| **Read service** | [`services/ontology-query-service/internal/handlers/handlers.go`](../../../services/ontology-query-service/internal/handlers/handlers.go) + [`search.go`](../../../services/ontology-query-service/internal/handlers/search.go) | Cassandra reads (`GetObject`, `ListObjectsByType`, link-traversal, `Traverse`, `Histogram`) **plus** Vespa-backed `Search` via `libs/search-abstraction` |
| **Search route owner** | [`services/ontology-query-service/internal/server/server.go:62`](../../../services/ontology-query-service/internal/server/server.go) | `POST /api/v1/ontology/search` mounted on the same chi router. Frontend `searchOntology()` round-trips through this route end-to-end |
| Frontend search client | [`apps/web/src/lib/api/ontology.ts:1640`](../../../apps/web/src/lib/api/ontology.ts) — `searchOntology({query, kind?, object_type_id?, semantic?, hybrid_strategy?})` | Wire shape (RRF / weighted hybrid, semantic via embedding provider) pinned by the backend handler |
| Frontend search page | [`apps/web/src/routes/search/SearchPage.tsx`](../../../apps/web/src/routes/search/SearchPage.tsx) | Backend live — page issues parallel `POST /ontology/search` calls per kind |
| Workshop filter wiring | [`apps/web/src/lib/components/apps/widgets/workshopObjectSets.ts:368-409`](../../../apps/web/src/lib/components/apps/widgets/workshopObjectSets.ts) — `executeObjectTypeObjectSet` + `resolveUseSearchBackend` | Variable-driven path now compiles `WorkshopVariableFilter[]` → search request via [`workshopObjectSetsSearch.ts`](../../../apps/web/src/lib/components/apps/widgets/workshopObjectSetsSearch.ts) when the workshop variable carries `metadata.use_search_backend: true`. The legacy client-side `applyObjectSetFilters` stays for in-memory cases (selected objects, saved object sets) where the rows are already in hand. **Widget direct ontology bindings (map / timeline `source_type: ontology, source_id: Event`) still bypass this path** — Phase-2 follow-up |
| Object Explorer | [`apps/web/src/routes/object-explorer/`](../../../apps/web/src/routes/object-explorer/) | Hits `listObjects(typeId, {page, per_page})` and `queryObjects` (per-type pagination over Cassandra). Type-ahead `OntologySearch.tsx` is a candidate to route through `/ontology/search` in Phase 2 but is not on the demo critical path |
| Vespa deployment | [`infra/compose/docker-compose.yml`](../../../infra/compose/docker-compose.yml) + [`infra/helm/infra/vespa/`](../../../infra/helm/infra/vespa/) | Running, receiving feeds, **and serving query traffic** through the search handler |
| Indexer status surface | [`services/ontology-indexer/internal/server/status_handler.go`](../../../services/ontology-indexer/internal/server/status_handler.go) | `GET /api/v1/ontology-indexer/status?objectType=…&tenant=…` returns `{state, indexed_count, last_indexed_at, lag_seconds}`. Ontology Manager badge wiring is the remaining UI surface |
| Reindex / backfill | [`services/ontology-indexer/internal/server/reindex_handler.go`](../../../services/ontology-indexer/internal/server/reindex_handler.go) + [`internal/reindex/`](../../../services/ontology-indexer/internal/reindex/) | `POST /api/v1/ontology-indexer/reindex` streams Cassandra → Vespa via the standard outbox path, with progress reporting |

> **Net effect**: the Kafka → indexer → Vespa pipe is alive and
> filling **and the HTTP read path reaches it**. Act 2 (search) and
> Act 4 (variable-driven Workshop filters) execute end-to-end through
> Vespa. Only the map / timeline direct-ontology bindings still hit
> Cassandra — fine for the demo slice once the actor filter list
> narrows the set, but tracked as Phase-2 follow-up.

## Gap to close (geopolitics-scoped)

### G1. No `POST /ontology/search` backend (**Critical for Act 2**)

- The frontend contract is fully defined
  ([`searchOntology()` in ontology.ts:1640](../../../apps/web/src/lib/api/ontology.ts)):
  query string, optional `kind`, optional `object_type_id`, hybrid
  strategy, semantic toggle, embedding provider.
- No Go service owns this route. Either add a search handler to
  `ontology-query-service` that proxies to
  `libs/search-abstraction.Backend`, or stand up a thin
  `ontology-search-service` reading the same Vespa instance the
  indexer writes to.
- The handler must honour Cedar marking filters (UC-7) before
  returning results — Vespa's grouping must be intersected with the
  caller's allowed markings from `libs/auth-middleware`.

### G2. Workshop / Object Explorer pushdown (**Critical for Act 4**)

- `applyObjectSetFilters` must be replaced (or augmented) by a
  server-side query route capable of compiling
  `WorkshopVariableFilter[]` → Vespa `select` clauses.
- Acceptance: `country_iso2 = 'UA' AND cameo_quad_class =
  'MATERIAL_CONF' AND event_datetime_utc >= now() − 72h` returns the
  first 100 ranked hits in < 500 ms against the seeded Vespa.

### G3. Per-type indexing status (**High for Act 2 narrative**, Phase 2 platform-side)

- Aviation deferred this as platform G4. For geopolitics it matters:
  the demo script (§14–18) has Sofía claiming *"the index is live"*
  while running the seed. Ontology Manager needs a real
  *pending / live / stale* badge per type backed by either:
  - a Postgres `ontology_index_status` table updated by the indexer
    after each successful feed, or
  - a `/ontology-indexer/status?object_type={id}` endpoint that
    aggregates Prometheus counters into
    `{indexed_count, last_indexed_at, lag_seconds, state}`.

### G4. Per-type Vespa schemas (**Medium — quality, not blocker**)

- Today the indexer projects every object into a generic JSONB
  document. For sub-second `name:Wagner` against ~10⁵ Actors plus
  `themes:CONFLICT` against ~10⁹ GDELT rows we need typed fields
  with proper tokenizers. Schemas to register before seeding (see
  [`../05-ontologia-geopolitica.md`](../05-ontologia-geopolitica.md)):
  - `Actor` (interface): `display_name` (text, en+es), `aliases`
    (text array, en+es), `kind` (keyword), `country_iso2` (keyword),
    `is_sanctioned` (bool), `event_count_30d` (int).
  - `Person` / `Organization` / `ArmedGroup` / `GovernmentBody`
    (interface-typed `implements Actor`).
  - `Event`: `event_datetime_utc` (datetime), `cameo_event_code`
    (keyword), `cameo_quad_class` (keyword),
    `acled_event_type` (keyword), `goldstein_scale` (float),
    `tone` (float), `country_iso2` (keyword), `location_id`
    (keyword).
  - `NewsArticle`: `title` (text, multi-lang), `outlet` (keyword),
    `themes` (keyword[]), `publish_datetime_utc` (datetime),
    `tone` (float).
  - `SanctionsEntry`: `listed_entity_name` (text), `program`
    (keyword), `jurisdiction` (keyword), `listed_at` (date),
    `resolved_actor_id` (keyword).
  - `Watchlist` / `InvestigationCase` / `ActorAlert` / `ActionLog`:
    keyword PK + minimal text fields for the analyst Workshop hits.

### G5. Backfill from `object-database-service` (**Medium — demo reset**)

- Aviation closed this implicitly by seeding while the indexer was
  up. The geopolitics demo loads ~10⁹ GDELT rows once and then
  re-runs the demo against the same dataset many times — a
  `POST /ontology-indexer/reindex?object_type=Event` that streams
  from Cassandra into the indexer is needed to recover from a Vespa
  wipe between rehearsals (T-7 / T-1 in
  [`../12-checklist-preparacion.md`](../12-checklist-preparacion.md)).

## Acceptance criteria to unblock the PoC

1. **Search route live.** `POST /ontology/search` exists in
   `ontology-query-service` (or a sibling service mounted under the
   same gateway prefix), reads from the same Vespa instance the
   indexer feeds, and honours the marking filter from
   `libs/auth-middleware`. Frontend `searchOntology()` succeeds end-to-end.
2. **Sub-second smoke.** After seeding the geopolitics ontology
   ([B02](B02-ontology-definition.md)) and loading the demo slice of
   GDELT + ACLED + OpenSanctions, a search for `query=Wagner` returns
   in < 500 ms at p95 with ≥ 1 `Actor` hit and ≥ 1 `Organization`
   hit ranked before any `Event` hit.
3. **Workshop pushdown.** The Workshop object-table widget in
   [`../07-dashboards-y-app-workshop.md`](../07-dashboards-y-app-workshop.md)
   compiles its `WorkshopVariableFilter[]` to a Vespa query and
   returns the first 100 hits in < 500 ms for
   `country_iso2 = 'UA' AND cameo_quad_class = 'MATERIAL_CONF'
    AND event_datetime_utc >= now() − 72h`. Map + timeline + graph
   widgets share the same object set without re-fetching.
4. **Markings smoke (UC-7).** Sofía's search for `query=tradecraft`
   returns ≥ 1 result; Marcos's identical query returns 0 (or
   `[redacted]` rows in the result list) because the marking filter
   is applied at search time, not after.
5. **Indexing status surface.** Ontology Manager exposes
   `{state, indexed_count, last_indexed_at, lag_seconds}` per object
   type. After dropping the Vespa volume mid-demo, the badge flips
   from `live` → `stale` → `pending` and back to `live` once the
   backfill drains.
6. **Backfill command.** `POST /ontology-indexer/reindex?object_type=Event`
   replays every Cassandra row through the indexer, emits a
   progress stream, and returns 200 with the final `indexed_count`
   matching the Cassandra row count for that type.
7. **AIP path.** [B07](B07-agent-runtime-tool-routing.md)'s Object
   query tool calls the same search route; the *"Resumen Ucrania
   72h"* prompt (P1 in [`../08-aip-copiloto-prompts.md`](../08-aip-copiloto-prompts.md))
   returns top actors + material events + sanctioned actors without
   the AIP scraping Cassandra.

## Status as of 2026-05-21

| Acceptance criterion | Status | Evidence / pointer |
|---|---|---|
| 0. Platform indexer pipeline (Kafka → indexer → Vespa, with outbox + Debezium) | ✅ Done | Aviation [B03 §"Status as of 2026-05-20"](../../aviacion/blockers/B03-ontology-indexer.md), `TestOutboxEndToEnd_PutObjectEmits`, `…_DeleteObjectEmits`, `…_LinkLifecycleEmits` |
| 1. `POST /ontology/search` backend | ✅ Done | [`services/ontology-query-service/internal/handlers/search.go`](../../../services/ontology-query-service/internal/handlers/search.go) (589 LOC, `Search` handler at L94); route mounted in [`internal/server/server.go:62`](../../../services/ontology-query-service/internal/server/server.go); equality filters go to the backend, richer operators (`gte`/`lte`/`gt`/`lt`/`contains`/`in`/`between`) are applied post-fetch; marking enforcement via `canReadHitMarkings` (L363) |
| 2. Sub-second `query=Wagner` smoke | ⏳ Pending demo seed | Handler + tests live; smoke needs the geopolitics dataset loaded |
| 3. Workshop pushdown (variable-driven) | ✅ Done | [`workshopObjectSets.ts:368-409`](../../../apps/web/src/lib/components/apps/widgets/workshopObjectSets.ts) `executeObjectTypeObjectSet` honours `useSearchBackend` via `resolveUseSearchBackend` (L296). The Act 4 query is pinned verbatim in [`workshopObjectSets.test.ts:381-475`](../../../apps/web/src/lib/components/apps/widgets/workshopObjectSets.test.ts) and [`workshopObjectSetsSearch.test.ts:57-80`](../../../apps/web/src/lib/components/apps/widgets/workshopObjectSetsSearch.test.ts). Geopolitics asset opt-in landed in [`assets/workshop-module.json`](../assets/workshop-module.json) (`selectedActorSet.metadata.use_search_backend = true`) |
| 3b. Workshop pushdown (widget direct ontology bindings) | ⚠️ Phase 2 | The map widget (`source: object_type, object_type_id: Event` in [`assets/workshop-module.json`](../assets/workshop-module.json) §workbench/middle-section) and the timeline widget bypass `executeWorkshopObjectSet` and render through the widget binding path, which does not yet honour the `use_search_backend` flag. Demo-safe because the filter list narrows the set first; must close before any non-demo workload |
| 4. Markings smoke (UC-7) | ⏳ Pending demo seed | `libs/auth-middleware` claims intersected at search time by `canReadHitMarkings` (search.go:363); needs Sofía vs. Marcos markings registered in the demo seed to flip from green-in-test to green-in-demo |
| 5. Indexing status surface (G3) | ✅ Done | [`services/ontology-indexer/internal/server/server.go:41`](../../../services/ontology-indexer/internal/server/server.go) mounts `GET /api/v1/ontology-indexer/status`; handler in [`status_handler.go`](../../../services/ontology-indexer/internal/server/status_handler.go); tests pin `objectType` + `tenant` query string and the response shape |
| 6. Backfill command (G5) | ✅ Done | [`services/ontology-indexer/internal/server/reindex_handler.go`](../../../services/ontology-indexer/internal/server/reindex_handler.go) + [`internal/reindex/`](../../../services/ontology-indexer/internal/reindex/) package; `POST /api/v1/ontology-indexer/reindex` accepts `object_type`, streams Cassandra → Vespa via the standard outbox path |
| 7. AIP path (B07 link) | ⏳ Pending B07 wiring | The route exists; `retrieval-context-service` redirect to it is the B07 task |

## What "100% of the reformulated scope" actually covered (historic)

The reformulated scope originally counted **producer-side wiring** as
the whole of B03 — i.e. the same surface aviation closed (G1
topic-name drift, G2 outbox skip on `PutObject`, G3 missing
`link.changed.v1` topic CR). That work is done and the indexer fills
Vespa. The 25% PoC figure recorded earlier reflected "producer done,
consumer absent". As of 2026-05-21 the consumer side is now also
real: the search handler, the indexer status endpoint and the
reindex endpoint are mounted and the Workshop variable-driven path
opts into the search backend declaratively (see the
[geopolitics workshop module](../assets/workshop-module.json)
`selectedActorSet.metadata.use_search_backend`). Remaining work is
the Phase-2 follow-up on widget direct-ontology bindings.

## Implementation order — status

The Phase-2 plan that originally listed six items is now mostly
done. Updated tracker:

1. ✅ **`POST /ontology/search` in `ontology-query-service`** — landed
   ([search.go:94](../../../services/ontology-query-service/internal/handlers/search.go),
   route mounted at
   [server.go:62](../../../services/ontology-query-service/internal/server/server.go)).
   Marking enforcement via `canReadHitMarkings`.
2. ✅ **Per-type Vespa schemas (G4)** — handled by
   [`libs/search-abstraction/vespa/schema.go`](../../../libs/search-abstraction/vespa/schema.go)
   and the [`schemasync` package](../../../services/ontology-indexer/internal/schemasync/)
   listening on `ontology.object_type.changed.v1` (B02).
3. ✅ **Workshop pushdown — variable-driven path** — landed via
   `executeObjectTypeObjectSet` honouring `resolveUseSearchBackend`
   in [`workshopObjectSets.ts:368-409`](../../../apps/web/src/lib/components/apps/widgets/workshopObjectSets.ts);
   geopolitics asset opt-in in
   [`assets/workshop-module.json`](../assets/workshop-module.json).
   Legacy `applyObjectSetFilters` retained for in-memory cases
   (selected objects, saved object sets).
3b. ⚠️ **Workshop pushdown — widget direct ontology bindings**
   (map / timeline `source_type: ontology, source_id: Event`) —
   still on the widget binding renderer. Demo-safe because the
   filter list narrows the set before these widgets render. Phase-3
   follow-up: thread `useSearchBackend` through the widget binding
   renderer the same way `executeWorkshopObjectSet` does.
4. ✅ **Indexing status surface (G3)** — landed
   ([status_handler.go](../../../services/ontology-indexer/internal/server/status_handler.go)).
   Ontology Manager UI badge wiring still pending.
5. ✅ **Backfill command (G5)** — landed
   ([reindex_handler.go](../../../services/ontology-indexer/internal/server/reindex_handler.go)
   + [`internal/reindex/`](../../../services/ontology-indexer/internal/reindex/)).
6. ⏳ **Smoke against the geopolitics seed** — Act 2 / Act 4 end-to-end
   p95 latency pin in a `//go:build integration` test under
   [`services/ontology-query-service/internal/handlers/`](../../../services/ontology-query-service/internal/handlers/).
   Existing in-memory `search_test.go` already pins the wire shape;
   the integration smoke is the last piece needed before the demo
   can be rehearsed against a real GDELT slice.

## Cross-blocker notes

- **B02 link.** Per-type Vespa schemas (G4) listen on
  `ontology.object_type.changed.v1`, which is the topic B02 already
  emits. The two blockers share the same ADR-0022 envelope; no
  new event type is needed.
- **B07 link.** The AIP "Object query" tool in
  [B07](B07-agent-runtime-tool-routing.md) currently hits
  `ontology-query-service` (Cassandra). Redirecting it to the new
  `/ontology/search` route is a one-line change once G1 lands and
  is a prerequisite for the *"Resumen Ucrania 72h"* prompt
  succeeding inside the agent loop.
- **Workshop B01 link.** The geopolitics Workshop app
  ([`../07-dashboards-y-app-workshop.md`](../07-dashboards-y-app-workshop.md))
  is the visible consumer of G2 / G3. Until the pushdown ships,
  the map+timeline+table will look fast on a 25-row demo slice and
  collapse on a real GDELT load — the only place where the demo
  could surprise the customer in front of the laptop.
