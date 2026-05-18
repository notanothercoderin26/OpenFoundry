<div align="center">

# 🗺️ OpenFoundry Roadmap

### From zero to full Palantir Foundry parity — open source.

*Last updated: May 2026*

</div>

---

## Overview

OpenFoundry aims to deliver **25 core capabilities** that match Palantir Foundry — all open-source, self-hosted, and community-driven. This roadmap outlines our phased approach to get there.

### Status Legend

| Icon | Meaning |
|------|---------|
| ✅ | Done — feature shipped and usable |
| 🚧 | In Progress — actively being built |
| 📐 | Designed — architecture defined, implementation pending |
| 🔲 | Planned — scoped but not yet started |
| 💡 | Exploring — researching approaches |

### Priority Legend

| Tag | Meaning |
|-----|---------|
| 🔴 **Critical** | Core platform value — blocks adoption |
| 🟡 **High** | Key differentiator — needed for production use |
| 🟠 **Medium** | Important — completes the platform story |
| 🟢 **Low** | Nice to have — enhances ecosystem |

---

## 📊 Parity Tracker: 23/25 Foundry Components shipped

| # | Foundry Component | OpenFoundry Service(s) | Status | Target Phase |
|---|---|---|---|---|
| 1 | Ontology | `ontology-definition-service` · `ontology-query-service` · `object-database-service` · `ontology-indexer` | ✅ Done | Phase 1 |
| 2 | Transforms / Pipeline Builder | `pipeline-build-service` · `pipeline-runner` (+ libs `pipeline-expression`, `pipeline-plan`, `pipeline-runtime`) | ✅ Done | Phase 1 (ADR-0045 retired the Scala/Spark variant) |
| 3 | Data Connections | `connector-management-service` · `ingestion-replication-service` | ✅ Done | Phase 1 |
| 4 | Contour (Visual Analytics) | `sql-bi-gateway-service` (Flight SQL) + frontend `/contour`, `/queries` | ✅ Done | Phase 1 |
| 5 | Dataset Management & Versioning | `dataset-versioning-service` | ✅ Done | Phase 1 |
| 6 | Data Lineage | `lineage-service` | ✅ Done | Phase 1 |
| 7 | Notebooks / Code Workbooks | `notebook-runtime-service` (+ lib `python-sidecar`) | ✅ Done | Phase 1 |
| 8 | Quiver (Dashboards) | `apps/web` frontend (`/dashboards`, `/quiver`) | ✅ Done | Phase 2 |
| 9 | Object Explorer | `ontology-query-service` + `apps/web` `/object-explorer` | ✅ Done | Phase 1 |
| 10 | Auth / RBAC / SSO | `identity-federation-service` · `authorization-policy-service` (+ libs `auth-middleware`, `authz-cedar-go`) | 🚧 In Progress | Phase 2 |
| 11 | Workflows / Actions | `workflow-automation-service` (+ libs `saga`, `state-machine`, `event-scheduler`) · `ontology-actions-service` | ✅ Done | Phase 2 |
| 12 | Notifications | `notification-alerting-service` | ✅ Done | Phase 2 |
| 13 | Data Catalog | `iceberg-catalog-service` + `dataset-versioning-service` + frontend `/datasets`, `/iceberg-tables` | ✅ Done | Phase 2 |
| 14 | Data Quality | Declarative expectations inside `pipeline-build-service` via lib `pipeline-expression` | ✅ Done | Phase 2 |
| 15 | Slate/Workshop (App Builder) | `application-composition-service` + frontend `/apps`, `/workshop-editor` | ✅ Done | Phase 3 |
| 16 | ML / Model Management | `model-catalog-service` · `model-deployment-service` (+ lib `ml-kernel-go`) | ✅ Done | Phase 3 |
| 17 | AIP (GenAI / LLM / Copilot) | `agent-runtime-service` · `retrieval-context-service` · `llm-catalog-service` · `ai-evaluation-service` (+ lib `ai-kernel-go`) | ✅ Done | Phase 3 |
| 18 | Reports | Frontend `/reports` route (no dedicated service yet — report jobs land via `workflow-automation-service`) | 🚧 In Progress | Phase 4 |
| 19 | Fusion (Entity Resolution) | `entity-resolution-service` + frontend `/fusion` | ✅ Done | Phase 4 |
| 20 | Code Repositories (Git) | `code-repository-review-service` (global branching, code-security scanning, review plane) | ✅ Done | Phase 4 |
| 21 | Marketplace | `federation-product-exchange-service` + frontend `/marketplace` | ✅ Done | Phase 4 |
| 22 | Streaming (Real-time) | `ingestion-replication-service` + lib `event-bus-data` over Kafka (Strimzi) | ✅ Done | Phase 4 |
| 23 | Geospatial / Maps | `ontology-exploratory-analysis-service` + libs `geospatial-core`, `geospatial-tiles` + frontend `/geospatial`, `/maplibre-demo` | ✅ Done | Phase 4 |
| 24 | Audit & Compliance | `audit-compliance-service` + `audit-sink` (Kafka → Iceberg) (+ lib `audit-trail`) | ✅ Done | Phase 4 |
| 25 | Nexus (Cross-org Sharing) | `federation-product-exchange-service` (federation registry, product distribution) | ✅ Done | Phase 5 |

