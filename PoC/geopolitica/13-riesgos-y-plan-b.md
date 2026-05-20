# 13 — Risks and plan B

> Honest catalog of what can go wrong, what the symptoms look like, and the recorded plan B in each case. The principle: **never apologize for a public-data PoC, never claim parity for what is not built, never improvise on stage**.

---

## 🟥 The biggest single risk — the customer dismisses the value pitch

**Symptom.** The customer says, halfway through, *"this I can do with Elastic + Kibana + Neo4j."*

**Why it's likely.** A PoC on public data has a low ceiling. The visualization is the most visible thing on screen — but the visualization is not what we sell.

**Plan B (rhetorical, mid-demo).**

> *"Fair challenge. Two things separate this from Elastic + Kibana + Neo4j. First, what you are seeing is the Ontology — Object Types, Link Types, Action Types — with versioned datasets, lineage, Data Health, and Markings consistently enforced from the dataset row to the chatbot answer. That is the durable asset. Second, the same ontology accepts your classified internal feeds tomorrow without redoing the model — only a new Data Connection and a new marking. The investment is in the model and the governance. Let me show you the markings demo and then the lineage panel — that's where the comparison breaks down."*

Then jump straight to UC-7 (markings) followed by lineage. Do **not** add more dashboard candy.

**Pre-empt.** Open with the three messages (T-2 minutes of [`11-guion-demo.md`](11-guion-demo.md)) and repeat them at minute 47–50.

---

## 🟧 Live ingest stops mid-demo

**Symptom.** GDELT 15-min drop misses the window; the Map widget shows no new dots.

**Plan B.** Switch to the **recorded fixture** (the same fixture the air-gapped variant uses). The presenter says, *"GDELT publishes every 15 minutes — there is a natural cadence. We can replay the last 4 hours of drops in 30 seconds to make the cadence visible."* Trigger the replay. Continue.

**Pre-empt.** The fixture is always loaded (cloud variant uses it as a fallback). The replay command is on the index card.

---

## 🟧 Entity-resolution Data Health goes red the morning of the demo

**Symptom.** Precision drops below 0.95 on the `entity-resolution` transform — most often after a new OFAC SDN snapshot lands with a structural change.

**Plan B.** Rollback `curated.actor` to the last green build (a one-command revert against the dataset transaction history). The presenter shows this as a **feature**: *"every dataset is transactional and time-traveled — when an upstream source publishes a breaking change, you revert in seconds and your downstream ontology, your Workshop module, and your AIP responses recover instantly."*

**Pre-empt.** T-1 rehearsal snapshot exists. Rollback command tested at T-1.

---

## 🟧 The AIP chatbot hallucinates an actor or sanctions program

**Symptom.** AIP names a person or a program that does not exist in the ontology.

**Plan B.** This is the most expensive failure mode. The presenter must catch it. Recovery: *"that's a hallucination — let me ask it the same thing with the explicit ontology citation flag,"* re-issue the prompt with stricter system-prompt enforcement (a pre-staged config flag in `agent-runtime-service` raises the citation requirement). If still wrong, switch to the **pre-recorded video** of P1–P3 and narrate over it.

**Pre-empt.** T-1 rehearsal validates all of P1–P6 deterministically (using the same `seed=42` synthetic enrichment and the same time window). System-prompt enforces tool-only answers. Retrieval-context vector store is loaded before the demo and pinned.

---

## 🟧 Markings demo leaks a redacted value

**Symptom.** Marcos's AIP chat surfaces a `Event.source_url` it should not have, or paraphrases the URL ("it was a Reuters story about…").

**Plan B.** This **must not happen**. If it does on stage, the presenter must acknowledge it cleanly and pivot — do **not** try to recover by re-prompting. Say: *"that's a leak via paraphrase — exactly the kind of failure mode markings have to defeat. In production we tighten the system prompt and the retrieval-filter; in this room we caught it, and that's the test."* Then show the audit-log entry of the leak attempt to demonstrate detectability.

