# B01 — Workshop backend (application-composition-service) is a stub

> Severity: **Critical** — blocks PoC Act 4 (Workshop App de aviación).
> Without this backend, the rich React Workshop editor in the frontend has
> no service to persist, version, or publish modules to.

## Identity

| Field | Value |
|---|---|
| OpenFoundry service | [services/application-composition-service/](../../services/application-composition-service/) |
| Launcher app | **#28 Workshop** — internal id `workshop`, route `/apps` ([launcher-app-mapping.md §F](../../docs/reference/launcher-app-mapping.md)) |
| Foundry product | [Workshop](https://www.palantir.com/docs/foundry/workshop/overview/) |
| PoC act(s) | **Act 4** — "MRO workbench / Workshop module with Object Table, Button Group, filters, variables, Map widgets" ([00-contrato §Foundry-native capability mapping](../00-contrato-foundry-native.md)) |
| 1-to-1 checklist | [foundry-workshop-pipeline-1to1-checklist.md](../../docs/migration/foundry-workshop-pipeline-1to1-checklist.md) |
| Parity matrix module | Workshop slice inside *Workshop / Pipeline Builder* (see [foundry-feature-parity-matrix.json](../../docs/migration/foundry-feature-parity-matrix.json)) |

## Palantir reference (public docs)

| Page | Live URL | Local scraped MD | Full-page screenshot (Read-able) |
|---|---|---|---|
| Workshop overview | https://www.palantir.com/docs/foundry/workshop/overview/ | [Seed URLs/Workshop/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Overview.md) | [Seed URLs/Workshop/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Overview.screenshot.png) |
| Widgets concepts | https://www.palantir.com/docs/foundry/workshop/concepts-widgets/ | [Seed URLs/Workshop/Concepts Widgets.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Concepts%20Widgets.md) | [Seed URLs/Workshop/Concepts Widgets.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Concepts%20Widgets.screenshot.png) |
| Object Table widget | https://www.palantir.com/docs/foundry/workshop/widgets-object-table/ | [Seed URLs/Workshop/Widgets Object Table.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Object%20Table.md) | [Seed URLs/Workshop/Widgets Object Table.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Object%20Table.screenshot.png) |
| Button Group widget | https://www.palantir.com/docs/foundry/workshop/widgets-button-group/ | [Seed URLs/Workshop/Widgets Button Group.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Button%20Group.md) | [Seed URLs/Workshop/Widgets Button Group.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Button%20Group.screenshot.png) |
| Map widget | https://www.palantir.com/docs/foundry/workshop/widgets-map/ | [Seed URLs/Workshop/Widgets Map.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Map.md) | [Seed URLs/Workshop/Widgets Map.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Map.screenshot.png) |
| Variables | https://www.palantir.com/docs/foundry/workshop/variables/ | [Seed URLs/Workshop/Variables.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Variables.md) | [Seed URLs/Workshop/Variables.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Variables.screenshot.png) |
| Branching / Rebasing | https://www.palantir.com/docs/foundry/workshop/branching-rebasing/ | [Seed URLs/Workshop/Branching Rebasing.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Branching%20Rebasing.md) | [Seed URLs/Workshop/Branching Rebasing.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Branching%20Rebasing.screenshot.png) |
| Publishing | https://www.palantir.com/docs/foundry/workshop/publishing/ | [Seed URLs/Workshop/Publishing.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Publishing.md) | [Seed URLs/Workshop/Publishing.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Publishing.screenshot.png) |

> If any of the scraped paths above does not exist, re-run the scraper:
> `python docs_original_palantir_foundry/scraper.py --output docs_original_palantir_foundry/foundry-docs --seed-urls PoC/blockers/seed-urls.txt`

## Foundry behavior to replicate (summary)

A Workshop **module** is a versioned tree of pages, each page composed of
**widgets** (Object Table, Button Group, Map, Filter, Tab, …) bound to
**variables**, **object sets**, and **action types**. Modules can be edited
on a **branch**, previewed, and **published** to consumers with their own
permission scope. Widgets are configured declaratively in a side panel —
not coded — and the runtime renders the module against the live Ontology.
The author never writes bespoke React for the common case.

## Current OpenFoundry surface

| Layer | File | State |
|---|---|---|
| Service main | [services/application-composition-service/cmd/application-composition-service/main.go](../../services/application-composition-service/cmd/application-composition-service/main.go) | 75 lines, boots a router but the persistence layer is in-memory |
| Handlers | [services/application-composition-service/internal/handlers/](../../services/application-composition-service/internal/handlers/) | 8 handlers; create/read shapes exist but no transactional save/publish |
| Migrations | [services/application-composition-service/internal/repo/migrations/](../../services/application-composition-service/internal/repo/migrations/) | Directory exists; no real persistence of module versions |
| Frontend (works) | [apps/web/src/routes/apps/runtime/](../../apps/web/src/routes/apps/) (`/apps/runtime/:slug`) | ~4.7k LOC, drag-drop, 15 widget types — fully built |
| Frontend ↔ backend bridge | [apps/web/src/lib/api/](../../apps/web/src/lib/api/) (search for module/workshop) | Calls land on stub handlers that don't persist |

## Gap to close

1. **No durable module storage.** Saving a module from the editor does not
   survive a service restart; there is no `modules` / `module_versions`
   table backing the create/update handlers.
2. **No publish lifecycle.** There is no draft → published transition, no
   permission scoping at the published module, and no runtime read endpoint
   the published consumer would hit.
3. **No widget configuration validation.** The editor sends arbitrary widget
   JSON; the backend accepts it without schema validation, so corrupt
   configs surface only on render.
4. **No branch awareness.** The Foundry contract requires Workshop modules
   to be editable on a Global Branch ([Branching Workshop modules](https://www.palantir.com/docs/foundry/workshop/branching-rebasing/)).
   The OpenFoundry service has no branch parameter on its endpoints.
5. **No action-button → action-type wiring.** Button Group widgets in Foundry
   trigger declared Action Types. OpenFoundry's stub does not resolve action
   references against `ontology-actions-service`.

## Acceptance criteria to unblock the PoC

1. `POST /modules` persists a module with a stable ID; `GET /modules/{id}`
   returns the same payload after a restart.
2. `POST /modules/{id}/versions` creates a new immutable version; the
   editor can list all prior versions.
3. `POST /modules/{id}/publish` flips a version to `published` and exposes
   it at `GET /modules/{id}/runtime?version={v}` for the frontend runtime.
4. Widget JSON is validated against a schema; invalid widgets are rejected
   with a structured error pointing at the offending widget path.
5. `?branch={branchName}` is accepted on create/read/update/publish and
   isolates state per branch.
6. A Button Group widget with `actionTypeId=X` produces a runtime payload
   that the frontend can submit to `ontology-actions-service`; the round
   trip works against the demo aviation ontology (see [B02](B02-ontology-definition.md)).
7. An aviation-specific demo module (e.g. *MRO workbench* with `Aircraft`
   table, `Schedule maintenance` action button, and weather Map widget)
   can be authored in the editor, saved, published, and re-opened from a
   fresh tab.

## Implementation pointers

1. Promote the in-memory store to a `modules` + `module_versions` table in
   Postgres; add Goose migrations under `services/application-composition-service/internal/repo/migrations/`.
2. Add a `branch` column on both tables; default to `main`.
3. Introduce a `WidgetSchema` registry; validate on save.
4. Add a `publish` endpoint that copies the latest draft to a `published`
   row and emits a `module.published` event on the bus.
5. Wire the frontend `lib/api/workshop.ts` (or equivalent) to the new
   endpoints, keeping the existing widget editor untouched.
6. Cross-reference unimplemented items against
   [foundry-workshop-pipeline-1to1-checklist.md](../../docs/migration/foundry-workshop-pipeline-1to1-checklist.md)
   and mark them as `done` only after a `_test.go` covers them.
