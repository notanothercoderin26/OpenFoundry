# 11 — Demo script (45–60 min)

> This is the **literal minute-by-minute script** for presenting the PoC to the customer. Read it aloud before each rehearsal. Anything between `«»` is a cue for the presenter (not spoken).

---

## ⏱️ Overall timeline

| Time | Act | Duration | Who |
|---|---|---|---|
| 00:00–05:00 | **Act 0 — Opening** | 5 min | Presenter |
| 05:00–10:00 | **Act 1 — Connect the chaos** | 5 min | Demo |
| 10:00–20:00 | **Act 2 — Model reality (Ontology)** | 10 min | Demo |
| 20:00–30:00 | **Act 3 — Pipeline + quality + lineage** | 10 min | Demo |
| 30:00–40:00 | **Act 4 — Workshop App + dashboards** | 10 min | Demo |
| 40:00–50:00 | **Act 5 — AIP copilot + workflows** | 10 min | Demo |
| 50:00–55:00 | **Act 6 — Governance (RBAC + audit + branches)** | 5 min | Demo |
| 55:00–60:00 | **Act 7 — Closing with numbers + Q&A** | 5 min + Q&A | Presenter |

---

## 🎬 Act 0 — Opening (5 min)

«Title screen with OpenFoundry logo and customer name»

> *"Good morning. Today we're going to show you OpenFoundry: the open-source, self-hosted alternative to Palantir Foundry, running on your own infrastructure, with no lock-in. To make it relevant, we picked an aviation use case, identical to the one Foundry solves in Skywise: bringing together flight operations, maintenance, weather and supply chain into a single operational reality, with an AI copilot on top."*

> *"In 50 minutes you'll see how we connect more than 1 terabyte of real data — live ADS-B flights, NOAA weather, public data from the US DOT, and a synthetic MRO — model it as an ontology, exploit it in dashboards and apps, and let a copilot reason, propose actions, and trigger workflows. All audited, all permissioned, all traceable."*

«Show slide with the **3 key messages** (see `01-vision-y-caso-de-uso.md`)»

> *"If you take 3 ideas away with you: **connect**, **act**, **open**. Let's get started."*

---

## 🔌 Act 1 — Connect the chaos (5 min)

«Switch to the UI. Log in as `admin@acme-airlines.demo`. Go to the catalog view (`apps/web` route `/datasets` + `/iceberg-tables`, fed by `iceberg-catalog-service` and `dataset-versioning-service`).»

> *"This is the catalog. We've already pre-loaded the datasets in the background — they're TBs, not loaded live, but I'll walk you through the connectors."*

«Go to `/data-connection` (view fed by `connector-management-service`) → show 4 connectors already active:»
- `opensky-historical` (Trino) — *"real flights from the entire global ADS-B network"*
- `opensky-live` (REST polling 5s) — *"and this one, live. Right now it's receiving aircraft every 5 seconds."*
- `noaa-hrrr` (S3 sync) — *"public NOAA weather. ~50 GB per month."*
- `mro-synth` (file upload) — *"and here, synthetic maintenance data, generated from real tail numbers so it stays consistent."*

«Show the catalog lineage (graph) already wiring bronze → silver → gold.»

> *"This is real lineage, not a drawing. Every arrow is emitted by the pipeline at execution time. Later I'll show you how it's used for auditing."*

---

## 🧬 Act 2 — Modeling reality: the ontology (10 min)

«Go to `ontology-definition-service`. Show the type graph.»

> *"This is the most important thing about Foundry, and about OpenFoundry. The ontology is the dictionary of your business: aircraft, flight, airport, maintenance event, part, engineer. And the relationships among them."*

«Click on `Aircraft` → show properties, relationships, available actions.»

> *"Each object has properties — tail_number, model, flight hours — and actions that can be executed on it. Actions are what turn the ontology into something alive, not a model drawn in Confluence."*

«Search in the top bar: "N12345"» «The aircraft card appears with its associated graph.»

> *"This is Object Explorer. It shows you this aircraft, its latest flights, the open maintenance events, the parts it has consumed, the assigned engineer. All in one click. Note that the aircraft is flying right now — that information comes from the live OpenSky stream."*

«Click on a linked `Flight` → go to the Flight Detail.»

> *"And here you see the flight with its links to origin and destination airports, correlated weather observations, and the predictor model that has computed a risk_score for it."*

---

## 🧪 Act 3 — Pipeline, quality and lineage (10 min)

«Go to `/pipelines` in `apps/web` (data served by `pipeline-build-service`). Show the list of pipelines.»

> *"We have 12 active pipelines, in medallion architecture: bronze, silver, gold, ontology. I'll open one: the one that enriches flights with weather."*

«Open `gd-flights-enriched` → show the declarative SQL, the versioned inputs, the quality expectations.»

> *"Notice three things: first, it's declarative — versioned in git, not a lost script. Second, the expectations: if the data breaks schema or distributions, the pipeline fails and stays in FAILED state. Third, the lineage is emitted automatically to OpenLineage."*

«Click on "Run history" → show green runs and a recent FAILED one.»

> *"Here we had a run that failed because `distance_km` came out negative. I left it in on purpose so you'd see the system reacting."*

«Go to `/lineage` in `apps/web` (fed by `lineage-service`, OpenLineage sink) → show the end-to-end graph of `risk_score` for `flight AAL256`.»

> *"Where the risk_score for this flight comes from. The model service, the features, the join with weather, the bronze datasets of origin. In regulatory audits, this is gold."*

«Show the expectations of the `gd-flights-enriched` pipeline (declared with the `pipeline-expression` lib inside `pipeline-build-service`) → 4 green rules and 1 yellow.»

---

## 🖥️ Act 4 — Workshop App + dashboards (10 min)