Current repo audit: 24 components are shipped on `main`. The two remaining gaps are (a) Enterprise auth — OIDC is implemented in `identity-federation-service`; SAML sign-in flow is still pending; and (b) Reports — the frontend is in place but a dedicated `report-service` binary has not been split out of the workflow plane yet.

---

## Phase 1 — Foundation 🏗️

> **Goal:** A working platform where you can connect data, explore it, build pipelines, and define an ontology.
>
> **Priority:** 🔴 Critical — nothing works without this.

### Milestone 1.1 — Platform Bootstrap

- [x] **Go module setup** — Single `go.mod` at the repo root, shared packages compile, `Makefile` as the canonical task runner (the `justfile` is a thin shim)
- [x] **Protobuf generation** — `buf` pipeline generating Go (via `buf generate`) into `libs/proto-gen/`, plus TypeScript, Python and Java SDKs in `sdks/`
- [x] **Shared libraries** — `core-models`, `auth-middleware`, `event-bus-control` (NATS), `event-bus-data` (Kafka), `storage-abstraction`, `observability`
- [x] **Edge gateway service** — `edge-gateway-service`: chi HTTP server, JWT validation, routing, rate-limiting, CORS
- [x] **Identity & auth service (basic)** — `identity-federation-service` with JWT issue/validate, local user registration, session management (OIDC, MFA, WebAuthn already wired)
- [x] **Docker Compose dev stack** — Postgres (CNPG), Kafka (Strimzi), NATS JetStream, Ceph S3 (Rook) running with `docker compose -f infra/compose/docker-compose.yml up -d`
- [x] **React 19 + Vite shell** — `apps/web` app layout, sidebar, top bar, routing, auth flow, design system (base UI components)
- [x] **CI pipeline** — GitHub Actions (`.github/workflows/openfoundry-go.yml`): lint (golangci-lint), vet, tidy drift, proto drift, sqlc drift, race-enabled test, integration (testcontainers)

### Milestone 1.2 — Data Layer

- [x] **Dataset service** — `dataset-versioning-service`: CRUD, Parquet/Iceberg read/write, schema management, branches, transactions, file APIs
- [x] **Data connectors (first wave)** — `connector-management-service`: PostgreSQL, MySQL, CSV, Parquet, JSON, S3, REST API (extensible via WASM connectors in `plugin-sdk` lib)
- [x] **Query service** — `sql-bi-gateway-service`: Apache Arrow Flight SQL server (port `50133`) over DataFusion, with per-statement routing to Iceberg, Vespa and Postgres (ADR-0014)
- [x] **Frontend: Dataset Explorer** — `/datasets` route: data preview table, schema viewer, upload flow
- [x] **Frontend: SQL Workbench** — `/queries`: Monaco SQL editor, query execution, results table

### Milestone 1.3 — Ontology & Pipelines

- [x] **Ontology services** — `ontology-definition-service` (object types, properties, link types, action types), `ontology-query-service` (read path), `object-database-service` (Cassandra/Scylla storage), `ontology-indexer` (Kafka → search backend)
- [x] **Pipeline services (basic)** — `pipeline-build-service` (authoring + build orchestration) and `pipeline-runner` (pure-Go runner that executes a `pipelineplan.Plan` against Iceberg; ADR-0045 retired the prior Scala/Spark variant)
- [x] **Data lineage** — `lineage-service`: OpenLineage events sink, lineage graph query API
- [x] **Frontend: Ontology Explorer** — `/ontologies`, `/ontology-design`, `/object-explorer`: type editor, graph view (Cytoscape.js)
- [x] **Frontend: Pipeline Builder** — `/pipelines` DAG canvas (React Flow), node palette, transform editor
- [x] **Frontend: Lineage View** — `/lineage` interactive lineage graph

### Milestone 1.4 — Notebooks

