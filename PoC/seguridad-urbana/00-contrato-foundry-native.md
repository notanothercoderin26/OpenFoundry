# 00 — Foundry-native contract for the Urban Public-Safety PoC

> Goal: this PoC must be demonstrable as if it had been built directly in **Palantir Foundry**. OpenFoundry may implement the internals differently, but every user-visible step, artifact, and acceptance criterion must map to a public Foundry capability. **The PoC dictates the contract; OpenFoundry adapts.**

---

## Non-negotiable interpretation

1. **Foundry first, OpenFoundry second.** The PoC is not a generic OpenFoundry demo with Foundry-like labels; it is a Foundry-native workflow that OpenFoundry must emulate.
2. **Customer-facing names must be Foundry concepts.** In the demo script and UI copy, use names such as Data Connection, Dataset, Pipeline Builder, Code Repositories, Ontology Manager, Object Type, Link Type, Action Type, Workshop, Quiver, AIP Chatbot, Data Lineage, Data Health, Action Log, Markings/Policies, and Global Branching.
3. **OpenFoundry service names are implementation details.** Names such as `connector-management-service`, `dataset-versioning-service`, or `agent-runtime-service` can remain in engineering runbooks, but not as the primary narrative for the customer demo.
4. **If a Foundry capability cannot be publicly verified, mark it as an emulation.** Do not claim it is identical to Foundry unless the behavior is supported by Palantir public documentation or validated by a Palantir environment.
5. **The acceptance test is behavioral parity.** The question is not whether the OpenFoundry architecture resembles Foundry; the question is whether a Foundry practitioner would perform the same step with an equivalent Foundry resource.
6. **No native graph widget in this PoC.** This vertical does not stress link analysis. The Workshop module is **Map + Object Table + Forecast charts + Briefing card**. The Vertex-equivalent app exists in OpenFoundry but is **not used** in the urban-safety demo path. If a customer asks for graph exploration, point them to the geopolitical PoC instead.
7. **Markings are the headline differentiator.** As in the geopolitical PoC, marking-aware visibility (dataset → ontology → Workshop → AIP) is what separates this from a generic "PostGIS + Grafana" stack. The Anna ↔ Jordi flip in UC-7 is the proof.

---

## Public Foundry documentation baseline checked

Use these public pages as the baseline for the PoC vocabulary and acceptance criteria:

