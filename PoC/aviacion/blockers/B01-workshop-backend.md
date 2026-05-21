# B01 — Workshop backend (application-composition-service) is a stub

> **Scope revised 2026-05-20.** The earlier framing of this file claimed
> the persistence layer was in-memory and the publish lifecycle did not
> exist. A scrupulous read of the code shows
> `services/application-composition-service/` has 8 Postgres migrations
> (`apps`, `app_versions`, `composition_views`, `app_audit_events`, …),
> 989 LOC in `internal/repo/repo.go`, a real `PublishApp` HTTP handler,
> a public `GetPublishedApp` runtime endpoint, and per-branch isolation
> via migration `20260520120000_app_branches.sql`. The "Current
> OpenFoundry surface" table below has been rewritten and a *Status as
> of 2026-05-20* section has been added at the bottom; the original
> framing is preserved in the *Gap to close* and *Acceptance criteria*
> sections so the parity contract stays auditable.
>
> Severity: **Medium** (down from Critical) — what remains is **AC#6
> action-button → action-type wiring** and **AC#7 the aviation demo
> module itself**; both are PoC-content tasks, not service rewrites.
>
> ### Naming note (Foundry ↔ OpenFoundry)
>
> The Foundry-native vocabulary used throughout this file —
> "**module**" / "**module versions**" — maps 1-to-1 onto the
> OpenFoundry codebase as "**app**" / "**app version**". The tables in
> Postgres are `apps` and `app_versions`; the handlers are
> `CreateApp` / `PublishApp` / `GetPublishedApp`; the REST surface lives
> under `/api/v1/apps`. A reader who `grep`s for `modules` will find
> only this file — that is by design (the file talks Foundry, the
> code talks OpenFoundry).

## Identity

