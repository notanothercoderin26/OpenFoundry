# 13 — Risks and plan B

> Honest catalog of what can go wrong in the 15-minute demo, what the symptoms look like, and the recorded plan B in each case. The principle: **never apologize for a public-data PoC, never claim parity for what is not built, never improvise on stage**.

---

## 🟥 The biggest single risk — the customer dismisses the value pitch

**Symptom.** The customer (a senior police officer, often a deputy chief) says, halfway through, *"this I can already do with Excel + ArcGIS + Power BI."*

**Why it's likely.** A police commander has seen 10 dashboard products. The visualization is the most visible thing on screen — and the visualization is **not** what we sell.

**Plan B (rhetorical, mid-demo).**

> *"Fair challenge. Three things separate this from Excel + ArcGIS + Power BI. First, what you are seeing is the Ontology — Incident, Neighborhood, Shift, ReinforcementZone, TacticalBriefing — with versioned datasets, lineage, Data Health, and Markings consistently enforced from the dataset row to the chatbot answer. The dashboard is the surface; the ontology is the durable asset. Second, every operational write — every reinforcement zone, every briefing, every alert acknowledgment — is in the Action Log with the policy decisions that allowed it; you cannot reproduce that pivot in Excel. Third, the same ontology accepts your internal CAD/AVL feeds tomorrow without redoing the model — only a new Data Connection and a new marking. Let me show you the markings demo and then the Action Log pivot — that's where the comparison breaks down."*

Then jump straight to UC-7 (markings) followed by the Action Log deep link. Do **not** add more dashboard candy.

**Pre-empt.** Open with the three messages (T-0 minute of [`11-guion-demo.md`](11-guion-demo.md)) and repeat them in the close panel at minute 13–15.

---

## 🟧 The forecast model is not better than baseline on the demo day

**Symptom.** XGBoost MAE is within +0.5 of the naive baseline or, worse, above it. We knew this was possible — the urban incident series is noisy at neighborhood × shift grain.

**Plan B.** **Narrate it honestly on stage.** The presenter says:

> *"You'll notice that on this slice of public data, the model does not materially beat the naive baseline — same neighborhood, same shift, same day-of-week 30-day mean. We show you both numbers because that is the only honest way to talk to a police commander about a forecast. The platform value is not the model — the platform value is the loop: alert → reinforcement zone → after-action close → Action Log, with markings enforced and the AIP grounded in the ontology. The model is replaceable; the platform is what you'd actually procure."*

Pivot to the Action Log + the markings demo. The 15-minute structure absorbs this gracefully because the model is in the **close panel**, not the spine of the script.

**Pre-empt.** T-7 checklist measures the MAE delta and saves both numbers; the close panel always shows both, never just the model number. If MAE delta is worse than baseline + 0.5, the demo presents the model as "baseline-equivalent" from minute 1, not a surprise at minute 13.

---

## 🟧 AIP hallucinates a neighborhood

**Symptom.** The AIP names a neighborhood that does not exist in Barcelona (the 73 are fixed), or paraphrases one ("the Raval-adjacent area"), or invents an incident type.

**Plan B.** This is the most expensive failure mode for a police audience. The presenter must catch it. Recovery: *"that's a hallucination — let me re-issue the prompt with the explicit citation flag,"* re-issue against the same `seed=42` frozen window (a one-line config flag in `agent-runtime-service` raises the citation requirement). If it hallucinates again, **switch to the pre-recorded video** of P1–P5 and narrate over it.

**Pre-empt.** T-1 rehearsal validates all of P1–P5 deterministically against `seed=42` and the frozen window `2026-05-15..2026-05-22`. System-prompt enforces tool-only answers and ontology-ID citation. The 73 Neighborhood names are loaded into the retrieval-context cheat-sheet so the model has them grounded.

---

## 🟧 Markings leak via paraphrase

**Symptom.** Anna's or Jordi's AIP chat surfaces a `PII-RESIDENT` value it should not have, or paraphrases ("the demographic skew of Raval is younger…") in a way that leaks the underlying value.

**Plan B.** This **must not happen**. If it does on stage, the presenter must acknowledge it cleanly and pivot — do **not** try to recover by re-prompting. Say:

> *"That's a leak via paraphrase — exactly the kind of failure mode markings have to defeat. In production we tighten the system prompt and the retrieval-filter; in this room we caught it, and that's the test. Let me show you the audit log of the leak attempt — that's what we'd be triaging tomorrow."*

Then pivot to the **Action Log** entry of the leak attempt, narrating the policy decision and the corrective workflow.

**Pre-empt.** T-1 rehearsal exercises P5 explicitly with 10 rephrasings; the `retrieval-context-service` marking filter is verified server-side (the chatbot never receives the redacted value, so it cannot paraphrase what it cannot see). If the rehearsal cannot guarantee this, the markings demo is **cut from the script** rather than risked on stage.

---

## 🟧 Branch demo (UC-6) does not propagate to Workshop

**Symptom.** Branch is created, Pipeline Builder shows branch-aware nodes, but the Workshop module still renders `main` data — Anna does not see the proposed chronic-priority neighborhoods highlighted.

**Plan B.** **Switch to the pre-recorded video** of UC-6. The presenter says:

