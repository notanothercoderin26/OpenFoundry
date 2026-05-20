# B02 — Ontology definition service is a stub

> Severity: **Critical** — blocks PoC Act 2 (define Aircraft, Flight,
> MaintenanceEvent, WeatherObservation, Part, Crew). Without this, no
> downstream act (3, 4, 5, 6) has an ontology to bind to.

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
| Object types | https://www.palantir.com/docs/foundry/object-link-types/object-types/ | [Seed URLs/Object Link Types/Object Types.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Link%20Types/Object%20Types.md) | [Seed URLs/Object Link Types/Object Types.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Link%20Types/Object%20Types.screenshot.png) |
| Link types | https://www.palantir.com/docs/foundry/object-link-types/link-types/ | [Seed URLs/Object Link Types/Link Types.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Link%20Types/Link%20Types.md) | [Seed URLs/Object Link Types/Link Types.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Object%20Link%20Types/Link%20Types.screenshot.png) |
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
product (Object Explorer, Workshop, AIP) consumes.

## Current OpenFoundry surface

| Layer | File | State |
|---|---|---|
| Service main | [services/ontology-definition-service/cmd/ontology-definition-service/main.go](../../services/ontology-definition-service/cmd/ontology-definition-service/main.go) | ~75 lines, minimal router |
| Handlers | [services/ontology-definition-service/internal/handlers/](../../services/ontology-definition-service/internal/handlers/) | Skeleton CRUD for object types, no transactional versioning |
| Migrations | [services/ontology-definition-service/internal/repo/migrations/](../../services/ontology-definition-service/internal/repo/migrations/) | Directory present, real schema not deployed end-to-end |
| Related kernel | [libs/ontology-kernel/](../../libs/ontology-kernel/) | ~49k LOC; has the type system but the service does not expose it through API |
| Frontend | [apps/web/src/routes/ontology-manager/](../../apps/web/src/routes/ontology-manager/) | UI exists but reads from stub responses |

## Gap to close

1. **No durable object-type registry.** Defining `Aircraft` from the UI
   does not persist with property metadata, primary key, display name.
2. **No link-type registry.** Cannot declare `Aircraft → operates → Flight`
   with cardinality/direction.
3. **No action-type registry.** Actions referenced by Workshop ([B01](B01-workshop-backend.md))
   and AIP ([B07](B07-agent-runtime-tool-routing.md)) have no canonical
   definition store.
4. **No versioning / promotion lifecycle.** Foundry requires draft-vs-active
   versions of ontology entities; the stub treats every write as latest.
5. **No event emission to the indexer.** Even if types persisted, they do
   not produce the events `ontology-indexer` ([B03](B03-ontology-indexer.md))
   needs to project into the search backend.

## Acceptance criteria to unblock the PoC

1. `POST /object-types` persists an object type with `apiName`, `primaryKey`,
   `displayName`, `pluralDisplayName`, properties (typed list), and
   `permissions`. `GET /object-types/{apiName}` returns the full record
   across restarts.
2. `POST /link-types` declares a link between two existing object types
   with `cardinality` (`MANY_TO_ONE` etc.) and `direction`.
3. `POST /action-types` declares an action with `parameters` (typed),
   `rules`, `validation`, and `sideEffects` references compatible with
   [B05](B05-notifications.md) notification side effects.
4. Every successful write emits an `ontology.type.changed` event to the
   bus that `ontology-indexer` ([B03](B03-ontology-indexer.md))
   consumes.
5. A scripted seed produces the 7 aviation object types of the PoC
   (`Aircraft`, `Flight`, `Airport`, `MaintenanceEvent`,
   `WeatherObservation`, `Part`, `Crew`) and their canonical link types
   in under 30 seconds.
6. The Ontology Manager UI ([apps/web/src/routes/ontology-manager/](../../apps/web/src/routes/ontology-manager/))
   shows the seeded types and lets a presenter open the `Aircraft` type
   detail to show properties and permissions.

## Implementation pointers

1. Materialize `object_types`, `object_type_properties`, `link_types`,
   `action_types` Postgres tables (Goose migrations).
2. Lean on [libs/ontology-kernel/](../../libs/ontology-kernel/) for the
   type system instead of re-implementing it.
3. Add an outbox table + Kafka producer for `ontology.type.*` events.
4. Write the aviation seed as a Go script under
   `services/ontology-definition-service/cmd/seed-aviation/` so the
   demo rehearsal can rebuild the ontology deterministically.
5. Track unimplemented items against
   [foundry-ontology-manager-object-views-1to1-checklist.md](../../docs/migration/foundry-ontology-manager-object-views-1to1-checklist.md).
