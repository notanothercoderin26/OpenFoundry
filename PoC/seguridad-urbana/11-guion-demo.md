# 11 — Demo script (minute-by-minute, 15 min)

> Speaker: 1 senior engineer ("the presenter"). 1 backup engineer in the room. 1 laptop with the live stack (cloud or air-gapped per [`04-infraestructura-y-despliegue.md`](04-infraestructura-y-despliegue.md)). The plan B is in [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md).
>
> The script uses **Foundry vocabulary** in everything the customer hears. The OpenFoundry service names never leave the engineer's notes.
>
> **Why 15 minutes:** a senior police commander's working-meeting attention window is short. The 15-minute script is the primary product. The 45-minute extended version is in the appendix at the bottom of this file and is reserved for full-day customer engagements.

---

## ⏱ Overall arc (15 min, 8 acts)

| Minute | Block | Message | Foundry concept on screen |
|---|---|---|---|
| 00–02 | **Act 1 — Problem** | "How a patrol reinforcement is decided today in BCN" | — |
| 02–04 | **Act 2 — Ontology** | "This is not a table; it is a model of the real world" | Ontology Manager, Object Type, Link Type |
| 04–07 | **Act 3 — Workshop + map** | Filter, click a neighborhood, show the 7-day forecast | Workshop module, Map, Object Table, Forecast chart |
| 07–10 | **Act 4 — Action** | Mark a reinforcement zone → it appears in the Action Log | Action Type, Action Log, Notifications |
| 10–12 | **Act 5 — AIP** | 3 rehearsed prompts live | AIP Chatbot, Object query / Action / Function tools |
| 12–13 | **Act 6 — Markings & honesty** | Limitations on stage: GUB not Policía Nacional, simple model, possible biases | Markings/Policies, Data Health (MAE vs baseline) |
| 13–14 | **Act 7 — KPI panel** | Numbers on the close panel | Observability + Action Log + Data Lineage |
| 14–15 | **Act 8 — Close** | "This in 4 weeks with public data. Imagine it with real internal-police data." | — |

---

## 🎤 Minute-by-minute

### 00–02 — Act 1: Problem

«Title screen with OpenFoundry logo and *Urban Public-Safety Operations — Barcelona*»

> *"Good morning. In 15 minutes I will show you how a patrol-reinforcement decision is made today in Barcelona — and how it can be made tomorrow."*

> *"Today, at 20:00, a Guàrdia Urbana commander decides which of the 73 neighborhoods get reinforced for the next four shifts. The information exists: incidents, traffic accidents, weather, the calendar of city events. But it lives in five tools and is reconciled by hand on Excel. The decision is signed off on experience, not on a traceable, auditable, repeatable operation."*

> *"What I am about to show you is built on **Guàrdia Urbana public open data** — not on internal Mossos d'Esquadra or Policía Nacional records. That is important and I will repeat it on stage. The point of this PoC is the platform, the ontology, and the governance. Your internal feeds plug into the same model tomorrow, without redoing it."*

### 02–04 — Act 2: Ontology

«Switch to the Ontology Manager view.»

> *"This is the asset. Not a table — a model of the real world the commander operates in."*

«Show the object types: `Incident`, `TrafficAccident`, `Neighborhood`, `District`, `CensusTract`, `Shift`, `WeatherEvent`, `Patrol`, `ReinforcementZone`, `TacticalBriefing`, `LoadForecast`, `IncidentAlert`, `ActionLog`.»

> *"Thirteen object types. Eleven link types — `OCCURRED_IN`, `DURING_SHIFT`, `UNDER_WEATHER`, `PREDICTS_FOR`, `REINFORCES`, and the rest. Six Action Types — the ones the commander actually does: mark a reinforcement zone, generate a briefing, close a zone with an outcome, register the outcome, acknowledge an alert, and a branch-only one for chronic-priority proposals."*

«Click `LoadForecast` → show it links to `Neighborhood` + `Shift`, and that its source dataset traces back through Data Lineage to GUB incidents + AEMET weather + INE census.»

> *"This is the durable asset. Map and dashboard come and go. The ontology stays."*

### 04–07 — Act 3: Workshop map + forecast

«Log in as **Anna Vives** (commander, `OPS-CORE`). Open the Quiver dashboard *Urban Public-Safety Operations — Live* for 5 seconds; KPI strip, live incidents in the last 24 h, top-N neighborhoods. Then click "Open in Workshop".»

«The Workshop module *Urban Public-Safety Operations* opens.»

> *"This is Anna's screen. Map of Barcelona's 73 neighborhoods, color-coded by the forecasted incident load for the next shift. Object Table of the top 10 neighborhoods. A 7-day forecast chart per shift. And a briefing card on the right that the AIP has already drafted."*

«Filter the map: district = Ciutat Vella, next shift = TARDE, weather overlay on (rain expected).»

