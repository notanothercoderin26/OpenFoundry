# Services and Ports

All backend services expose a health endpoint and bind to fixed default ports in local development. The edge gateway listens on `8080` and proxies public traffic to these internal services.

> Current-source note: this page describes runtime service names and default
> ports. It is not a filesystem map. The HTTP gateway source lives at
> `services/edge-gateway-service`; there is no current `services/gateway`
> directory. For authoritative route ownership, read
> `services/edge-gateway-service/internal/proxy/router_table.go`.

## Service Map

The **Plano objetivo** column maps each service onto one of the five
target planes from [Runtime Topology](./runtime-topology.md): *storage*,
*ingestion*, *compute*, *control* or *state* (relational). A small number
of services are dual-anchored (e.g. write-path services that govern
*state* but emit on the *control* plane).

| Service | Default Port | Plano objetivo | Primary Role |
| --- | --- | --- | --- |
| `edge-gateway-service` | `8080` | control | Public HTTP edge, route selection, request IDs, rate limiting, tenant/auth headers, audit fan-out |
| `identity-federation-service` | `50112` | control | Login, refresh, MFA, SAML/OIDC/OAuth flows, service account tokens, scoped/guest sessions |
| `authorization-policy-service` | `50115` | control | Roles, permissions, groups, policies, restricted views, and merged security-governance/cipher/network-boundary surfaces |
| `tenancy-organizations-service` | `50113` | control | Tenant resolution, organizations, enrollments, spaces, projects, and sharing boundaries |
| `connector-management-service` | `50088` | ingestion | Connector catalog, source/connection definitions, credentials metadata, connection testing, and discovery orchestration |
| `ingestion-replication-service` | `50120` | ingestion | Ingest-job materialization, replication control plane, and CDC metadata endpoints |
| `dataset-versioning-service` | `50117` | state | Dataset metadata, branches, transactions, versions, files, and Iceberg-backed snapshot state |
| `media-sets-service` | `50121` / `50122` | state | Media set metadata, media item references, and media storage APIs |
| `iceberg-catalog-service` | `8197` | storage | Iceberg REST catalog compatibility surface |
| `sql-bi-gateway-service` | `50133` / `50134` | compute | Flight SQL / BI edge plus HTTP `/healthz` and saved-query style surfaces |
| `pipeline-build-service` | `50081` | compute | Pipeline definitions, validation, preview/build execution, run history, and scheduled/cron trigger ownership after consolidation |
| `lineage-service` | `50083` | compute | Dataset and column lineage APIs |
| `ontology-definition-service` | `50122` | control | Ontology schema/control plane: object types, properties, interfaces, link types, action definitions, and project governance |
| `object-database-service` | `50104` | state | Object instances, link instances, revision history, and transactional outbox |
| `ontology-query-service` | `50105` | compute | Search, graph traversal, object-set queries, KNN, read models, and projections |
| `ontology-actions-service` | `50106` | control | Controlled mutations, action validation/execution, funnel/functions/rules, and policy-aware filters |
| `workflow-automation-service` | `50137` | control | Workflow orchestration and execution runtime |
| `notebook-runtime-service` | `50134` | compute | Notebook kernels, cells, sessions, notepad/reporting-style surfaces after consolidation |
| `application-composition-service` | `50118` | control | Application composition, templates, publishing, and related widget/app surfaces |
| `code-repository-review-service` | `50155` | state | Code repository review and developer-platform repository flows |
| `federation-product-exchange-service` | `50126` | control | Federation, marketplace, product exchange, and Nexus-style collaboration surfaces |
| `notification-alerting-service` | `50114` | control | Notification transport, inbox APIs, delivery channels, alerting, and websocket fanout |
| `audit-compliance-service` | `50115` | control | Audit collection, retention, lineage deletion, SDS, GDPR, and compliance posture surfaces |
| `model-catalog-service` | `50085` | compute | ML experiments, runs, models, and model versions |
| `model-deployment-service` | `50086` | compute | Model deployments, predictions, drift, and batch prediction APIs |
| `ai-evaluation-service` | `50075` | compute | AI guardrail and evaluation APIs |
| `llm-catalog-service` | `50095` | compute | AI provider catalog APIs |
| `retrieval-context-service` | `50098` | compute | Knowledge-base retrieval and RAG context APIs |
| `agent-runtime-service` | `50127` | compute | Agent/AI runtime, tool execution, prompt workflow compatibility, and conversation surfaces |
| `entity-resolution-service` | `50058` | compute | Entity resolution and fusion-style APIs |
| `ontology-exploratory-analysis-service` | `50131` | compute | Exploratory ontology analysis and geospatial-style APIs after consolidation |
| `telemetry-governance-service` | `50153` | control | Monitoring views, monitor rules, and telemetry governance |