| Area | Public documentation |
|---|---|
| Data ingestion | [Data Connection — overview](https://www.palantir.com/docs/foundry/data-connection/overview) |
| Datasets | [Core concepts — datasets](https://www.palantir.com/docs/foundry/data-integration/datasets) |
| Pipelines | [Pipeline Builder — overview](https://www.palantir.com/docs/foundry/pipeline-builder/overview/) and [Transforms — overview](https://www.palantir.com/docs/foundry/pipeline-builder/transforms-overview/) |
| Data quality | [Data Health](https://www.palantir.com/docs/foundry/observability/data-health/) |
| Ontology | [Object and link types — type reference](https://www.palantir.com/docs/foundry/object-link-types/type-reference) |
| Actions | [Action rules](https://www.palantir.com/docs/foundry/action-types/rules/), [use actions in the platform](https://www.palantir.com/docs/foundry/action-types/use-actions/), [action log](https://www.palantir.com/docs/foundry/action-types/action-log), [notifications](https://www.palantir.com/docs/foundry/action-types/notifications/), [webhooks](https://www.palantir.com/docs/foundry/action-types/webhooks) |
| Workshop | [Workshop widgets](https://www.palantir.com/docs/foundry/workshop/concepts-widgets), [Object Table](https://www.palantir.com/docs/foundry/workshop/widgets-object-table), [Map widget](https://www.palantir.com/docs/foundry/workshop/widgets-map/), [Button Group](https://www.palantir.com/docs/foundry/workshop/widgets-button-group/) |
| Quiver | [Quiver action button](https://www.palantir.com/docs/foundry/quiver/card-action-button) |
| AIP | [AIP Chatbot Studio overview](https://www.palantir.com/docs/foundry/chatbot-studio/overview/), [AIP Chatbot tools](https://www.palantir.com/docs/foundry/agent-studio/tools/), [retrieval context](https://www.palantir.com/docs/foundry/agent-studio/retrieval-context/) |
| Branching | [Global Branching overview](https://www.palantir.com/docs/foundry/foundry-branching/overview/) and [supported functionality](https://www.palantir.com/docs/foundry/foundry-branching/supported-functionality/) |
| Markings / policies | [Markings overview](https://www.palantir.com/docs/foundry/security/markings) |
| Workshop branching caveat | [Branching Workshop modules](https://www.palantir.com/docs/foundry/workshop/branching-rebasing/) |

---

## Foundry-native capability mapping

| PoC capability | How it must be described in Foundry terms | OpenFoundry implementation target | Acceptance criteria |
|---|---|---|---|
| Register GUB incidents, GUB traffic accidents, BCN neighborhoods/districts, AEMET weather, INE census | **Data Connection** sources and syncs into raw Foundry datasets | `connector-management-service` + `ingestion-replication-service` | Each source appears as a connection/sync; outputs are raw datasets with schema, permissions, build history, attribution, and lineage. |
| Land files and tables | **Datasets** containing structured/semi-structured files with transaction history | `dataset-versioning-service` | Every write is a transaction; users can inspect versions/builds and downstream lineage. |
| Batch transforms (incident normalization, spatial join to neighborhood, weather join, shift bucketing, census coarsening) | **Pipeline Builder** or **Code Repositories transforms** | `pipeline-build-service` + `pipeline-runner-spark` | Transform graph is visible; runs are schedulable; failed runs expose errors and Data Health state. |
| Synthetic CAD-style live feed (for the alert step) | Foundry streaming pipeline feeding datasets / ontology-backed objects | `ingestion-replication-service` over Kafka-compatible bus | New `IncidentAlert` objects reach the Workshop module within the PoC latency target without bypassing dataset/ontology semantics. |
| 7-day load forecast at neighborhood × shift grain | A **transform** producing the canonical `LoadForecast` dataset + ontology objects, with explicit naive-baseline comparison | `pipeline-build-service` + Code Workbook (XGBoost + Poisson) | Forecast is materialized as a dataset; MAE vs naive baseline appears as a Data Health metric and is shown on stage. |
| Data quality rules | **Data Health** checks and pipeline validation | `pipeline-expression` + health surfaces | Null, uniqueness, range, freshness, row-count, schema, and MAE-vs-baseline checks are visible as Data Health checks. |
| Lineage | **Data Lineage** from source to dataset to object type and Workshop card | `lineage-service` | A presenter can click from `LoadForecast.expected_incidents` back through the forecast transform to the GUB + AEMET + census source datasets. |
| Urban-safety ontology | **Ontology Manager** object types, link types, properties, interfaces/value types | `ontology-definition-service` + `object-database-service` | `Incident`, `TrafficAccident`, `Neighborhood`, `District`, `CensusTract`, `Shift`, `WeatherEvent`, `Patrol`, `ReinforcementZone`, `TacticalBriefing`, `LoadForecast`, `IncidentAlert`, `ActionLog` match Foundry semantics. |
| Operational writes (`mark-reinforcement-zone`, `generate-daily-briefing`, `close-reinforcement-zone`, `register-zone-outcome`, `acknowledge-incident-alert`) | **Action Types** with rules, validation, side effects, and permissions | `ontology-actions-service` | Actions create/modify objects or links transactionally and enforce role/parameter validation. |
| Decision audit | **Action Log** object types and edit history | `audit-compliance-service` + ontology projections | Every action submission is queryable as an action-log object with actor, timestamp, action type, target object, outcome, and produced edits. |
| Notifications / webhooks | **Action side effects**: Notifications and Webhooks | `notification-alerting-service` + outbound webhooks | When Anna marks a reinforcement zone, Jordi receives a notification; the webhook for the demo Mattermost channel fires as a post-commit side effect. |
| Commander workbench | **Workshop** module *Urban Public-Safety Operations* with Map, Object Table, Forecast chart, Filter, Button Group, AIP Chat, Briefing card | `application-composition-service` + `apps/web` | App builder can configure the module without writing bespoke React for every interaction; selection state is shared across widgets. |
| Operations live dashboard | **Quiver** dashboard *Urban Public-Safety Operations — Live* over ontology object sets | `application-composition-service` + `apps/web` | Dashboard uses ontology-backed object sets, KPI strip, map, top-N tables, and action buttons. |
| AIP Chatbot | **AIP Chatbot** with Ontology context, Document context, Function-backed context, and tools | `agent-runtime-service` + `retrieval-context-service` + `llm-catalog-service` | Tools map to Foundry tool types: Action, Object query, Function, Update application variable, Command, and Request clarification. The chatbot drafts the briefing in < 4 s. |
| Markings (`PUBLIC-OPENDATA`, `OPS-CORE`, `ANALYST-CORE`, `PII-RESIDENT`) | **Markings/Policies** on datasets, objects, and properties | `authorization-policy-service` | Anna sees aggregated forecast + reinforcement zones; Jordi sees raw incident detail; neither sees `PII-RESIDENT` fields without the marking; the AIP respects the same boundary as the UI. |
| Branch demo ("propose 3 chronic-priority neighborhoods to the standing roster") | **Global Branching** across datasets/transforms/Ontology/Workshop/actions | `dataset-versioning-service` + repository branching + branch-aware services | Branch can modify the chronic-priority roster, preview impact in Workshop, run `propose-chronic-priority` on branch, and merge after review. |
| Governance | Foundry permissions, markings/policies, action permissions, and platform security controls | `identity-federation-service` + `authorization-policy-service` + `audit-compliance-service` | Users only see and execute what their role/policy/marking allows; the AIP inherits the same security boundary. |
| Observability | Foundry Observability/Data Health run metrics, traces, logs, and alerts | observability stack | Briefing latency (< 4 s), reinforcement-zone write reflection (< 2 s), forecast MAE vs naive baseline, and AIP/tool activity are visible in a Foundry-style operational surface. |

---

## Required changes to OpenFoundry to match this PoC

Unlike the geopolitical PoC, this PoC does **not** require any net-new platform surface (no Vertex-equivalent app is exercised here). The OpenFoundry deltas it does require are:

### Markings-based row/column visibility on datasets and ontology
- **Requirement:** OpenFoundry's policy engine must enforce **dataset markings** (per-row or per-property) and propagate them into ontology objects, Workshop widgets, and AIP responses.
- **Acceptance:** Anna (with `OPS-CORE`) sees the aggregated `LoadForecast` and the `ReinforcementZone` objects but **not** the address-precise `Incident.location_precise`; Jordi (with `ANALYST-CORE`) sees the raw `Incident` rows but neither user sees the `PII-RESIDENT` census-derived fields. The AIP Chatbot, asked for those fields, refuses with a "marking required" message.
- **Implementation note:** this is the headline differentiator vs. a generic "PostGIS + Grafana + spreadsheet" stack. If markings are not enforced end-to-end (UI + AIP + lineage), this PoC fails its core claim.

### Naive baseline as a first-class Data Health metric
- **Requirement:** the forecast pipeline must publish, alongside the model output, a **same-neighborhood × same-shift × same-day-of-week 30-day rolling mean** as a Data Health metric, and the MAE delta between model and baseline must be a visible health check.
- **Acceptance:** the close panel of the demo shows both numbers; the engineer is contractually allowed to say *"the model is/is not materially better than the baseline today"* live, without surprise.

### Replace OpenFoundry-first language

| Current wording/pattern | Replace with |
|---|---|
| "Spin up `connector-management-service`" | "Create a Data Connection sync; OpenFoundry implements this via `connector-management-service`." |
| "Call `/api/datasets/v1/.../branches`" | "Create a Global Branch; OpenFoundry exposes a compatible API internally." |
| "Register MCP tools" | "Configure AIP Chatbot tools; internally these may be implemented as MCP-style tools." |
| "Cedar / ABAC / RBAC" | "Foundry-style permissions, markings/policies, action permissions; Cedar is implementation detail only." |
| "OpenLineage sink" | "Expose Foundry-style Data Lineage; OpenLineage can be an implementation detail." |
| "Predictive scoring of neighborhoods" | "Spatio-temporal **load forecast** at neighborhood × shift grain, compared live to a naive baseline." |

---

## Gaps that must not be oversold

| Gap | Current PoC risk | Foundry-native handling |
|---|---|---|
| Dedicated Open Data BCN / AEMET connector | Public docs do not confirm a native connector for either | Implement as a custom Data Connection / external transform; do not claim out-of-the-box connector parity. |
| Forecast accuracy | A simple model on public data may not beat the naive baseline at all shifts × neighborhoods | Publish both numbers; **never** claim a delta we have not measured this morning. |
| AIP briefing fluency | The briefing template depends on Spanish/Catalan place names that AIP backbones may stumble on | Hard-code the 4–5 rehearsed prompts; do not improvise on stage. |
| Approval inbox | Public docs confirm action confirmation and branch review patterns | Model approvals as staged actions, branch/resource review, or explicit approval objects. |
| Local backbone fallback | BYOM/registered model patterns exist, but local parity is not publicly confirmed | Keep provider abstraction; label the local variant as OpenFoundry-local demo fallback (mandatory for air-gapped variant). |
| Quiver inside branch | Workshop branching docs note that non-Workshop elements such as Quiver dashboards are not modifiable on a branch | Do not make the branch demo depend on modifying embedded Quiver cards. |
| Auditing every read/view | Action Log covers action submissions; public docs do not prove every object view is logged | Guarantee action/write audit; mark read audit as environment-dependent unless implemented explicitly. |
| "Internal-police data ready" claim | OpenFoundry has not been accredited for handling internal police records | Position the PoC as a *technical* dry run for the migration path; certification and CAD/AVL onboarding are out-of-scope follow-ons. |

---

## Foundry-native demo flow

1. **Data Connection:** show syncs for GUB incidents, GUB traffic accidents, BCN neighborhoods, BCN districts, AEMET weather, INE census.
2. **Raw datasets:** show landed datasets, schemas, transactions, permissions, source attribution, and **markings** (`PUBLIC-OPENDATA`, `OPS-CORE`, `ANALYST-CORE`, `PII-RESIDENT`).
3. **Pipeline Builder / Code Repositories:** show bronze → silver → gold pipelines including the forecast transform, incremental runs, and Data Health checks (including MAE vs naive baseline).
4. **Data Lineage:** trace `LoadForecast.expected_incidents` from the forecast transform back to the GUB incidents + AEMET weather + census source datasets.
5. **Ontology Manager:** show object types and link types listed above.
6. **Workshop (Urban Public-Safety Operations):** Map filtered to a district, Object Table of forecasted top-N neighborhoods, Forecast chart, Briefing card with the AIP-drafted text.
7. **Action Types:** show action rules and permissions for `mark-reinforcement-zone`, `generate-daily-briefing`, `close-reinforcement-zone`, `register-zone-outcome`, `acknowledge-incident-alert`, `propose-chronic-priority` (branch-only).
8. **Quiver (Urban Public-Safety Operations — Live):** KPI strip, live map of incidents in the last 24 h, top-N neighborhoods by forecasted load, active reinforcement zones.
9. **AIP Chatbot:** ask the demo prompts using Object query, Action, Function, and retrieval context tools; execute writes only with confirmation.
10. **Action Log and Governance:** show the resulting Action Log object after Anna marks a reinforcement zone, with edited objects, actor, policy decision, and notification side effects.
11. **Markings demo (UC-7):** Anna asks the AIP for raw incident-level addresses → refused. Jordi asks for `PII-RESIDENT` census fields → refused. Neither leak.
12. **Global Branching (UC-6):** create a `chronic-priority-roster-2026Q3` branch, run `propose-chronic-priority` with 3 candidate neighborhoods, preview impact on the standing roster in Workshop, review, merge or discard.
13. **Observability:** close with Data Health, pipeline run metrics, forecast MAE vs baseline, AIP/tool traces, latency KPIs, marking-denial counts.

---

## Code adaptation checklist for OpenFoundry

Use this checklist to adapt OpenFoundry to the PoC rather than bending the PoC around OpenFoundry internals.

### Product surface
- [ ] Add Foundry-native labels and resource types in the UI: Data Connection, Dataset, Pipeline, Object Type, Link Type, Action Type, Workshop Module, Quiver Dashboard, AIP Chatbot, Global Branch, Marking.
- [ ] Hide raw microservice names from the customer-facing demo path.
- [ ] Add deep links from UI resources to lineage, health, action log, branch context, and marking provenance.

### Data layer
- [ ] Make dataset writes transaction-first, branch-aware, and marking-aware.
- [ ] Represent raw, silver, gold, and ontology materializations as datasets with schema, versions, health, and lineage.
- [ ] Implement connector metadata so sources look like Data Connection syncs.

### Pipeline layer
- [ ] Persist transform graphs and schedules in a Pipeline Builder-like model.
- [ ] Surface quality checks as Data Health-style checks with status, owner, freshness, schema, and failure reason.
- [ ] Emit lineage at field/dataset/object-type level where feasible.
- [ ] **Forecast transform must publish MAE vs naive baseline as a first-class Data Health metric**, not as a hidden notebook cell.

### Ontology and actions
- [ ] Support Foundry-like object/link/action type metadata, display names, validation, and permissions.
- [ ] Support action rules for create/modify/delete object and link edits, including the reinforcement-zone lifecycle (`mark` → `register-outcome` → `close`).
- [ ] Support side effects with separate writeback vs post-commit behavior (Anna → Jordi notification).
- [ ] Materialize an Action Log object type per action type.

### Workshop / Quiver-like app layer
- [ ] Implement object-table, filter, button group, map, **forecast chart**, **briefing card**, object-card, and AIP-chat widgets as reusable configurable widgets.
- [ ] Ensure inline edits and action buttons are action-type backed.
- [ ] Ensure branch preview works for Workshop resources where supported, and document Quiver-like branch limitations.

### AIP layer
- [ ] Rename user-facing "MCP tools" to AIP Chatbot tools.
- [ ] Implement tool categories matching Foundry docs: Action, Object query, Function, Update application variable, Command, Request clarification.
- [ ] Enforce ontology permissions **and markings** inside every tool invocation.
- [ ] Require confirmation for write actions (especially `mark-reinforcement-zone`); never auto-execute.

### Governance and observability
- [ ] Enforce roles/policies/markings consistently for humans, apps, actions, and AIP tools.
- [ ] Capture action submissions in queryable action-log objects.
- [ ] Add Data Health / Observability-style monitors for pipeline runs, freshness, schema, forecast MAE, AIP tool latency, and UI p95.

---

## Definition of done

The PoC can be called **Foundry-native equivalent** only when all of the following are true:

1. A Foundry user can map every demo step to a known Foundry application or concept.
2. Any non-publicly-confirmed capability is explicitly marked as OpenFoundry emulation.
3. The AIP Chatbot uses the same security boundary (roles **and markings**) as the UI user.
4. Every operational write — especially `mark-reinforcement-zone` — is performed through an Action Type and appears in an Action Log.
5. Every data transformation has visible lineage and health checks; the forecast transform exposes MAE vs naive baseline.
6. The Workshop module is Map + Object Table + Forecast + Briefing card — no graph widget is invoked.
7. Markings work end-to-end: dataset row/column → ontology object/property → Workshop widget → AIP response → lineage view.
8. Branching is demonstrated through Global Branching-compatible semantics, including documented Quiver limitations.
9. The demo script never claims parity for OpenFoundry-specific internals that Palantir public documentation does not support.
10. The customer leaves with the message *"the morning-briefing decision is now traceable, repeatable, and ready to accept our internal CAD/AVL feeds tomorrow."* — not *"look at the pretty map."*

---

## ✅ Concrete actions (when the PoC is executed)

1. Walk the demo script against this contract one final time before each customer session; if any step does not map to a row in the capability table, rewrite the step.
2. Pre-stage the four marking accounts (`PUBLIC-OPENDATA` only, `OPS-CORE`, `ANALYST-CORE`, `PII-RESIDENT`) and confirm each one denies the right things in the AIP and in Workshop.
3. Verify that the forecast transform publishes both the model MAE and the naive baseline MAE as Data Health metrics, and that the close panel reads them from there — not from a slide.
4. Confirm that `mark-reinforcement-zone` produces an Action Log row, fires the notification side effect to Jordi, and reflects in Workshop in under 2 s.
5. Confirm that the branch demo (`propose-chronic-priority`) does **not** require modifying the Quiver dashboard on the branch.
6. Print this contract; keep it next to the laptop during the demo. If the customer asks *"is that real Foundry?"*, the answer is in this file.
