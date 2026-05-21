# 01 — Vision and use case

## 🎬 Single narrative (elevator pitch for the customer)

> *"A municipal patrol commander has to decide, every evening: which of the 73 neighborhoods get reinforced for tomorrow's four shifts? The information exists — Guàrdia Urbana incident logs, traffic accidents, AEMET weather, census density, the calendar of events like La Mercè or Sant Joan — but today it lives in five tools and is reconciled by hand on Excel. OpenFoundry turns that decision into a Foundry-native loop: a load forecast at neighborhood × shift grain, an AIP-drafted briefing with citations to ontology IDs, a one-click Action that marks the reinforcement zone, and an after-action review when the shift closes. The same ontology accepts your internal CAD/AVL feeds tomorrow without redoing anything."*

---

## 🏢 Vertical and sub-vertical

- **Vertical:** Urban public-safety operational intelligence.
- **Sub-verticals served by the same PoC:**
  - Municipal police force operations office (Guàrdia Urbana de Barcelona profile).
  - Regional-government public-safety analytics team.
  - Metropolitan emergency-management agency.
  - Large-event security planning (La Mercè, Sant Joan, marathons, summits).
- **Palantir analogue:** Foundry deployments at public-safety customers (LAPD, NYPD, NCPD-style operational intelligence — public references only).

---

## 👥 Personas (the two who will appear in the demo)

### 👩‍✈️ Cmdte. Anna Vives — Senior Patrol Commander
- **Account:** `anna.vives@bcn-publicsafety.demo`
- **Role:** Senior Patrol Commander, Guàrdia Urbana de Barcelona, Operations Office. Foundry role: `commander`.
- **Day to day:** decides each evening which neighborhoods get reinforced for the next day's four shifts; signs the daily tactical briefing; reviews the previous day's outcomes.
- **Frustration today:** Excel + experience. The incident dashboard is a static PDF, the weather forecast is on a separate tab, the calendar of city events is on a printed sheet.
- **What she will see in the demo:** a single Workshop module — *Urban Public-Safety Operations* — with a map, an object table of forecasted top-N neighborhoods, the per-shift forecast chart, and a briefing card the AIP has already drafted with citations. One click marks a reinforcement zone.

### 🕵️ Lt. Jordi Mas — Tactical Planning Analyst
- **Account:** `jordi.mas@bcn-publicsafety.demo`
- **Role:** Tactical Planning Analyst / briefing officer. Foundry role: `analyst`.
- **Day to day:** drafts the per-shift briefing, surfaces patterns across neighborhoods, gets pinged when reinforcement zones are written so he can reconcile patrol assignments.
- **Frustration today:** five tools, manual aggregation, no audit trail for "why was Raval reinforced last Thursday and not Gòtic".
- **What he will see in the demo:** the same Workshop module with raw `Incident` rows visible (his marking gives him incident-level detail). When Anna marks a reinforcement zone, he receives a notification and the briefing card refreshes.

> Both characters have real accounts with different roles **and different markings**. Anna has `OPS-CORE` (aggregated forecast + reinforcement zones, census-derived PII coarsened); Jordi has `ANALYST-CORE` (raw incident detail including approximate addresses, `PII-RESIDENT` redacted). The marking demo (UC-7) flips between them. Detail in [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md).

---

## 🎯 Concrete use cases to demonstrate

| ID | Use case | OpenFoundry services involved | KPI shown |
|----|---|---|---|
| UC-1 | **Live incident map + 24 h load forecast** | `ingestion-replication-service`, `ontology-query-service`, `application-composition-service` + `apps/web` | "73 neighborhoods × 4 shifts × 7 days = 2,044 predictions; live ingest → Workshop < 2 s" |
| UC-2 | **Comparative analysis of 2–4 neighborhoods** (default: Raval vs Gòtic during La Mercè) | `ontology-query-service`, `pipeline-build-service` (rolling windows), Workshop filter + forecast widget | "Raval n=… incidents/shift, Gòtic n=…; weather + calendar overlay" |
| UC-3 | **Mark reinforcement zone from Workshop** with motive + shift window | `ontology-actions-service`, `audit-compliance-service`, `notification-alerting-service` | "Action → Action Log → Jordi notified, reflected in Workshop in < 2 s" |
| UC-4 | **AIP drafts the per-shift briefing** with citations + proposes 5 reinforcement zones | `agent-runtime-service`, `retrieval-context-service`, `llm-catalog-service`, `ontology-actions-service` | "Briefing drafted in < 4 s with N ontology citations + 5 proposed zones awaiting confirmation" |
| UC-5 | **Live incident alert → patrol re-assignment** (synthetic CAD feed) → Jordi notified | `ingestion-replication-service` (Kafka), `workflow-automation-service`, `notification-alerting-service` | "Alert → acknowledge → Jordi notified in < 30 s, full Action Log" |
| UC-6 | **Global Branch: propose 3 chronic-priority neighborhoods** for the standing roster | `dataset-versioning-service`, `code-repository-review-service`, `lineage-service` | "Branch preview shows the 3 candidates in the standing roster card; merge or discard" |
| UC-7 | **Markings & governance** (Anna ↔ Jordi flip, AIP refusal on `PII-RESIDENT`) | `audit-compliance-service`, `authorization-policy-service` | "Anna sees aggregated forecast; Jordi sees raw incidents; AIP refuses `PII-RESIDENT` for both. 100% audited." |

