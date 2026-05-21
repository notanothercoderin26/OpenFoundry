# 02 — Architecture and services for the demo

> Snapshot note: this PoC document is intentionally a demo-scope snapshot, not the canonical repository inventory. The current code-first inventory is **50 service directories** under `services/`; use [`docs/reference/repository-layout.md`](../../docs/reference/repository-layout.md) for the authoritative service/library list. Spinning up all services for a demo is unmanageable. This document defines the **minimum viable subset for the Urban Public-Safety PoC (~14 services)** and explicitly leaves the rest off but "listed as available".

The customer-facing narrative uses Foundry concepts (Data Connection, Dataset, Pipeline, Ontology, Workshop, AIP Chatbot, Action Type, Marking, Global Branch) — see [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md). The table below maps each Foundry concept to the OpenFoundry service(s) that must be running.

---

## 🧱 Minimum viable subset (~14 services)

| # | Foundry concept | OpenFoundry service(s) | Why it is in for this PoC |
|---|---|---|---|
| 1 | **Data Connection** | `connector-management-service`, `ingestion-replication-service` | We have 6 source connections (BCN incidents, BCN accidents, BCN geometries, AEMET hourly observations, INE census, synthetic AVL + CAD). AEMET is the live-ish stream (hourly poller). |
| 2 | **Datasets + transactions** | `dataset-versioning-service` | All raw, staging, curated layers need transactional writes + branch awareness (Global Branch in UC-6). |
| 3 | **Pipeline Builder / Code Repositories** | `pipeline-build-service`, `pipeline-runner-spark`, `pipeline-expression` (lib) | Bronze→silver→gold transforms. The **load-forecast feature pipeline + XGBoost training** is the heaviest job. |
| 4 | **Data Health** | `pipeline-expression` health surfaces, `telemetry-governance-service` | Freshness on AEMET hourly drop, uniqueness on `numero_expedient`, forecast-MAE-vs-baseline check. |
| 5 | **Iceberg catalog** | `iceberg-catalog-service` | Backing store for Datasets; user-facing surface is the Dataset, not Iceberg. |
| 6 | **Data Lineage** | `lineage-service` | Click from `LoadForecast.predicted_count` back to the GUB incident rows + AEMET features used. |
| 7 | **Ontology Manager** | `ontology-definition-service`, `object-database-service` | Object types (`Incident`, `Neighborhood`, `Shift`, …), link types, action types. |
| 8 | **Object query / pivots** | `ontology-query-service` | Filter by neighborhood × shift × weather; powers the Workshop Map + Object Table widgets and AIP Object query tool. Search is served by Postgres + pgvector — no separate indexer needed. |
| 9 | **Action Types + Action Log** | `ontology-actions-service`, `audit-compliance-service` | `mark-reinforcement-zone`, `generate-daily-briefing`, `close-reinforcement-zone`, `register-zone-outcome`, etc., with full audit. |
| 10 | **Workshop** | `application-composition-service` + `apps/web` | Customer-facing module title: **"Urban Public-Safety Operations"** (Map + Forecast charts + Object Table + AIP chat). |
| 11 | **AIP Chatbot** | `agent-runtime-service`, `retrieval-context-service`, `llm-catalog-service` | Briefing drafting, Object query tools, Action tools, retrieval over historical incident narratives. |
| 12 | **Workflow / approvals** | `workflow-automation-service` | Incident alert → patrol re-assignment workflow with SLA + notification side effect (UC-5). |
| 13 | **Notifications / webhooks** | `notification-alerting-service` | Email / chat / webhook for the alert → patrol flow. |
| 14 | **Identity + Authorization** | `identity-federation-service`, `authorization-policy-service` | Keycloak-backed Anna (`commander`, `OPS-CORE`) and Jordi (`analyst`, `ANALYST-CORE`); markings (`PUBLIC-OPENDATA`, `OPS-CORE`, `ANALYST-CORE`, `PII-RESIDENT`) enforced in datasets, ontology, Workshop, AIP. |
| 15 | **Observability** | `observability` lib + `telemetry-governance-service` | KPI panel (1 M incidents, 50 k accidents, 73 barrios, forecast MAE vs baseline, write latency). |

> Everything not in this table is **off** for the demo. It can be referenced as "available in OpenFoundry" but it does not run.

---

## 🚫 Services explicitly **off** for the demo