- [x] **Notebook service** — `notebook-runtime-service`: notebook CRUD, cell model, session management, kernel execution, export
- [x] **Python kernel** — Subprocess-based Python execution via lib `python-sidecar` (gRPC interface), variable state, output capture
- [x] **SQL kernel** — Route SQL cells to `sql-bi-gateway-service` (Flight SQL)
- [x] **Frontend: Notebook Editor** — `/notebooks`: cell editor (Monaco), cell outputs, kernel selector/status

**Phase 1 exit criteria:**
> A user can connect a Postgres database, explore tables, write SQL queries, build a simple pipeline with SQL transforms, define ontology object types backed by datasets, and run Python notebooks.

---

## Phase 2 — Core Platform 🧱

> **Goal:** Production-grade auth, dashboards, workflows, data quality, and catalog. The platform becomes usable for real teams.
>
> **Priority:** 🔴 Critical + 🟠 Medium features that complete the core loop.

### Milestone 2.1 — Enterprise Auth

- [x] **RBAC** — Roles, permissions, row-level security
- [x] **ABAC** — Attribute-based policies
- [ ] **SSO** — OAuth2/OIDC provider integration, SAML (OIDC implemented; SAML sign-in flow pending)
- [x] **MFA** — TOTP-based multi-factor authentication
- [x] **API keys** — Programmatic access management
- [x] **Frontend: User/Role management** — Settings pages for users, roles, groups

### Milestone 2.2 — Dashboards (Quiver)

- [x] **Dashboard grid layout** — Responsive drag-and-drop grid
- [x] **Chart widget** — ECharts integration: bar, line, area, pie, scatter, etc.
- [x] **Table widget** — Paginated, sortable, filterable data tables
- [x] **KPI widget** — Single metric cards with sparklines
- [x] **Filter bar** — Global filters propagated to all widgets
- [x] **Date range filter** — Relative and absolute date selection
- [x] **Dashboard CRUD** — Create, edit, duplicate, share dashboards

### Milestone 2.3 — Data Catalog & Quality

- [x] **Data catalog** — Search by name/tag/owner, dataset tagging, ownership assignment
- [x] **Auto-profiling** — Column statistics, distributions, null rates, uniqueness
- [x] **Quality rules** — Null checks, range validation, regex, custom SQL rules
- [x] **Quality scoring** — Per-dataset quality score, trend tracking
- [x] **Quality alerts** — Notifications on quality degradation
- [x] **Frontend: Catalog search** — Full-text search in dataset explorer
- [x] **Frontend: Quality dashboard** — Quality scores, profiling report, rule management

### Milestone 2.4 — Workflows & Notifications

- [x] **Workflow service** — `workflow-automation-service`: workflow definitions, step execution, conditional branching (libs `saga`, `state-machine`)
- [x] **Triggers** — Cron (lib `scheduling-cron` + `event-scheduler`), event-driven, manual, webhook triggers
- [x] **Human-in-the-loop** — Native `approval` step inside `workflow-automation-service`, approval inbox in `apps/web`
- [x] **Notification service** — `notification-alerting-service`: email (SMTP/SES), Slack, MS Teams webhooks
- [x] **In-app notifications** — WebSocket-based real-time notifications via `notification-alerting-service`
- [x] **User preferences** — Per-user channel and frequency preferences
- [x] **Frontend: Workflow builder** — `/workflows`, `/automate`: visual workflow canvas, step config, trigger config
- [x] **Frontend: Notification bell** — In-app notification center

### Milestone 2.5 — Pipeline Enhancements

- [x] **Python transforms** — Subprocess-based Python transform execution via lib `python-sidecar`
- [x] **WASM sandbox** — Sandboxed WASM transforms for user-submitted code via lib `plugin-sdk`
- [x] **Column-level lineage** — Track lineage at the column level through transforms via `lineage-service`
- [x] **Pipeline scheduling** — Cron-based pipeline scheduling via libs `scheduling-cron` + `event-scheduler`
- [x] **Retry & failure handling** — Configurable retry policies, partial re-execution (lib `saga`)
- [x] **Dataset branching** — Git-like branches for datasets in `dataset-versioning-service`, branch selector in UI
- [x] **D1.1.4 Branching parity (5/5)** — full Foundry branching surface
      ([ADR-0033](docs/architecture/adr/ADR-0033-branching-foundry-parity.md)):
      P1 unified Branch model · P2 JobSpec + build-branch resolver ·
      P3 BranchGraph / OpenTransactionBanner / JobSpec icon coloring ·
      P4 retention worker + markings inheritance + global-branching plane (consolidated into `code-repository-review-service` + `dataset-versioning-service`) ·
      P5 BranchCompare + lifecycle timeline + full E2E suite
