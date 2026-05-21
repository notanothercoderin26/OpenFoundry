# 12 — Preparation checklist

> Concrete tasks at T-30, T-7, T-1 and T-0 days before the 15-minute demo. Tick every box. The presenter does not improvise — if a box is unchecked at T-0, follow [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md).

---

## 🗓 T-30 days — discovery and decisions

- [ ] Confirm the **vertical** with the customer. If they are not a municipal police force, a public-safety analytics team, or a metropolitan emergency-management agency, redirect to [`../aviacion/`](../aviacion/) or [`../geopolitica/`](../geopolitica/).
- [ ] Confirm **deployment mode**: cloud (default) or air-gapped. This drives the LLM provider (`gpt-4o` vs `qwen2.5-14b-instruct`) and the network plan in [`04-infraestructura-y-despliegue.md`](04-infraestructura-y-despliegue.md).
- [ ] Confirm whether the customer's room **has internet**. If air-gapped on their side, force the air-gapped variant.
- [ ] Confirm the **target city** (default: Barcelona / Guàrdia Urbana profile). If the customer is in a different Spanish or EU city, narrate the demo on Barcelona data but be ready to translate the message.
- [ ] Confirm **3 messages** the customer must take home (from [`01-vision-y-caso-de-uso.md`](01-vision-y-caso-de-uso.md)).
- [ ] Create accounts: **AEMET API key registered** (free, requires email confirmation), Azure OpenAI tenancy ready (cloud variant) or Ollama model pull staged (air-gapped variant).
- [ ] Provision the demo VM or workstation per [`04-infraestructura-y-despliegue.md`](04-infraestructura-y-despliegue.md): 16 vCPU / 64 GiB RAM / 500 GB NVMe (cloud) or 16 CPU / 64 GiB / 1 TB NVMe (air-gapped).
- [ ] Kick off the **dataset downloads**:
  - [ ] Open Data BCN `incidents-gestionats-gub` 2020–2024 (CSV, ~1 M rows)
  - [ ] Open Data BCN `accidents-gu-bcn` 2020–2024 (CSV, ~50 k rows)
  - [ ] Open Data BCN neighborhoods (73) + districts (10) GeoJSON
  - [ ] **INE bulk download done** — census sections of Barcelona (~1.1 k rows)
  - [ ] AEMET OpenData — Barcelona hourly El Prat + Fabra, 2020–2024 (~80 k rows)
  - [ ] **GUB CSV mirror downloaded** locally (the BCN portal occasionally throttles — keep a copy)

---

## 🗓 T-7 days — stack up and load

- [ ] All data downloads complete; total raw volume ≈ 80 GB; `du -sh /data/raw` snapshot saved.
- [ ] **Synthetic AVL + CAD generated with `seed=42`**: ~50–70 GB AVL traces + ~3 M dispatch records. The seed is the same across rehearsals and the demo — if it drifts, deterministic prompt answers will drift too.
- [ ] All raw ingests applied **markings** correctly (`PUBLIC-OPENDATA` on the open sources; `OPS-CORE` on the synthetic operational layer; `ANALYST-CORE` on the synthetic incident-detail enrichment; `PII-RESIDENT` on the sub-neighborhood census joins).
- [ ] All bronze → silver → gold pipelines built green. Specifically:
  - [ ] `incident-normalize`: typology mapping ≥ 99.5 %, geocoder ≥ 95 % to a Neighborhood polygon.
  - [ ] `weather-join`: ≥ 95 % of incidents joined to an AEMET hourly observation within ± 1 h.
  - [ ] `census-coarsen`: every sub-neighborhood column either dropped or aggregated to Neighborhood level before the `PII-RESIDENT` marking is removed (it never is — the marking-strip is auditable and not approved).
- [ ] Ontology definition (`PoC/seguridad-urbana/assets/ontology-seguridad-urbana.yaml`) loaded; the sample queries from [`05-ontologia-seguridad-urbana.md`](05-ontologia-seguridad-urbana.md) return the expected row counts (73 Neighborhoods, 10 Districts, ~1 M Incidents, ~50 k TrafficAccidents).
- [ ] **Forecast model retrained** on the rehearsal dataset:
  - [ ] XGBoost run completes within the rehearsal window.
  - [ ] Poisson GLM fallback runs and the coefficients are saved for the explanation surface.
  - [ ] **MAE compared to the naive baseline** (same Neighborhood × same Shift × same day-of-week 30-day rolling mean). **Acceptance: model MAE ≤ baseline MAE + 0.5**. If the model is materially worse than baseline, halt — see plan B below. If it is within +0.5 but not strictly better, ship the demo and present the model as **"baseline-equivalent, with explainability and platform integration as the value-add"**, honestly.
  - [ ] Both numbers (model MAE and baseline MAE) saved for the close-panel KPI slide.