> *"I am narrowing to Ciutat Vella for tonight's TARDE shift. The map re-colors, the Object Table re-ranks. Raval is on top, Gòtic second."*

«Click Raval on the map. Side panel opens with the forecast curve over the next 7 days, the breakdown by shift, and the top contributing features — day-of-week, La Mercè flag, expected rain, 30-day rolling mean.»

> *"The forecast model is XGBoost as the primary, Poisson GLM as the explainable fallback. Both are exposed. Right now you are seeing the XGBoost number, and the explanation surface is the Poisson coefficients underneath. Boring on purpose. Police commanders respect technical honesty more than hype."*

### 07–10 — Act 4: Action

«Still as Anna. Click the **Mark Reinforcement Zone** button in the Workshop button group.»

«Dialog opens: neighborhoods = [Raval], motive = "La Mercè + expected rain + 30-day rolling mean above baseline", start = tonight 14:00, end = tomorrow 02:00, shift = TARDE+NOCHE.»

«Submit.»

> *"That is the Action. Foundry calls them Action Types. The write is transactional. The side effects fire post-commit — Jordi gets a notification, the Workshop card refreshes, the Action Log gets a new row."*

«Open the Action Log → the new row is there with actor (Anna), timestamp, action type (`mark-reinforcement-zone`), target objects, parameters, outcome status, edited objects.»

> *"This is what your audit team will ask for next year when someone asks 'why was Raval reinforced last Thursday and not Gòtic'. The answer is right here. Not a Word doc, not a memory."*

«Open the new `ReinforcementZone` object → show its links to Raval, to the TARDE+NOCHE shifts, to Anna as the commander, and to the `TacticalBriefing` that includes it.»

### 10–12 — Act 5: AIP

«Type **P1** (verbatim from [`08-aip-copiloto-prompts.md`](08-aip-copiloto-prompts.md)):*

```
Draft the tactical briefing for tonight's TARDE shift in Ciutat Vella.
Cite ontology IDs for each neighborhood mentioned.
```

«AIP draft appears in the Briefing card in < 4 s. Citations are clickable Object IDs.»

> *"Every claim is anchored to an Object ID and a dataset. If a sentence cites Raval's load, you can click into the `LoadForecast` object that produced it."*

«Type **P2**:*

```
Compare Raval and Gòtic over the last La Mercè edition: incidents per shift,
weather context, and any reinforcement zones we issued.
```

«AIP composes a paragraph + a small table. References the previous year's `ReinforcementZone` objects.»

«Type **P3**:*

```
From tonight's forecast, propose up to 3 additional reinforcement zones I have
not yet marked. One-sentence rationale each. Do not execute.
```

«AIP proposes 3 with rationale; explicitly does not execute.»

> *"The AIP is an assistant, not an oracle. It proposes. The commander confirms. Every write goes through the same Action Type as before, with the same audit trail."*

### 12–13 — Act 6: Markings & honesty

«Switch user to **Jordi Mas** (analyst, `ANALYST-CORE`). Same Workshop module re-renders.»

> *"Jordi has a different marking. He sees the raw `Incident` rows, including approximate addresses. Anna did not."*

«Type in AIP as Jordi:*

```
Show me the census-derived resident demographics for Raval block-level.
```

«AIP refuses: *"marking required — `PII-RESIDENT` not granted."*»

«Switch back to Anna. Same prompt. Same refusal — neither user has `PII-RESIDENT`. Three Action Log entries logged for the exchange.»

> *"This is server-side. The chatbot is sandboxed in the same security boundary as the UI."*

«Switch to the Data Health panel for the forecast pipeline.»

> *"Honesty section. The data is GUB public open data, not Policía Nacional. The model is XGBoost — simple and explainable. The naive baseline — same neighborhood × same shift × same day-of-week 30-day rolling mean — is right here. Today's MAE is …, the baseline's is …. The model is/is not materially better; either way you saw the real number."*

> *"And we do not score individuals. The forecast is at neighborhood × shift grain. That is a deliberate ethical choice."*

### 13–14 — Act 7: KPI panel

«Open the Observability panel.»

- ~1.0 M GUB incidents 2020–2024.
- ~50 k traffic accidents 2020–2024.
- 73 neighborhoods, 10 districts.
- ~80 k AEMET hourly observations.
- 7-day × 73 × 4 ≈ 2,044 predictions / day.
- Forecast MAE vs naive baseline: both numbers (read live).
- Briefing latency: < 4 s. Reinforcement-zone write reflection: < 2 s.
- 100% of writes audited; 100% of marking denials logged.

### 14–15 — Act 8: Close

> *"What you saw: ~3–4 weeks of focused work by one senior engineer, on public data. Imagine the same loop with your internal CAD/AVL feeds plugged into the same ontology — same Workshop module, same Action Types, same Action Log, same markings. No redesign. The investment is in the model and the governance, not in the wiring."*

