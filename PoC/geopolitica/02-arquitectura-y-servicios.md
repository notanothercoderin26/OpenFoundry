# 02 — Architecture and services for the demo

> Snapshot note: this PoC document is intentionally a demo-scope snapshot, not the canonical repository inventory. The current code-first inventory is **50 service directories** under `services/`; use [`docs/reference/repository-layout.md`](../../docs/reference/repository-layout.md) for the authoritative service/library list. Spinning up all services for a demo is unmanageable. This document defines the **minimum viable subset for the geopolitical PoC (~16 services)** and explicitly leaves the rest off but "listed as available".

The customer-facing narrative uses Foundry concepts (Data Connection, Dataset, Pipeline, Ontology, Workshop, AIP Chatbot, Action Type, Marking, Global Branch) — see [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md). The table below maps each Foundry concept to the OpenFoundry service(s) that must be running.

---

## 🧱 Minimum viable subset (~16 services)

| # | Foundry concept | OpenFoundry service(s) | Why it is in for this PoC |
|---|---|---|---|
| 1 | **Data Connection** | `connector-management-service`, `ingestion-replication-service` | We have 6 source connections (GDELT events, GDELT GKG, ACLED, OFAC SDN, EU Consolidated, OpenSanctions, Wikidata) — at least one is streaming (GDELT 15-min drop). |
| 2 | **Datasets + transactions** | `dataset-versioning-service` | All raw, staging, curated layers need transactional writes + branch awareness. |
| 3 | **Pipeline Builder / Code Repositories** | `pipeline-build-service`, `pipeline-runner-spark`, `pipeline-expression` (lib) | Bronze→silver→gold transforms; the **entity-resolution transform** is the single most important pipeline. |
| 4 | **Data Health** | `pipeline-expression` health surfaces, `telemetry-governance-service` | Freshness, uniqueness, ER precision/recall checks. |
| 5 | **Iceberg catalog** | `iceberg-catalog-service` | Backing store for Datasets; user-facing surface is the Dataset, not Iceberg. |
| 6 | **Data Lineage** | `lineage-service` | Click from `Actor.is_sanctioned` back to OFAC + EU + OpenSanctions rows. |
| 7 | **Ontology Manager** | `ontology-definition-service`, `object-database-service` | Object types, link types, properties, action types. |
| 8 | **Object Explorer / graph queries** | `ontology-query-service`, `ontology-indexer` | N-hop link expansion; powers Workshop graph widget and AIP Object query tool. |
| 9 | **Action Types + Action Log** | `ontology-actions-service`, `audit-compliance-service` | `add-to-watchlist`, `flag-actor`, `open-investigation-case`, etc., with full audit. |
| 10 | **Workshop** | `application-composition-service` + `apps/web` | The analyst module (map + timeline + graph + object table + AIP chat). |
| 11 | **AIP Chatbot** | `agent-runtime-service`, `retrieval-context-service`, `llm-catalog-service` | Brief drafting, Object query tools, Action tools, retrieval over `NewsArticle` content. |
| 12 | **Workflow / approvals** | `workflow-automation-service` | Watchlist → alert → investigation-case workflow with SLA + notification side effect. |
| 13 | **Notifications / webhooks** | `notification-alerting-service` | Email / chat / webhook for the alert → case flow. |
| 14 | **Identity** | `identity-federation-service` | Keycloak-backed Sofía and Marcos with different roles + markings. |
| 15 | **Authorization (markings + RBAC + ABAC)** | `authorization-policy-service` | The headline differentiator — markings enforced in datasets, ontology, Workshop, AIP. |
| 16 | **Observability** | `observability` lib + `telemetry-governance-service` | KPI panel at the end of the demo. |

> Everything not in this table is **off** for the demo. It can be referenced as "available in OpenFoundry" but it does not run.

---

## 🚫 Services explicitly **off** for the demo

| Service / area | Why off for this PoC |
|---|---|
| Anything ML-training-specific (model registry, training orchestrator) beyond `llm-catalog-service` | We use the LLM as a service; no training in scope. |
| Marketplace / publishing services | Out of scope — the PoC is internal. |
| Multi-tenancy isolation services beyond what `identity-federation-service` provides | Single `acme-intel` tenant. |
| Code Repositories Git server | We use the platform's external repo connection if needed; not demoed end-to-end. |
| Streaming services beyond `ingestion-replication-service` Kafka path | Single Kafka topic per source; no fan-out workloads to demo. |
| Notebook services | Replaced by the AIP Chatbot for ad-hoc questions in this demo. |

