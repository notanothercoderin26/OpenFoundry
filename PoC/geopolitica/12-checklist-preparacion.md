# 12 — Preparation checklist

> Concrete tasks at T-30, T-7, T-1 and T-0 days before the demo. Tick every box. The presenter does not improvise — if a box is unchecked at T-0, follow [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md).

---

## 🗓 T-30 days — discovery and decisions

- [ ] Confirm the **vertical** with the customer. If they are not a fit for geopolitical intelligence, redirect to [`../aviacion/`](../aviacion/) or escalate.
- [ ] Confirm **deployment mode**: cloud (default) or air-gapped. This drives the LLM provider and the network plan in [`04-infraestructura-y-despliegue.md`](04-infraestructura-y-despliegue.md).
- [ ] Confirm whether the customer's room **has internet**. If air-gapped on their side, force the air-gapped variant.
- [ ] Confirm the **time window** for the simulated demo day (last X days of data must be dense in events for the country / region you will focus on).
- [ ] Confirm the **focus country / region** for the script (default: Ukraine; verify with customer it is appropriate).
- [ ] Confirm **3 messages** the customer must take home (from [`01-vision-y-caso-de-uso.md`](01-vision-y-caso-de-uso.md)).
- [ ] Create accounts: ACLED (API), OpenSanctions if commercial edition is needed (out of scope for PoC; standard edition is free), Azure OpenAI or Ollama model pull.
- [ ] Provision the demo VM or workstation per [`04-infraestructura-y-despliegue.md`](04-infraestructura-y-despliegue.md).
- [ ] Kick off the **dataset downloads** (GDELT 12-month is the long pole — 4–6 days).

---

## 🗓 T-7 days — stack up and load

- [ ] All data downloads complete; total volume ≥ 1.0 TB; `aws s3 ls --summarize --human-readable` snapshot saved.
- [ ] All raw ingests applied **markings** correctly (verify by querying as Sofía and Marcos).
- [ ] All bronze → silver → gold pipelines built green. Specifically:
  - [ ] `entity-resolution`: 4/4 Data Health checks green; precision ≥ 0.95, recall ≥ 0.90 on the hand-labeled set.
  - [ ] `event-union-and-normalize`: FK presence rate ≥ 95%, geocoder ≥ 90%.
  - [ ] `sanctions-aggregator`: no silent drops vs. prior snapshot.
- [ ] Ontology definition (`PoC/geopolitica/assets/ontology-geopolitica.yaml`) loaded and the 4 sample queries from [`05-ontologia-geopolitica.md`](05-ontologia-geopolitica.md) return the expected row counts.
- [ ] **B03 G2 — Workshop pushdown live.** The `selectedActorSet` variable in [`assets/workshop-module.json`](assets/workshop-module.json) carries `metadata.use_search_backend: true`; the actor filter list + actor object table read through `POST /api/v1/ontology/search` (Vespa-backed) and not through the Cassandra-backed object-database query. Smoke-verify by tailing `ontology-query-service` logs while flipping a country filter — every flip must emit a `/ontology/search` access-log line, zero `/objects` ones.
- [ ] **B03 G3 — Indexer status surface live.** `GET /api/v1/ontology-indexer/status?objectType=Event&tenant=<demo>` returns `state=live`, `lag_seconds < 60` for every Event / Actor / NewsArticle / SanctionsEntry type before the demo starts.
- [ ] **B03 G5 — Reindex command rehearsed.** `POST /api/v1/ontology-indexer/reindex?object_type=Event` replays Cassandra → Vespa green; final `indexed_count` matches `object-database-service` row count for the type. Required so we can recover between rehearsals if the Vespa volume is wiped.
- [ ] Quiver dashboard and Workshop module configurations loaded; widgets render with seed data.
- [ ] AIP Chatbot tools registered, all 13 tools resolve to the right endpoints, prompts P1–P6 succeed end-to-end.
- [ ] Action permissions and markings registered in `authorization-policy-service`. Sofía/Marcos accounts created with correct roles and marking claims.
- [ ] Notifications: SMTP / in-app / webhook channels configured; the Mattermost / Slack hook reaches a demo channel and round-trips.
- [ ] Backup video recorded: UC-5 (alert→case), UC-6 (branch), UC-7 (markings) — 30–60 s each.
- [ ] Backup deck: screenshots of every Workshop card, every AIP response P1–P6, every Action Log row, every lineage view.