- [x] **D1.1.5 Builds parity (5/5)** — full Foundry builds lifecycle
      ([ADR-0036](docs/architecture/adr/ADR-0036-builds-foundry-parity.md)):
      P1 BuildState/JobState lifecycle + resolver (cycles + locks + queue) ·
      P2 parallel JoinSet executor + multi-output atomicity + abort_policy
      cascade + staleness/force_build · P3 five logic kinds (Sync /
      Transform / HealthCheck / Analytical / Export) + InputSpec view filters
      (AT_TIMESTAMP / AT_TRANSACTION / RANGE / INCREMENTAL_SINCE_LAST_BUILD) ·
      P4 dual `LogSink` (Postgres + broadcast) + SSE/WS endpoints with the
      doc-compliant 10s heartbeat delay + LiveLogViewer · P5 dedicated
      `/builds` application (list + detail with Job graph, Live logs,
      Inputs, Outputs, Audit tabs), outbox `foundry.build.events.v1`,
      Prometheus metrics, full E2E suite
- [x] **D1.1.1 Datasets parity (5/5)** — full Foundry datasets surface
      ([ADR-0034](docs/architecture/adr/ADR-0034-datasets-foundry-parity.md)):
      P1 schema-per-view · P2 file-format readers + view preview ·
      P3 backing filesystem (`logical_path → physical_path`) + Files tab ·
      P4 retention preview + applicable policies · P5 Compare + Open in… ·
      P6 dataset quality (expectations evaluated by `pipeline-build-service` via lib `pipeline-expression`), QualityDashboard,
      Application-reference conformance (cursor pagination + ETag/304 +
      207 batch + unified error envelope) and full E2E journey
- [x] **D1.1.3 Media sets parity (5/5)** — full Foundry media-sets surface
      ([ADR-0039](docs/architecture/adr/ADR-0039-media-sets-architecture.md)):
      H3 Cedar + markings + audit envelope + cost-meter + 70% coverage gate ·
      H4 Foundry-style branches with `parent_branch_rid`/`head_transaction_rid`,
      write modes (modify default / replace transactional-only), 10k cap +
      merge resolution · H5 `media-transform-runtime-service` + access
      patterns (RECOMPUTE/PERSIST/CACHE_TTL via moka) + cost meter +
      Usage UI tab (ECharts) · H6 `MediaReference` as first-class
      ontology property · H7 DICOM (7th schema, `render_dicom_image_layer`
      75 cs/GB) + Vertex/Map raster source (`geospatial-tiles` lib +
      `RasterMediaLayer.tsx`) + SDS scanner (`media-scanner` lib +
      `PiiTag` taxonomy) + Marketplace export
      (`MarketplaceArtifact::MediaSet`) + Python incremental transforms
      (`openfoundry_transforms` SDK with snapshot-on-commit) + empty
      media set checkpoint round-trip

**Phase 2 exit criteria:**
> Teams can collaborate with proper auth/RBAC, build dashboards over their data, set up data quality monitoring, automate workflows with approvals, and receive notifications.

---

## Phase 3 — Intelligence 🧠

> **Goal:** ML, AI, and app building capabilities. This is where OpenFoundry becomes a true decision-making platform.
>
> **Priority:** 🔴 Critical — these are the features that make Foundry *Foundry*.

### Milestone 3.1 — App Builder (Slate/Workshop)

- [x] **App composition service** — `application-composition-service`: app definitions, page layouts, widget catalog, publish runtime
- [x] **Widget system** — Table, form, chart, map, text, image, button, container
- [x] **Data binding** — Bind widgets to ontology objects, datasets, or queries
- [x] **Event handlers** — onClick → execute action, navigate, filter, etc.
- [x] **App theming** — Colors, fonts, branding customization
- [x] **Publish & deploy** — Version and publish apps, embedding support (iframe)
- [x] **App templates** — Starter templates for common use cases
- [x] **Frontend: WYSIWYG editor** — `/apps`, `/workshop-editor`: drag-and-drop canvas, property inspector, live preview
- [x] **Frontend: App runtime** — Render published apps for end users

### Milestone 3.2 — ML Studio

- [x] **Experiment tracking** — Logged through `model-catalog-service` (runs with params, metrics, and artifacts)
- [x] **Model registry** — `model-catalog-service`: register models, manage versions (staging → production)
- [x] **Feature store** — Feature definitions, online serving, offline batch computation (lib `ml-kernel-go`)
- [x] **Training orchestration** — Submit training jobs, hyperparameter tuning
- [x] **Model serving** — `model-deployment-service`: real-time inference endpoints, batch predictions
- [x] **A/B testing** — Traffic splitting between model versions
- [x] **Drift monitoring** — Data and concept drift detection (lib `ml-kernel-go`), auto-retraining triggers via `workflow-automation-service`
- [x] **Frontend: ML Studio** — `/ml` route: experiment list, run comparison, model registry, deployment panel