### Internal / data-plane binaries (no gateway routes)

The following binaries live under `services/` and ship in the same
Helm releases but are not reachable through the edge gateway; they are
data-plane consumers, CLI tools, or runtime workers.

| Service | Plano objetivo | Primary Role |
| --- | --- | --- |
| `ai-sink` | storage | Kafka consumer that lands AI runtime events into Iceberg sinks |
| `audit-sink` | storage | Kafka consumer that lands audit events into the Iceberg audit archive |
| `ontology-indexer` | compute | Cassandra → Vespa indexer for ontology read models |
| `pipeline-runner` | compute | Plan-driven runner: decodes a `pipelineplan.Plan` and executes it via `libs/pipeline-runtime` against Iceberg. ADR-0045 retired the Scala `pipeline-runner-spark` variant. |
| `reindex-coordinator-service` | compute | Foundry-pattern reindex coordinator (Kafka-driven full-keyspace scan; ADR-0037) |
| `compute-module-service` | compute | Hosts user-supplied compute modules (Foundry-style container UDFs) |
| `media-transform-runtime-service` | compute | Worker runtime for media transforms scheduled by `media-sets-service` |
| `sdk-generation-service` | control | OpenAPI / TS / Python / Java SDK generation hand-off endpoint |
| `solution-design-service` | control | Solution / template authoring control plane |
| `workflow-automation-service` (CronJob: `approvals-timeout-sweep`) | control | Periodic timeout sweeper shipped alongside `workflow-automation-service`; turns expired approvals into `approval.expired.v1` events |

`workflow-automation-service` also hosts the consolidated **saga** and
**approval** substrates after S8 consolidation (see
[ADR-0030](./adr/ADR-0030-service-consolidation-30-targets.md)). The
legacy `automation-operations-service` and `approvals-service`
binaries no longer exist on disk; their packages now live in
[`services/workflow-automation-service/internal/automationoperations/`](../../services/workflow-automation-service/internal/automationoperations/)
and
[`services/workflow-automation-service/internal/approvals/`](../../services/workflow-automation-service/internal/approvals/).

### Edge SQL surfaces — explicit positioning

Two surfaces sit at the **edge of the compute plane** and are easy to
confuse; their roles are intentionally disjoint:

| Component                      | Plano objetivo            | Role                                                                                                                                                                                                                            |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sql-bi-gateway-service`       | compute (edge BI gateway) | **Edge BI gateway**. The single Apache Arrow Flight SQL surface for external BI clients (Tableau, Superset, JDBC/ODBC). The Flight SQL gRPC port (`50133`) is substrate-only today: a literal-SELECT evaluator (`libs/query-engine`) answers BI client probes and richer statements are federated by catalog prefix to optional Flight SQL backends (`WAREHOUSING_FLIGHT_SQL_URL`, `TRINO_FLIGHT_SQL_URL`, `VESPA_FLIGHT_SQL_URL`, `POSTGRES_FLIGHT_SQL_URL`) — see [ADR-0014](./adr/ADR-0014-retire-trino-flight-sql-only.md), [ADR-0029](./adr/ADR-0029-reintroduce-trino-for-iceberg-analytics.md) and [ADR-0030](./adr/ADR-0030-service-consolidation-30-targets.md). The companion HTTP port (`50134`) owns the warehousing (`/api/v1/warehouse/*`) and tabular-analysis (`/api/v1/tabular/*`) HTTP CRUD absorbed from the retired `sql-warehousing-service` and `tabular-analysis-service` (S8 consolidation); the analytical-expressions surface lives in the `libs/analytical-logic` internal package (no duplicated routes). |

## Gateway Route Ownership

The gateway maps URL prefixes to backend services. Important examples
from `services/edge-gateway-service/internal/proxy/router_table.go`:

- `/api/v1/auth`, `/api/v1/users` -> `identity-federation-service`
- `/api/v1/roles`, `/api/v1/permissions`, `/api/v1/groups`, `/api/v1/policies` -> `authorization-policy-service`
- `/api/v1/tenancy/resolve`, `/api/v1/organizations`, `/api/v1/enrollments` -> `tenancy-organizations-service`
- `/api/v1/connectors/catalog`, `/api/v1/connections` -> `connector-management-service`
- `/api/v1/connector-agents`, connection sync jobs -> `ingestion-replication-service`
- `/api/v1/datasets`, `/api/v2/filesystem` -> `dataset-versioning-service`
- `/api/v1/pipelines`, pipeline runs, and pipeline cron triggers -> `pipeline-build-service`
- `/api/v1/workflows`, approvals, and workflow execution routes -> `workflow-automation-service`
- `/api/v1/lineage` -> `lineage-service`
- `/api/v1/ontology/projects` -> `tenancy-organizations-service`
- `/api/v1/ontology/actions`, `/api/v1/ontology/funnel`, `/api/v1/ontology/storage/insights`, `/api/v1/ontology/functions`, `/api/v1/ontology/rules`, `/api/v1/ontology/types/{id}/objects/{id}/inline-edit`, `/api/v1/ontology/types/{id}/rules`, `/api/v1/ontology/objects/{id}/rule-runs` -> `ontology-actions-service` (S8.1: sole runtime owner after absorbing funnel/functions/security)
- `/api/v1/ontology/search`, `/api/v1/ontology/graph`, `/api/v1/ontology/quiver`, `/api/v1/ontology/object-sets`, `/api/v1/ontology/types/{id}/objects/query`, `/api/v1/ontology/types/{id}/objects/knn` -> `ontology-query-service`
- `/api/v1/ontology/links/{id}/instances`, `/api/v1/ontology/types/{id}/objects` -> `object-database-service`
- `/api/v1/ontology/interfaces`, `/api/v1/ontology/shared-property-types`, `/api/v1/ontology/links`, `/api/v1/ontology/types` -> `ontology-definition-service`
- `/api/v1/ml/experiments`, `/api/v1/ml/models` -> `model-catalog-service`
- `/api/v1/ml/deployments`, `/api/v1/ml/batch-predictions` -> `model-deployment-service`
- `/api/v1/ai/evaluations` -> `ai-evaluation-service`
- `/api/v1/ai/providers` -> `llm-catalog-service`
- `/api/v1/ai/knowledge-bases/*/search` -> `retrieval-context-service`
- `/api/v1/entity-resolution`, `/api/v1/fusion` -> `entity-resolution-service`
- `/api/v1/code-repos` -> `code-repository-review-service` / global branch routes per router table
- `/api/v1/marketplace`, `/api/v1/federation-product-exchange`, `/api/v1/nexus` -> `federation-product-exchange-service`
- `/api/v1/nexus/spaces` -> `tenancy-organizations-service`
- `/api/v1/notifications` -> `notification-alerting-service`
- `/api/v1/audit` -> `audit-compliance-service`

### Gateway upstream aliases (Helm parity)

The gateway's `UpstreamURLs` struct in
[`services/edge-gateway-service/internal/config/config.go`](../../services/edge-gateway-service/internal/config/config.go)
keeps **legacy alias fields** for every service that existed in the
Rust gateway's `config.rs`, even when the bounded context has since
been absorbed by another binary. The package doc-comment is explicit:

> Field set + default ports MUST stay aligned with the Rust gateway's
> config.rs so a single Helm values.yaml can drive both
> implementations during the strangler-fig cutover.

The practical consequence is that several upstream keys point to a
service that is **not** a separate binary on disk. The mapping is:

| Gateway upstream key | Resolves to |
| --- | --- |
| `data_connector_service_url` (`:50088`) | `connector-management-service` |
| `ontology_service_url` (`:50103`) | `ontology-definition-service` |
| `audit_service_url` (`:50115`) | `audit-compliance-service` |
| `ml_service_url` (`:50085`) | `model-catalog-service` |
| `ai_service_url` (`:50127`) | `agent-runtime-service` |
| `security_governance_service_url` (`:50114`) | `authorization-policy-service` (absorbed surface) |
| `cipher_service_url` (`:50073`) | `authorization-policy-service` (absorbed surface) |
| `oauth_integration_service_url` (`:50094`) | `identity-federation-service` (absorbed surface) |
| `session_governance_service_url` (`:50074`) | `identity-federation-service` (absorbed surface) |
| `network_boundary_service_url` (`:50119`) | `authorization-policy-service` (absorbed surface) |
| `checkpoints_purpose_service_url` (`:50116`) | `tenancy-organizations-service` (absorbed surface) |
| `retention_policy_service_url` (`:50117`) | `dataset-versioning-service` (absorbed surface) |
| `lineage_deletion_service_url` (`:50118`) | `audit-compliance-service` (absorbed surface) |
| `sds_service_url` (`:50076`) | `audit-compliance-service` (absorbed surface) |
| `virtual_table_service_url` (`:50089`) | reserved (see [ADR-0040](./adr/ADR-0040-virtual-tables-service.md); not yet deployed) |
| `pipeline_authoring_service_url` (`:50080`) | `pipeline-build-service` (absorbed surface) |
| `pipeline_schedule_service_url` (`:50082`) | `pipeline-build-service` (absorbed surface) |
| `data_asset_catalog_service_url` (`:50079`) | `connector-management-service` (absorbed surface) |
| `dataset_quality_service_url` (`:50072`) | `pipeline-build-service` (absorbed surface) |
| `approvals_service_url` (`:50071`) | `workflow-automation-service` (approvals package) |
| `app_builder_service_url` (`:50063`) | `application-composition-service` (absorbed surface) |
| `application_curation_service_url` (`:50101`) | `application-composition-service` (absorbed surface) |
| `model_evaluation_service_url` (`:50091`) | `model-catalog-service` (absorbed surface) |
| `model_serving_service_url` (`:50087`) | `model-deployment-service` (absorbed surface) |
| `model_inference_history_service_url` (`:50092`) | `model-deployment-service` (absorbed surface) |
| `prompt_workflow_service_url` (`:50096`) | `agent-runtime-service` (absorbed surface) |
| `knowledge_index_service_url` (`:50097`) | `retrieval-context-service` (absorbed surface) |
| `conversation_state_service_url` (`:50099`) | `agent-runtime-service` (absorbed surface) |
| `document_reporting_service_url` (`:50102`) | `notebook-runtime-service` (absorbed surface) |
| `streaming_service_url` (`:50121`) | `media-sets-service` (shares port; reserved alias) |
| `report_service_url` (`:50064`) | `notebook-runtime-service` (absorbed surface) |
| `geospatial_intelligence_service_url` (`:50131`) | `ontology-exploratory-analysis-service` |
| `code_repo_service_url` (`:50065`) | `code-repository-review-service` |
| `global_branch_service_url` (`:50110`) | `code-repository-review-service` (absorbed surface) |
| `marketplace_catalog_service_url` (`:50066`) | `federation-product-exchange-service` (absorbed surface) |
| `product_distribution_service_url` (`:50111`) | `federation-product-exchange-service` (absorbed surface) |
| `nexus_service_url` (`:50067`) | `tenancy-organizations-service` (Nexus spaces route) |

> **Do not point a real Helm deployment at these legacy URLs.** Point
> the alias to the same host:port as its resolved owner, or delete the
> override from `values.yaml`. The default-port values exist purely so
> a development shell with no overrides still boots cleanly.

## Cross-Service Dependencies

Configuration files show explicit service-to-service defaults for several domains:

- `connector-management-service` knows about dataset, pipeline, and ontology services
- `ingestion-replication-service` knows about dataset, pipeline, and ontology services
- connector discovery and virtual-table style routes are consolidated into `connector-management-service`
- `pipeline-build-service` depends on dataset, workflow, AI, and storage services
- `lineage-service` depends on dataset, workflow, and AI services
- `workflow-automation-service` depends on notification, ontology, and pipeline services
- `ontology-definition-service` depends on audit, AI, and notification services
- `object-database-service` depends on audit and notification services; all writes go through `object-database-service`
- `ontology-query-service` depends on `object-database-service` (fallback point lookups), `ontology-actions-service` (policy filters, S8.1), and AI services
- `ontology-actions-service` depends on `object-database-service` (mutations) and `ontology-definition-service` (action / function package definitions); owns the actions, funnel, function-runtime and rule (policy / marking) HTTP surfaces and the `actions_log` Cassandra column family (S8.1)
- reporting/notepad-style routes are consolidated into `notebook-runtime-service`
- `notebook-runtime-service` depends on query and AI services
- marketplace/product-exchange routes are consolidated into `federation-product-exchange-service`
- app-builder/application-curation/developer-console style routes are consolidated into `application-composition-service`

## Health Convention

Every current Go service exposes a `/healthz` route. Some services also keep
`/health` as a compatibility alias. This shared convention is used by:

- local runtime scripts
- GitHub Actions smoke jobs
- Helm health probes and operational checks

The `sql-bi-gateway-service` is gRPC-only on its primary Flight SQL port
(`50133`) and therefore exposes its HTTP `/healthz` probe (also aliased as
`/health`) plus the saved-queries / warehousing / tabular-analysis HTTP
CRUD on a companion port (`healthz_port`, default `50134`). The retired
`sql-bi-gateway-service` previously played the same gRPC-only role on
ports `50123`/`50124`; that surface is now folded into the gateway.