«Logout admin → Login as `ana@acme-airlines.demo`.»

> *"Now I'm Ana, ops controller. This is my screen."*

«Show Operations Live (see `07-dashboards-y-app-workshop.md`).»

- *"1,247 flights in the air right now. Real — you can verify them on FlightRadar."*
- *"38 flights classified as HIGH or CRITICAL delay risk by our predictor model."*
- *"Map color-coded by risk, NOAA weather overlay…"*

«Hover on an aircraft on the map → side panel.»

«Click on "AAL256" in the table → opens Flight Detail.»

«Linked objects tab → click on the aircraft → shows history.»

> *"In 2 clicks I've gone from the map to the aircraft, to the model, to the maintenance history. This is what we call navigating the ontology graph."*

«Switch to Workshop App `mro-triage-workbench`. Still logged in as Ana, show that she **cannot execute** MRO actions (greyed-out buttons, tooltip "requires mro-lead role").»

> *"You'll notice something important: as Ana, I see everything, but I cannot execute maintenance actions. Real RBAC."*

«Logout → login as `luis@acme-airlines.demo`.»

> *"Now I'm Luis, hangar lead. This is my view."*

«Show Fleet Health: heatmap of recurring defects, list of aircraft, parts at risk.»

«Click on the heatmap → drill into the ATA-27 cluster on the A320 fleet.»

> *"Here I see an anomalous cluster of defects on the aileron, A320, last 60 days. Is it one aircraft or a fleet-wide issue? Let's ask the copilot."*

---

## 🤖 Act 5 — AIP copilot + workflows (10 min)

«Click "Ask AIP" in the header. The copilot opens as an overlay.»

«Paste prompt **D1**:»
```
What flights arriving at JFK in the next 4 hours are at HIGH or CRITICAL risk
of delay? Show me the top 5, ordered by risk, with the main contributing
weather factor for each.
```

«Wait for response (~5 s). A table appears. Note that the copilot has called 2 tools (visible in the "tool calls" panel).»

«Paste prompt **D2**:**
```
Tell me more about the first one. Why is its risk score so high?
```

«Comment on the explanation, cite the data.»

«Paste prompt **D3**:**
```
For the A320 fleet, are there any recurring defects in the last 60 days?
Highlight any ATA chapter that is statistically anomalous compared to the
prior 60-day baseline.
```

> *"Remember: the copilot doesn't make things up. It's querying the ontology. If the information doesn't exist, it says so."*

«Paste prompt **D4** (the action proposal):»
```
For the affected aircraft, propose flagging them for an unscheduled inspection
within 72 hours, priority HIGH, with a clear justification linked to the
recurring ATA-27 defect.
```

> *"Pay attention here: the copilot **proposes** actions. It does not execute them. This is human-in-the-loop. I'm going to approve."*

«Paste prompt **D5**:**
```
Yes, execute these actions. Assign the inspections to the engineer with the
lowest current workload at the home base of each aircraft.
```

«The actions execute. Notification toasts appear (`notification-alerting-service` + WebSocket). Switch to the `/workflows` tab (served by `workflow-automation-service`) and show the `mro-inspection` workflows running.»

> *"This is what most demonstrates Foundry: from insight to coordinated action in 30 seconds, all traced, all assigned, all notified."*

---

## 🔐 Act 6 — Governance: RBAC, audit, branches (5 min)

«Logout → login as `diego@acme-airlines.demo` (mro-engineer).»

> *"Now I'm Diego, engineer. Look at what I see."*

«Only the `MaintenanceEvent`s assigned to him appear. Try to open the workshop app → 403.»

> *"Real ABAC: the filter is at the row level, not just at the screen level."*

«Logout → login as admin. Go to `/audit` in `apps/web` (fed by `audit-compliance-service`).»

«Filter by `actor.user_id = ai-copilot` and `action_id = flag-aircraft-for-inspection` in the last 5 min.»

> *"Every copilot action records who proposed it, who confirmed it, what objects it created, what workflows it triggered. Immutable, replicated to S3 with object-lock."*

«Paste prompt **D7** (branch comparison) in the copilot:**
```
Compare the risk_score distribution for flights to JFK on the 'main' branch
vs the 'feat/risk-model-v2' branch. Are there meaningful differences?
```

«Show the side-by-side table.»

> *"Branches over datasets — Foundry-style. You try new models on a branch, compare them, merge them if they work, roll back if not. And everything stays in lineage."*

---

## 🎯 Act 7 — Closing with numbers (5 min)

«Show the **observability** Grafana dashboard (prepared for this):»

- 1.18 TB ingested.
- 4.3 billion analyzable rows.
- 12 active pipelines, 99.2% success rate.
- Ontology query latency p95: 1.4 s.
- Stream ingest → dashboard latency: 3.8 s.
- 100% of copilot actions in the audit log.
- 0 PII data exposed.

> *"This is the PoC. What comes next? A pilot with your real data, on your infra, in 6 weeks. No lock-in. No license fees. And all the code is on GitHub."*

«Show `github.com/unnamedlab/OpenFoundry`.»

«Move to Q&A.»

---

## 🧷 Things to **never** say live

- "This is beta" / "This is experimental" → weakens it.
- Mentioning recent bugs.
- Touching features that are **not in the ~17-service subset**.
- Improvising copilot prompts outside D1–D7. If the customer asks for something new: *"good question, we'll show it in a follow-up so we don't run out of time"*.

---

## ✅ Concrete actions (when the PoC is executed)

1. Print this document. Keep it on you.
2. Rehearse the full script 3 times against the clock.
3. Record the final rehearsal as a **plan B** (10-min video, see [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md)).
4. If the customer is non-English-speaking, translate prompts D1–D7.
5. Have browser tabs pre-opened in the order of the script.