### Milestone 3.3 — AI Platform (AIP)

- [x] **LLM gateway** — Multi-provider routing (OpenAI, Anthropic, Ollama/local) via `llm-catalog-service` + lib `ai-kernel-go`, load balancing, fallback
- [x] **Prompt management** — Versioned prompt templates, variable interpolation
- [x] **RAG pipeline** — `retrieval-context-service`: document chunking, embedding generation, semantic retrieval + reranking
- [x] **Knowledge bases** — Index datasets and ontology into vector store (lib `vector-store` — backend-agnostic; production uses Vespa Apache-2.0; pgvector still supported via the abstraction)
- [x] **AI agents** — `agent-runtime-service`: Plan → Act → Observe loop, tool calling, task decomposition (OpenAI-compatible chat endpoint, MCP tools registered inside the runtime)
- [x] **Platform copilot** — Natural language → SQL, pipeline suggestions, ontology help (via `agent-runtime-service`)
- [x] **Guardrails** — Output validation, PII detection (lib `media-scanner`), toxicity filtering, eval surface in `ai-evaluation-service`
- [x] **Semantic caching** — Cache LLM responses by semantic similarity
- [x] **Frontend: Copilot panel** — Floating drawer, conversational UI (route `/ai`)
- [x] **Frontend: Agent builder** — `/automate`: visual agent configuration, tool registry
- [x] **Frontend: Knowledge manager** — Upload docs, manage knowledge bases

**Phase 3 exit criteria:**
> Users can build operational apps without code, train and deploy ML models, use AI agents and a platform copilot to accelerate their work, and build RAG pipelines over their data.

---

## Phase 4 — Platform Completeness 🔒

> **Goal:** Every remaining Foundry capability. Entity resolution, streaming, geospatial, code repos, marketplace, reports, and audit.
>
> **Priority:** 🟡 High — completes the platform for enterprise adoption.

### Milestone 4.1 — Entity Resolution (Fusion)

- [x] **Match rules** — `entity-resolution-service`: deterministic rules (exact, fuzzy, phonetic)
- [x] **ML-based matching** — Gradient boosted classifier for probabilistic matching
- [x] **Blocking strategies** — LSH, sorted neighborhood, key-based blocking
- [x] **String comparators** — Jaro-Winkler, Levenshtein, Soundex, metaphone
- [x] **Graph resolution** — Transitive closure for entity clusters
- [x] **Golden record** — Survivorship rules, merge strategies
- [x] **Human-in-the-loop** — Review queue for uncertain matches
- [x] **Frontend: Match rule builder, cluster viewer, manual review** (`/fusion`)

### Milestone 4.2 — Real-time Streaming

- [x] **Stream definitions** — Named streams with schemas, served by `ingestion-replication-service` over Kafka (Strimzi)
- [x] **Processing topology** — DAG-based stream processing
- [x] **Windowing** — Tumbling, sliding, and session windows (Flink jobs under `infra/helm/infra/flink-jobs`)
- [x] **Stream joins** — Stream-stream and stream-table joins
- [x] **Complex event processing** — Pattern matching on event sequences
- [x] **State backend** — RocksDB-based state store (Flink-managed)
- [x] **Connectors** — Kafka source, NATS source, HTTP webhook source, WebSocket sink, dataset sink (lib `event-bus-data` for Kafka, `event-bus-control` for NATS)
- [x] **Backpressure** — Flow control to prevent overload
- [x] **Frontend: Topology editor, stream monitor, live data tail** (`/streaming`)

### Milestone 4.3 — Reports & Geospatial

- [ ] **Report service** — Currently no dedicated binary; report jobs run as `workflow-automation-service` steps and surface in the `/reports` frontend route (a dedicated `report-service` is planned for Phase 4 completion)
- [ ] **Generators** — PDF / Excel / CSV / HTML / PPTX generators pending; today only basic CSV/Parquet exports via pipelines
- [x] **Distribution** — Email, S3, Slack, webhook delivery via `notification-alerting-service`
- [x] **Geospatial capability** — `ontology-exploratory-analysis-service` (geospatial queries): within, intersects, nearest, buffer
- [x] **Vector tiles** — MVT tile server, H3 hex aggregation (lib `geospatial-tiles`)
- [x] **Geocoding** — Address ↔ coordinates
- [x] **Spatial clustering** — DBSCAN, K-means
- [x] **Routing** — Shortest path, isochrones
- [x] **Frontend: MapLibre GL map, layer panel, heatmap, clustering, routing** (`/geospatial`, `/maplibre-demo`)