| Service / area | Why off for this PoC |
|---|---|
| `ontology-indexer` (Vespa) | The urban dataset is small enough (~1 M incidents + 73 barrios + a handful of object types) to be served from Postgres + pgvector. We drop the dedicated search backend entirely versus the geopolitical PoC. |
| Anything ML-training-specific beyond `pipeline-runner-spark` + `llm-catalog-service` | XGBoost training runs inside the pipeline; no model registry / training orchestrator needed for one model. |
| Marketplace / publishing services | Out of scope — single internal tenant. |
| Multi-tenancy isolation services beyond `identity-federation-service` | Single `bcn-publicsafety` tenant. |
| Code Repositories Git server | Use platform's external repo connection if needed; not demoed end-to-end. |
| Streaming services beyond `ingestion-replication-service` Kafka path | One Kafka topic per source; no fan-out workloads. |
| Notebook services | Replaced by the AIP Chatbot for ad-hoc questions in this demo. |

---

## 🧭 Topology diagram (textual)

```
┌──────────────────────────── Data Connection layer ────────────────────────────┐
│  Open Data BCN — incidents-gestionats-gub (CSV) ──┐                            │
│  Open Data BCN — accidents-gu-bcn (CSV)        ──┤                             │
│  Open Data BCN — barris + districtes (GeoJSON) ──┼──▶ ingestion-replication ──┐│
│  AEMET OpenData — hourly El Prat + Fabra (API) ──┤        │                    ││
│  INE — census sections of Barcelona (CSV)      ──┤        ▼                    ││
│  Synthetic — patrol AVL traces (Parquet)       ──┤    Kafka / Redpanda         ││
│  Synthetic — CAD-style dispatch (Parquet)      ──┘        │                    ││
│                                                            ▼                   ││
│                              dataset-versioning-service  ◀── iceberg-catalog ──┘│
│                              (raw → staging → curated → ontology)               │
└────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌────────────────────────────── Pipeline layer ─────────────────────────────────┐
│ pipeline-build-service ── DAG editor / Code Repositories transforms            │
│   ├── incident-normalizer (BCN typology → Incident ontology fields)            │
│   ├── accident-normalizer                                                      │
│   ├── geom-resolver (Incident lat/lon → Neighborhood + District + CensusTract) │
│   ├── weather-joiner (Incident timestamp → nearest AEMET hour)                 │
│   ├── shift-binner (timestamp → MAÑANA / TARDE / NOCHE / MADRUGADA)            │
│   ├── load-forecast-features (counts × neighborhood × shift × weather × hol.)  │
│   ├── load-forecast-train (XGBoost + Poisson GLM fallback)                     │
│   └── gold-projector (→ ontology-backed datasets)                              │
│ pipeline-runner-spark — executes the above on Iceberg datasets                 │
│ lineage-service — propagates lineage to ontology-definition-service            │
└────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────── Ontology + actions layer ──────────────────────────┐
│ ontology-definition-service  — object types, link types, action types         │
│ object-database-service      — materialized objects + edits                   │
│ ontology-query-service       — filters, pivots, marking-aware reads           │
│ ontology-actions-service     — mark-reinforcement-zone, generate-briefing, …  │
│ audit-compliance-service     — Action Log object type + queryable history     │
└────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌────────────────────────── App layer (Workshop / AIP) ─────────────────────────┐
│ application-composition-service + apps/web                                    │
│   Workshop module "Urban Public-Safety Operations"                            │
│     ├── Map widget (Neighborhood polygons + Incident overlay)                 │
│     ├── Forecast chart widget (LoadForecast × Shift × 7 days)                 │
│     ├── Object Table widget (Incidents, Patrols, ReinforcementZones)          │
│     ├── Filter + Button Group widgets (mark-zone, generate-briefing)          │
│     └── AIP Chatbot widget                                                    │
│ agent-runtime-service + retrieval-context-service + llm-catalog-service       │
└────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────── Workflow / governance / observability ─────────────────────┐
│ workflow-automation-service  — IncidentAlert → patrol re-assignment (SLA)     │
│ notification-alerting-service — email / chat / webhook side effects            │
│ identity-federation-service   — Keycloak (Anna, Jordi, roles, markings)       │
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
| Inspect Data Health | `GET /api/health/v1/checks?dataset=...` (`telemetry-governance-service`) | Forecast-MAE-vs-baseline lives here. |
| Define ontology object/link/action type | `POST /api/ontology/v1/definitions` (`ontology-definition-service`) | YAML/JSON declarative input. |
| Query ontology / pivots | `POST /api/ontology/v1/query` (`ontology-query-service`) | Markings applied server-side. |
| Submit an Action | `POST /api/actions/v1/actions/{id}/submit` (`ontology-actions-service`) | Returns an action-log object id; this is how reinforcement zones are written. |
| List Action Log | `GET /api/audit/v1/actions` (`audit-compliance-service`) | Same shape as Foundry's Action Log views. |
| Configure Workshop module | `PUT /api/apps/v1/workshop/{id}` (`application-composition-service`) | Module = JSON config of widgets + variables. |
| Talk to AIP Chatbot | `POST /api/aip/v1/chat` (`agent-runtime-service`) | Tools resolved via `retrieval-context-service` + `llm-catalog-service`. |
| Create Global Branch | `POST /api/branches/v1/branches` (`dataset-versioning-service`) | Branch spans datasets + transforms + ontology + Workshop (UC-6). |
| Apply a Marking | `PUT /api/policies/v1/markings/{id}/assignments` (`authorization-policy-service`) | Marking is the headline differentiator — see [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md). |

> The OpenFoundry endpoints above are **implementation details**. The demo script must use the Foundry vocabulary in column 1. The customer-facing Quiver dashboard is titled **"Urban Public-Safety Operations — Live"**.

---

## ⚙️ Resource sizing per service (PoC single-node target)

| Service | CPU req | RAM req | Notes |
|---|---|---|---|
| `connector-management-service` | 0.5 | 512 Mi | Stateless. |
| `ingestion-replication-service` | 0.5 | 1 Gi | AEMET hourly + BCN one-shots; lighter than GDELT. |
| `dataset-versioning-service` | 0.5 | 1 Gi | Tx metadata in Postgres. |
| `iceberg-catalog-service` | 0.5 | 1 Gi | Catalog only; data on S3/MinIO. |
| `pipeline-build-service` | 0.5 | 512 Mi | DAG editor / scheduling. |
| `pipeline-runner-spark` | 2 | 8 Gi | The fat one — XGBoost training + feature pipeline. |
| `ontology-definition-service` | 0.5 | 512 Mi | Schemas in Postgres. |
| `object-database-service` | 1 | 2 Gi | Materialized objects + edits. |
| `ontology-query-service` | 1 | 2 Gi | Pivot/filter hot path; backed by Postgres + pgvector. |
| `ontology-actions-service` | 0.5 | 512 Mi | Stateless. |
| `audit-compliance-service` | 0.5 | 512 Mi | Action Log + projections. |
| `application-composition-service` | 0.5 | 512 Mi | App config persistence. |
| `agent-runtime-service` | 1 | 2 Gi | LLM client + tool routing. |
| `retrieval-context-service` | 0.5 | 1 Gi | Vector store + retriever. |
| `llm-catalog-service` | 0.5 | 512 Mi | Provider registry. |
| `workflow-automation-service` | 0.5 | 512 Mi | IncidentAlert flow. |
| `notification-alerting-service` | 0.5 | 512 Mi | Side-effect dispatch. |
| `identity-federation-service` | 0.5 | 512 Mi | Keycloak federation. |
| `authorization-policy-service` | 0.5 | 1 Gi | **Markings enforcement** — keep healthy. |
| `telemetry-governance-service` | 0.5 | 512 Mi | KPI surfaces. |
| **Total** | **~12 CPU, ~28 GiB** | | Plus 100–200 GiB SSD for local Iceberg test footprint. |

> A 16-CPU / 64-GiB VM (or equivalent workstation) runs the demo comfortably; the bottleneck is the Spark runner during the forecast-training pipeline. See [`04-infraestructura-y-despliegue.md`](04-infraestructura-y-despliegue.md) for layouts and the air-gapped variant.

---

## ✅ Concrete actions (when the PoC is executed)

1. Create `infra/compose/poc-seguridad-urbana.override.yml` declaring only the ~14 services in the table above plus their dependencies (Postgres + pgvector, Redpanda, Keycloak, Caddy) — note the absence of Vespa relative to the geopolitical override.
2. Bring the subset up via `docker compose -f infra/compose/docker-compose.yml -f infra/compose/poc-seguridad-urbana.override.yml up -d` and confirm every service surfaces `/healthz` green; the KPI panel reads this.
3. Wire the OpenFoundry endpoints into the Foundry-labeled UI per [`07-dashboards-y-app-workshop.md`](07-dashboards-y-app-workshop.md); the Workshop module must register under the title `Urban Public-Safety Operations`.
4. Smoke test: submit a `mark-reinforcement-zone` action from the Workshop button group and confirm it lands as an action-log entry in `audit-compliance-service` in under 2 s (KPI target).
5. Confirm marking enforcement end-to-end by switching between Anna (`OPS-CORE`) and Jordi (`ANALYST-CORE`) accounts; see [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md) for the exact assertions, including the AIP refusal on `PII-RESIDENT` fields.
