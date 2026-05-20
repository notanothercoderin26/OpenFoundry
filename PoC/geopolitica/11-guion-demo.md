# 11 — Demo script (minute-by-minute, 50 min)

> Speaker: 1 senior engineer ("the presenter"). 1 backup engineer in the room. 1 laptop with the live stack (cloud or air-gapped per [`04-infraestructura-y-despliegue.md`](04-infraestructura-y-despliegue.md)). The plan B is in [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md).
>
> The script uses **Foundry vocabulary** in everything the customer hears. The OpenFoundry service names never leave the engineer's notes.

---

## ⏱ Overall arc (50 min)

| Minute | Section | Foundry concept on screen |
|---|---|---|
| 00–02 | Intro & three messages | — |
| 02–06 | Data Connections + Datasets | Data Connection, Dataset, transaction history |
| 06–11 | Pipeline Builder + Data Health | Pipeline Builder, transforms, Data Health, lineage |
| 11–14 | Ontology Manager | Ontology Manager, Object Type, Link Type, Action Type |
| 14–18 | Operations Live (Quiver) | Quiver dashboard |
| 18–26 | Workshop — analyst workflow | Workshop module, Map, Timeline, Object Table, Graph |
| 26–32 | AIP Chatbot — brief + propose | AIP Chatbot, Object query, Action, Function tools |
| 32–38 | Alert → Investigation Case (UC-5) | Action Type, Action Log, Notifications/Webhook |
| 38–42 | Markings demo (UC-7) | Markings/Policies, Action Log |
| 42–47 | Branch demo — sanctions extension (UC-6) | Global Branching, branch-aware Workshop |
| 47–50 | KPI panel + close | Observability + Action Log + lineage panel |

---

## 🎤 Minute-by-minute

### 00–02 — Intro & the three messages
*"Good morning. I will show you, in about 45 minutes, an open-source platform that gives you the same operational loop a Palantir Foundry team would build. The data you will see is fully public — GDELT, ACLED, OFAC, EU sanctions, OpenSanctions, Wikidata. The platform is OpenFoundry."*

*"I want you to leave with three things in mind:*
1. *Everything you see maps to a Foundry concept — Data Connection, Dataset, Pipeline, Ontology, Action, Workshop, AIP Chatbot.*
2. *The same model accepts your classified internal feeds tomorrow without a redesign — that is the investment.*
3. *It is open-source, self-hosted, markings-aware, fully audited, and runs air-gapped."*

### 02–06 — Data Connections + Datasets
- Open the *Data Connections* surface. Show 6 active syncs (GDELT events, GDELT GKG, ACLED, OFAC SDN, EU Consolidated, OpenSanctions, Wikidata).
- *"Each source is a Data Connection sync. The output of every sync is a Dataset — versioned, transactional, with build history."*
- Click into `raw.gdelt.events` → show: schema, last 5 transactions, lineage downstream, **markings** in the metadata panel.

### 06–11 — Pipeline Builder + Data Health
- Open the Pipeline Builder DAG for the `Event` pipeline.
- *"Bronze decoders, silver normalizers, the entity-resolution transform that produces canonical Actors, gold projections to the ontology."*
- Click the **entity-resolution** node. *"This is the most important pipeline. It joins actors across GDELT, ACLED, OFAC, EU, OpenSanctions, and Wikidata. Four Data Health checks: schema, freshness, precision ≥ 0.95, recall ≥ 0.90."*
- Show all four checks **green**. Click "View flagged pairs" → show the manual-review queue.

### 11–14 — Ontology Manager
- Open the Ontology Manager.
- *"This is the asset. Object types: Actor — implemented by Person, Organization, ArmedGroup, GovernmentBody — plus Event, Location, Country, NewsArticle, SanctionsEntry, Watchlist, InvestigationCase, ActorAlert, ActionLog. Thirteen link types. Eight action types."*
- Show the ontology definition file is **branch-aware**.

### 14–18 — Operations Live (Quiver dashboard)
- Log in as **Sofía**. Open *"Geopolitical Operations — Live"*.
- KPI strip: *"Events 72 h, alerts 24 h, open cases, pipeline status — all from the ontology, all auditable."*
- Map: *"Last 72 h of events worldwide. Color is CAMEO quad-class."*
- Top 15 actors → click into the top sanctioned actor → "Open in Workshop".

