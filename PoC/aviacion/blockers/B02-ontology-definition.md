# B02 — Ontology definition service — emit schema events to the bus

> **Scope revised 2026-05-20.** The earlier framing of this file claimed
> the service was a stub. A scrupulous read of the code (services/ +
> libs/ontology-kernel/) showed the service has 6,004 LOC of Go, 7 SQL
> migrations covering ~35 tables, full CRUD HTTP for object types /
> link types / properties / object-type-groups, JWT auth, Cedar-style
> permission checks, restricted-view policy validation, audit log,
> optimistic-concurrency versioning, and an atomic Review-edits
> batch-save endpoint. Action-types CRUD is already exposed by
> `ontology-actions-service` via `libs/ontology-kernel/handlers/actions/`
> (6,775 LOC). See "Current OpenFoundry surface" below for evidence.
>
> Severity: **High** (down from Critical) — what remains is **bus
> integration**, not a CRUD rewrite. Without `ontology.schema.v1`
> events on Kafka, the indexer ([B03](B03-ontology-indexer.md)),
> schema-bundle distribution to cells, and any downstream consumer
> are silent. The schema-CRUD surface itself is platform-viable.

## Identity

| Field | Value |
|---|---|
| OpenFoundry service | [services/ontology-definition-service/](../../services/ontology-definition-service/) |
| Launcher app | **#2 Ontology Manager** — internal id `ontology-manager`, route `/ontology-manager` ([launcher-app-mapping.md §B](../../docs/reference/launcher-app-mapping.md)) |
| Foundry product | [Ontology Manager](https://www.palantir.com/docs/foundry/ontology-manager/overview/) |
| PoC act(s) | **Act 2** — "Aviation ontology / Ontology Manager object types, link types, properties, interfaces" ([00-contrato §Foundry-native capability mapping](../00-contrato-foundry-native.md)) |
| 1-to-1 checklist | [foundry-ontology-manager-object-views-1to1-checklist.md](../../docs/migration/foundry-ontology-manager-object-views-1to1-checklist.md) |
| Parity matrix module | Ontology Manager / Object Views (see [foundry-feature-parity-matrix.json](../../docs/migration/foundry-feature-parity-matrix.json)) |

## Palantir reference (public docs)

| Page | Live URL | Local scraped MD | Full-page screenshot |
|---|---|---|---|
| Ontology Manager overview | https://www.palantir.com/docs/foundry/ontology-manager/overview/ | [Seed URLs/Ontology Manager/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Ontology%20Manager/Overview.md) | [Seed URLs/Ontology Manager/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Ontology%20Manager/Overview.screenshot.png) |
| Ontology overview | https://www.palantir.com/docs/foundry/ontology/overview/ | [Seed URLs/Ontology/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Ontology/Overview.md) | [Seed URLs/Ontology/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Ontology/Overview.screenshot.png) |
| Object/Link type reference | https://www.palantir.com/docs/foundry/object-link-types/type-reference/ | [Seed URLs/Object Link Types/Type Reference.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Link%20Types/Type%20Reference.md) | [Seed URLs/Object Link Types/Type Reference.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Link%20Types/Type%20Reference.screenshot.png) |
| Object types overview | https://www.palantir.com/docs/foundry/object-link-types/object-types-overview/ | [Seed URLs/Object Link Types/Object Types Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Link%20Types/Object%20Types%20Overview.md) | [Seed URLs/Object Link Types/Object Types Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Link%20Types/Object%20Types%20Overview.screenshot.png) |
| Link types overview | https://www.palantir.com/docs/foundry/object-link-types/link-types-overview/ | [Seed URLs/Object Link Types/Link Types Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Link%20Types/Link%20Types%20Overview.md) | [Seed URLs/Object Link Types/Link Types Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Link%20Types/Link%20Types%20Overview.screenshot.png) |
| Action types overview | https://www.palantir.com/docs/foundry/action-types/overview/ | [Seed URLs/Action Types/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Overview.md) | [Seed URLs/Action Types/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Overview.screenshot.png) |
| Action rules | https://www.palantir.com/docs/foundry/action-types/rules/ | [Seed URLs/Action Types/Rules.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Rules.md) | [Seed URLs/Action Types/Rules.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Rules.screenshot.png) |
| Use actions in platform | https://www.palantir.com/docs/foundry/action-types/use-actions/ | [Seed URLs/Action Types/Use Actions.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Use%20Actions.md) | [Seed URLs/Action Types/Use Actions.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Use%20Actions.screenshot.png) |

## Foundry behavior to replicate (summary)

The Ontology is a typed graph: **Object Types** (`Aircraft`, `Flight`),
**Link Types** between them (`Aircraft → operates → Flight`), and
**Property metadata** (primary key, display name, data type, indexing
flags, permissions). The Ontology Manager lets a curator browse, create,
and version these types via a UI; an API mirror exists for code-first
authoring. The definitions in the Manager are what every downstream
product (Object Explorer, Workshop, AIP) consumes. Crucially, every
write is observable downstream — the indexer, schema-bundle
distribution, search projections, and audit pipelines all react
because the platform emits **schema-change events** on the data bus.

## Current OpenFoundry surface (evidence)

| Layer | File | State |
|---|---|---|
| Service main | [services/ontology-definition-service/cmd/ontology-definition-service/main.go](../../services/ontology-definition-service/cmd/ontology-definition-service/main.go) | 75 LOC, real bootstrap: pgxpool, JWT, tracing, metrics, probes, server |
| Handlers (object types) | [internal/handlers/handlers.go](../../services/ontology-definition-service/internal/handlers/handlers.go) | List/Get/Create/Update/Delete + AppCapabilities; auth + restricted-view policy validation |
| Handlers (properties + link types) | [internal/handlers/properties_links.go](../../services/ontology-definition-service/internal/handlers/properties_links.go) | CreateProperty + Link-type CRUD |
| Handlers (object-type groups) | [internal/handlers/handlers.go](../../services/ontology-definition-service/internal/handlers/handlers.go) | Full CRUD + add/remove member |
| Handlers (interfaces, shared property types) | [internal/handlers/handlers.go](../../services/ontology-definition-service/internal/handlers/handlers.go) | **Read-only** (`GET /interfaces`, `GET /shared-property-types`) — see Gap below |
| Handlers (batch save) | [internal/handlers/batch_save.go](../../services/ontology-definition-service/internal/handlers/batch_save.go) | Atomic multi-edit for the Ontology-Manager Review-edits modal |
| Repo + audit | [internal/repo/repo.go](../../services/ontology-definition-service/internal/repo/repo.go) + [internal/repo/audit.go](../../services/ontology-definition-service/internal/repo/audit.go) | pgx-backed implementations of the Store interface, audit log writes |
| Server / router | [internal/server/server.go](../../services/ontology-definition-service/internal/server/server.go) | Routes mounted on both `/api/v1/ontology-definition` and `/api/v1/ontology` (gateway-canonical) |
| Migrations | [internal/repo/migrations/](../../services/ontology-definition-service/internal/repo/migrations/) | 7 SQL files; `0001_ontology_schema_consolidated.sql` brings up ~35 tables (object_types, properties, link_types, object_type_groups, action_types, ontology_interfaces, interface_properties, object_type_interfaces, shared_property_types, ontology_function_packages, ontology_rules, ontology_object_sets, ontology_quiver_visual_functions, ontology_funnel_sources, ontology_projects, ontology_project_branches, ontology_project_proposals, ontology_project_migrations, ontology_project_folders, ontology_folder_permissions, schema_bundle, plus join + soft-delete columns) |
| Action types HTTP | [libs/ontology-kernel/handlers/actions/](../../libs/ontology-kernel/handlers/actions/) | 6,775 LOC. CRUD + validate + execute + execute-batch + metrics + what-if + inline-edit + applicable-actions + uploads. Mounted by [services/ontology-actions-service/internal/server/server.go](../../services/ontology-actions-service/internal/server/server.go) under `/api/v1/ontology/actions` |
| Tests | [internal/handlers/handlers_test.go](../../services/ontology-definition-service/internal/handlers/handlers_test.go), [handlers_fake_test.go](../../services/ontology-definition-service/internal/handlers/handlers_fake_test.go), [internal/models/property_metadata_test.go](../../services/ontology-definition-service/internal/models/property_metadata_test.go) | Unit tests with in-memory `Store` fake; production repo behind interface |
| Frontend | [apps/web/src/routes/ontology-manager/](../../apps/web/src/routes/ontology-manager/) | Real UI consuming the existing endpoints |

**Bus integration today**: ZERO. `grep -r event-bus-data services/ontology-*-service` returns nothing — neither `ontology-definition-service` nor `ontology-actions-service` publish to the data bus on schema change. The library exists ([libs/event-bus-data/](../../libs/event-bus-data/)) and the consumer side is wired (e.g. `services/ontology-indexer/internal/runtime/runtime.go` imports `databus` as a Kafka subscriber — see [B03](B03-ontology-indexer.md)). The producer half is what this blocker now tracks.

## Gap to close (revised — much smaller than first written)

### G1. No `ontology.schema.v1` events on the data bus (**Critical for downstream viability**)

- Successful Create/Update/Delete on any of object-types, link-types,
  properties, object-type-groups, action-types **does not** produce a
  Kafka record. The indexer, schema-bundle distribution, action-log
  sink, and any other consumer are silent.
- The pattern mandated by [libs/event-bus-data/CLAUDE.md](../../libs/event-bus-data/CLAUDE.md)
  is **transactional outbox + Debezium**, per [ADR-0022](../../docs/architecture/adr/ADR-0022-transactional-outbox-postgres-debezium.md). Direct `kafka.Writer` calls
  from inside a state-write transaction are forbidden.
- The infrastructure is already in place: `pg-policy` Postgres database
  is provisioned in [infra/compose/docker-compose.yml](../../infra/compose/docker-compose.yml)
  with WAL logical decoding; `debezium-connect` and
  `debezium-connect-init` are running. What is missing is the **outbox
  table per service** and the **producer code that writes to it in the
  same transaction as the schema mutation**.

### G2. Property-level mutation API gaps (**Medium — platform completeness**)

- `POST /object-types/{id}/properties` and `GET /object-types/{id}/properties`
  exist, but there is **no individual** `PATCH /properties/{id}` or
  `DELETE /properties/{id}` exposed. Today the only way to modify or
  remove a property is to go through the atomic `POST /batch-save`
  endpoint (which works for the UI but is awkward for code-first /
  agent-driven authoring).

### G3. Interface and shared-property-type CRUD (**Low — current MVP UI is read-only**)

- `GET /interfaces` and `GET /shared-property-types` exist for catalog
  reads. There is **no** `POST/PATCH/DELETE` surface for either, even
  though the underlying tables and kernel models support full
  lifecycle. This matters when an agent wants to declare an interface
  before binding object types to it.

### G4. No published OpenAPI spec for agent consumption (**Low — discoverability**)

- The routes are real but undiscoverable without reading
  [server.go](../../services/ontology-definition-service/internal/server/server.go).
  An AI agent driving the ontology end-to-end benefits from an
  OpenAPI/JSON-schema declaration.

## Acceptance criteria (technical viability, not PoC-specific)

> Reframed at the user's request 2026-05-20: the goal is **platform
> viability so that the future PoC can be driven from UI or API by a
> human or AI agent**, not to ship a demo-only seed script.

1. **Outbox table installed.** A new Goose migration (numbered after
   `0007_audit_log.sql`) creates `ontology_schema_outbox` with the
   minimal envelope agreed in ADR-0022 (`id`, `aggregate_type`,
   `aggregate_id`, `event_type`, `payload JSONB`, `headers JSONB`,
   `occurred_at`, plus the Debezium-friendly index). The table lives
   in the `ontology_schema` namespace (same as the rest of this
   service's tables).
2. **Producer code path.** Every `repo.CreateObjectType`,
   `UpdateObjectType`, `DeleteObjectType`,
   `UpdateObjectTypeAppCapabilities`, `CreateProperty`,
   `CreateLinkType`, `UpdateLinkType`, `DeleteLinkType`,
   `UpdateLinkTypeAppCapabilities`, and `SaveBatch` writes to the
   outbox in the **same database transaction** as the row mutation.
   Failure to enqueue the outbox row rolls back the schema mutation.
3. **Event envelope.** Each outbox row carries the agreed Foundry-style
   payload: `{schemaVersion, eventType, aggregateType, aggregateId,
   actor, occurredAt, mutation: {before, after}}`. The OpenLineage
   headers from [libs/event-bus-data/headers.go](../../libs/event-bus-data/headers.go)
   are populated.
4. **Debezium configuration.** A connector definition under
   [infra/compose/](../../infra/compose/) (or the registry consumed by
   `debezium-connect-init`) points at the new outbox table and routes
   its rows to the canonical topic name `openfoundry.ontology.schema.v1`.
5. **Same surface in `ontology-actions-service`.** Action-type
   create/update/delete (and execute, if we deem it schema-affecting)
   write to a sibling outbox `ontology_actions_outbox` so the indexer
   reacts to action changes as well. Topic:
   `openfoundry.ontology.actions.v1`.
6. **Property mutation API closed (G2).** Add `PATCH /properties/{id}`
   and `DELETE /properties/{id}`. Both write to the outbox.
7. **Interface and shared-property-type mutation API closed (G3).**
   Add `POST/PATCH/DELETE` for both resources. All writes go through
   the outbox.
8. **OpenAPI spec (G4).** Generate or hand-write
   `services/ontology-definition-service/api/openapi.yaml` covering
   every route in [server.go](../../services/ontology-definition-service/internal/server/server.go).
   Same for `ontology-actions-service`.
9. **Integration test.** A `//go:build integration` test under
   [services/ontology-definition-service/internal/repo/](../../services/ontology-definition-service/internal/repo/)
   spins testcontainers Postgres + Kafka, calls `CreateObjectType`,
   and asserts a record appears on `openfoundry.ontology.schema.v1`
   within the timeout.

## Status as of 2026-05-20 (Phase 1 closure)

| Acceptance criterion | Status | Evidence |
|---|---|---|
| 1. Outbox table installed | ✅ Done | [internal/repo/migrations/0008_ontology_schema_outbox.sql](../../services/ontology-definition-service/internal/repo/migrations/0008_ontology_schema_outbox.sql) |
| 2. Producer code path (all 9 listed mutations) | ✅ Done | [internal/repo/repo.go](../../services/ontology-definition-service/internal/repo/repo.go) + [internal/repo/interfaces_shared.go](../../services/ontology-definition-service/internal/repo/interfaces_shared.go) + [internal/repo/batch_save.go](../../services/ontology-definition-service/internal/repo/batch_save.go) (12 outbox sites in batch-save) |
| 3. Envelope + OpenLineage headers | ✅ Done | [internal/repo/events.go](../../services/ontology-definition-service/internal/repo/events.go) + unit test in `events_test.go` |
| 4. Debezium configuration | ✅ Done | [infra/helm/infra/debezium/templates/kafka-connector-outbox-pg-schemas.yaml](../../infra/helm/infra/debezium/templates/kafka-connector-outbox-pg-schemas.yaml) + KafkaTopic CRs in [topics-ontology-schema-v1.yaml](../../infra/helm/infra/kafka-cluster/templates/topics-ontology-schema-v1.yaml) + `walLevel: logical` flipped on `pgSchemas` |
| 5. Same surface in `ontology-actions-service` | ✅ Done | Action-type CRUD lifted out of the kernel into [services/ontology-actions-service/internal/repo/](../../services/ontology-actions-service/internal/repo/) + [internal/handlers/action_types.go](../../services/ontology-actions-service/internal/handlers/action_types.go). `server.mountActions` keeps the 13 read/execute routes from the kernel and replaces POST/PUT/PATCH/DELETE on `/actions[/{id}]` with the lifted, outbox-aware handlers. Integration test `TestOutboxEndToEnd_ActionTypeLifecycle` proves end-to-end emission on `ontology.action_type.changed.v1` against a real Postgres with `wal_level=logical` |
| 6. Property mutation API closed | ✅ Done | `GET/PATCH/DELETE /object-types/{id}/properties/{propertyID}` + outbox events |
| 7. Interface and shared-property-type mutation API closed | ✅ Done | `POST/GET/PATCH/DELETE /interfaces[/{id}]` and `POST/GET/PATCH/DELETE /shared-property-types[/{id}]`, all with outbox |
| 8. OpenAPI spec | ✅ Done | [api/openapi.yaml](../../services/ontology-definition-service/api/openapi.yaml) — 17 paths, 31 schemas, validated `$ref` resolution |
| 9. Integration test | ✅ Done | `TestOutboxEndToEnd_ObjectTypeCreated` + `TestOutboxEndToEnd_InterfaceLifecycle` in [internal/repo/outbox_integration_test.go](../../services/ontology-definition-service/internal/repo/outbox_integration_test.go); both PASS against postgres:16-alpine with `wal_level=logical` and the `test_decoding` logical replication slot |

## Deferred to a follow-up commit

(Phase 1 closed — every B02 acceptance criterion is met. The
remaining items live outside B02 scope and are tracked elsewhere.)

### Notes from the action-type lift

The action-type CRUD has been pulled out of `libs/ontology-kernel/handlers/actions/` per **Approach 1** of the original deferred plan. Concretely:

- New package [services/ontology-actions-service/internal/repo/](../../services/ontology-actions-service/internal/repo/) owns the SQL against `ontology_schema.action_types` plus the outbox enqueue (same `runRepoTx` pattern used by object types and link types in `ontology-definition-service`).
- New handlers in [services/ontology-actions-service/internal/handlers/action_types.go](../../services/ontology-actions-service/internal/handlers/action_types.go) replicate the kernel's validation invariants (`validateActionDefinition`, `parseOperationKind`, `validateActionParameterType`) — drift is documented in the file header so a future change in the kernel can be mirrored in one place.
- [server.mountActions](../../services/ontology-actions-service/internal/server/server.go) keeps every read/execute route on the kernel and only redirects the 3 schema-mutation verbs (POST, PUT/PATCH, DELETE) to the lifted handlers.
- The `outbox.events` table + `outbox-pg-schemas` Debezium connector wired in the definition-service commit also carry action-type events because both services share `openfoundry_ontology_service`.
- The integration test `TestOutboxEndToEnd_ActionTypeLifecycle` exercises Create→Update→Delete and asserts all 3 INSERTs on the WAL with the canonical envelope.

Known limitations / follow-ups:

1. **Validation drift**: the kernel's `validateActionDefinition` is copied (~30 LOC). The kernel version routes through `storageabstraction.DefinitionStore.ActionRepoObjectTypeExists`; the service version queries `ontology_schema.object_types` directly. They answer the same question against the same table, so they cannot diverge silently, but any rule change in the kernel must be mirrored here.
2. **`invoke_function` config validation**: the kernel calls `validateInvokeFunctionActionDefinition` which inspects the function runtime. The lifted handler intentionally drops this check (function runtime is not exercised by the demo path); re-add when the function runtime is wired into this service.
3. **Envelope helper duplication**: [services/ontology-actions-service/internal/repo/events.go](../../services/ontology-actions-service/internal/repo/events.go) is a near-copy of the definition service's `events.go`. Once a third service-internal producer appears, lift the envelope helper into a shared `libs/ontology-outbox` package.

## Implementation plan (proposed Phase 1)

1. **ADR-0022 reading + alignment.** Read the ADR in full and confirm
   the outbox shape (single canonical envelope vs. per-resource
   schemas). This blocks every code change.
2. **Migration `0008_ontology_schema_outbox.sql`.** Create the outbox
   table + the partial index Debezium expects.
3. **Repo wrap.** Introduce `repo.Outbox` writer with a single
   `EnqueueEvent(ctx, tx, envelope)` method. Refactor each Create /
   Update / Delete to accept the same `pgx.Tx`, then have the handler
   (or a small `repo.WithTransaction` helper) open the TX, call the
   mutation, call the outbox writer, and commit.
4. **Wire `libs/event-bus-data` (publisher side)** only for the smoke
   path that confirms Debezium output ends up on the right topic in
   the integration test — production publish is Debezium's job.
5. **Mirror in `ontology-actions-service`.** Reuse the same outbox
   library against the action-types kernel handlers (they call into
   `libs/ontology-kernel/handlers/actions/`).
6. **Close G2, G3, G4.** Add the missing endpoints and the OpenAPI
   spec. Each new endpoint also writes to the outbox.
7. **Integration test.** Lock the contract.
8. **Cross-update [B03](B03-ontology-indexer.md).** Once events flow,
   B03's reindex/backfill loop has something to consume; mark the
   producer-side acceptance there as satisfied.

See [foundry-ontology-manager-object-views-1to1-checklist.md](../../docs/migration/foundry-ontology-manager-object-views-1to1-checklist.md)
for the per-feature parity items already tracked.
