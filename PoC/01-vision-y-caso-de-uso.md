# 01 — Vision and use case

## 🎬 Single narrative (elevator pitch for the customer)

> *"An airline loses 50 million per year to preventable delays and reactive maintenance. The information exists — but it is scattered across the maintenance ERP, the flight operations system, weather reports, and the parts supply chain. OpenFoundry brings everything together into a single operational reality, lets teams coordinate in real time, and lets an AI copilot propose concrete actions. And it's all open-source, on your own infrastructure."*

---

## 🏢 Vertical and sub-vertical

- **Vertical:** Civil aviation.
- **Sub-vertical:** **Fleet operations + MRO (Maintenance, Repair & Overhaul)**.
- **Palantir analogue:** Skywise (Airbus) and Foundry MRO solutions.

---

## 👥 Personas (the two who will appear in the demo)

### 👩‍💼 Ana — Operations Controller
- **Role:** operations controller at the airline's control center.
- **Day to day:** monitors flights in progress, detects delay risks, decides on reassignments.
- **Frustration today:** opens 6 different tools (FlightAware, Sabre, Excel sheets, the meteorologist's email, MRO system, Slack).
- **What she will see in the demo:** a single dashboard with live flights, predictive alerts, and the ability to act.

### 👨‍🔧 Luis — MRO Maintenance Lead
- **Role:** lead of a maintenance hangar.
- **Day to day:** prioritizes work orders, checks parts availability, decides which aircraft goes back into service.
- **Frustration today:** discovers recurring defects in a fleet 3 months late, when someone writes a report.
- **What he will see in the demo:** aircraft view with defect history, failure prediction, AI-created task.

> Both characters must have real Keycloak accounts, with different roles. More detail in [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md).

---

## 🎯 Concrete use cases to demonstrate

| ID | Use case | OpenFoundry services involved | KPI shown |
|----|---|---|---|
| UC-1 | **Unified live fleet visibility** (map + table) | `ingestion-replication-service` (streaming via lib `event-bus-data`), `ontology-exploratory-analysis-service` (geospatial), `application-composition-service` + `apps/web` | "X flights airborne, Y landing in next 30 min" |
| UC-2 | **Weather-driven delay prediction** | `pipeline-build-service` + `pipeline-runner-spark` (quality checks via lib `pipeline-expression`), `ontology-query-service` | "12 flights to JFK at HIGH risk" |
| UC-3 | **Recurring defect detection across a fleet** | `ontology-query-service`, `ontology-exploratory-analysis-service`, lib `analytical-logic` (BI expressions) | "Defect X across 7 A320 aircraft in 30 days" |
| UC-4 | **AIP copilot answers and acts** | `agent-runtime-service` (chat + tools), `retrieval-context-service`, `llm-catalog-service`, `ontology-actions-service` | "Task created in 3 seconds" |
| UC-5 | **End-to-end MRO workflow** | `workflow-automation-service` (includes sagas and built-in **approvals**), `notification-alerting-service` | "4h SLA met, Luis notified" |
| UC-6 | **Dataset branch + time travel** ("Foundry-style") | `dataset-versioning-service` (branches + transactions), `code-repository-review-service` (global branching plane), `lineage-service` | "Auditable version of every decision" |
| UC-7 | **Audit & governance** | `audit-compliance-service`, `authorization-policy-service` (Cedar / ABAC / RBAC) | "100% of actions traced to a user" |

---

## 📈 KPIs we will show at the close

These numbers **must appear on a panel** at the end of the demo (pulled from `telemetry-governance-service` + Grafana dashboards on top of the `observability` lib):

- **Ingested volume:** ≥ 1 TB.
- **Analyzable rows:** ≥ 4 billion.
- **Modeled flights:** ≥ 50 million (12 months BTS + OpenSky).
- **Aircraft in the ontology:** ≥ 30,000 (real tail-number records).
- **Active pipelines:** ≥ 12.
- **Query p95 latency** on the ontology: < 2 s.
- **Streaming ingest → dashboard latency:** < 5 s.
- **Copilot actions traced in audit:** 100%.
- **Zero sensitive data exposed.**

---

## 🚦 Scope — what's IN and what's OUT

### ✅ In scope for the PoC
- ADS-B streaming (OpenSky) — last 6 months + a live window during the demo.
- BTS On-Time history 2018–2024 (USA).
- NOAA HRRR/GFS weather — last 6 months over USA + Europe.
- Synthetic MRO data (work orders, parts, defects) generated from real tail numbers.
- 1 UI language (English) and 1 reference time zone (UTC) with per-user conversion.

### ❌ Out of scope for the PoC
- Real PII data of passengers or crew.
- Integration with the customer's real systems (that is the next phase: pilot).
- Regulatory certification (Part-145, EASA, FAA AC).
- Complex multi-tenancy — a single `acme-airlines` tenant for the PoC.
- Mobile app — only responsive web.

---

## 📅 Timeline of a simulated demo day

So that the live data "makes sense", the demo is anchored to a **"simulated operational day"**:

- **T0 = the moment of the demo.**
- Between **T0-7 days and T0** we ingest batch data (BTS + NOAA + synthetic).
- During the demo we connect the **live OpenSky stream** — the customer sees real aircraft moving.
- The copilot reasons about "today" using the stable batch cut + the stream.

---

## ✅ Concrete actions (when the PoC is executed)

1. Confirm with the customer that the aviation vertical fits them (if it's banking or healthcare, 03 and 05 need to be redone).
2. Create the two users `ana@acme-airlines.demo` and `luis@acme-airlines.demo` with different roles.
3. Define the **3 messages the customer must take home** (write them in a single sentence). Suggested:
   - *"OpenFoundry connects heterogeneous data at TB scale into a living ontology."*
   - *"It turns insights into action through workflows and an AI copilot."*
   - *"It is open-source, self-hosted, and auditable — no lock-in."*
4. Validate the date range for the "simulated day" 48h before the demo.