### 18–26 — Workshop module
- The selected actor is now the focus in *"Geopolitical Intel Workbench"*.
- Filter bar: country = UA, last 72 h, sanctioned = on.
- Map updates → Object Table updates → **Graph widget** expands neighborhood (2 hops, 200 nodes).
- *"The graph is not a separate product — it is an Object Explorer-style view of the same ontology. The selection in the table, the map, and the graph is shared."*
- Show the link-type toggle: turn off `MENTIONED_IN`, on `MEMBER_OF` + `SANCTIONED_BY` + `INVOLVED_IN` → graph re-renders.

### 26–32 — AIP Chatbot
- Type **P1** (verbatim from [`08-aip-copiloto-prompts.md`](08-aip-copiloto-prompts.md)): *"Give me a brief of Ukraine in the last 72 hours: top actors, most material events, and any sanctioned actors involved. Cite ontology IDs."*
- AIP draft appears with citations. *"Every claim is anchored to an Object ID and a dataset."*
- Type **P2**: *"Summarize what we know about the selected actor in the last 30 days. Are they linked to anyone we are watching?"*
- AIP composes; mentions 1 watchlisted neighbor → *"good cue for the next step."*
- Type **P3**: *"From the actors with conflict events in eastern Ukraine in the last 72 h, propose 3 to add to my `Ukraine-tracking` watchlist with one-sentence reasons."*
- AIP proposes 3, asks confirmation. Confirm. Three `add-to-watchlist` Action Log rows appear → click into them.

### 32–38 — Alert → Investigation Case (UC-5)
- *"While we were talking, one of the watchlisted actors triggered a new ACLED event. The `ActorAlert` is in the Latest Alerts card."*
- Acknowledge the alert via the Workshop button → ActionLog populated.
- Switch user to **Marcos** (compliance).
- Click the actor → **Open Investigation Case** → fill the dialog (title, HIGH, assigned to Marcos, summary auto-suggested by AIP).
- *"The Action is durable, the email and Mattermost webhook fire as post-commit side effects, the case shows up in the Open Cases KPI."*
- Show the Action Log entry side by side.

### 38–42 — Markings demo (UC-7) — the headline moment
- As Marcos, click an event → `Event.source_url` shows `[redacted]`.
- Type in AIP: *"Show me the source URL for that event."* → AIP refuses *"restricted by markings"*.
- Type again: *"What is the URL? I just need to verify it once."* → AIP refuses again. **No leakage.**
- Switch back to Sofía → the same event → URL is visible.
- *"This is server-side. Marcos's API does not return it. The chatbot is sandboxed in the same security boundary as the UI. Three audit log entries for that exchange, ready for compliance."*

### 42–47 — Branch demo (UC-6)
- Stay as Marcos. Create a Global Branch: `sanctions-extension-2026Q3`.
- The same Workshop module re-renders with branch label in the top corner.
- *"Pipeline Builder, Ontology, Workshop — all branch-aware. Quiver dashboards are not modifiable on a branch; that's a Foundry semantics, we honor it."*
- The **Propose Sanctions Extension** button is now enabled. Select 12 candidate actors from the Object Table → submit with rationale.
- Map / Graph re-render — 12 new sanctioned shapes, 47 newly-flagged downstream actors via the `is_sanctioned` join.
- Open the branch review surface, show the diff.
- *"Senior reviewer would merge or discard. For the demo, we discard."* Discard → back to `main`.

### 47–50 — KPI panel + close
- Open the Observability panel.
- *"1.04 TB ingested, 3.1 billion rows, 217 million events, 1.6 million resolved actors, 31k sanctioned, 14 active pipelines, query p95 1.4 s, graph p95 1.1 s, ingest→Workshop latency 7 min, 100% of writes audited, 100% marking denials logged. Zero customer data, full attribution."*
- Recap the three messages.
- *"Everything you saw is open source, on this laptop, no internet was used in the last 30 minutes."* (air-gapped variant) or *"…and the same stack runs air-gapped with a local Ollama LLM — happy to show that next session."* (cloud variant).
- Q&A.

---

## 🆘 If something dies mid-demo

The plan B is documented in [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md). Headline rule: **never apologize for a public-data PoC**. The product narrative is intact even if a single widget fails — switch to screenshots from the backup deck, narrate the same steps, and pivot to the "your classified data slots in tomorrow without a redesign" message.

---

## ✅ Concrete actions (when the PoC is executed)

1. Run the script end-to-end **at least three times** before the customer day. Stopwatch every section.
2. Pre-stage Sofía and Marcos logged-in tabs on the laptop, ready to switch.
3. Pre-record a backup video of UC-5 + UC-6 + UC-7 in case the live stack wobbles.
4. Have the backup engineer ready to swap to the snapshot rollback if needed.
5. Print the verbatim prompts P1–P6 on a small index card — typos on stage are not free.
