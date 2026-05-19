# Launcher app mapping — Foundry ↔ OpenFoundry

Date: 2026-05-19
Status: **live** — all 47 apps are registered in the launcher catalog, route
bindings ship behind the canonical paths in the tables below, and the backend
`application-access/evaluate` allowlist accepts every internal ID. 18 of the
roadmap apps render a minimal Phase 4 landing (mock data, no backend) — they
are real routes, not placeholders.

This document freezes the **1:1 equivalence** between the 47 Palantir Foundry
applications listed in our compatibility scope and the names OpenFoundry uses
in the sidebar launcher.

It is the source of truth for:

- `LAUNCHER_APPS` in [`apps/web/src/lib/launcher/catalog.ts`](../../apps/web/src/lib/launcher/catalog.ts)
- the `application_ids` accepted by the `POST /application-access/evaluate` handler in [`services/identity-federation-service/internal/handlers/control_panel.go`](../../services/identity-federation-service/internal/handlers/control_panel.go)
- launcher i18n strings and category headings

## Naming rule

We follow the rule: **alias the distinctive Palantir brand names, keep the
generic ones unchanged.** Concretely:

- **Alias** when the Foundry name is a distinctive product brand (Quiver,
  Slate, Vertex, Compass, Pilot, Contour, Fusion, Cipher, Machinery,
  Insight) or contains a Palantir-specific phrase (the `AIP` prefix,
  `Foundry Rules`, `AI FDE`, `Data Lifetime`).