---

## 🗓 T-1 day — final rehearsal

- [ ] **Three full run-throughs** of the script in [`11-guion-demo.md`](11-guion-demo.md), in the demo room (or as close as possible), on the demo laptop. Stopwatch every section.
- [ ] Every Action Log row produced during rehearsal is **deleted** (or moved to a rehearsal branch) so the demo box is clean.
- [ ] **Snapshot** the demo box (full disk / S3 + Postgres + MinIO dump). This is the rollback if anything wedges.
- [ ] Verify cold start time: stop all services, restart, all `/healthz` green within < 3 min.
- [ ] Verify the GDELT live ingest is working **right now** (cloud variant) or the recorded fixture is replaying correctly (air-gapped variant).
- [ ] Pre-position browser tabs:
  - Tab 1: Quiver dashboard (Sofía logged in)
  - Tab 2: Workshop "Geopolitical Intel Workbench" (Sofía)
  - Tab 3: Pipeline Builder DAG with the entity-resolution node selected
  - Tab 4: Ontology Manager
  - Tab 5: Action Log query
  - Tab 6: Marcos's session (separate browser profile or incognito)
- [ ] Print the index card with prompts P1–P6 verbatim.
- [ ] Confirm with the backup engineer: their role during the demo, the rollback command, the "narrate over screenshots" cue.

---

## 🗓 T-0 day — demo day

### T-0 morning (3+ hours before)
- [ ] Demo box up and healthy: every service `/healthz` green.
- [ ] All four Data Health checks on `entity-resolution` still green.
- [ ] GDELT live ingest delivering new rows (cloud) or fixture replay running (air-gapped).
- [ ] Sofía and Marcos can both log in; AIP responds to a smoke prompt.
- [ ] Empty the Action Log of any morning-of test rows (or move them to a hidden rehearsal branch).

### T-0 90 min before
- [ ] Run **the markings demo manually end-to-end**. If it fails, halt, fix, re-snapshot. This is the single most demo-critical assertion.
- [ ] Run UC-5 and UC-6 manually end-to-end.
- [ ] Backup video + screenshots accessible from the laptop **and** a USB stick.

### T-0 15 min before
- [ ] Browser tabs pre-positioned per T-1 list.
- [ ] Network test: webhook to demo Mattermost channel arrives within 5 s (or, if air-gapped, the local in-app notification arrives within 2 s).
- [ ] Volume settings, screen-sharing resolution checked.
- [ ] Index card visible.
- [ ] Phone on silent.

### T-0 during the demo
- [ ] Stick to the script in [`11-guion-demo.md`](11-guion-demo.md). Do **not** improvise pipeline edits or ad-hoc AIP prompts the customer suggests — those are for the Q&A.
- [ ] If anything wedges, hand off to the backup engineer per [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md).

### T-0 after the demo
- [ ] Capture the Action Log entries produced during the demo as evidence.
- [ ] Save the KPI panel screenshot.
- [ ] Send a follow-up within 24 h linking to the documents in this PoC the customer is allowed to read.

---

## ✅ Concrete actions (high level)

1. Owner: the engineer running the demo. Backup: a second engineer in the room.
2. The checklist is the bar. If 1 item is unchecked at T-1, you do not run the demo at T-0.
3. Treat the rehearsals as production — every Action Log row generated during rehearsal must be accounted for, never left as noise in the customer-facing surface.