- [ ] Forecast horizon populated: 7 days × 73 Neighborhoods × 4 Shifts ≈ 2,044 predictions/day.
- [ ] Quiver dashboard `Urban Public-Safety Operations — Live` loaded; widgets render with seed data.
- [ ] AIP Chatbot tools registered, all 11 tools resolve to the right endpoints, prompts P1–P5 succeed end-to-end against the `seed=42` frozen window.
- [ ] **Accounts for Anna and Jordi provisioned** in Keycloak with the correct marking claims (`OPS-CORE` + `PUBLIC-OPENDATA` for Anna; `ANALYST-CORE` + `PUBLIC-OPENDATA` for Jordi). Senior commander + auditor also provisioned.
- [ ] Action permissions and markings registered in `authorization-policy-service` (see the matrix in [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md)).
- [ ] **Markings demo dry-run passes**: UC-7 steps 1–6 execute deterministically; the 4 marking-violation test cases all deny with no leakage.
- [ ] Notifications: SMTP (briefing PDF), in-app, Mattermost webhook all configured; the Mattermost hook reaches a demo channel and round-trips.
- [ ] Backup video recorded: UC-5 (alert → reinforcement), UC-6 (branch), UC-7 (markings) — 30–60 s each.
- [ ] Backup deck: screenshots of every Workshop card, every AIP response P1–P5, every Action Log row, every lineage view.

---

## 🗓 T-1 day — final rehearsal

- [ ] **The 15-minute script run 3 times with a stopwatch**, in the demo room (or as close as possible), on the demo laptop. Each run must finish in ≤ 15 minutes including the markings demo and the close panel. If any run goes over, cut content from the script (see [`11-guion-demo.md`](11-guion-demo.md)) — do not race the clock on stage.
- [ ] Every `ActionLog` row produced during rehearsal is **deleted** (or moved to a rehearsal branch) so the demo box is clean.
- [ ] **Snapshot** the demo box (full disk / Postgres + MinIO dump). This is the rollback if anything wedges.
- [ ] Verify cold start time: stop all services, restart, all `/healthz` green within < 3 min.
- [ ] Verify the synthetic AVL/CAD fixture is replaying correctly (60-second cadence; alert appears within 60 s of a spike).
- [ ] Pre-position browser tabs:
  - Tab 1: Quiver dashboard `Urban Public-Safety Operations — Live` (Anna logged in)
  - Tab 2: Workshop `Urban Public-Safety Operations` (Anna)
  - Tab 3: Pipeline Builder DAG with the `incident-normalize` + `weather-join` nodes selected
  - Tab 4: Ontology Manager
  - Tab 5: Action Log query
  - Tab 6: Jordi's session (separate browser profile or incognito)
- [ ] Print the index card with prompts P1–P5 verbatim + the fixture replay command.
- [ ] Confirm with the backup engineer: their role during the demo, the rollback command, the "narrate over screenshots" cue.

---

## 🗓 T-0 day — demo day

### T-0 morning (3+ hours before)
- [ ] Demo box up and healthy: every service `/healthz` green.
- [ ] Synthetic CAD fixture replay running.
- [ ] Anna and Jordi can both log in; AIP responds to a smoke prompt.
- [ ] Empty the Action Log of any morning-of test rows (or move them to a hidden rehearsal branch).

### T-0 90 min before
- [ ] Run **the markings demo manually end-to-end** (UC-7 steps 1–6 + the 4 violation test cases). If it fails, halt, fix, re-snapshot. This is the single most demo-critical assertion.
- [ ] Run UC-5 (alert → reinforcement) and UC-6 (branch) manually end-to-end.
- [ ] Backup video + screenshots accessible from the laptop **and** a USB stick.

### T-0 15 min before
- [ ] Browser tabs pre-positioned per T-1 list.
- [ ] Network test: webhook to demo Mattermost channel arrives within 5 s (or, if air-gapped, the local in-app notification arrives within 2 s).
- [ ] Volume settings, screen-sharing resolution checked.
- [ ] Index card visible (prompts P1–P5 + fixture replay + provider-flip command).
- [ ] Phone on silent.

### T-0 during the demo
- [ ] Stick to the 15-minute script in [`11-guion-demo.md`](11-guion-demo.md). Do **not** improvise pipeline edits or ad-hoc AIP prompts the customer suggests — those go on the follow-up card.
- [ ] If anything wedges, hand off to the backup engineer per [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md).

### T-0 after the demo
- [ ] Capture the Action Log entries produced during the demo as evidence.
- [ ] Save the KPI panel screenshot (the honest model-vs-baseline MAE numbers visible).
- [ ] Send a follow-up within 24 h linking to the documents in this PoC the customer is allowed to read.

---

## ✅ Concrete actions (high level)

1. Owner: the engineer running the demo. Backup: a second engineer in the room.
2. The checklist is the bar. If 1 item is unchecked at T-1, you do not run the demo at T-0.
3. Treat the 3 rehearsals as production — every Action Log row generated during rehearsal must be accounted for, never left as noise in the customer-facing surface.
4. The model-vs-baseline MAE comparison is run **honestly** at T-7 and shown on stage; if the model is not better than baseline, that's the talking point — not something to hide.
