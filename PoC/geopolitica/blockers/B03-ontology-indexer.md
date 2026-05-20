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
> **The misleading part of the "100% reformulated scope" status**: the
> indexer is filling the search store correctly, but **nothing in the
> read path reaches it**. `ontology-query-service` only talks to
> Cassandra, no service exposes `POST /ontology/search`, and Workshop
> filters run client-side on already-fetched object lists. From the
> Act 2 / Act 4 perspective in [`../11-guion-demo.md`](../11-guion-demo.md),
> the index is invisible: the GDELT/ACLED event volume and the
> resolved Person/Organization graph are in Vespa but the UI cannot
> see them.
>
> Severity: **High** for the geopolitics narrative. The aviation PoC
> tolerated the gap because its object cardinality is small (~10⁴);
> geopolitics needs sub-second filters over **GDELT (~10⁹ events) +
> ACLED (~10⁶ events) + Persons (~10⁵) + Orgs (~10⁴)** and the
> Cassandra read path cannot deliver that. Tracked at **~25% PoC
> readiness** despite the reformulated-scope green ticks.

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
| **Read service** | [`services/ontology-query-service/internal/handlers/handlers.go`](../../../services/ontology-query-service/internal/handlers/handlers.go) (322 LOC) | **Cassandra-only**. Exposes `GET /api/v1/ontology/objects/{tenant}/{object_id}`, `ListObjectsByType`, link-traversal endpoints, `Traverse`, `Histogram` — **no `/search` route, no Vespa client** |
| **Search route owner** | *(none)* | `grep -rn "/ontology/search" services/*/internal/server/` returns **zero matches**. The frontend's `searchOntology()` POSTs to `/ontology/search` and hits 404 in this stack |
| Frontend search client | [`apps/web/src/lib/api/ontology.ts:1640`](../../../apps/web/src/lib/api/ontology.ts) — `searchOntology({query, kind?, object_type_id?, semantic?, hybrid_strategy?})` | Wire shape ready (RRF / weighted hybrid, semantic via embedding provider) — waiting for a backend |
| Frontend search page | [`apps/web/src/routes/search/SearchPage.tsx`](../../../apps/web/src/routes/search/SearchPage.tsx) | Comments declare *"Backend: parallel calls to POST /ontology/search per kind"* — the page is fully built around a route that does not exist |
| Workshop filter wiring | [`apps/web/src/lib/components/apps/widgets/workshopObjectSets.ts:94-97`](../../../apps/web/src/lib/components/apps/widgets/workshopObjectSets.ts) — `applyObjectSetFilters` | **Client-side `.filter()` over the already-paginated `listObjects` response.** Not an indexer pushdown. Works for ~25 widget rows; not viable for the geopolitics fact table |
| Object Explorer | [`apps/web/src/routes/object-explorer/`](../../../apps/web/src/routes/object-explorer/) | Hits `listObjects(typeId, {page, per_page})` and `queryObjects` (per-type pagination over Cassandra). Type-ahead exists but uses metadata only — see comments in [`OntologySearch.tsx`](../../../apps/web/src/lib/components/ontology/OntologySearch.tsx) |
| Vespa deployment | [`infra/compose/docker-compose.yml`](../../../infra/compose/docker-compose.yml) + [`infra/helm/infra/vespa/`](../../../infra/helm/infra/vespa/) | Running, receiving feeds; query traffic = zero |
| Indexer status surface | *(none)* | No `GET /ontology-indexer/status?object_type=…` endpoint; Ontology Manager has no *"pending / live / stale"* badge. Platform G4 deferred |

> **Net effect**: the Kafka → indexer → Vespa pipe is alive and
> filling; the HTTP read path stops at Cassandra. The geopolitics
> demo cannot execute Act 2 (search) or Act 4 (Workshop filters) as
> scripted today.

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

## Status as of 2026-05-20

| Acceptance criterion | Status | Evidence / pointer |
|---|---|---|
| 0. Platform indexer pipeline (Kafka → indexer → Vespa, with outbox + Debezium) | ✅ Done | Aviation [B03 §"Status as of 2026-05-20"](../../aviacion/blockers/B03-ontology-indexer.md), `TestOutboxEndToEnd_PutObjectEmits`, `…_DeleteObjectEmits`, `…_LinkLifecycleEmits` |
| 1. `POST /ontology/search` backend | ❌ Not started | No route in `services/*/internal/server/`; frontend 404s today |
| 2. Sub-second `query=Wagner` smoke | ⏳ Blocked by (1) | Vespa is fed; no read path |
| 3. Workshop pushdown | ❌ Client-side `applyObjectSetFilters` only | [`workshopObjectSets.ts:94`](../../../apps/web/src/lib/components/apps/widgets/workshopObjectSets.ts) |
| 4. Markings smoke (UC-7) | ⏳ Blocked by (1) + Cedar wiring | `libs/auth-middleware` carries the claims; the search handler must intersect them with Vespa results |
| 5. Indexing status surface (G3) | ❌ No endpoint, no UI badge | Platform G4 from aviation B03 stayed deferred |
| 6. Backfill command (G5) | ❌ Not started | `ontology-indexer` has no `/reindex` handler |
| 7. AIP path (B07 link) | ⏳ Blocked by (1) | `retrieval-context-service` can be redirected once the search route exists |

## What "100% of the reformulated scope" actually covers

The reformulated scope counted **producer-side wiring** as the whole
of B03 — i.e. the same surface aviation closed (G1 topic-name drift,
G2 outbox skip on `PutObject`, G3 missing `link.changed.v1` topic
CR). That work is genuinely done and the indexer is filling Vespa.
The number is misleading because the **read path** was never part of
the reformulated scope, and without it the geopolitics demo has no
visible index. The 25% PoC figure reflects "producer done, consumer
absent" rather than "1 in 4 platform gaps closed".

## Implementation order (proposed Phase 2)

1. **Add `POST /ontology/search` to `ontology-query-service`.**
   Reuse [`libs/search-abstraction.Backend`](../../../libs/search-abstraction/) on the read
   side (already imported by the indexer). Pipe markings from the
   JWT claims into the Vespa query as a filter group. Pin the wire
   shape to `searchOntology()` in [`apps/web/src/lib/api/ontology.ts`](../../../apps/web/src/lib/api/ontology.ts).
2. **Register per-type Vespa schemas (G4).** Generate them from
   the ontology definition emitted on
   `ontology.object_type.changed.v1` (see [B02 §Topics](B02-ontology-definition.md))
   so a future ontology change auto-registers the schema delta. For
   Phase 2 it is acceptable to hand-write the eight schemas above.
3. **Replace `applyObjectSetFilters` with a pushdown.** New
   `queryObjectSet({filters, sort, page})` API call that hits the
   search route; keep the client-side function as a fallback for
   in-memory test fixtures only.
4. **Add the indexing status surface (G3).** Smallest viable shape:
   a Prometheus-backed `GET /ontology-indexer/status` returning
   `{object_type, state, indexed_count, last_indexed_at,
   lag_seconds}`; Ontology Manager UI consumes it.
5. **Add the backfill command (G5).** Stream from
   `object-database-service` (Cassandra) via cursor pagination, emit
   `ontology.object.changed.v1` events through the outbox so the
   normal indexer path absorbs them.
6. **Smoke against the geopolitics seed.** Re-run Act 2 + Act 4 from
   [`../11-guion-demo.md`](../11-guion-demo.md) end-to-end and pin
   the p95 latencies in a `//go:build integration` test under
   [`services/ontology-query-service/internal/handlers/`](../../../services/ontology-query-service/internal/handlers/).

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