### Milestone 4.4 — Code Repos & Marketplace

- [x] **Code repo service** — `code-repository-review-service`: Git object storage, branches, commits, code-security scanning plane
- [x] **Merge requests** — Code review workflow, inline comments, approvals
- [x] **CI integration** — Trigger pipeline builds on push
- [x] **Code search** — Full-text code search via lib `search-abstraction` (Vespa-backed)
- [x] **Marketplace service** — `federation-product-exchange-service`: package registry, versioning, dependency resolution, federation registry
- [x] **Package types** — Connectors, transforms, widgets, app templates, ML models, AI agents
- [x] **Discovery** — Search, categories, ratings & reviews
- [x] **One-click install** — Install packages into workspace
- [x] **Frontend: File browser, diff viewer, MR workflow** (`/code-repos`)
- [x] **Frontend: Marketplace browser, publish wizard** (`/marketplace`)

### Milestone 4.5 — Audit & Compliance

- [x] **Audit service** — `audit-compliance-service` + `audit-sink` (Kafka → Iceberg): immutable append-only audit log
- [x] **Event collection** — Auto-capture from all services via Kafka (lib `audit-trail`)
- [x] **GDPR support** — Right to erasure, data portability (lineage deletion lives in `audit-compliance-service`)
- [x] **Compliance reports** — SOC2, ISO 27001, HIPAA export formats
- [x] **Anomaly detection** — Alert on unusual access patterns
- [x] **Data classification** — PII, confidential, public labels (lib `media-scanner` for SDS)
- [x] **Retention policies** — Configurable TTL for audit events (handled inside `audit-compliance-service`)
- [x] **Frontend: Audit log viewer, compliance dashboard, policy manager** (`/audit`)

**Phase 4 exit criteria:**
> The platform has full feature parity with Palantir Foundry for 23 of 25 components, suitable for enterprise production use. Outstanding: dedicated `report-service` binary + SAML sign-in flow.

---

## Phase 5 — Ecosystem 🌐

> **Goal:** Cross-organization data sharing, plugin SDK, and community ecosystem.
>
> **Priority:** 🟠 Medium — the network-effect layer.

### Milestone 5.1 — Nexus (Cross-org Data Sharing)

- [x] **Peer management** — `federation-product-exchange-service`: register and authenticate partner organizations
- [x] **Data sharing contracts** — Define what's shared, with whom, under what terms
- [x] **Federated queries** — Query shared data without copying it (via Flight SQL surface of `sql-bi-gateway-service`)
- [x] **Selective replication** — Replicate subsets of data to consumer orgs
- [x] **E2E encryption** — Encrypted data in transit and at rest for shared datasets
- [x] **Cross-org audit trail** — Audit bridge between organizations (`audit-compliance-service`)
- [x] **Schema compatibility** — Validate schema compatibility across orgs
- [x] **Frontend: Peer list, share wizard, contract manager, shared data browser** (`/marketplace`, `/federation`)

### Milestone 5.2 — Developer Ecosystem

- [x] **Plugin SDK** — Go + WASM SDK in lib `plugin-sdk` for building custom connectors, transforms, widgets
- [x] **CLI tool** — `of-cli` under `tools/of-cli` for project management, deployment, and scripting (compiled with `go build ./tools/of-cli`)
- [x] **REST API docs** — Full OpenAPI spec auto-generated from proto (drift gated by `proto-check.yml`)
- [x] **Developer portal** — Interactive API explorer, tutorials, cookbooks under `/developers`
- [x] **Terraform provider** — Manage OpenFoundry resources as IaC
- [x] **GitHub/GitLab integration** — External Git sync, CI/CD triggers via `code-repository-review-service`
- [x] **Frontend: Developers portal with API explorer, SDK toolkit, Terraform panel, and repository integration manager** (`/developers`)

### Milestone 5.3 — Performance & Scale

- [x] **Distributed query execution** — Multi-node DataFusion queries served by `sql-bi-gateway-service`
- [x] **Distributed pipeline execution** — Plan-driven transform execution via `pipeline-runner` Jobs dispatched by `pipeline-build-service`. Multi-pod sharding is a v2 follow-up; v1 covers single-pod execution at the PoC online-retail scale (ADR-0045 § Consequences). The Spark Operator + `pipeline-runner-spark` path that previously sat here was removed in Phase D.
- [x] **Auto-scaling** — HPA/KEDA-based scaling per service
- [x] **Multi-tenancy** — Logical tenant isolation, resource quotas (`tenancy-organizations-service`)
- [x] **Global CDN** — Tile server (lib `geospatial-tiles`) and static asset caching at the edge
- [x] **Benchmark suite** — Reproducible benchmarks for all critical paths under `benchmarks/`