> *"Branch propagation is consistent at the dataset and ontology layer; the Workshop branch rebase is a known semantic limitation that Foundry itself surfaces — we'll show the recorded path."*

**Pre-empt.** T-1 rehearsal must show branch propagation end-to-end at least once. If it does not, cut UC-6 from the live demo and present the video only — the 15-minute script can be re-balanced to give those 90 seconds back to the markings demo.

---

## 🟧 Live AVL/CAD fixture stops mid-demo

**Symptom.** The synthetic CAD fixture replay halts; the alert in UC-5 does not appear on time.

**Plan B.** The replay command is on the index card. The presenter triggers it manually: *"Let me replay the last hour of dispatch data — there is a natural 60-second cadence."* Within 60 seconds the alert appears.

**Pre-empt.** The fixture is always loaded. The replay command is `make poc-su-cad-replay` (or equivalent — registered in `infra/scripts/poc-seguridad-urbana/`). Index card line: `make poc-su-cad-replay`.

---

## 🟧 The customer asks about real Mossos / Policía Nacional data

**Symptom.** *"Why not show me real Mossos or Policía Nacional incidents? Wouldn't this be more credible?"*

**Plan B.** Honest answer:

> *"The data here is Guàrdia Urbana de Barcelona public open data — incidents handled by the municipal police, published under CC-BY 4.0 by the Ajuntament. We deliberately do not use Mossos d'Esquadra or Policía Nacional records: those are operational law-enforcement data under LO 7/2021 (the Spanish transposition of the Police Directive) and require a formal data-protection authorization and a Data Protection Impact Assessment before any pilot. That's a contracted next step, not a PoC step. What you saw works on public data; the ontology, the actions, the markings, and the AIP are unchanged when the data is real. Only the Data Connection sync and the marking labels change."*

**Pre-empt.** This phrasing is on the index card.

---

## 🟧 The customer asks about LOPDGDD

**Symptom.** *"How does this comply with LOPDGDD? With Article 22 on automated decisions?"*

**Plan B.** Answer cleanly from the position in [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md):

> *"Four points. One: lawful basis — all data here is published under public-interest task by the publisher; we ingest under their license. Two: data minimization — the forecast is at Neighborhood × Shift grain only; we deliberately do not score individuals or use sub-neighborhood demographics. Three: Article 22 — the forecast does not make decisions; a human commander always approves the reinforcement zone before it is written, and that approval is in the Action Log. Four: the `PII-RESIDENT` marking gates anything more granular than neighborhood-level aggregates, and the AIP refuses to surface it — you just saw that. For a pilot on internal CAD data we'd run a DPIA before any ingest; that's a separate contracted deliverable."*

**Pre-empt.** This sentence-by-sentence answer is on the index card.

---

## 🟨 Network failure (cloud variant only)

**Symptom.** Azure OpenAI request hangs; webhook to Mattermost fails.

**Plan B.** Flip the `llm-catalog-service` config to the **Ollama-local** provider (the air-gapped variant — `qwen2.5-14b-instruct` — is always installed as a fallback on the demo box). The presenter notes *"we just switched to the on-box LLM — same prompts, same answers, no internet."* For the webhook, the in-app notification still fires.

**Pre-empt.** Ollama is always running on the demo box, even in cloud mode. The provider flip is a one-line config change tested at T-1.

---

## 🟨 A single OpenFoundry service crashes

**Symptom.** `ontology-query-service` (or another) returns 500s; widgets render empty.

**Plan B.** The backup engineer restarts the service (one-line `docker compose restart <svc>`). If the failure repeats, **rollback to the T-1 snapshot** and restart the demo from the affected section. The presenter narrates the snapshot-rollback as a deliberate demonstration of operability.

**Pre-empt.** Snapshot exists from T-1. Restart commands per-service are on the backup engineer's index card.

---

## 🟢 The "what about air-gapped?" question (this is good, not bad)

**Symptom.** Customer asks the air-gapped or internal-data question early in the 15 minutes.

**Why it's good.** It means they are mentally past the public-data layer. Use it.

**Response.** Move directly into the **public → operational-data migration story** in [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md). If you are on the cloud variant, screen-share the air-gapped variant briefly — same product, only the LLM provider and the object-store backend flip.

---

## 🆘 Universal abort

If multiple things go wrong simultaneously (e.g. forecast model + AIP + branch), the presenter:
1. Pauses for 10 seconds. Breathes.
2. Says: *"I'm going to switch to a recorded run-through — the live stack is on this laptop and we will return to it after."*
3. Switches to the backup deck + videos and finishes the narrative.
4. Returns to live stack for Q&A only.

There is no "improvising the entire demo from scratch." The script + the videos + the screenshots are the full deliverable. The 15-minute format is unforgiving — there is no slack to recover a tangled live stack.

---

## ✅ Concrete actions (when the PoC is executed)

1. Treat this file as a **read-aloud script** during the T-1 rehearsal: for each risk, simulate it and confirm the plan B works.
2. Maintain the backup deck + videos as part of the PoC artifact set; ship them with every demo.
3. After each demo, capture the failures observed (if any) into this file as new risks + new plan Bs.
4. Always carry the index card: prompts P1–P5, the fixture replay command, the LLM provider-flip command, the LOPDGDD sentence-by-sentence answer, the Mossos-data honest answer.
