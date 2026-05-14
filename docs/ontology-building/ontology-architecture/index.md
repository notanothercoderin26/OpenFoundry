# Ontology architecture

The ontology architecture is the part of OpenFoundry that turns many independent platform services into one operational system.

Without this layer, the repo is still a capable data and workflow platform. With this layer, it can become a governed semantic operating system.

## CQRS model and the three planes

The ontology stack is structured as a CQRS (Command Query Responsibility Segregation) architecture across three cooperating planes.

### Control plane

Owned by `ontology-definition-service` (port 50103).

The control plane is the single source of truth for all schema and governance definitions:

- object types, properties, and interfaces
- shared property types
- link types
- action type definitions
- function package metadata and versioning
- object-set definitions
- funnel source definitions
- project, branch, proposal, and migration governance

Schema changes are compiled into versioned `schema_bundle` snapshots and distributed to cells.  The control plane never serves operational object data, graph traversal, or search results.

### Write plane

Owned by `object-database-service` (port 50104).

The write plane is the single write authority for all operational object data:

- `object_instances` — current mutable state of every object
- `link_instances` — current mutable state of every link
- `object_revisions` — append-only audit history for every object mutation
- `link_revisions` — append-only audit history for every link mutation
- `write_outbox` — transactional outbox for publishing change events to NATS JetStream

Every mutation (direct write, action execution, or funnel upsert) goes through `object-database-service`.  It writes the current state, appends a revision record, and inserts an outbox row in a single transaction.  No other service mutates object or link data directly.

### Read / serving plane

Owned by `ontology-query-service` (port 50105).

The read plane serves all hot query paths exclusively from pre-computed read models.  It never scans the write-side tables for search, graph, or KNN:

- `obj_current_projection` — denormalized current state for point lookups and filter queries
- `link_adjacency_projection` — pre-expanded adjacency list for graph and neighbor serving
- `search_document_projection` — hybrid FTS + vector serving document (lexical and semantic search)
- `knn_vector_projection` — per-property vector store for nearest-neighbor retrieval
- `object_view_projection` — enriched object view cache for the UI surface
- `object_set_membership` — incremental row-level representation of object-set members
- `funnel_health_projection` — explicit health model for funnel sources

Read models are refreshed asynchronously by consumers reading from the `write_outbox` stream.

## The ontology services

| Service | Port | Responsibility | Status |
| --- | --- | --- | --- |
| `ontology-definition-service` | 50103 | Control plane: schema, governance, definitions | ✅ shipped |
| `object-database-service` | 50104 | Write authority: objects, links, revisions, outbox | ✅ shipped |
| `ontology-query-service` | 50105 | Serving: search, graph, views, KNN, object sets | ✅ shipped |
| `ontology-actions-service` | 50106 | Mutations: action validation, planning, execution (also currently hosts funnels and function metadata) | ✅ shipped |
| `ontology-indexer` | n/a (worker) | Kafka worker projecting ontology changes into the search backend | ✅ shipped |
| `ontology-exploratory-analysis-service` | n/a | Time-series, geospatial, scenarios | ✅ shipped |
| Funnel runtime | 50107 (target) | Batch funnel runs, health, backfills | 📐 currently inside `ontology-actions-service` + `ingestion-replication-service`; a dedicated binary is a target split |
| Functions runtime | 50108 (target) | TypeScript / Python sandbox | 📐 currently inside `ontology-actions-service` + lib `python-sidecar`; a dedicated binary is a target split |
| Authorization policy | 50109 (target) | Policy compilation, visibility pushdown | ✅ shipped as platform-wide `authorization-policy-service` (Cedar engine + `libs/authz-cedar-go`) |

> The "funnel", "functions" and "security" rows above were originally planned as dedicated `ontology-funnel-service` / `ontology-functions-service` / `ontology-security-service` binaries. Those splits have **not landed** in the Go monorepo; their capabilities are consolidated as noted. The CQRS planes below describe the **target architecture** and remain accurate at the boundary level.

## Write path

```text
caller (action / funnel / direct API)
    |
    v
object-database-service
    |-- writes object_instances + object_revisions + write_outbox (one transaction)
    |
    v
NATS JetStream (write_outbox relay)
    |
    +--> ontology-query-service projection consumers
    |       (refresh obj_current_projection, link_adjacency_projection,
    |        search_document_projection, knn_vector_projection,
    |        object_view_projection, object_set_membership,
    |        funnel_health_projection)
    |
    +--> authorization-policy-service bundle invalidation consumer
```

## Read path

```text
API client
    |
    v
gateway -> ontology-query-service
    |
    +--> Redis cache (hot objects, recent search results)
    |
    +--> obj_current_projection        (filter / point-lookup queries)
    +--> link_adjacency_projection     (graph traversal, neighbors)
    +--> search_document_projection    (hybrid search)
    +--> knn_vector_projection         (KNN queries)
    +--> object_view_projection        (enriched object view)
    +--> object_set_membership         (object-set serving)
    |
    +--> policy_visibility_projection  (security pushdown, compiled by authorization-policy-service)
```

Fallback: when a request requires read-your-own-write consistency, `ontology-query-service` may perform a targeted point-read against `object-database-service` for the specific object ID.

## Security path

`authorization-policy-service` (the platform-wide Cedar decision point) compiles access policies into `policy_bundle` snapshots and expands them into `policy_visibility_projection` rows. Query and action services consume these projections as SQL predicates, eliminating the need to fetch objects before filtering. The bundle distribution pattern is documented in [security-governance / Policy bundles in-process](../../security-governance/policy-bundles.md).

Policy bundles are versioned and distributed to cells.  Each cell applies the latest local bundle without a synchronous call to the security service.

## What reads the transactional store

Only narrow cases bypass the read models and go directly to the write store:

- GET /objects/{id} — when the caller needs strong consistency after a write
- GET /links/{id} — same
- CRUD of definitions in the control plane
- Action validation against the current state of a specific object
- Governance flows (branch/proposal/migration reads)

Everything else (search, graph, KNN, object views, object-set serving, neighbors, analytics) reads from projections.

## Cell topology

Each deployment cell contains a complete ontology stack:

- `edge-gateway-service`
- `object-database-service` (today backed by Cassandra/Scylla in the active deployment; Postgres HA via CloudNativePG remains an option per [ADR-0010](../../architecture/adr/ADR-0010-cnpg-postgres-operator.md))
- `ontology-query-service` with local cache and read replicas
- `ontology-actions-service` (also hosts funnels and function metadata until those split out)
- `authorization-policy-service` (platform-wide; bundle distributed per cell)
- `ontology-indexer` (Kafka worker → search backend)
- `ontology-exploratory-analysis-service`
- local NATS JetStream (3-node cluster)

`ontology-definition-service` operates as a regional/global control plane and distributes `schema_bundle` and `policy_bundle` snapshots to each cell.

Objects live in a single home cell.  Searches are cell-local first.  Cross-cell queries are explicit federation fan-outs, not transparent remote joins.

## What still needs work

The main gaps to reach this target:

- projection consumer workers (write_outbox → read models) not yet implemented
- pgvector activation for knn_vector_projection and search_document_projection (Phase 2)
- per-cell schema and policy bundle replication (Phase 3)
- physical database separation of control plane, write store, and read store (Phase 2)
- Redis cache layer integration in ontology-query-service (Phase 2)

## Related pages

- [Indexing and materialization](/ontology-building/indexing-and-materialization)
- [Object edits and conflict resolution](/ontology-building/object-edits-and-conflict-resolution)
- [Action types](/ontology-building/action-types)
- [Functions](/ontology-building/functions)
