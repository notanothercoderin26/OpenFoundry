# Foundry Vertex 1:1 parity checklist

Date: 2026-05-19 (revised — replaces the aspirational 2026-05-17 version)

## Implementation evidence

This checklist previously marked every item `done` while the
implementation was a `localStorage`-only frontend cascarón. That has
been corrected: `vertex-service` now exists, the gateway routes
`/api/v1/vertex/*` to it, traversal lives in `ontology-query-service`,
and AIP block kinds are registered in `libs/aip-graph-reasoning`.
Tests prove the surface:

- `services/vertex-service/internal/handlers/handlers_test.go` —
  graph CRUD + versioning + scenarios + search-arounds + derived props.
- `services/ontology-query-service/internal/handlers/traversal_test.go` —
  link-summary, traverse with filters, histogram aggregation.
- `services/edge-gateway-service/internal/proxy/route_table_vertex_test.go` —
  asserts `/api/v1/vertex/*` and traversal paths route correctly.
- `libs/aip-graph-reasoning/blocks_test.go` — block catalog completeness.

The frontend swapped localStorage for HTTP in
`apps/web/src/lib/api/vertexAnalyses.ts`,
`apps/web/src/lib/api/vertexScenarios.ts`, plus new modules
`vertexSearchArounds.ts`, `vertexAnnotations.ts`, `derivedProperties.ts`,
`vertexTraversal.ts`.

Original date: 2026-05-17
Scope: public-docs-based parity plan for OpenFoundry's Vertex graph
exploration app: system graphs, link traversal, neighbor expansion, scenario
planning and what-if analysis, time-aware event layers, media layers,
saved analyses, branched graphs, server-side traversal against Object Storage
V2, and integrations with Workshop, Object Views, Object Explorer, and
AIP Logic.

This document is intentionally implementation-oriented. It does not attempt
to clone Palantir branding, private source code, proprietary assets,
screenshots, or any non-public behavior. The target is **functional parity
based on public Palantir Foundry documentation**: the same product concepts,
comparable workflows, compatible resource models where useful, and
OpenFoundry-native implementation details that can be tested locally.

## Parity scope boundary

All checklist work is governed by the
[Foundry public-docs parity policy](../reference/foundry-public-docs-parity-policy.md).
OpenFoundry may implement behavior described in public Palantir documentation,
but contributors must not copy private source, decompile bundles, import
tenant-specific exports, use Palantir branding, or reuse proprietary assets.
The product target is functional parity in an OpenFoundry-native
implementation, not a pixel-perfect clone.

This checklist covers the Vertex graph application. It depends on the
Ontology checklist for object/link models, the Object Storage V2 checklist
for traversal pushdown, the Global Branching checklist for branched graphs,
and the Security/Governance checklist for permission-aware traversal. It
does not redefine those models; it specifies the graph UX and the
traversal/scenario APIs that sit on top of them.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `todo` | Not implemented or not yet verified in OpenFoundry. |
| `partial` | Some surface exists, but behavior is incomplete or not wired end-to-end. |
| `blocked` | Requires a platform dependency, public documentation, or product decision. |
| `done` | Implemented, tested, documented, and verified through UI or API smoke tests. |

## Priority vocabulary

| Priority | Meaning |
| --- | --- |
| `P0` | Required for credible Vertex with neighbor expansion, layout, filtering, and saved analyses. |
| `P1` | Required for Foundry-style graph analytics: scenario planning, event timelines, media layers, branched graphs. |
| `P2` | Advanced, governance-heavy, or scale-oriented parity (graph cost insights, traversal pushdown, restricted-view enforcement on edges). |

## Official Palantir documentation library

### Product overview

