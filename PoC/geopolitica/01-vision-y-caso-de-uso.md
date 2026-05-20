# 01 — Vision and use case

## 🎬 Single narrative (elevator pitch for the customer)

> *"An intelligence team or sanctions desk needs to answer, every morning: which actors of interest were active in which places in the last 72 hours, who are they connected to, and which of them are on our watchlist? The information exists — it is in news feeds (GDELT), conflict reports (ACLED), public sanctions lists (OFAC, EU, OpenSanctions), and reference knowledge bases (Wikidata) — but it is not joined into a single operational reality. OpenFoundry brings everything together into an ontology, exposes it as a map+timeline+graph workbench, lets an AI copilot summarize and propose actions, and — critically — lets the same model accept your classified internal feeds tomorrow without redoing anything."*

---

## 🏢 Vertical and sub-vertical

- **Vertical:** Geopolitical intelligence / sanctions monitoring / conflict observation.
- **Sub-verticals served by the same PoC:**
  - National intelligence agency open-source-intelligence (OSINT) desk.
  - Sanctions / financial-intelligence-unit (FIU) compliance team.
  - Defense / military analyst (situational awareness, force protection).
  - NGO / academic conflict observatory (e.g. analogous to ACLED users themselves).
- **Palantir analogue:** Foundry deployments at intelligence and defense customers, plus the Gotham link-analysis heritage embedded in Foundry's Object Explorer.

---

## 👥 Personas (the two who will appear in the demo)

### 👩‍💼 Sofía — Senior intelligence analyst
- **Role:** OSINT analyst at a national agency / EU institution.
- **Day to day:** writes a morning brief on a region, hunts for actors of interest, tracks a few designated networks across news + conflict feeds.
- **Frustration today:** opens 5 different tools (a news aggregator, ACLED dashboard, a separate sanctions checker, a notes wiki, a spreadsheet of "actors I am tracking"); cross-referencing is manual.
- **What she will see in the demo:** a single Workshop module with map + timeline + actor graph, plus an AIP copilot that drafts the brief in seconds with proper citations to source datasets.

### 👨‍💼 Marcos — Sanctions compliance investigator
- **Role:** investigator at a financial intelligence unit (FIU) or sanctions enforcement office.
- **Day to day:** receives alerts when a sanctioned entity appears active in open-source signals; opens an investigation case, links related persons/orgs, decides whether to escalate to a freeze/asset-tracing workflow.
- **Frustration today:** alerts arrive in email, evidence collection is by screenshot, audit trail is in a separate ticketing system, and every "who is connected to whom" question requires a manual graph in Excel or a slow analyst's notebook.
- **What he will see in the demo:** an inbound `ActorAlert` from the watchlist, a one-click "Open Investigation Case" Action with side-effect notifications, a graph of resolved entities, and the Action Log proving every step is auditable.

> Both characters must have real Keycloak accounts, with different roles **and different markings**. Sofía has `MARKING:ANALYST-CORE` (sees raw GDELT/GKG); Marcos has `MARKING:COMPLIANCE-CORE` (sees sanctions detail, redacted news sources). The marking demo (act 11 of [`11-guion-demo.md`](11-guion-demo.md)) flips between them. Detail in [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md).

---

## 🎯 Concrete use cases to demonstrate

| ID | Use case | OpenFoundry services involved | KPI shown |
|----|---|---|---|
| UC-1 | **Unified live event map + timeline** (last 72 h, CAMEO-coded) | `ingestion-replication-service` (GDELT 15-min drops), `ontology-query-service`, `application-composition-service` + `apps/web` | "N events ingested, M after dedup, live latency < 10 min" |
| UC-2 | **Sanctioned-entity activity in conflict zones** | `pipeline-build-service` (ER transform), `ontology-query-service`, `authorization-policy-service` (markings) | "K OFAC-listed actors with ≥1 ACLED event in eastern Ukraine, last 72 h" |
| UC-3 | **Actor neighborhood expansion (graph)** | `ontology-query-service` (N-hop), Workshop graph widget | "From Actor:X → 14 linked persons/orgs in 2 hops, 3 sanctioned" |
| UC-4 | **AIP copilot drafts a brief and proposes actions** | `agent-runtime-service`, `retrieval-context-service`, `llm-catalog-service`, `ontology-actions-service` | "Brief drafted in 4 s with 7 ontology citations + 2 proposed watchlist additions awaiting confirmation" |
| UC-5 | **End-to-end watchlist → alert → investigation case** | `workflow-automation-service`, `notification-alerting-service`, `ontology-actions-service` | "Alert → case opened → Marcos notified in < 30 s, full Action Log" |
| UC-6 | **Branch demo: "extend OFAC list with 12 candidates"** | `dataset-versioning-service` (Global Branching), `code-repository-review-service`, `lineage-service` | "Branch preview shows 47 newly-flagged actors in Workshop; merge or discard" |
| UC-7 | **Markings & governance** | `audit-compliance-service`, `authorization-policy-service` | "Sofía sees raw GDELT URL; Marcos sees `[redacted]` for the same field; AIP refuses to read the URL when asked by Marcos. 100% audited." |