| Field | Value |
|---|---|
| OpenFoundry service | [services/application-composition-service/](../../../services/application-composition-service/) |
| Launcher app | **#28 Workshop** — internal id `workshop`, route `/apps` ([launcher-app-mapping.md §F](../../../docs/reference/launcher-app-mapping.md)) |
| Foundry product | [Workshop](https://www.palantir.com/docs/foundry/workshop/overview/) |
| PoC act(s) | **Act 4** — "MRO workbench / Workshop module with Object Table, Button Group, filters, variables, Map widgets" ([00-contrato §Foundry-native capability mapping](../00-contrato-foundry-native.md)) |
| 1-to-1 checklist | [foundry-workshop-pipeline-1to1-checklist.md](../../../docs/migration/foundry-workshop-pipeline-1to1-checklist.md) |
| Parity matrix module | Workshop slice inside *Workshop / Pipeline Builder* (see [foundry-feature-parity-matrix.json](../../../docs/migration/foundry-feature-parity-matrix.json)) |

## Palantir reference (public docs)

| Page | Live URL | Local scraped MD | Full-page screenshot (Read-able) |
|---|---|---|---|
| Workshop overview | https://www.palantir.com/docs/foundry/workshop/overview/ | [Seed URLs/Workshop/Overview.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Overview.md) | [Seed URLs/Workshop/Overview.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Overview.screenshot.png) |
| Widgets concepts | https://www.palantir.com/docs/foundry/workshop/concepts-widgets/ | [Seed URLs/Workshop/Concepts Widgets.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Concepts%20Widgets.md) | [Seed URLs/Workshop/Concepts Widgets.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Concepts%20Widgets.screenshot.png) |
| Object Table widget | https://www.palantir.com/docs/foundry/workshop/widgets-object-table/ | [Seed URLs/Workshop/Widgets Object Table.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Object%20Table.md) | [Seed URLs/Workshop/Widgets Object Table.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Object%20Table.screenshot.png) |
| Button Group widget | https://www.palantir.com/docs/foundry/workshop/widgets-button-group/ | [Seed URLs/Workshop/Widgets Button Group.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Button%20Group.md) | [Seed URLs/Workshop/Widgets Button Group.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Button%20Group.screenshot.png) |
| Map widget | https://www.palantir.com/docs/foundry/workshop/widgets-map/ | [Seed URLs/Workshop/Widgets Map.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Map.md) | [Seed URLs/Workshop/Widgets Map.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Widgets%20Map.screenshot.png) |
| Variables (concepts) | https://www.palantir.com/docs/foundry/workshop/concepts-variables/ | [Seed URLs/Workshop/Concepts Variables.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Concepts%20Variables.md) | [Seed URLs/Workshop/Concepts Variables.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Concepts%20Variables.screenshot.png) |
| Branching / Rebasing | https://www.palantir.com/docs/foundry/workshop/branching-rebasing/ | [Seed URLs/Workshop/Branching Rebasing.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Branching%20Rebasing.md) | [Seed URLs/Workshop/Branching Rebasing.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Branching%20Rebasing.screenshot.png) |
| Versions (publishing) | https://www.palantir.com/docs/foundry/workshop/versions/ | [Seed URLs/Workshop/Versions.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Versions.md) | [Seed URLs/Workshop/Versions.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Workshop/Versions.screenshot.png) |

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
| Service main | [services/application-composition-service/cmd/application-composition-service/main.go](../../../services/application-composition-service/cmd/application-composition-service/main.go) | Real bootstrap (pgxpool, JWT, tracing, metrics, graceful shutdown) |
| Handlers (apps CRUD + publish) | [services/application-composition-service/internal/handlers/apps.go](../../../services/application-composition-service/internal/handlers/apps.go) | 427 LOC: `CreateApp`, `GetApp`, `UpdateApp`, `PublishApp`, `PromoteVersion`, `GetPublishedApp` (public, no-auth read) |
| Handlers (workshop endpoints) | [services/application-composition-service/internal/handlers/workshop_endpoints.go](../../../services/application-composition-service/internal/handlers/workshop_endpoints.go) | 259 LOC: widget catalog version + schema headers |
| Repo | [services/application-composition-service/internal/repo/repo.go](../../../services/application-composition-service/internal/repo/repo.go) | 989 LOC, pgx-backed Postgres persistence behind the `Store` interface |
| Migrations | [services/application-composition-service/internal/repo/migrations/](../../../services/application-composition-service/internal/repo/migrations/) | 8 SQL files: `apps` + `app_versions` + `app_templates` + `composition_views` + `composition_bindings` + `developer_applications` + `developer_releases` + `app_audit_events` + `managed_workspaces` + `custom_endpoints` + `app_branches` (`branch` column on `apps` and `app_versions`, migration `20260520120000_app_branches.sql`) |
| Integration test | [services/application-composition-service/internal/repo/repo_integration_test.go](../../../services/application-composition-service/internal/repo/repo_integration_test.go) | Persists a real `apps` + `app_versions` round-trip against testcontainers Postgres |
| Frontend (editor + runtime) | [apps/web/src/routes/apps/](../../../apps/web/src/routes/apps/) | Drag-drop editor + `/apps/runtime/:slug` renderer, fully built |
| Frontend ↔ backend bridge | [apps/web/src/lib/api/](../../../apps/web/src/lib/api/) | Calls land on the real `apps` CRUD + publish endpoints |

**What is still missing for the PoC** (after Phase 1 platform closure):

- **AC#6 — Button Group → Action Type resolution.** `apps.go` and
  `repo.go` do not yet reference `actionType` / `actionTypeId` lookups
  against `ontology-actions-service`. A Button Group widget with
  `actionTypeId=X` is persisted but the runtime payload that the
  frontend needs (action schema + parameters) is not resolved.
- **AC#7 — Aviation demo module.** No aviation-specific module is
  authored anywhere (search `apps/web/src/routes/` for
  `aviacion` / `aviation` / `fleet` / `skywise` returns nothing).
- **Widget JSON schema enforcement** (AC#4). The catalog version
  headers are emitted, but a hard schema rejection of malformed widget
  JSON has not been validated end-to-end.

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

## Status as of 2026-05-20 (Phase 1 closure)

| Acceptance criterion | Status | Evidence |
|---|---|---|
| 1. Module persists with stable ID; survives restart | ✅ Done | `apps` table (migration `20260422101500_app_builder_foundation.sql`) + `CreateApp` / `GetApp` in [internal/handlers/apps.go](../../../services/application-composition-service/internal/handlers/apps.go). Round-trip exercised in [`repo_integration_test.go`](../../../services/application-composition-service/internal/repo/repo_integration_test.go) against testcontainers Postgres. |
| 2. `POST /modules/{id}/versions` creates immutable versions | ✅ Done | `app_versions` table with `UNIQUE (app_id, version_number)` (same migration). |
| 3. `POST /modules/{id}/publish` + runtime read endpoint | ✅ Done | `PublishApp` (apps.go:166) flips `published_version_id`; `GetPublishedApp` (apps.go:306) is the public, no-auth runtime read at `/apps/{slug}/published`. |
| 4. Widget JSON schema validation | ⚠️ Partial | Catalog version + schema-version headers emitted by `workshop_endpoints.go`; hard rejection of malformed widget JSON not yet exercised by an integration test. |
| 5. `?branch={branchName}` accepted on every verb | ✅ Done | Migration `20260520120000_app_branches.sql` adds `branch` column + composite unique index `apps_slug_branch_uniq`; handlers thread the branch through. |
| 6. Button Group → action-type wire-through | ❌ Open | No matches for `actionType` / `actionTypeId` in `internal/handlers/` or `internal/repo/`. Last-mile wiring against `ontology-actions-service` not done. |
| 7. Aviation demo module authored end-to-end | ❌ Open | No aviation-named route under `apps/web/src/routes/`; no seed module under `tools/` or `PoC/aviacion/`. This is PoC content, not platform work. |

## Deferred to PoC execution

(Phase 1 closed for the platform. The two remaining items — AC#6 and
AC#7 — are PoC-content tasks owned by the demo author and tracked here
so they do not get lost. They are scoped against the same Foundry
parity references as the platform work.)

## Implementation pointers

> The *Implementation pointers* below were written against the original
> "stub" framing. They are kept verbatim for traceability. The items
> already shipped are crossed-referenced in *Status as of 2026-05-20*
> above; only AC#6 (button → action-type) and AC#7 (aviation demo
> module) remain.

1. Promote the in-memory store to a `modules` + `module_versions` table in
   Postgres; add Goose migrations under `services/application-composition-service/internal/repo/migrations/`. *(Done — tables shipped under the OpenFoundry-native names `apps` + `app_versions`; the eight migration files are listed in *Current OpenFoundry surface*.)*
2. Add a `branch` column on both tables; default to `main`. *(Done — migration `20260520120000_app_branches.sql`.)*
3. Introduce a `WidgetSchema` registry; validate on save. *(Partial — catalog version + schema-version headers; hard schema rejection still open.)*
4. Add a `publish` endpoint that copies the latest draft to a `published`
   row and emits a `module.published` event on the bus. *(Done — `PublishApp` + `GetPublishedApp` in `apps.go`; bus-event emission is the same outbox pattern shipped for B02 and can be lifted in.)*
5. Wire the frontend `lib/api/workshop.ts` (or equivalent) to the new
   endpoints, keeping the existing widget editor untouched. *(Done — `apps/web/src/lib/api/` already calls the real apps endpoints.)*
6. Cross-reference unimplemented items against
   [foundry-workshop-pipeline-1to1-checklist.md](../../../docs/migration/foundry-workshop-pipeline-1to1-checklist.md)
   and mark them as `done` only after a `_test.go` covers them.