**Phase 5 exit criteria:**
> Organizations can share data securely across boundaries, third-party developers can extend the platform, and the system scales to enterprise workloads.

---

## 📅 Indicative Timeline

> ⚠️ These are **estimates**, not commitments. Open source moves at the speed of contributors.

```
2026 Q2-Q3    Phase 1 — Foundation
              ████████████████████████████░░░░░░░░░░░░░░░░░░░

2026 Q3-Q4    Phase 2 — Core Platform
              ░░░░░░░░░░░░████████████████████████░░░░░░░░░░░

2027 Q1-Q2    Phase 3 — Intelligence (ML, AI, App Builder)
              ░░░░░░░░░░░░░░░░░░░░░░░░████████████████░░░░░░

2027 Q2-Q3    Phase 4 — Platform Completeness
              ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████████░░

2027 Q3+      Phase 5 — Ecosystem
              ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████
```

---

## 🎯 How We Prioritize

1. **User value first** — Does this unlock a workflow that wasn't possible before?
2. **Foundation before features** — Auth, data layer, and ontology must be solid before ML/AI.
3. **Horizontal before vertical** — Basic versions of many features > perfect version of one.
4. **Community signal** — GitHub issues with 👍 reactions influence priority.
5. **Contributor interest** — If someone wants to build it, we help them ship it.

---

## 🤝 Help Us Get There Faster

Every contribution accelerates the roadmap. Here's where help is most needed:

| Phase | Area | What's Needed |
|---|---|---|
| **Phase 1** | Data connectors | Implement new sources via the connector contracts in `connector-management-service` and the `plugin-sdk` WASM SDK |
| **Phase 1** | Frontend | React 19 + Vite pages under `apps/web/src/routes`, Tailwind components |
| **Phase 2** | Dashboard widgets | New chart types, custom widgets |
| **Phase 2** | Quality rules | Custom data quality rule implementations (extend lib `pipeline-expression`) |
| **Phase 3** | LLM providers | Adapters for Gemini, Mistral, Cohere, etc. (register in `llm-catalog-service` via lib `ai-kernel-go`) |
| **Phase 4** | Geospatial | Extend `ontology-exploratory-analysis-service`, contribute algorithms to libs `geospatial-core` / `geospatial-tiles` |
| **Phase 4** | Report generators | PDF, Excel, PPTX template engines — needed to ship the dedicated `report-service` binary |
| **Phase 2** | Enterprise SSO | Wire SAML sign-in flow in `identity-federation-service`, provider validation, and end-to-end login testing |

