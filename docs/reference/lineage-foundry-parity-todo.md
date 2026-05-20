# Data Lineage ↔ Foundry parity — residual TODO

Date: 2026-05-20
Status: ~93 % parity achieved across 8 phases + 2 follow-ups (Fases 1–8 +
description persistence + Cassandra wire-up). What follows is the punch
list of items that did not fit the UI-parity scope and require either a
model-level change, a new service, or deeper backend work.

## Done in this iteration

- Fases 1–8 of the Foundry parity roadmap — see commit log for the
  full file inventory. Coverage rose from ~22 % (initial audit) to
  ~87 % (end of Fase 8).
- Real persistence of node descriptions:
  - `lineage_node_descriptions` table + Goose-style migration.
  - `lineage.NodeDescriptionRepo` + `handlers.NodeDescriptionHandlers`.
  - `GET / PUT / DELETE /api/v1/lineage/nodes/{id}/description`.
  - 3 pure-helper tests + 8 HTTP-handler tests.
  - Frontend `lib/api/lineage-node-descriptions.ts` + new Description
    section in `NodePropertiesPanel` + auto-fetch on selection.
- Cassandra-backed `lineagestore` wire-up in
  `cmd/lineage-service/main.go` reading `CASSANDRA_CONTACT_POINTS`,
  `CASSANDRA_KEYSPACE`, `CASSANDRA_USERNAME`, `CASSANDRA_PASSWORD`.
  Falls back to in-memory on any failure with a warning log.

## Residual items

### 1. Cedar permission checks per node

**What:** Foundry's lineage view is filtered per-viewer: a user only
sees nodes they have at least read-access to, and "Open in app" links
respect the same. Today the lineage-service returns the full graph and
the frontend renders everything for any authenticated user.

**Why it matters:** Without per-node ACL we leak the existence of
sensitive datasets / pipelines to anyone who can hit `/api/v1/lineage`.
The marking-filter already exists for `LineageImpactItem` but the full
graph endpoint (`GetFullLineage`) does not consult Cedar policies.

**What's needed:**
- Backend: extend `lineage.FilterImpactForClaims` to a general
  `FilterGraphForClaims(graph, claims)` that walks every node + edge
  and drops anything the caller can't see (using the existing Cedar
  evaluator from `services/authorization-policy-service`).
- Backend: apply that filter in `handlers.GetFullLineage`,
  `GetDatasetLineage`, and `GetDatasetColumnLineage`.
- Backend: scope `SavedGraphRepo.List` and `GetByShareToken` so
  shared snapshots respect viewer markings (today the snapshot
  payload is opaque to the policy engine — we need a re-filter on
  read).
- Frontend: no visible change beyond fewer nodes; tests should
  verify the dim/hide UX for sensitive markings.
- Tests: integration tests with a Cedar policy that grants access
  to a subset of the graph and assert the full graph endpoint
  returns the filtered shape.

**Estimated complexity:** Medium-large. The Cedar evaluator already
exists; the work is wiring it across three handlers + writing the
test matrix. Roughly 2–3 days.

### 2. `schedule_rid` on the Build model for true "Color by schedule"

**What:** The Build Timeline Gantt offers a `colored by schedule`
mode (Fase 4). Today we approximate by hashing `Build.pipeline_rid`
into a colour palette — same pipeline = same colour. Foundry colours
by the *schedule* that triggered the build, which is finer-grained.

**Why it matters:** Two schedules over the same pipeline render with
the same colour, hiding scheduling differences from the user.

**What's needed:**
- Backend: add `schedule_rid TEXT NULL` to the `builds` table in
  `pipeline-build-service` + migration.
- Backend: extend `pipeline-build-service` build-trigger paths to
  carry the schedule rid through job creation; surface it on the
  `Build` JSON.
- Backend: extend the build-listing endpoints used by
  `listBuildsV1` so the new field is returned.