---

## 📈 KPIs we will show at the close

These numbers **must appear on a panel** at the end of the demo (pulled from `telemetry-governance-service` + Grafana dashboards on top of the `observability` lib):

- **Incidents ingested 2020–2024:** ~1.0 M (real GUB open data).
- **TrafficAccidents ingested 2020–2024:** ~50 k (real).
- **Neighborhoods modeled:** 73 (full BCN coverage).
- **Districts modeled:** 10.
- **Weather observations enriching incidents:** ~80 k hourly rows (El Prat + Fabra).
- **Synthetic patrol traces:** ~50–70 GB AVL, ~3 M dispatch records, labeled `SYNTH`.
- **Forecast horizon:** 7 days × 73 neighborhoods × 4 shifts ≈ **2,044 predictions / day**.
- **Forecast MAE vs naive baseline:** both numbers shown live; if the model is not materially better than the baseline, we say so on stage.
- **Briefing generation latency (AIP draft + render):** < 4 s.
- **Reinforcement-zone write → Workshop reflection:** < 2 s.
- **100 %** of writes audited; **100 %** of marking denials logged.
- **Zero personal data; full attribution to Open Data BCN, AEMET, INE.**

---

## 🚦 Scope — what's IN and what's OUT

### ✅ In scope for the PoC
- Open Data BCN — GUB incidents 2020–2024 (~1 M rows) + GUB traffic accidents 2020–2024 (~50 k) + neighborhoods (73 polygons) + districts (10 polygons), CC-BY 4.0.
- AEMET OpenData — Barcelona hourly observations 2020–2024 (El Prat + Fabra), free API key.
- INE — Barcelona census sections (~1.1 k rows).
- Synthetic AVL traces + dispatch records, deterministic, labeled `SYNTH` end-to-end.
- 1 UI language (English) and 1 reference time zone (Europe/Madrid) with per-user conversion; Spanish/Catalan place names preserved.
- Markings: a small fixed set (`PUBLIC-OPENDATA`, `OPS-CORE`, `ANALYST-CORE`, `PII-RESIDENT`).
- Forecast: Gradient-Boosted Trees primary, Poisson GLM explainable fallback, naive same-shift-historical baseline.

### ❌ Out of scope for the PoC
- Internal **Mossos d'Esquadra** or **Policía Nacional** records — open data only.
- Real personal data — `SYNTH` enrichment is deterministic and clearly labeled.
- Integration with the customer's real CAD/AVL systems (that is the pilot phase, optionally air-gapped).
- Accreditation / certification for handling internal police records.
- Complex multi-tenancy — a single `bcn-publicsafety` tenant for the PoC.
- Mobile app — only responsive web.
- **Predictive scoring of individuals.** The forecast is spatio-temporal at neighborhood × shift grain. This is a deliberate ethical choice and is stated on stage.
- Native graph / link-analysis widget — this PoC uses Map + Object Table + Forecast charts + Briefing card. Customers who want graph exploration should run [`../geopolitica/`](../geopolitica/).

---

## 📅 Timeline of a simulated demo day

So the live data "makes sense", the demo is anchored to a **simulated operational day**:

- **T0 = the moment of the demo.**
- Between **T0-5 years and T0** we ingest batch data (GUB incidents, traffic accidents, AEMET, INE).
- During the demo we connect the **synthetic CAD-style live feed** — the customer sees a fresh `IncidentAlert` land within seconds (UC-5).
- The AIP reasons about "tonight's shifts" using the stable batch cut + the latest synthetic events + the latest 7-day forecast.

---

## ✅ Concrete actions (when the PoC is executed)

1. Confirm with the customer that the urban-public-safety vertical fits them (if it is national intelligence or aviation MRO, run [`../geopolitica/`](../geopolitica/) or [`../aviacion/`](../aviacion/) instead).
2. Create the two users `anna.vives@bcn-publicsafety.demo` (`commander`, `OPS-CORE`) and `jordi.mas@bcn-publicsafety.demo` (`analyst`, `ANALYST-CORE`) with the correct markings.
3. Define the **3 messages the customer must take home** (one sentence each). Suggested:
   - *"OpenFoundry turns the morning-briefing decision into a traceable, data-driven, repeatable operation."*
   - *"The same ontology accepts your internal CAD/AVL feeds tomorrow without redoing the model — the investment is in the model and the governance."*
   - *"Open-source, self-hosted, markings-aware, fully audited, GDPR/LOPDGDD-respecting, runs air-gapped."*
4. Validate the date window for the "simulated day" 48 h before the demo (pick a window dense with incidents — e.g. the days around La Mercè or Sant Joan).
5. Confirm with the customer whether the demo runs **online** or **air-gapped**. The narrative is identical; only the AIP backbone flips.
6. Confirm the forecast MAE vs naive baseline numbers the morning of the demo — the close panel quotes them verbatim.