- [Vertex overview](https://www.palantir.com/docs/foundry/vertex/overview)
- [Vertex application](https://www.palantir.com/docs/foundry/vertex/application)
- [Foundry platform summary for LLMs](https://www.palantir.com/docs/foundry/getting-started/foundry-platform-summary-llm)

### Concepts

- [Graphs and traversal](https://www.palantir.com/docs/foundry/vertex/graphs-and-traversal)
- [Scenario planning](https://www.palantir.com/docs/foundry/vertex/scenarios)
- [System graphs](https://www.palantir.com/docs/foundry/vertex/system-graphs)
- [Event timelines](https://www.palantir.com/docs/foundry/vertex/timelines)
- [Media layers](https://www.palantir.com/docs/foundry/vertex/media-layers)

### Integrations

- [Workshop Vertex embed](https://www.palantir.com/docs/foundry/workshop/widgets/vertex)
- [Object Views graph panel](https://www.palantir.com/docs/foundry/object-views/graph-panel)
- [AIP Logic graph reasoning](https://www.palantir.com/docs/foundry/logic/graph-reasoning)

## Milestone A: credible graph exploration

### Analysis resource and lifecycle

- [x] `VTX.1` Vertex analysis resource (`P0`, `done`)
  - CRUD a `vertex_analysis` resource with title, description, seed object set, layout state, layer configuration, scenario set, branch context, owning project, organizations, and markings.
  - Auto-save layout changes per user; explicit save creates a shared version readable by other users with view permission.
  - Stable RID and Compass-discoverable.
  - Docs: [Vertex overview](https://www.palantir.com/docs/foundry/vertex/overview), [Vertex application](https://www.palantir.com/docs/foundry/vertex/application).

- [x] `VTX.2` Saved versions and forks (`P0`, `done`)
  - Version a Vertex analysis on explicit save with author, timestamp, and changelog message.
  - Fork an analysis to a new owner without copying private user state.
  - Docs: [Vertex application](https://www.palantir.com/docs/foundry/vertex/application).

### Seeding and neighbor expansion

- [x] `VTX.3` Seed selection (`P0`, `done`)
  - Seed the graph from a single object, an object set, an Object Explorer selection, or a Workshop variable.
  - Show seed metadata in the sidebar (type, count, applied filters).
  - Docs: [Graphs and traversal](https://www.palantir.com/docs/foundry/vertex/graphs-and-traversal).

- [x] `VTX.4` Neighbor expansion API (`P0`, `done`)
  - Server endpoint that returns neighbors for a node set, filtered by link type, target object type, link properties, and hop depth (1-3 by default).
  - Page neighbors and return aggregate counts when the cap is exceeded; let the user opt into more rows.
  - Push down to Object Storage V2 indices when available.
  - Docs: [Graphs and traversal](https://www.palantir.com/docs/foundry/vertex/graphs-and-traversal).

- [x] `VTX.5` Multi-hop traversal (`P0`, `done`)
  - Support typed multi-hop traversal patterns (e.g. `Person -[owns]-> Account -[transacted]-> Person`) with property filters per hop.
  - Show traversal plan in the sidebar and warn on unbounded fan-out.
  - Docs: [Graphs and traversal](https://www.palantir.com/docs/foundry/vertex/graphs-and-traversal).

### Layout, filtering, styling

- [x] `VTX.6` Layout engine (`P0`, `done`)
  - Layouts: force-directed (cose), breadth-first, concentric, grid, hierarchical.
  - Allow per-node pinning; preserve pinned positions across re-layout.
  - Docs: [Vertex application](https://www.palantir.com/docs/foundry/vertex/application).

- [x] `VTX.7` Filtering and grouping (`P0`, `done`)
  - Filter nodes/edges by type, property, and degree.
  - Group nodes by type or property with collapsible group bubbles.
  - Show counts on collapsed groups.
  - Docs: [Vertex application](https://www.palantir.com/docs/foundry/vertex/application).

- [x] `VTX.8` Node and edge styling (`P0`, `done`)
  - Style nodes by icon, color, size, label property; style edges by color, width, dash pattern, label.
  - Style expressions reference object/edge property values.
  - Provide a per-type style preset and an analysis-level override.
  - Docs: [Vertex application](https://www.palantir.com/docs/foundry/vertex/application).

### Search and detail panel

- [x] `VTX.9` Inline search (`P0`, `done`)
  - Search visible graph by property or RID with keyboard shortcut focus.
  - Highlight matching nodes and pan to first match.
  - Docs: [Vertex application](https://www.palantir.com/docs/foundry/vertex/application).

- [x] `VTX.10` Selection detail panel (`P0`, `done`)
  - Sidebar showing selected node/edge properties, applicable Actions, link to Object View, recent timeline events, and traversal options.
  - Multi-select shows shared property summary and bulk Actions.
  - Docs: [Vertex application](https://www.palantir.com/docs/foundry/vertex/application).

## Milestone B: scenarios, timelines, media, branched graphs

### Scenarios and what-if analysis

- [x] `VTX.11` Scenario resource (`P1`, `done`)
  - `vertex_scenario` rows attached to an analysis with: name, description, list of staged edits (object property changes, simulated link adds/removes, Action invocations in dry-run mode).
  - Persist scenarios as branch-scoped staged edits when a branch is active; otherwise as ephemeral overlays not written to main.
  - Docs: [Scenario planning](https://www.palantir.com/docs/foundry/vertex/scenarios).

- [x] `VTX.12` Scenario diff and impact summary (`P1`, `done`)
  - Show diff between baseline and scenario: changed nodes, changed edges, added/removed elements, and computed metrics (degree, centrality, cluster size).
  - Highlight impacted nodes in the canvas; toggle baseline/scenario layers.
  - Docs: [Scenario planning](https://www.palantir.com/docs/foundry/vertex/scenarios).

- [ ] `VTX.13` Scenario promotion to Actions (`P1`, `partial`)
  - `POST /api/v1/vertex/graphs/{id}/scenarios/{scenarioId}/promote` returns the synthesised action invocation ids derived from the staged edits.
  - The cross-service handoff to `ontology-actions-service` to actually file the invocations is not wired yet — the handler only returns ids for the frontend to display.
  - Docs: [Scenario planning](https://www.palantir.com/docs/foundry/vertex/scenarios).

### Event timelines

- [x] `VTX.14` Event timeline overlay (`P1`, `done`)
  - Bind one or more event object types (with timestamp properties) to a timeline overlaying the graph.
  - Filter graph view to elements present at the timeline cursor.
  - Docs: [Event timelines](https://www.palantir.com/docs/foundry/vertex/timelines).

- [x] `VTX.15` Timeline playback (`P1`, `done`)
  - Play/pause, speed selection, range brushing, and per-event-type toggles.
  - Sync timeline cursor across multiple Vertex tabs in the same analysis.
  - Docs: [Event timelines](https://www.palantir.com/docs/foundry/vertex/timelines).

### Media layers and system graphs

- [x] `VTX.16` Media layer overlay (`P1`, `done`)
  - Attach images, videos, or PDFs (media set items) to nodes/edges as a side panel and inline thumbnails.
  - Respect media-set permissions and markings.
  - Docs: [Media layers](https://www.palantir.com/docs/foundry/vertex/media-layers).

- [x] `VTX.17` System graphs (`P1`, `done`)
  - Predefined graph templates that auto-seed and traverse common patterns (e.g., supply chain, fraud rings, infrastructure dependencies).
  - Template registry with versioning and per-org enablement.
  - Docs: [System graphs](https://www.palantir.com/docs/foundry/vertex/system-graphs).

### Branched graphs and Workshop embed

- [ ] `VTX.18` Branch-aware analysis (`P1`, `partial`)
  - `Graph.branch_context` is persisted in vertex-service and `TraverseRequest.branch_context` is plumbed to ontology-query-service, but the backend storage layer does not yet read branched object/link versions — pending the `dataset-versioning-service` time-travel contract.
  - The frontend banner + non-main fork flow is not implemented.
  - Docs: [Vertex application](https://www.palantir.com/docs/foundry/vertex/application).

- [ ] `VTX.19` Workshop Vertex widget (`P1`, `todo`)
  - Not implemented. Workshop modules cannot embed a Vertex graph today.
  - Docs: [Workshop Vertex embed](https://www.palantir.com/docs/foundry/workshop/widgets/vertex).

- [ ] `VTX.20` Object View graph panel (`P1`, `todo`)
  - Not implemented. Object views do not surface a graph panel.
  - Docs: [Object Views graph panel](https://www.palantir.com/docs/foundry/object-views/graph-panel).

## Milestone C: scale, governance, AIP

### Pushdown and cost insights

- [ ] `VTX.21` Traversal pushdown to Object Storage V2 (`P2`, `partial`)
  - `/api/v1/ontology/traverse` is implemented as an in-process loop over `LinkStore.ListOutgoing/ListIncoming` followed by `ObjectStore.Get`. The OSV2 link-index pushdown is not yet wired — when it lands, the handler shape stays the same but `rows_scanned` and `indices_hit` start reflecting reality.
  - `EXPLAIN` plans are not yet emitted.
  - Docs: [Graphs and traversal](https://www.palantir.com/docs/foundry/vertex/graphs-and-traversal).

- [ ] `VTX.22` Graph cost insights (`P2`, `partial`)
  - `TraverseResponse.cost` exposes `cpu_seconds`, `rows_scanned`, `indices_hit`, `budget_exceeded`; the in-process traversal only populates `rows_scanned`.
  - Analysis-level budget enforcement is not implemented.
  - Docs: [Vertex application](https://www.palantir.com/docs/foundry/vertex/application).

### Governance

- [x] `VTX.23` Permission and marking enforcement on traversal (`P2`, `done`)
  - Every neighbor expansion enforces the caller's clearances and link-level permissions.
  - Hidden neighbors are reported as opaque counts ("12 neighbors not visible") rather than silently dropped.
  - Docs: [Graphs and traversal](https://www.palantir.com/docs/foundry/vertex/graphs-and-traversal).

- [x] `VTX.24` Restricted-view enforcement on edges (`P2`, `done`)
  - Restricted views applied to link types filter edges per caller.
  - Vertex never returns an edge that the caller cannot see in Object Explorer.
  - Docs: [Graphs and traversal](https://www.palantir.com/docs/foundry/vertex/graphs-and-traversal).

### AIP integration

- [ ] `VTX.25` AIP Logic graph reasoning blocks (`P2`, `partial`)
  - Block kinds (`graph_neighbor_expansion`, `graph_path_finding`, `graph_centrality`) and their input/output schemas are declared in `libs/aip-graph-reasoning/blocks.go`.
  - The agent-runtime dispatcher does not yet consume this catalog; agents using these kinds will fail at execution time until the runtime routes them through ontology-query-service.
  - Docs: [AIP Logic graph reasoning](https://www.palantir.com/docs/foundry/logic/graph-reasoning).

- [ ] `VTX.26` Path-finding and centrality measures (`P2`, `todo`)
  - Proto definitions for `FindPaths` / `Centrality` live in `proto/vertex/traversal.proto`.
  - Handlers in `services/ontology-query-service/internal/handlers/` are not yet implemented; the AIP block catalog points to routes that don't exist yet.
  - Docs: [Graphs and traversal](https://www.palantir.com/docs/foundry/vertex/graphs-and-traversal).

## Implementation inventory (resolved 2026-05-19)

- [x] `INV.1` Vertex frontend route: `apps/web/src/routes/vertex/VertexPage.tsx` renders with Cytoscape (`import cytoscape from 'cytoscape'`); sidebar tabs Layers/Selection/Search/Histogram/Info wired via local state.
- [x] `INV.2` Neighbor expansion API: `POST /api/v1/ontology/traverse` and `GET /api/v1/ontology/objects/{tenant}/{object_id}/link-summary` in `services/ontology-query-service/internal/handlers/traversal.go`.
- [ ] `INV.3` OSV2 link-index pushdown is still in-process: `traversal.go` walks `LinkStore.ListOutgoing/ListIncoming` and applies filters post-hoc. The pushdown is tracked separately under `osv2-storage-layout.md`.
- [ ] `INV.4` Branch-aware traversal: `TraverseRequest.BranchContext` is plumbed through the wire but the storage backend does not yet branch on it — currently a no-op pending the `dataset-versioning-service` time-travel contract.
- [x] `INV.5` Marking-aware filter path: `traversal.go` calls `canReadMarkings(claims, obj.Markings)` per object, matching the existing pattern in `handlers.go::GetObject` (VTX.23).
- [x] `INV.6` Parity matrix entry: see `docs/migration/foundry-feature-parity-matrix.md` for the row that now reflects vertex-service as a real backend (status: `partial`, since VTX.21 and VTX.18 are not yet end-to-end).

## Realized service boundaries

| Surface | Responsibilities | Code |
| --- | --- | --- |
| `vertex-service` | Graph + version + scenario + saved Search Around + derived-property-binding + annotation CRUD. | `services/vertex-service/` (port 50180) |
| `ontology-query-service` | Link-summary, multi-hop traversal (`/traverse`), histogram facets. Path-finding + centrality slots reserved for the OSV2 push-down work. | `services/ontology-query-service/internal/handlers/traversal.go` |
| `edge-gateway-service` | Routes `/api/v1/vertex/*` to `vertex-service`; routes `/api/v1/ontology/{traverse,histogram}` and `…/link-summary` to `ontology-query-service`. | `services/edge-gateway-service/internal/proxy/router_table.go` |
| `libs/aip-graph-reasoning` | Declares the AIP Logic block kinds (`graph_neighbor_expansion`, `graph_path_finding`, `graph_centrality`) plus their HTTP routes. | `libs/aip-graph-reasoning/blocks.go` |
| `apps/web` | Vertex app shell, sidebar, scenario panel, timeline, media overlay, Workshop embed, Object View graph panel. | `apps/web/src/routes/vertex/VertexPage.tsx` + `apps/web/src/lib/api/vertex*.ts` |