- **Notepad** is kept as-is per product decision (the name is descriptive
  enough and we are happy to share it with Palantir's app).
- **Keep** when the Foundry name is already generic English (Pipeline
  Builder, Data Lineage, Control Panel, Object Views, Model Catalog,
  Sensitive Data Scanner, etc.).
- Internal kebab-case IDs (`compass`, `quiver`, `slate`, …) **stay aligned
  with the Foundry vocabulary** because they are not user-visible. This keeps
  the codebase searchable against Foundry docs.

## How to read the table

- **Foundry name** — the canonical Palantir name (per
  [palantir.com/docs/foundry](https://www.palantir.com/docs/foundry)).
- **OpenFoundry display name** — what renders on the launcher tile. If equal
  to the Foundry name, the cell is marked `=`.
- **Internal ID** — the `id` field in `LAUNCHER_APPS` and the
  `application_id` sent to backend authorization.
- **Route** — current or planned route under `apps/web/src/routes/`.
- **Reason for alias** — short justification when display name ≠ Foundry name.

---

## A. Workspace (1)

| # | Foundry name | OpenFoundry display name | Internal ID | Route | Reason for alias |
|---|---|---|---|---|---|
| 1 | [Compass](https://www.palantir.com/docs/foundry/compass/overview/) | **Workspace** | `compass` | `/` | "Compass" is a Palantir brand; the function (browse/share/secure resources) is what we surface |

## B. Ontology (3)

| # | Foundry name | OpenFoundry display name | Internal ID | Route | Reason for alias |
|---|---|---|---|---|---|
| 2 | [Ontology Manager](https://www.palantir.com/docs/foundry/ontology-manager/overview/) | = | `ontology-manager` | `/ontology-manager` | generic |
| 3 | [Object Explorer](https://www.palantir.com/docs/foundry/object-explorer/overview/) | = | `object-explorer` | `/object-explorer` | generic |
| 4 | [Object Views](https://www.palantir.com/docs/foundry/object-views/overview/) | = | `object-views` | `/object-views` | generic |

Sub-concepts (Action Types, Object Link Types, Interfaces, Ontology Indexing) are not separate launcher tiles — they live as tabs inside Ontology Manager.

## C. Data Integration (7)

| # | Foundry name | OpenFoundry display name | Internal ID | Route | Reason for alias |
|---|---|---|---|---|---|
| 5 | [Pipeline Builder](https://www.palantir.com/docs/foundry/pipeline-builder/overview/) | = | `pipeline-builder` | `/pipelines` | generic |
| 6 | [Code Repositories](https://www.palantir.com/docs/foundry/code-repositories/overview/) | = | `code-repositories` | `/code-repos` | generic |
| 7 | [Data Lineage](https://www.palantir.com/docs/foundry/data-lineage/overview/) | = | `data-lineage` | `/lineage` | generic |
| 8 | [Dataset Preview](https://www.palantir.com/docs/foundry/dataset-preview/overview/) | = | `dataset-preview` | `/datasets` | generic |
| 9 | [Linter](https://www.palantir.com/docs/foundry/linter/overview/) | **Pipeline Linter** | `linter` | `/pipelines/linter` | "Linter" alone is ambiguous; the Foundry product targets pipelines specifically |
| 10 | [Peer Manager](https://www.palantir.com/docs/foundry/peer-manager/overview/) | = | `peer-manager` | `/peer-manager` | generic |
| 11 | [Machinery](https://www.palantir.com/docs/foundry/machinery/overview/) | **Job Engine** | `machinery` | `/machinery` | "Machinery" is a Palantir brand; the function is running long-lived jobs/workers |

Sub-concepts (Data Connection, Builds, Streaming, Media Sets, Iceberg Tables, Virtual Tables, Object Databases) are tabs inside Pipeline Builder or Dataset Preview.

## D. Analytics & Operations (7)

| # | Foundry name | OpenFoundry display name | Internal ID | Route | Reason for alias |
|---|---|---|---|---|---|
| 12 | [Contour](https://www.palantir.com/docs/foundry/contour/overview/) | **Lens** | `contour` | `/contour` | brand |
| 13 | [Insight](https://www.palantir.com/docs/foundry/insight/overview/) | **Investigator** | `insight` | `/insight` | brand and disambiguates from generic "insight" |
| 14 | [Quiver](https://www.palantir.com/docs/foundry/quiver/overview/) | **Chart Studio** | `quiver` | `/quiver` | brand |
| 15 | [Notepad](https://www.palantir.com/docs/foundry/notepad/overview/) | = | `notepad` | `/notepad` | product decision: keep the name |
| 16 | [Fusion](https://www.palantir.com/docs/foundry/fusion/overview/) | **Data Sheet** | `fusion` | `/fusion` | brand |
| 17 | [Vertex](https://www.palantir.com/docs/foundry/vertex/overview/) | **Graph Explorer** | `vertex` | `/vertex` | brand |
| 18 | [Map](https://www.palantir.com/docs/foundry/map/overview/) | **Geo Map** | `map` | `/geospatial` | clarifies scope vs other "map" UIs |

## E. AI Platform (9)

The Foundry `AIP` prefix ("Artificial Intelligence Platform") is Palantir's
product line. We drop it consistently and render `AI <Function>`.

| # | Foundry name | OpenFoundry display name | Internal ID | Route | Reason for alias |
|---|---|---|---|---|---|
| 19 | [AIP Logic](https://www.palantir.com/docs/foundry/logic/overview/) | **AI Logic** | `aip-logic` | `/logic` | drop `AIP` prefix |
| 20 | [AIP Assist](https://www.palantir.com/docs/foundry/assist/overview/) | **AI Assist** | `aip-assist` | `/ai/assist` | drop `AIP` prefix |
| 21 | [AIP Analyst](https://www.palantir.com/docs/foundry/aip-analyst/overview/) | **AI Analyst** | `aip-analyst` | `/ai/analyst` | drop `AIP` prefix |
| 22 | [AIP Threads](https://www.palantir.com/docs/foundry/threads/overview/) | **AI Threads** | `aip-threads` | `/ai/threads` | drop `AIP` prefix |
| 23 | [AIP Document Intelligence](https://www.palantir.com/docs/foundry/document-intelligence/overview/) | **Document AI** | `aip-document-intelligence` | `/ai/documents` | drop `AIP` prefix |
| 24 | [AIP Chatbot Studio](https://www.palantir.com/docs/foundry/chatbot-studio/overview/) | **Chatbot Studio** | `aip-chatbot-studio` | `/ai/chatbot-studio` | drop `AIP` prefix |
| 25 | [AIP Evals](https://www.palantir.com/docs/foundry/aip-evals/overview/) | **AI Evals** | `aip-evals` | `/aip-evals` | drop `AIP` prefix |
| 26 | [AI FDE](https://www.palantir.com/docs/foundry/ai-fde/overview/) | **AI Operator** | `ai-fde` | `/ai/operator` | "FDE" = Forward Deployed Engineer, a Palantir-specific role |
| 27 | [Model Catalog](https://www.palantir.com/docs/foundry/model-catalog/overview/) | = | `model-catalog` | `/model-catalog` | generic |

## F. Application Development (8)

| # | Foundry name | OpenFoundry display name | Internal ID | Route | Reason for alias |
|---|---|---|---|---|---|
| 28 | [Workshop](https://www.palantir.com/docs/foundry/workshop/overview/) | = | `workshop` | `/apps` | already generic English; per naming rule |
| 29 | [Slate](https://www.palantir.com/docs/foundry/slate/overview/) | **Web App Studio** | `slate` | `/slate` | brand |
| 30 | [Pilot](https://www.palantir.com/docs/foundry/pilot/overview/) | **AI App Builder** | `pilot` | `/pilot` | brand |
| 31 | [Custom widgets](https://www.palantir.com/docs/foundry/custom-widgets/overview/) | **Custom Widgets** | `custom-widgets` | `/widgets` | generic, casing fix |
| 32 | [OSDK React applications](https://www.palantir.com/docs/foundry/ontology-sdk-react-applications/overview/) | **Ontology SDK Apps** | `osdk-apps` | `/osdk-apps` | shorter and avoids the Palantir-coined `OSDK` short form on the surface |
| 33 | [Custom Endpoints](https://www.palantir.com/docs/foundry/custom-endpoints/overview/) | **Custom APIs** | `custom-endpoints` | `/custom-endpoints` | clearer for end users |
| 34 | [Developer Console](https://www.palantir.com/docs/foundry/developer-console/overview/) | = | `developer-console` | `/developers` | generic |
| 35 | [Compute modules](https://www.palantir.com/docs/foundry/compute-modules/overview/) | **Compute Modules** | `compute-modules` | `/compute-modules` | generic, casing fix |

## G. Automation (2)

| # | Foundry name | OpenFoundry display name | Internal ID | Route | Reason for alias |
|---|---|---|---|---|---|
| 36 | [Foundry Rules](https://www.palantir.com/docs/foundry/foundry-rules/overview/) | **Operational Rules** | `foundry-rules` | `/foundry-rules` | `Foundry` is the platform brand |
| 37 | [Dynamic scheduling](https://www.palantir.com/docs/foundry/dynamic-scheduling/scheduling-overview/) | **Dynamic Schedules** | `dynamic-scheduling` | `/dynamic-scheduling` | casing/pluralization |

## H. Security & Governance (5)

| # | Foundry name | OpenFoundry display name | Internal ID | Route | Reason for alias |
|---|---|---|---|---|---|
| 38 | [Approvals](https://www.palantir.com/docs/foundry/approvals/overview/) | = | `approvals` | `/approvals` | generic |
| 39 | [Checkpoints](https://www.palantir.com/docs/foundry/checkpoints/overview/) | **Justification Checkpoints** | `checkpoints` | `/checkpoints` | scopes the term (vs ML training checkpoints, etc.) |
| 40 | [Cipher](https://www.palantir.com/docs/foundry/cipher/overview/) | **Crypto Service** | `cipher` | `/cipher` | brand |
| 41 | [Sensitive Data Scanner](https://www.palantir.com/docs/foundry/sensitive-data-scanner/overview/) | = | `sensitive-data-scanner` | `/sds` | generic |
| 42 | [Data Lifetime](https://www.palantir.com/docs/foundry/data-lifetime/overview/) | **Retention Policies** | `data-lifetime` | `/retention` | "Data Lifetime" is Palantir-specific phrasing; "Retention Policies" is the standard industry term |

## I. Administration (5)

| # | Foundry name | OpenFoundry display name | Internal ID | Route | Reason for alias |
|---|---|---|---|---|---|
| 43 | [Control Panel](https://www.palantir.com/docs/foundry/administration/control-panel/) | = | `control-panel` | `/control-panel` | generic |
| 44 | [Resource Management](https://www.palantir.com/docs/foundry/resource-management/overview/) | = | `resource-management` | `/control-panel/data-health` | generic |
| 45 | [Upgrade Assistant](https://www.palantir.com/docs/foundry/upgrade-assistant/overview/) | = | `upgrade-assistant` | `/control-panel/streaming-profiles` | generic |
| 46 | Enrollment settings | **Enrollment Settings** | `enrollment-settings` | `/control-panel/tenancy` | casing |
| 47 | Organization settings | **Organization Settings** | `organization-settings` | `/control-panel/users` (TBD) | casing |

---

## Tiles removed from the launcher

The following tiles existed in the legacy launcher but are **not** in the
canonical list. They have been removed; the underlying routes either
redirect to a canonical destination (Phase 5 cleanup) or remain reachable
as sub-pages of a canonical app.

| Legacy tile | Disposition | Route behavior |
|---|---|---|
| Marketplace | removed (no canonical equivalent) | `/marketplace`, `/marketplace/:id` → redirect `/` |
| Workflows | folded into Operational Rules | `/workflows` → redirect `/foundry-rules` |
| Reports | folded into Web App Studio | `/reports` → redirect `/slate` |
| Dashboards | folded into Chart Studio | `/dashboards`, `/dashboards/:id` → redirect `/quiver` |
| Global Branching | removed (no canonical equivalent) | `/global-branching` → redirect `/` |
| Workflow Lineage | folded into Data Lineage | `/workflow-lineage` → redirect `/lineage` |
| Queries | folded into Object Explorer | `/queries` → redirect `/object-explorer` |
| Automate | folded into Operational Rules | `/automate` → redirect `/foundry-rules` |
| Ontology Design | folded into Ontology Manager | `/ontology-design` → redirect `/ontology-manager` |
| Ontologies | folded into Ontology Manager | `/ontologies` → redirect `/ontology-manager` |
| Nexus | folded into AI Threads | `/nexus` → redirect `/ai/threads` |
| Data Catalog | folded into Dataset Preview | tile removed; `/datasets` is canonical |
| Data Connection | tab inside Pipeline Builder | `/data-connection` route preserved |
| Builds | tab inside Pipeline Builder | `/builds` route preserved |
| Streaming | tab inside Pipeline Builder | `/streaming` route preserved |
| Media Sets | tab inside Dataset Preview | `/media-sets` route preserved |
| Iceberg Tables | tab inside Dataset Preview | `/iceberg-tables` route preserved |
| Virtual Tables | tab inside Dataset Preview | `/virtual-tables` route preserved |
| Object Databases | tab inside Pipeline Builder | `/object-databases` route preserved |
| Ontology Indexing | tab inside Ontology Manager | `/ontology-indexing` route preserved |
| Workshop Notebooks | tab inside Code Repositories | `/notebooks`, `/notebooks/:id` routes preserved |
| AI Platform | folded into the AI Platform category header | `/ai` route preserved |
| ML Studio | renamed to Model Catalog | `/ml` → redirect `/model-catalog` |
| Agents | folded into AI Logic | tile removed |
| Action Types | tab inside Ontology Manager | `/action-types`, `/action-types/:id` routes preserved |
| Object Link Types | tab inside Ontology Manager | `/object-link-types` route preserved |
| Interfaces | tab inside Ontology Manager | `/interfaces` route preserved |
| Governance Center | renamed to Approvals | `/audit` → redirect `/approvals` |
| Object Monitors | folded into Operational Rules | `/object-monitors` route preserved |
| Access Reviews | folded into Control Panel | tile removed |
| Policy Engine | folded into Approvals + Crypto Service | tile removed |
| Functions | renamed to Compute Modules | `/functions` → redirect `/compute-modules` |
| Settings | stays in footer nav as "Account" | `/settings` route preserved |
| Help Center / Product Tours / Contact Support | moved to the help icon | `/developers` route preserved |

## Change-management notes

- Internal IDs in column 3 are **stable contracts**. Renaming the display
  name is safe; renaming the ID breaks the `application-access/evaluate`
  policy and any persisted favorites in `localStorage` (`of_favorite_apps`).
- When a Foundry app is renamed or split in the upstream docs, we update
  the OpenFoundry display name but keep the internal ID, and add a row
  documenting the split.
- Sub-concepts that are not launcher tiles (Action Types, Streaming, etc.)
  are **not** governed by this document — they live in the navigation of
  their parent app.
- 18 of the 47 apps currently render the Phase 4 landing in
  [`apps/web/src/routes/<app>/<App>Page.tsx`](../../apps/web/src/routes/)
  with mock data only — Slate, Pilot, the AIP family, Investigator,
  Pipeline Linter, Peer Manager, Custom Widgets, OSDK Apps, Custom APIs,
  Justification Checkpoints, Crypto Service, Sensitive Data Scanner, and
  Retention Policies. Their backends are not yet wired up; replacing the
  mock data with real API calls is the next iteration.