---

## 📈 KPIs we will show at the close

These numbers **must appear on a panel** at the end of the demo (pulled from `telemetry-governance-service` + Grafana dashboards on top of the `observability` lib):

- **Ingested volume:** ≥ 1 TB.
- **Analyzable rows:** ≥ 3 billion (GDELT events + GKG mentions dominate).
- **Modeled events (last 12 months):** ≥ 200 million.
- **Resolved Actors in the ontology:** ≥ 1.5 million (after entity resolution across GDELT actors + sanctions lists + Wikidata).
- **Sanctioned actors in the ontology:** ≥ 30,000 (OFAC + EU + OpenSanctions aggregated).
- **Active pipelines:** ≥ 14.
- **Query p95 latency** on the ontology: < 2 s.
- **N-hop graph expansion p95** (2 hops, ≤ 200 nodes): < 1.5 s.
- **Streaming ingest → Workshop latency:** < 10 min (GDELT drop cadence is the lower bound).
- **Copilot actions traced in audit:** 100%.
- **Marking violations attempted in demo:** 100% denied + logged.
- **Zero customer data; zero un-attributed source.**

---

## 🚦 Scope — what's IN and what's OUT

### ✅ In scope for the PoC
- GDELT 2.0 events + GKG mentions — last 12 months globally + a live window of 15-min drops during the demo.
- ACLED — last 24 months (registered account, attribution required).
- OFAC SDN List + EU Consolidated Sanctions + OpenSanctions aggregated entities.
- Wikidata enrichment for `Person` and `Organization` entities (Q-IDs).
- Synthetic enrichment for analyst-tradecraft fields (case status, source reliability score) generated deterministically from real underlying IDs.
- 1 UI language (English) and 1 reference time zone (UTC) with per-user conversion.
- Markings: a small fixed set (`OPEN-SOURCE`, `SANCTIONS-LIST`, `ANALYST-CORE`, `COMPLIANCE-CORE`) to keep the demo legible.

### ❌ Out of scope for the PoC
- Real classified data of any kind.
- PII beyond what is already public in sanctions lists and Wikidata.
- Integration with the customer's real systems (that is the next phase: pilot, optionally air-gapped).
- Accreditation / certification for classified handling.
- Complex multi-tenancy — a single `acme-intel` tenant for the PoC.
- Mobile app — only responsive web.
- Predictive scoring of individuals (we ingest and resolve; we do not score persons). This is a deliberate ethical choice and must be stated in the demo.

---

## 📅 Timeline of a simulated demo day

So the live data "makes sense", the demo is anchored to a **simulated operational day**:

- **T0 = the moment of the demo.**
- Between **T0-12 months and T0** we ingest batch data (GDELT historical, ACLED, sanctions snapshots, Wikidata).
- During the demo we connect the **GDELT live 15-min drop** + a polling job on **OpenSanctions deltas** — the customer sees new events landing.
- The copilot reasons about "today" using the stable batch cut + the latest drops.

---

## ✅ Concrete actions (when the PoC is executed)

1. Confirm with the customer that the geopolitical/intelligence vertical fits them (if it's banking or healthcare, 03 and 05 need to be redone; aviation customers should run [`../aviacion/`](../aviacion/) instead).
2. Create the two users `sofia@acme-intel.demo` and `marcos@acme-intel.demo` with different roles **and markings**.
3. Define the **3 messages the customer must take home** (one sentence each). Suggested:
   - *"OpenFoundry turns heterogeneous public-intelligence sources into a living ontology with verifiable lineage."*
   - *"The same ontology accepts your classified internal feeds tomorrow without redoing it — the investment is in the model, not in the wiring."*
   - *"It is open-source, self-hosted, markings-aware, fully audited — no lock-in, and ready for an air-gapped deployment."*
4. Validate the date window for the "simulated day" 48 h before the demo (GDELT and ACLED both have publication lag; pick a window where the data is dense).
5. Confirm with the customer whether the demo runs **online** (Azure OpenAI for the copilot) or **air-gapped** (Ollama local). The narrative is identical; only the LLM provider flips.