---

## 🧭 Topology diagram (textual)

```
┌──────────────────────────── Data Connection layer ────────────────────────────┐
│  GDELT events (s3 + 15-min stream) ──┐                                         │
│  GDELT GKG mentions  ────────────────┤                                         │
│  ACLED (CSV / API)   ────────────────┼──▶  ingestion-replication-service ─────┐
│  OFAC SDN (XML)      ────────────────┤        │                                │
│  EU Consolidated     ────────────────┤        ▼                                │
│  OpenSanctions       ────────────────┤    Kafka / Redpanda                     │
│  Wikidata SPARQL     ────────────────┘        │                                │
│                                                ▼                               │
│                              dataset-versioning-service  ◀── iceberg-catalog ─┘
│                              (raw → staging → curated → ontology)
└────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌────────────────────────────── Pipeline layer ─────────────────────────────────┐
│ pipeline-build-service ── DAG editor / Code Repositories transforms            │
│   ├── gdelt-event-decoder                                                      │
│   ├── cameo-enrichment                                                         │
│   ├── geocoder (events → Location)                                             │
│   ├── sanctions-aggregator (OFAC + EU + OpenSanctions → SanctionsEntry)        │
│   ├── entity-resolution (Actor)        ◀── precision/recall Data Health        │
│   └── gold-projector (→ ontology-backed datasets)                              │
│ pipeline-runner-spark — executes the above on Iceberg datasets                 │
│ lineage-service — propagates lineage to ontology-definition-service            │
└────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────── Ontology + actions layer ──────────────────────────┐
│ ontology-definition-service  — object types, link types, action types         │
│ object-database-service      — materialized objects + edits                   │
│ ontology-query-service       — pivots, N-hop expansion, marking filters       │
│ ontology-indexer             — search indices behind Object Explorer          │
│ ontology-actions-service     — add-to-watchlist, flag-actor, open-case, …     │
│ audit-compliance-service     — Action Log object type + queryable history     │
└────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌────────────────────────── App layer (Workshop / AIP) ─────────────────────────┐
│ application-composition-service + apps/web                                    │
│   Workshop module "Geopolitical Intel Workbench"                              │
│     ├── Map widget                                                            │
│     ├── Timeline widget                                                       │
│     ├── Object Table widget                                                   │
│     ├── Graph widget (N-hop link analysis)                                    │
│     ├── Filter + Button Group widgets                                         │
│     └── AIP Chatbot widget                                                    │
│ agent-runtime-service + retrieval-context-service + llm-catalog-service       │
└────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────── Workflow / governance / observability ─────────────────────┐
│ workflow-automation-service  — Watchlist → Alert → Case (SLA + side effects)  │
│ notification-alerting-service — email / chat / webhook side effects            │
│ identity-federation-service   — Keycloak (Sofía, Marcos, roles, markings)     │
│ authorization-policy-service  — Foundry-style permissions + markings + ABAC   │
│ telemetry-governance-service + observability lib — KPI panel                  │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔌 Foundry-concept ↔ OpenFoundry endpoint map (for engineers)

| Foundry concept the customer sees | OpenFoundry internal endpoint(s) | Notes |
|---|---|---|
| Create Data Connection sync | `POST /api/connectors/v1/connections` (`connector-management-service`) | Customer never sees this URL; UI calls it. |
| Browse Datasets / transactions | `GET /api/datasets/v1/datasets/{id}` (`dataset-versioning-service`) | Foundry labels: dataset, transaction, branch, build. |
| Edit Pipeline graph | `PUT /api/pipelines/v1/graphs/{id}` (`pipeline-build-service`) | DAG with nodes = transforms, edges = dataset deps. |
| Inspect Data Health | `GET /api/health/v1/checks?dataset=...` (`telemetry-governance-service`) | Foundry labels: data health, freshness, schema check. |
| Define ontology object/link/action type | `POST /api/ontology/v1/definitions` (`ontology-definition-service`) | YAML/JSON declarative input. |
| Query ontology / N-hop | `POST /api/ontology/v1/query` (`ontology-query-service`) | Markings applied server-side. |
| Submit an Action | `POST /api/actions/v1/actions/{id}/submit` (`ontology-actions-service`) | Returns an action-log object id. |
| List Action Log | `GET /api/audit/v1/actions` (`audit-compliance-service`) | Same shape as Foundry's Action Log views. |
| Configure Workshop module | `PUT /api/apps/v1/workshop/{id}` (`application-composition-service`) | Module = JSON config of widgets + variables. |
| Talk to AIP Chatbot | `POST /api/aip/v1/chat` (`agent-runtime-service`) | Tools resolved via `retrieval-context-service` + `llm-catalog-service`. |
| Create Global Branch | `POST /api/branches/v1/branches` (`dataset-versioning-service`) | Branch spans datasets + transforms + ontology + Workshop. |
| Apply a Marking | `PUT /api/policies/v1/markings/{id}/assignments` (`authorization-policy-service`) | Marking is the headline differentiator — see [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md). |

> The OpenFoundry endpoints above are **implementation details**. The demo script must use the Foundry vocabulary in column 1.

---

## ⚙️ Resource sizing per service (PoC laptop / single-node target)

| Service | CPU req | RAM req | Notes |
|---|---|---|---|
| `connector-management-service` | 0.5 | 512 Mi | Stateless. |
| `ingestion-replication-service` | 1 | 1 Gi | Buffers GDELT 15-min drop. |
| `dataset-versioning-service` | 1 | 1 Gi | Tx metadata in Postgres. |
| `iceberg-catalog-service` | 1 | 1 Gi | Catalog only; data on S3/MinIO. |
| `pipeline-build-service` | 0.5 | 512 Mi | DAG editor / scheduling. |
| `pipeline-runner-spark` | 2–4 | 8–16 Gi | The fat one — entity resolution. |
| `ontology-definition-service` | 0.5 | 512 Mi | Schemas in Postgres. |
| `object-database-service` | 1 | 2 Gi | Materialized objects + edits. |
| `ontology-query-service` | 1 | 2 Gi | N-hop expansion is the hot path. |
| `ontology-indexer` | 1 | 2 Gi | Indices into Vespa. |
| `ontology-actions-service` | 0.5 | 512 Mi | Stateless. |
| `audit-compliance-service` | 0.5 | 512 Mi | Action Log + projections. |
| `application-composition-service` | 0.5 | 512 Mi | App config persistence. |
| `agent-runtime-service` | 1 | 2 Gi | LLM client + tool routing. |
| `retrieval-context-service` | 0.5 | 1 Gi | Vector store + retriever. |
| `llm-catalog-service` | 0.5 | 512 Mi | Provider registry. |
| `workflow-automation-service` | 0.5 | 512 Mi | Watchlist → Case flow. |
| `notification-alerting-service` | 0.5 | 512 Mi | Side-effect dispatch. |
| `identity-federation-service` | 0.5 | 512 Mi | Keycloak federation. |
| `authorization-policy-service` | 0.5 | 1 Gi | **Markings enforcement** — keep healthy. |
| `telemetry-governance-service` | 0.5 | 512 Mi | KPI surfaces. |
| **Total** | **~16 CPU, ~40 GiB** | | Plus 200–500 GiB SSD for local Iceberg test footprint. |

> A 32-CPU / 128-GiB box (or equivalent cloud VM) runs the demo comfortably; the bottleneck is the Spark runner during the entity-resolution pipeline. See [`04-infraestructura-y-despliegue.md`](04-infraestructura-y-despliegue.md) for layouts and the air-gapped variant.

---

## ✅ Concrete actions (when the PoC is executed)

1. Deploy the 16-service subset via `infra/compose/docker-compose.yml` (or the Helm subset chart in `infra/helm/poc-geopolitica/` — to be added during execution).
2. Confirm each service surfaces `/healthz` green; the KPI panel reads this.
3. Wire the OpenFoundry endpoints into the Foundry-labeled UI per [`07-dashboards-y-app-workshop.md`](07-dashboards-y-app-workshop.md).
4. Smoke test: create a `Watchlist` via the Workshop button group and confirm it lands as an action log entry in `audit-compliance-service`.
5. Confirm marking enforcement end-to-end by switching between Sofía and Marcos accounts; see [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md) for the exact assertions.
