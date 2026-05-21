# 🚓 OpenFoundry PoC — Urban Public-Safety Operational Intelligence

> **Status:** documentation ready. The PoC **is not being executed yet** — we are waiting for the OpenFoundry MVP to reach a viable level. The PoC is governed by the Foundry-native contract in [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md): user-visible behavior must match how the workflow would be built in Palantir Foundry.
>
> **Chosen vertical:** Urban public-safety operational intelligence — incidents, traffic accidents, neighborhoods, shifts, weather, patrols, and the morning-briefing decision *"which neighborhoods get reinforced today"*.
>
> **Target customer:** a municipal police force (Guàrdia Urbana de Barcelona profile), a public-safety analytics team in a regional government, or a metropolitan emergency-management agency that already recognizes the "Foundry for public safety" use case (LAPD/NYPD/NCPD-style deployments) and wants an open-source, self-hosted, GDPR/LOPDGDD-respecting alternative.

---

## 🎯 PoC objective

Demonstrate to a senior police commander, in a **15-minute** working-meeting session (with an optional 45-minute extended version), that OpenFoundry can:

1. **Ingest** public urban-safety data — Guàrdia Urbana incidents and traffic accidents, neighborhood and district geometries, AEMET weather, INE census — as Foundry Data Connection syncs into raw datasets.
2. **Model** an urban-safety operational ontology (`Incident`, `TrafficAccident`, `Neighborhood`, `District`, `CensusTract`, `Shift`, `WeatherEvent`, `Patrol`, `ReinforcementZone`, `TacticalBriefing`, `LoadForecast`, `IncidentAlert`, `ActionLog`) with resolved entities and link types.
3. **Build** versioned bronze→silver→gold pipelines with end-to-end **Data Lineage**, a 7-day spatio-temporal forecast at neighborhood × shift grain, and automated **Data Health** checks.
4. **Visualize** the operational picture in a *Workshop* module — `Urban Public-Safety Operations` — combining Map, Object Table, Forecast charts and a Briefing card; plus a *Quiver* live dashboard `Urban Public-Safety Operations — Live`.
5. **Reason with AI** through an AIP Chatbot that drafts the per-shift briefing with citations to ontology IDs and proposes reinforcement zones for human review.
6. **Coordinate** through Action Types: `mark-reinforcement-zone`, `generate-daily-briefing`, `close-reinforcement-zone`, `register-zone-outcome`, `acknowledge-incident-alert`, with full Action Log audit.
7. **Govern** with role + marking-based access (`PUBLIC-OPENDATA`, `OPS-CORE`, `ANALYST-CORE`, `PII-RESIDENT`), Action Log, and Global Branching for "propose chronic-priority neighborhoods" scenarios.

The **single message** for the customer: *"OpenFoundry turns the morning-briefing decision — which neighborhoods get reinforced today — into a traceable, data-driven, repeatable operation. The same ontology accepts your internal CAD/AVL feeds tomorrow without redoing the model. The investment is in the model and the governance."*

> The forecast number is not what we sell. **Ontology + lineage + markings + the action → outcome → after-action review loop** is what we sell.

---

## 📚 Document index

| # | Document | Purpose |
|---|---|---|
| 00 | [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md) | Non-negotiable Foundry-native parity contract, public documentation baseline, gaps, and OpenFoundry code adaptation checklist |
| 01 | [`01-vision-y-caso-de-uso.md`](01-vision-y-caso-de-uso.md) | Vertical, personas, business KPIs, scope |
| 02 | [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md) | Which microservices to spin up from the 50 current service directories (~14 subset; see [`docs/reference/repository-layout.md`](../../docs/reference/repository-layout.md)) |
| 03 | [`03-datasets-y-fuentes-de-datos.md`](03-datasets-y-fuentes-de-datos.md) | How to obtain ~80 GB of real, legal, attribution-friendly urban-safety data |
| 04 | [`04-infraestructura-y-despliegue.md`](04-infraestructura-y-despliegue.md) | Hardware, cloud, deployment with compose/k8s, air-gapped variant |
| 05 | [`05-ontologia-seguridad-urbana.md`](05-ontologia-seguridad-urbana.md) | Object types, properties, link types, action types |
| 06 | [`06-pipelines-y-transformaciones.md`](06-pipelines-y-transformaciones.md) | Batch + streaming pipelines, the 7-day load forecast, quality, lineage |
| 07 | [`07-dashboards-y-app-workshop.md`](07-dashboards-y-app-workshop.md) | UI: live operations dashboard + commander Workshop app (map + object table + forecast + briefing card) |
| 08 | [`08-aip-copiloto-prompts.md`](08-aip-copiloto-prompts.md) | Exact AIP Chatbot prompts and *system prompts* for the briefing agent |
| 09 | [`09-workflows-y-acciones.md`](09-workflows-y-acciones.md) | Reinforcement-zone lifecycle, briefing generation, incident-alert acknowledgement |
| 10 | [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md) | RBAC, markings, audit, branches, retention, GDPR/LOPDGDD considerations |
| 11 | [`11-guion-demo.md`](11-guion-demo.md) | **15-minute** minute-by-minute script for the customer session, plus a 45-minute extended-session appendix |
| 12 | [`12-checklist-preparacion.md`](12-checklist-preparacion.md) | Actionable checklist at T-30, T-7, T-1, T-0 |
| 13 | [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md) | Risks, possible failures, recorded plan B |
| — | [`blockers/`](blockers/) | Per-vertical delta on the platform-level blockers tracked under [`../aviacion/blockers/`](../aviacion/blockers/) |

---

## 🧭 How to use this documentation