**Pre-empt.** T-1 rehearsal exercises P5 explicitly; the retrieval-context-service marking filter is verified server-side (the chatbot never receives the redacted value, so it cannot paraphrase it). If the rehearsal cannot guarantee this, the markings demo is **cut from the script** rather than risked on stage.

---

## 🟧 Branch demo fails to render branch-aware Workshop

**Symptom.** Branch is created, Pipeline Builder shows branch-aware nodes, but the Workshop module still renders `main` data.

**Plan B.** Switch to the **pre-recorded video** of UC-6. The presenter says *"branch propagation is consistent at the dataset and ontology layer; the Workshop branch rebase is a known semantic limitation that Foundry itself surfaces — we'll show the recorded path."*

**Pre-empt.** T-1 rehearsal must show branch propagation end-to-end at least once. If it does not, cut UC-6 from the live demo and present the video only.

---

## 🟨 Network failure (cloud variant only)

**Symptom.** Azure OpenAI request hangs; webhook to Mattermost fails.

**Plan B.** Flip the `llm-catalog-service` config to the **Ollama-local** provider (the air-gapped variant is always installed as a fallback on the demo box). The presenter notes *"we just switched to the on-box LLM — same prompts, same answers, no internet."* For the webhook, the in-app notification still fires.

**Pre-empt.** Ollama is always running on the demo box, even in cloud mode. The provider flip is a one-line config change tested at T-1.

---

## 🟨 A single OpenFoundry service crashes

**Symptom.** `ontology-query-service` (or another) returns 500s; widgets render empty.

**Plan B.** The backup engineer restarts the service (one-line `docker compose restart <svc>`). If the failure repeats, **rollback to the snapshot** and restart the demo from the affected section. The presenter narrates the snapshot-rollback as a deliberate demonstration of operability.

**Pre-empt.** Snapshot exists from T-1. Restart commands per-service are on the backup engineer's index card.

---

## 🟨 Customer asks a Foundry-feature question we cannot answer

**Symptom.** Customer asks *"how does this compare to Foundry's Object Storage v2?"* or *"can I do X in Quiver?"*

**Plan B.** Honest answer: *"I won't claim parity with a Foundry feature we have not validated. The OpenFoundry implementation around X is documented at [link]; for true parity questions we test against a Foundry environment, not from memory."*

**Pre-empt.** The presenter reads the Foundry public-doc baseline at the top of [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md) the day before. Pages are scraped locally (per `aviacion/blockers/seed-urls.txt` pattern; equivalent seed list for geopolitica is a follow-on).

---

## 🟨 ACLED commercial-license question

**Symptom.** Customer asks *"can we use ACLED in production?"*

**Plan B.** Answer honestly: *"ACLED is free for academic and non-commercial use; commercial deployments require an ACLED license. For a pilot with you, we'd budget that license. The PoC runs under the academic license — the demo box does not call ACLED's API in front of you; the data was pulled under the academic terms beforehand."*

**Pre-empt.** This phrasing is on the index card.

---

## 🟢 The "what about classified?" question (this is good, not bad)

**Symptom.** Customer asks the air-gapped or classified-data question early.

**Why it's good.** It means they are mentally past the public-data layer. Use it.

**Response.** Move directly into the **public → classified migration story** in [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md). Then switch (if you are on the cloud variant) to a screen-share that shows the air-gapped variant is the same product, only the LLM provider and the object-store backend flip.

---

## 🆘 Universal abort

If multiple things go wrong simultaneously (e.g. data + AIP + branch), the presenter:
1. Pauses for 10 seconds. Breathes.
2. Says: *"I'm going to switch to a recorded run-through — the live stack is on this laptop and we will return to it after."*
3. Switches to the backup deck + videos and finishes the narrative.
4. Returns to live stack for Q&A only.

There is no "improvising the entire demo from scratch." The script + the videos + the screenshots are the full deliverable.

---

## ✅ Concrete actions (when the PoC is executed)

1. Treat this file as a **read-aloud script** during the T-1 rehearsal: for each risk, simulate it and confirm the plan B works.
2. Maintain the backup deck + videos as part of the PoC artifact set; ship them with every demo.
3. After each demo, capture the failures observed (if any) into this file as new risks + new plan Bs.