- Frontend: switch `buildTimeline.pipelineColor()` to
  `scheduleColor()` keyed on `build.schedule_rid` (falling back to
  pipeline_rid for legacy rows that don't have one yet).
- Tests: extend `buildTimeline.test.ts` to pin the new
  schedule-keyed colour.

**Estimated complexity:** Medium. Touches `pipeline-build-service`
schema + wire format + frontend client. ~1.5 days.

### 3. Real product tour

**What:** The Help menu's "Take the product tour" entry shows a
"coming soon" toast today.

**What's needed:**
- Frontend: a generic Stepper component that can highlight any DOM
  element by selector, render an arrow + balloon with copy, and
  walk through a script.
- Frontend: a Lineage-specific tour script covering: branch
  selector, search vs find, expand popover, properties panel,
  histogram, related items, build helper, schedules, save/share.
- Frontend: persist "tour completed" in `localStorage` or the
  user-preferences endpoint so it doesn't auto-replay.

**Estimated complexity:** Small-medium. ~2 days for a reusable
stepper + lineage tour script.

### 4. Issues backend (replace mailto placeholder)

**What:** `NodePropertiesPanel`'s "Report an issue" action opens a
`mailto:` URL pre-filled with the resource label / id / kind. There
is no issue tracker integration.

**What's needed:**
- Backend: a small `issues-service` (or extension of
  `governance-service` / `approvals-service`) with:
  - `POST /api/v1/issues` body `{ resource_id, kind, summary, body }`
  - `GET /api/v1/issues?resource_id=...` listing
  - storage table + migration
- Frontend: replace the `mailto:` shell with a modal form that
  POSTs to the new endpoint and surfaces the issue id back to the
  user.

**Estimated complexity:** Medium. The endpoint is straightforward
but it touches governance — decide whether to roll a fresh service
or fold into an existing one. ~3 days.

### 5. Kind-specific visual headers on nodes

**What:** Foundry renders extra visual headers on certain node
types — `MEDIA SET`, `MODULE`, `OBJECT TYPE` strip above the label;
distinctive icons inside the node body (airplane for transport
datasets, clock for delays, etc.). OpenFoundry uses a flat
chevron-pill with colour only.

**What's needed:**
- Frontend: extend the Cytoscape stylesheet with per-kind selectors
  rendering a header band via either a separate compound parent
  node or a stacked SVG overlay (similar to `NodeBadgeOverlay`).
- Frontend: optional kind→icon map for in-node glyphs.
- No backend change.

**Estimated complexity:** Small-medium. Cytoscape compound parents
are tricky but the work is contained. ~1.5 days.

### 6. Server-side saved-graphs filter / search / sort

**What:** `SavedGraphRepo.List` returns all of the caller's
snapshots ordered by `updated_at DESC`. With dozens of snapshots
per user the panel becomes hard to navigate.

**What's needed:**
- Backend: optional `?q=…`, `?branch=…`, `?has_share_link=true`
  query params on the list endpoint.
- Frontend: search input + filter chips on the snapshot panel.
- Cost: low. ~0.5 days.

### 7. Schedule details enrichment

**What:** Foundry's Manage Schedules side-panel surfaces fields we
don't render today — `Latest run`, `Last update`, `Target datasets`,
`When to build`, `Build scope`. We render the schedule's name,
trigger kind, and active/paused.

**What's needed:**
- Backend: schedules endpoint already returns most of these fields;
  audit `ScheduleSidebar` to consume them.
- Frontend: extend `ScheduleSidebar` rendering with the missing
  rows + a click-through to the schedule detail page.
- Cost: low. ~0.5 days.

### 8. Two-mode `Find` for catalog search

**What:** The Find tool searches `node.label` and (since Fase 7)
column names. A real Foundry catalog search also matches
`folder_path`, `created_by`, `marking`, etc. — anything indexed
server-side.

**What's needed:**
- Backend: a new `/api/v1/lineage/search?q=…` endpoint that hits
  the same Postgres/Cassandra indexes as the catalog service.
- Frontend: extend the Find popover with a third mode ("Catalog")
  that calls the new endpoint.
- Cost: medium. ~1.5 days because we need to wire across services.

## Out-of-scope notes

The following items showed up in Foundry screenshots but are
intentionally out of the lineage-service parity scope:

- **Workflow visualizations** (Foundry's "Workflow Lineage" was
  folded into Data Lineage in our launcher; the dedicated UI is
  not in our backlog because we routed everything through the
  unified `/lineage` page).
- **Live build telemetry overlay** (Foundry shows real-time job
  progress on running build bars — would require a Kafka or SSE
  wire from `pipeline-build-service` to the frontend).
- **In-graph annotations / sticky notes** (Foundry recently
  added freeform graph notes; not yet on our roadmap).

## How to pick this up

For each item:
1. Read the matching Fase summary in the chat transcript for full
   context — most decisions and trade-offs were captured there.
2. Inspect the relevant `apps/web/src/routes/lineage/LineagePage.tsx`
   sections; almost all UX cross-cuts route through there.
3. Backend work lives in `services/lineage-service/internal/{
   handlers, lineage, models, repo, server }` for lineage-scoped
   features; cross-service items list their target service
   explicitly above.
4. Always add at least one unit test + one HTTP-handler test for
   new backend surface; the existing `saved_graphs_test.go` is a
   good template.