1. **When the MVP is ready**, read [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md) first, then the documents in order 01 → 13.
2. Each document is **self-contained** and has a "Concrete actions" section at the end.
3. The **literal prompts** for the AIP Chatbot, the pipelines, and the service `curl` calls are in copy-paste code blocks.
4. Before the demo, fully complete [`12-checklist-preparacion.md`](12-checklist-preparacion.md).
5. If something fails live, follow [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md).

---

## ⏱️ Effort estimate (indicative, depends on the MVP)

| Block | Effort |
|---|---|
| Infra provisioning, AEMET key registration, public-source download | 2–3 days |
| Modeling the ontology and loading data through pipelines | 4–6 days |
| Forecast notebook (XGBoost + Poisson baseline + naive baseline) and Data Health checks | 3–5 days |
| Building the Workshop app (Map + Object Table + Forecast + Briefing card) and the Quiver dashboard | 3–5 days |
| Integrating the AIP Chatbot and validating the 4–5 rehearsed prompts | 2 days |
| End-to-end rehearsals (15-min script + plan B recording) | 2 days |
| **Realistic total** | **~3–4 weeks** of focused work by 1 senior engineer |

---

## 📌 Decisions already made

- **Vertical:** Urban public-safety operational intelligence (analogous to Foundry deployments at LAPD/NYPD/NCPD; public references only).
- **Anchor city:** Barcelona / Guàrdia Urbana de Barcelona profile. Narrative replicable to any Spanish/EU city.
- **Data:** Open Data BCN (GUB incidents, traffic accidents, neighborhoods, districts) + AEMET (weather) + INE (census) + deterministic synthetic AVL / dispatch enrichment, clearly labeled `SYNTH`.
- **Target volume:** ~80 GB in object storage (urban data is naturally smaller than the geopolitical PoC — we do **not** inflate the volume claim).
- **Storage:** S3-compatible (MinIO locally, S3 in cloud), Apache Iceberg over Parquet, partitioned by date and shift.
- **Compute:** Spark 3.5 / DataFusion for batch; Kafka/Redpanda for the synthetic CAD-style live feed during the demo.
- **Forecast model:** Gradient-Boosted Trees (primary) + Poisson GLM (explainable fallback), benchmarked **live on stage** against a naive same-shift-historical baseline.
- **AIP backbone:** two modes — local in the air-gapped variant, hosted in the cloud variant. The prompts and the workflow are identical.
- **Frontend:** `apps/web` from the repo + specific extensions for the urban-safety Workshop module.
- **Foundry-native constraint:** every customer-facing artifact must map to a public Foundry concept; OpenFoundry service names are implementation details only.
- **Differentiator vs. the other two PoCs:** this PoC stresses the **spatio-temporal forecast + Workshop action + after-action close** loop, not graph / link analysis. There is no native graph widget in this demo; the Workshop module is Map + Object Table + Forecast charts + Briefing card.

---

## 🆚 Honest framing — what this PoC is and is not

The engineer running the demo must internalize this before opening the laptop:

- The data is **Guàrdia Urbana de Barcelona public open data**, NOT internal Mossos d'Esquadra or Policía Nacional records. Internal-police-data pilots require a follow-on contract and proper accreditation. We say this **on stage**.
- The forecast model is **deliberately simple and explainable**. Police commanders respect technical honesty more than hype. We compare to a naive baseline live; if the model is not materially better than the baseline, we say so.
- We **do not score individuals**. The forecast is spatio-temporal at neighborhood × shift grain. This is an explicit ethical choice and is stated on stage.
- The AIP Chatbot is an **assistant**, not an oracle. We rehearse 4–5 prompts that work and use those; we do not improvise prompts on stage.
- **GDPR / LOPDGDD**: census-derived fields are coarsened by default; the `PII-RESIDENT` marking gates access to anything more granular than neighborhood-level aggregates, and the AIP refuses to surface those fields when the calling user lacks the marking.

---

## 🚧 What this PoC does **not** do

To be honest with the customer:

- It does not replace certified public-safety systems (Mossos d'Esquadra command-and-control, Policía Nacional internal systems, certified dispatch CAD/AVL platforms).
- It does not claim accreditation for handling police-internal information — it is a platform proof on open data plus clearly labeled synthetic enrichment.
- It does not demonstrate all 50 current service directories from [`docs/reference/repository-layout.md`](../../docs/reference/repository-layout.md); only the ~14-service subset documented in [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md).
- It does not use real personal data — synthetic enrichment is deterministic and clearly labeled `SYNTH`. The next phase would be a *pilot* with the customer's internal CAD/AVL feeds, optionally air-gapped.
- It does not perform autonomous decision-making about reinforcement assignments; every write goes through an Action Type with human-in-the-loop confirmation and full Action Log audit.

---

## ✅ Concrete actions (when the PoC is executed)

1. Confirm with the customer that the urban-public-safety vertical fits them (if it is national intelligence or aviation MRO, run [`../geopolitica/`](../geopolitica/) or [`../aviacion/`](../aviacion/) instead).
2. Create the two users `anna.vives@bcn-publicsafety.demo` (`commander`, `OPS-CORE`) and `jordi.mas@bcn-publicsafety.demo` (`analyst`, `ANALYST-CORE`) before the rehearsal.
3. Register an AEMET OpenData API key and confirm the Barcelona stations (El Prat + Fabra) return data for the demo window.
4. Pre-compute the 7-day forecast (73 neighborhoods × 4 shifts ≈ 2,044 predictions/day) plus the naive baseline; commit both MAE numbers to the close panel.
5. Pick between the **15-minute** primary script and the **45-minute** extended appendix based on the calendar the customer offers; rehearse the chosen variant end-to-end at least three times.