**Want to contribute?** Check the [issues labeled `help wanted`](https://github.com/open-foundry/open-foundry/labels/help%20wanted) or comment on this roadmap's [tracking issue](#).

---

## 🛡️ Data plane hardening (2026 Q2-Q3)

Sixteen verifiable milestones that consolidate OpenFoundry's data plane
around the five target planes documented in
[`docs/architecture/runtime-topology.md`](./docs/architecture/runtime-topology.md)
(storage, ingestion, compute, control, relational state). Each item is a
concrete, already-merged change in the monorepo, anchored to one of the
ADRs 0008–0012 in [`docs/architecture/adr/`](./docs/architecture/adr/).

- [x] **1. ADR-0008 — Single Iceberg REST Catalog (Lakekeeper).** Decision
  to standardise the lakehouse on Lakekeeper as the only Iceberg REST
  catalog; tightens `infra/storage-abstraction/README.md`. See
  [`docs/architecture/adr/ADR-0008-iceberg-rest-catalog-lakekeeper.md`](./docs/architecture/adr/ADR-0008-iceberg-rest-catalog-lakekeeper.md).
- [x] **2. ADR-0009 — Internal query fabric: DataFusion + Flight SQL.**
  Service-to-service SQL travels exclusively over Flight SQL P2P;
  Trino is repositioned as edge BI only. See
  [`docs/architecture/adr/ADR-0009-internal-query-fabric-datafusion-flightsql.md`](./docs/architecture/adr/ADR-0009-internal-query-fabric-datafusion-flightsql.md).
- [x] **3. ADR-0010 — CloudNativePG as the single Postgres operator.**
  All service-owned Postgres instances move to CNPG; HA with synchronous
  replicas and barman-cloud PITR. See
  [`docs/architecture/adr/ADR-0010-cnpg-postgres-operator.md`](./docs/architecture/adr/ADR-0010-cnpg-postgres-operator.md).
- [x] **4. ADR-0011 — Control vs Data bus contract enforcement.** NATS
  JetStream for control, Kafka for data; `tools/bus-lint/check_bus.py`
  enforces the contract in CI. See
  [`docs/architecture/adr/ADR-0011-control-vs-data-bus-contract.md`](./docs/architecture/adr/ADR-0011-control-vs-data-bus-contract.md).
- [x] **5. ADR-0012 — Data-plane SLOs, SLIs and error budgets.** Latency
  budgets per layer (Flight SQL, Iceberg scans, Kafka acks, Vespa, NATS)
  with Prometheus SLIs and freeze policy. See
  [`docs/architecture/adr/ADR-0012-data-plane-slos.md`](./docs/architecture/adr/ADR-0012-data-plane-slos.md).
- [x] **6. CloudNativePG operator + cluster templates.** Operator install
  and nil-safe cluster template under `infra/k8s/platform/manifests/cnpg/` for service-owned
  Postgres provisioning aligned with ADR-0010.
- [x] **7. Lakekeeper Iceberg REST Catalog deployment.** Kubernetes
  manifests under `infra/k8s/platform/manifests/lakekeeper/` materialising the ADR-0008
  decision; `libs/storage-abstraction/` README tightened accordingly.
- [x] **8. Rook Ceph: rbd-fast pool + RGW EC 4+2 object store.** Storage
  plane upgrade in `infra/k8s/platform/manifests/rook/` providing fast block storage and
  erasure-coded S3 object storage for the lakehouse.
- [x] **9. Strimzi Kafka rack/zone awareness +
  `RackAwareReplicaSelector`.** Multi-AZ resilience for the Kafka data
  plane in `infra/k8s/platform/manifests/strimzi/`.
- [x] **10. Retired time-series OLAP tier.** The former dedicated
  time-series storage tier has been removed; current analytics flow
  through Iceberg / Trino and service-owned Postgres where appropriate.
- [x] **11. Flink scheduled Iceberg maintenance jobs.** Rewrite, expire
  snapshots and orphan-file cleanup with HA + RGW checkpoints and
  documented 7-day / 90-day retention under `infra/k8s/platform/manifests/flink/`.
- [x] **12. Bus-lint: control vs data bus contract.** Static check in
  `tools/bus-lint/check_bus.py` wired into CI to block cross-bus
  regressions implementing ADR-0011.
- [x] **13. Bus-usage audit (current/target allowlist).** Audit document
  [`docs/architecture/bus-audit.md`](./docs/architecture/bus-audit.md)
  splits real `event-bus-data` usage into a current and target allowlist.
- [x] **14. Trino edge BI removed — superseded by item 17.** ~Trino~
  was originally repositioned as edge-BI-only; under
  [`ADR-0014`](./docs/architecture/adr/ADR-0014-retire-trino-flight-sql-only.md)
  the Trino deployment has been **removed entirely** in favour of a
  real Apache Arrow Flight SQL server inside `sql-bi-gateway-service`.
  See item 17 below.
- [x] **15. ADR-0007 consolidation — Vespa Lite for DX.** Production and
  DX search both run on Vespa (Vespa Lite single-node for DX);
  Meilisearch is **already demoted** — it is no longer part of the
  default DX stack in `infra/docker-compose.yml` /
  `infra/docker-compose.dev.yml`, and is gated behind the optional
  `--profile demo` as a first-run demo only. See
  [`docs/architecture/adr/ADR-0007-search-engine-choice.md`](./docs/architecture/adr/ADR-0007-search-engine-choice.md).
- [x] **16. Chaos suite for data-plane no-SPOF properties.** Smoke/chaos
  scenarios under `smoke/` exercising broker failover, Postgres failover
  and Iceberg catalog availability to assert the no-single-point-of-
  failure properties of the hardened data plane.
- [x] **17. ADR-0014 — Retire Trino, single Flight SQL edge gateway.**
  `sql-bi-gateway-service` is rewritten as a real Apache Arrow Flight
  SQL server (port `50133`) backed by DataFusion, with per-statement
  routing to `sql-warehousing-service` (Iceberg), Trino, Vespa and
  Postgres. Auth, tenant quotas, audit and saved queries are applied
  uniformly on the Flight SQL surface. The previous Trino edge deployment
  under `infra/k8s/platform/manifests/trino/` was deleted. Tableau /
  Superset connect with the Apache Arrow Flight SQL JDBC driver. See
  [`docs/architecture/adr/ADR-0014-retire-trino-flight-sql-only.md`](./docs/architecture/adr/ADR-0014-retire-trino-flight-sql-only.md).

---

<div align="center">

*This roadmap is a living document. It evolves with community feedback and contributions.*

**[Discuss the roadmap →](https://github.com/open-foundry/open-foundry/discussions)**

</div>
