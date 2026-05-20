# 00 — Foundry-native contract for the Geopolitical Intelligence PoC

> Goal: this PoC must be demonstrable as if it had been built directly in **Palantir Foundry**. OpenFoundry may implement the internals differently, but every user-visible step, artifact, and acceptance criterion must map to a public Foundry capability. **The PoC dictates the contract; OpenFoundry adapts.**

---

## Non-negotiable interpretation

1. **Foundry first, OpenFoundry second.** The PoC is not a generic OpenFoundry demo with Foundry-like labels; it is a Foundry-native workflow that OpenFoundry must emulate.
2. **Customer-facing names must be Foundry concepts.** In the demo script and UI copy, use names such as Data Connection, Dataset, Pipeline Builder, Code Repositories, Ontology Manager, Object Type, Link Type, Action Type, Workshop, Quiver, AIP Chatbot, Data Lineage, Data Health, Action Log, Markings/Policies, and Global Branching.
3. **OpenFoundry service names are implementation details.** Names such as `connector-management-service`, `dataset-versioning-service`, or `agent-runtime-service` can remain in engineering runbooks, but not as the primary narrative for the customer demo.
4. **If a Foundry capability cannot be publicly verified, mark it as an emulation.** Do not claim it is identical to Foundry unless the behavior is supported by Palantir public documentation or validated by a Palantir environment.
5. **The acceptance test is behavioral parity.** The question is not whether the OpenFoundry architecture resembles Foundry; the question is whether a Foundry practitioner would perform the same step with an equivalent Foundry resource.
6. **The graph view is part of the Foundry surface, not a separate product.** In Foundry terms, link analysis appears as an Object Explorer / Workshop graph visualization driven by ontology link types. We **must not** ship a parallel "Neo4j-style" UI labeled as its own product.

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
| Object Explorer (graph) | [Object Explorer — overview](https://www.palantir.com/docs/foundry/object-explorer/overview/) |
| Actions | [Action rules](https://www.palantir.com/docs/foundry/action-types/rules/), [use actions in the platform](https://www.palantir.com/docs/foundry/action-types/use-actions/), [action log](https://www.palantir.com/docs/foundry/action-types/action-log), [notifications](https://www.palantir.com/docs/foundry/action-types/notifications/), [webhooks](https://www.palantir.com/docs/foundry/action-types/webhooks) |
| Workshop | [Workshop widgets](https://www.palantir.com/docs/foundry/workshop/concepts-widgets), [Object Table](https://www.palantir.com/docs/foundry/workshop/widgets-object-table), [Map widget](https://www.palantir.com/docs/foundry/workshop/widgets-map/), [Button Group](https://www.palantir.com/docs/foundry/workshop/widgets-button-group/) |
| Quiver | [Quiver action button](https://www.palantir.com/docs/foundry/quiver/card-action-button) |
| AIP | [AIP Chatbot Studio overview](https://www.palantir.com/docs/foundry/chatbot-studio/overview/), [AIP Chatbot tools](https://www.palantir.com/docs/foundry/agent-studio/tools/), [retrieval context](https://www.palantir.com/docs/foundry/agent-studio/retrieval-context/) |
| Branching | [Global Branching overview](https://www.palantir.com/docs/foundry/foundry-branching/overview/) and [supported functionality](https://www.palantir.com/docs/foundry/foundry-branching/supported-functionality/) |
| Markings / policies | [Markings overview](https://www.palantir.com/docs/foundry/security/markings) (referenced wherever Foundry's marking-based access control is invoked) |
| Workshop branching caveat | [Branching Workshop modules](https://www.palantir.com/docs/foundry/workshop/branching-rebasing/) |

---

## Foundry-native capability mapping

| PoC capability | How it must be described in Foundry terms | OpenFoundry implementation target | Acceptance criteria |
|---|---|---|---|
| Register GDELT (events + GKG), ACLED, OFAC SDN, EU Consolidated, OpenSanctions, Wikidata | **Data Connection** sources and syncs into raw Foundry datasets | `connector-management-service` + `ingestion-replication-service` | Each source appears as a connection/sync; outputs are raw datasets with schema, permissions, build history, and lineage. |
| Land files and tables | **Datasets** containing structured/semi-structured files with transaction history | `dataset-versioning-service` | Every write is a transaction; users can inspect versions/builds and downstream lineage. |
| Batch transforms (GDELT decoder, CAMEO enrichment, geocoding, entity resolution) | **Pipeline Builder** or **Code Repositories transforms** | `pipeline-build-service` + `pipeline-runner-spark` | Transform graph is visible; runs are schedulable; failed runs expose errors and health state. |
| Streaming (GDELT 15-min drop, sanctions delta polling) | Foundry streaming pipeline feeding datasets or ontology-backed objects | `ingestion-replication-service` over Kafka-compatible bus | New events reach the Workshop module within the PoC latency target without bypassing dataset/ontology semantics. |
| Entity resolution (Actor cross-source dedup) | A modeled **transform** producing the canonical `Actor` dataset, with linkage tables to source rows | `pipeline-build-service` + `entity-resolution` library | Resolution rules are visible in the transform graph; precision/recall metrics surface as Data Health checks. |
| Data quality rules | **Data Health** checks and pipeline validation | `pipeline-expression` + health surfaces | Null, uniqueness, range, freshness, row-count, and schema checks are visible as health checks, not hidden test code. |
| Lineage | **Data Lineage** from source to dataset to object type and app | `lineage-service` | A presenter can click from `Event.cameo_code` or `Actor.is_sanctioned` to the producing pipeline and source datasets. |
| Geopolitical ontology | **Ontology Manager** object types, link types, properties, interfaces/value types | `ontology-definition-service` + `object-database-service` | Object types, link types, property metadata, primary keys, display names, and permissions match Foundry semantics. |
| Link analysis / graph expansion | **Object Explorer** graph view over ontology link types | `ontology-query-service` + `apps/web` graph widget | A user can pivot from an `Actor` to all linked `Event`s and `Organization`s up to N hops; the same pivots are available to the AIP chatbot via Object query tools. |
| Operational writes (add to watchlist, flag actor, open investigation case) | **Action Types** with rules, validation, side effects, and permissions | `ontology-actions-service` | Actions create/modify objects or links transactionally and enforce role/parameter validation. |
| Decision audit | **Action Log** object types and edit history | `audit-compliance-service` + ontology projections | Every action submission is queryable as an action-log object with actor, timestamp, action type, target object, outcome, and produced edits. |
| Notifications / webhooks | **Action side effects**: Notifications and Webhooks | `notification-alerting-service` + outbound webhooks | Notifications and webhooks are configured as action side effects; failures follow Foundry-like writeback vs side-effect semantics. |
| Analyst workbench | **Workshop** module with Map, Timeline, Object Table, Graph, Filter, Button Group, AIP Chat widgets | `application-composition-service` + `apps/web` | App builder can configure the module without writing bespoke React for every interaction. |
| Operations dashboard | **Quiver** dashboard and/or Workshop dashboard over ontology object sets | `application-composition-service` + `apps/web` | Dashboard uses ontology-backed object sets, filters, maps, tables, and action buttons. |
| Copilot | **AIP Chatbot** with Ontology context, Document context, Function-backed context, and tools | `agent-runtime-service` + `retrieval-context-service` + `llm-catalog-service` | Tools map to Foundry tool types: Action, Object query, Function, Update application variable, Command, and Request clarification. |
| Markings (compartmentation by source/region/classification level) | **Markings/Policies** on datasets, objects, and properties | `authorization-policy-service` | A user with the wrong marking cannot see the marked rows in datasets, Workshop, or AIP responses; the AIP chatbot respects the same boundary as the UI. |
| Branch demo (e.g. "extend OFAC list with 12 candidates and preview") | **Global Branching** across datasets/transforms/Ontology/Workshop/actions | `dataset-versioning-service` + repository branching + branch-aware services | Branch can modify a pipeline/ontology/app, preview effects, run actions on branch, and merge after review. |
| Governance | Foundry permissions, markings/policies, action permissions, and platform security controls | `identity-federation-service` + `authorization-policy-service` + `audit-compliance-service` | Users only see and execute what their role/policy/marking allows; the AIP chatbot inherits the same security boundary. |
| Observability | Foundry Observability/Data Health run metrics, traces, logs, and alerts | observability stack | P95 latency, failed runs, health checks, and AIP/tool activity are visible in a Foundry-style operational surface. |

---

## Required changes to OpenFoundry to match this PoC

Unlike the aviation PoC, this PoC introduces two requirements that the aviation contract did not stress, and that the OpenFoundry product must **adapt to**:

### Graph widget as a first-class Workshop widget
- **Requirement:** a `graph` widget configurable in Workshop, backed by ontology link-type queries (N-hop expansion), with selection state shared with `object-table`, `map`, and `timeline` widgets.
- **Acceptance:** the demo's "expand neighborhood of `Person:X`" step must work end-to-end without bespoke React; the widget configuration is JSON, persisted, branchable, and respects markings.
- **Implementation note:** OpenFoundry's `apps/web` graph rendering is a frontend concern; the link-type query path lives in `ontology-query-service` and must support paginated N-hop expansion with marking filters.

### Markings-based row/column visibility on datasets and ontology
- **Requirement:** OpenFoundry's policy engine must enforce **dataset markings** (per-row or per-property) and propagate them into ontology objects and AIP responses.
- **Acceptance:** a user without the `MARKING:GDELT-RAW` marking sees the resolved `Event` object but **not** the raw GDELT row that produced it; the AIP chatbot, asked for the source URL, refuses with a "marking required" message.
- **Implementation note:** this is the headline differentiator vs. a generic "Elastic + Kibana + Neo4j" stack. If markings are not enforced end-to-end (UI + AIP + lineage), this PoC fails its core claim.

### Replace OpenFoundry-first language

| Current wording/pattern | Replace with |
|---|---|
| "Spin up `connector-management-service`" | "Create a Data Connection sync; OpenFoundry implements this via `connector-management-service`." |
| "Call `/api/datasets/v1/.../branches`" | "Create a Global Branch; OpenFoundry exposes a compatible API internally." |
| "Register MCP tools" | "Configure AIP Chatbot tools; internally these may be implemented as MCP-style tools." |
| "Cedar / ABAC / RBAC" | "Foundry-style permissions, markings/policies, action permissions, and purpose/role controls; Cedar is implementation detail only." |
| "Graph database backed by Neo4j" | "Ontology link types queried via Object Explorer / Workshop graph widget; the storage backend is an implementation detail." |
| "OpenLineage sink" | "Expose Foundry-style Data Lineage; OpenLineage can be an implementation detail." |

---

## Gaps that must not be oversold

| Gap | Current PoC risk | Foundry-native handling |
|---|---|---|
| Dedicated GDELT connector | Public docs do not confirm a native GDELT connector | Implement as a custom Data Connection / external transform; do not claim out-of-the-box connector parity. |
| Entity resolution UX | Foundry has internal ER tooling, but the public surface is the transform graph + Object Health | Expose ER as a named transform with quality checks; do not claim parity with any proprietary ER UI. |
| Graph widget parity | Public Workshop docs list Map, Object Table, Button Group, etc.; a "Graph" widget is *implied* by Object Explorer but its Workshop integration is less documented | Ship the widget; label it explicitly as "Object Explorer-style graph view embedded in Workshop, equivalent behavior, OpenFoundry implementation". |
| MCP naming | Public AIP docs describe Chatbot tools, not MCP as the user-facing concept | Use AIP Chatbot tool types in docs and UI. |
| Approval inbox | Public docs confirm action confirmation and branch review patterns | Model approvals as staged actions, branch/resource review, or explicit `ApprovalRequest` ontology objects. |
| Ollama local fallback | BYOM/registered model patterns exist, but local Ollama parity is not publicly confirmed | Keep provider abstraction; label Ollama as OpenFoundry-local demo fallback (mandatory for air-gapped variant). |
| Quiver inside branch | Workshop branching docs note that non-Workshop elements such as Quiver dashboards are not modifiable on a branch | Do not make branch demo depend on modifying embedded Quiver cards. |
| Auditing every read/view | Action Log covers action submissions; public docs do not prove every object view is logged as the PoC describes | Guarantee action/write audit; mark read audit as environment-dependent unless implemented explicitly. |
| "Classified data ready" claim | OpenFoundry has not been accredited for classified handling | Position the PoC as a *technical* dry run for the migration path; certification is an out-of-scope follow-on. |

---

## Foundry-native demo flow

1. **Data Connection:** create or show syncs for GDELT events + GKG, ACLED, OFAC SDN, EU Consolidated, OpenSanctions, Wikidata.
2. **Raw datasets:** show landed datasets, schemas, transactions, permissions, source attribution, and **markings** (e.g. `OPEN-SOURCE`, `SANCTIONS-LIST`, `ENRICHED-PII`).
3. **Pipeline Builder / Code Repositories:** show bronze → silver → gold pipelines including the **entity-resolution transform**, incremental runs, and Data Health checks.
4. **Data Lineage:** trace `Actor.is_sanctioned` from source datasets through the ER transform back to OFAC + EU + OpenSanctions rows.
5. **Ontology Manager:** show object types (`Actor`, `Person`, `Organization`, `ArmedGroup`, `GovernmentBody`, `Event`, `Location`, `Country`, `NewsArticle`, `SanctionsEntry`, `Watchlist`, `InvestigationCase`) and link types.
6. **Object Explorer / graph:** expand the neighborhood of a designated actor, traverse `MENTIONED_IN`, `OCCURRED_AT`, `SANCTIONED_BY`, `MEMBER_OF` link types.
7. **Action Types:** show action rules and permissions for `add-to-watchlist`, `flag-actor`, `open-investigation-case`, `acknowledge-alert`, `propose-sanctions-extension` (branch-only).
8. **Workshop:** show the analyst module — map (events last 72 h), timeline, object table, **graph** widget, AIP chat.
9. **AIP Chatbot:** ask the demo prompts using Object query, Action, Function, and retrieval context tools; execute writes only with confirmation.
10. **Action Log and Governance:** show the resulting action log object, edited objects, actor, policy decision, and notification side effects.
11. **Markings demo:** switch to a low-clearance user — show that `NewsArticle.url` is redacted, the AIP refuses to surface it, and a downstream Workshop card shows "marking required".
12. **Global Branching:** create a "sanctions-extension-2026Q3" branch, add 12 candidate entities, preview impact in Workshop and AIP, review, merge or discard.
13. **Observability:** close with Data Health, pipeline run metrics, AIP/tool traces, latency/volume KPIs.

---

## Code adaptation checklist for OpenFoundry

Use this checklist to adapt OpenFoundry to the PoC rather than bending the PoC around OpenFoundry internals.

### Product surface
- [ ] Add Foundry-native labels and resource types in the UI: Data Connection, Dataset, Pipeline, Object Type, Link Type, Action Type, Workshop Module, AIP Chatbot, Global Branch, Marking.
- [ ] Hide raw microservice names from the customer-facing demo path.
- [ ] Add deep links from UI resources to lineage, health, action log, branch context, **and marking provenance**.

### Data layer
- [ ] Make dataset writes transaction-first, branch-aware, **and marking-aware**.
- [ ] Represent raw, silver, gold, and ontology materializations as datasets with schema, versions, health, and lineage.
- [ ] Implement connector metadata so sources look like Data Connection syncs.

### Pipeline layer
- [ ] Persist transform graphs and schedules in a Pipeline Builder-like model.
- [ ] Surface quality checks as Data Health-style checks with status, owner, freshness, schema, and failure reason.
- [ ] Emit lineage at field/dataset/object-type level where feasible.
- [ ] **Entity-resolution transform must be a first-class node in the transform graph** with input/output dataset references, parameter view, and metric checks.

### Ontology and actions
- [ ] Support Foundry-like object/link/action type metadata, display names, validation, and permissions.
- [ ] Support N-hop link expansion in the ontology query API, with marking filters.
- [ ] Support action rules for create/modify/delete object and link edits.
- [ ] Support side effects with separate writeback vs post-commit behavior.
- [ ] Materialize an action log object type per action type.

### Workshop / Quiver-like app layer
- [ ] Implement object-table, filter, button group, map, timeline, **graph**, object-card, and AIP-chat widgets as reusable configurable widgets.
- [ ] Graph widget must support: focus node, N-hop expansion, link-type filter, marking-aware visibility, selection state shared with sibling widgets.
- [ ] Ensure inline edits and action buttons are action-type backed.
- [ ] Ensure branch preview works for Workshop resources where supported, and document Quiver-like branch limitations.

### AIP layer
- [ ] Rename user-facing "MCP tools" to AIP Chatbot tools.
- [ ] Implement tool categories matching Foundry docs: Action, Object query, Function, Update application variable, Command, Request clarification.
- [ ] Enforce ontology permissions **and markings** inside every tool invocation.
- [ ] Require confirmation for write actions unless a configured policy allows automatic execution.

### Governance and observability
- [ ] Enforce roles/policies/**markings** consistently for humans, apps, actions, and AIP tools.
- [ ] Capture action submissions in queryable action-log objects.
- [ ] Add Data Health/Observability-style monitors for pipeline runs, freshness, schema, AIP tool latency, and UI p95.

---

## Definition of done

The PoC can be called **Foundry-native equivalent** only when all of the following are true:

1. A Foundry user can map every demo step to a known Foundry application or concept.
2. Any non-publicly-confirmed capability is explicitly marked as OpenFoundry emulation.
3. The AIP copilot uses the same security boundary (roles **and markings**) as the UI user.
4. Every operational write is performed through an Action Type and appears in an Action Log.
5. Every data transformation has visible lineage and health checks; the entity-resolution transform exposes precision/recall checks.
6. The graph widget reads from ontology link types — not from a parallel "graph DB UI" labeled as its own product.
7. Markings work end-to-end: dataset row/column → ontology object/property → Workshop widget → AIP response → lineage view.
8. Branching is demonstrated through Global Branching-compatible semantics, including documented limitations.
9. The demo script never claims parity for OpenFoundry-specific internals that Palantir public documentation does not support.
10. The customer leaves with the message *"the ontology + governance are the durable asset; my classified data slots in tomorrow without redoing this."* — not *"look at the pretty map."*