> *"It is open-source, self-hosted, markings-aware, fully audited, GDPR/LOPDGDD-respecting, and runs air-gapped."* (cloud variant: *"…and the same stack runs air-gapped with a local backbone — happy to show that next session."*)

«Q&A. Hold to two questions; offer the 45-minute extended session for anything deeper.»

---

## 🆘 If something dies mid-demo

The plan B is documented in [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md). Headline rule for this PoC: **never apologize for using public data**. The product narrative is intact even if the live feed fails — switch to the pre-recorded UC-5 snippet, narrate the same steps, and pivot to the *"your internal CAD/AVL feeds slot in tomorrow"* message.

---

## 📎 Appendix — 45-minute extended session

For full-day customer engagements, the same content expands into the 45-minute arc below. Use it only when the calendar genuinely allows; in a typical working meeting, stay on the 15-minute spine.

| Minute | Act | Content | Source act in 15-min spine |
|---|---|---|---|
| 00–04 | **A1 — Opening + 3 messages** | Slide intro, the three customer take-home messages, scope honesty (GUB public data, not Policía Nacional) | expands Act 1 |
| 04–10 | **A2 — Data Connection + Datasets** | Walk the six Data Connection syncs (GUB incidents, GUB traffic accidents, neighborhoods, districts, AEMET, INE). Markings on raw datasets. Transaction history. | new content (not in 15-min) |
| 10–17 | **A3 — Pipeline Builder + Data Health** | Bronze → silver → gold DAG, the spatial-join transform, the weather-join transform, the forecast transform, MAE-vs-baseline as a Data Health metric. Click into one failed run to show the platform reacting. | new content (not in 15-min) |
| 17–20 | **A4 — Ontology Manager** | The 13 object types, 11 link types, 6 action types. Branch-aware definition file. | expands Act 2 |
| 20–25 | **A5 — Quiver live + Workshop entry** | Open *Urban Public-Safety Operations — Live*, KPI strip, top-N table, click into Workshop. | expands Act 3 (Quiver portion) |
| 25–31 | **A6 — Workshop deep dive** | UC-1 + UC-2 in full: filter, compare Raval vs Gòtic during La Mercè, weather overlay, forecast curve. | expands Act 3 |
| 31–36 | **A7 — Action + after-action close** | UC-3 in full: mark the reinforcement zone, register the outcome at end of shift, close the zone. Three Action Log rows side by side. | expands Act 4 |
| 36–40 | **A8 — AIP Chatbot** | P1 → P2 → P3 → P4 → P5 (briefing + comparison + proposal + refusal + lineage citation). | expands Act 5 |
| 40–42 | **A9 — Live alert (UC-5)** | Synthetic CAD feed produces an `IncidentAlert`; Jordi acknowledges; Anna sees it on the live dashboard. | new content (not in 15-min) |
| 42–43 | **A10 — Markings (UC-7)** | Anna ↔ Jordi flip; AIP refusal on `PII-RESIDENT`. | expands Act 6 |
| 43–44 | **A11 — Branch demo (UC-6)** | Create `chronic-priority-roster-2026Q3` branch, run `propose-chronic-priority` with 3 candidates, preview, discard. | new content (not in 15-min) |
| 44–45 | **A12 — KPI panel + close** | Observability panel, forecast MAE vs baseline, three customer take-home messages, Q&A. | expands Acts 7 + 8 |

---

## 🧷 Things to **never** say live

- "This is beta" / "This is experimental" → weakens it.
- Mentioning recent bugs.
- Touching features that are **not in the ~14-service subset** documented in [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md).
- Improvising AIP prompts outside the rehearsed P1–P5. If the customer asks for something new: *"good question, we'll show it in a follow-up so we don't run out of time."*
- Comparing the model favorably to the baseline before reading the number off the Data Health panel.
- Anything that implies we have access to Mossos d'Esquadra or Policía Nacional internal records.

---

## ✅ Concrete actions (when the PoC is executed)

1. Print this document. Keep it on the laptop, alongside the index card with P1–P5 verbatim.
2. Rehearse the **15-minute spine** at least three times against the clock. Stopwatch every act. The 45-minute appendix is rehearsed separately, only if booked.
3. Pre-stage Anna and Jordi logged-in tabs on the laptop, ready to switch.
4. Pre-record a backup video of Act 4 (Action) + Act 5 (AIP) + Act 6 (Markings) in case the live stack wobbles.
5. The morning of the demo, read today's forecast MAE and the baseline MAE off the Data Health panel and write them on a sticky note on the laptop — Act 6 and Act 7 quote them verbatim.
6. Have the backup engineer ready to swap to the snapshot rollback if needed.
