# 12 — Preparation checklist

> Actionable checklist. Tick off as completed. Milestones at **T-30 days, T-7, T-1, T-0**. If at T-7 there are > 5 unchecked items from T-30, **postpone the demo**.

---

## 📅 T-30 days — Foundation

### Decisions
- [ ] Confirm demo date and time with the customer.
- [ ] Confirm format (in-person / remote / hybrid).
- [ ] Confirm language (ES/EN) and translate prompts if applicable.
- [ ] Confirm that the OpenFoundry MVP has the ~17 services of the subset bootable (see [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md) §Layer 2).

### Infra
- [ ] Choose option A/B/C from [`04-infraestructura-y-despliegue.md`](04-infraestructura-y-despliegue.md).
- [ ] If C: provision a dedicated AWS account + budget alert ($500/week).
- [ ] If B: order a Hetzner AX102 + mount disks.
- [ ] Register the domains `poc.openfoundry.dev` and `keycloak.poc.openfoundry.dev`.

### Data
- [ ] Create an OpenSky account (Trino access confirmed).
- [ ] Request EUROCONTROL R&D access (takes 1–2 weeks).
- [ ] Verify access to NOAA S3 buckets (no credentials required).
- [ ] Generate and sign a usage license for OurAirports (ODbL).

### Services
- [ ] `go build ./services/<each service in the subset>` → 100% green (alternative: `make build-services` and verify each subset binary exists in `./bin/`).
- [ ] Create `infra/docker-compose.poc-aviation.yml` with the ~17 services + dependencies (Postgres CNPG, Kafka Strimzi, Cassandra, Lakekeeper, Vespa, Temporal if applicable).
- [ ] Create (if C) `infra/terraform/poc-aviation/` + `values.yaml` for the Helm releases `of-platform`/`of-data-engine`/`of-ontology`/`of-ml-aip`/`of-apps-ops`/`of-web`.

---

## 📅 T-21 days — Build

### Pipelines and data
- [ ] Kick off batch downloads:
  - [ ] OpenSky historical 12 months (~600 GB).
  - [ ] NOAA HRRR 6 months CONUS (~250 GB).
  - [ ] NOAA GFS 6 months Europe (~150 GB).
  - [ ] BTS 2018–2024 (~50 GB).
  - [ ] FAA Registry, OurAirports.
- [ ] Verify `aws s3 ls --summarize`: ≥ 1.0 TB under `s3://acme-poc/raw/`.
- [ ] Implement and run `tools/poc-aviation/generate_mro.py` (250M rows).
- [ ] Materialize bronze pipelines (run `bz-*`).
- [ ] Materialize silver and gold pipelines.

### Ontology
- [ ] Materialize `PoC/assets/ontology-aviation.yaml`.
- [ ] Load into `ontology-definition-service`.
- [ ] Validate 3 example queries (see `05-ontologia-aviacion.md` §Examples).

### Model
- [ ] Train `delay_risk_predictor`.
- [ ] Validate AUC > 0.75 on BTS 2024 holdout.
- [ ] Register in `model-catalog-service` and publish via `model-deployment-service` (lib `ml-kernel-go`).

---

## 📅 T-14 days — UX and Workflows

### UI
- [ ] Implement Operations Live (3 screens P1, P2, P3 in `apps/web` — React 19 + Vite).
- [ ] Materialize the Workshop App `mro-triage-workbench` in `application-composition-service`.
- [ ] Performance: Lighthouse score > 80 on each screen.

### Workflows
- [ ] Materialize `mro-inspection.yaml`, `order-critical-parts.yaml`, `weather-disruption-response.yaml`.
- [ ] Load into `workflow-automation-service`.
- [ ] Smoke test: trigger `flag-aircraft-for-inspection` → full workflow in < 30 s.

### Copilot
- [ ] Configure Ollama with Llama 3.1 70B (40 GB download; allow time).
- [ ] Configure Azure OpenAI fallback in `llm-catalog-service`.
- [ ] Load system prompt into `agent-runtime-service`.
- [ ] Register the 10 MCP tools in the `agent-runtime-service` tool registry (there is no separate MCP binary).

### Security
- [ ] Create the Keycloak realm `openfoundry-poc`.
- [ ] Create the 5 users.
- [ ] Load the YAML policy.
- [ ] Test the RBAC matrix (script `tools/poc-aviation/test_rbac.sh`).

---

## 📅 T-7 days — Hardening

### Validation
- [ ] Run end-to-end smoke tests (script `tools/poc-aviation/smoke.sh`; alternative: the monorepo already has `smoke/chaos/run.sh` invoked by `chaos-smoke.yml`):
  - [ ] Login for the 5 users.
  - [ ] Each screen renders in < 3 s.
  - [ ] 3 ontology queries in < 2 s.
  - [ ] Full `mro-inspection` workflow in < 30 s.
  - [ ] All 7 copilot prompts D1–D7 OK.
  - [ ] 2 "attack" prompts blocked.
- [ ] Validate the audit log is immutable (attempt to delete and fail).
- [ ] Validate branch + diff + merge + rollback.

### Observability
- [ ] 3 Grafana dashboards working with real data.
- [ ] Screenshot of the "final numbers" dashboard (Act 7).

### Caching and plan B
- [ ] Generate `PoC/assets/aip-cache/D1..D7.md` from real responses.
- [ ] Test replay mode with the LLM network cut off.
- [ ] Record the plan B video (10 min, see [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md)).

### Rehearsals
- [ ] **Rehearsal 1**: 1 person, no audience.
- [ ] **Rehearsal 2**: with a colleague asking customer-style questions.
- [ ] **Rehearsal 3**: with simulated slow network (`tc qdisc add dev eth0 root netem delay 200ms`).

---

## 📅 T-1 day — Lock down

### System state
- [ ] **Full snapshot** of the environment (AMI or volume).
- [ ] Freeze any deploy / change.
- [ ] Confirm that the `feat/risk-model-v2` branch is created and populated.
- [ ] Confirm there is live OpenSky traffic coming in (verify Kafka lag < 10 s).

### Logistics
- [ ] Confirm the Zoom/Meet link / physical room.
- [ ] Reminder to the customer with agenda and link.
- [ ] List of attendees and their roles (for personalized commentary).
- [ ] Have a mobile phone with data as backup network (hotspot).
- [ ] Charge laptop to 100% + charger.

### Materials
- [ ] Printable PDF of the script (`11-guion-demo.md`).
- [ ] Browser tabs pre-opened in order.
- [ ] Plan B video downloaded locally (no streaming).
- [ ] Slides: title + 3 key messages + closing numbers + Q&A + thank-you.

### Security
- [ ] Rotate passwords for the 5 users (the previous ones may be in logs).
- [ ] Verify that the audit bucket is **append-only**.
- [ ] Verify `.env` is not committed: `git status` clean.

---

## 📅 T-0 (demo day)

### 2 hours before
- [ ] Bring up the full stack (`docker compose up -d`).
- [ ] Wait for green healthchecks (target < 4 min for the ~17 services).
- [ ] Quick smoke test (`tools/poc-aviation/smoke.sh --quick`).
- [ ] Warm up the copilot cache: run D1–D7 once.
- [ ] Verify OpenSky live polling.

### 30 min before
- [ ] Close all unnecessary apps on the laptop.
- [ ] "Do not disturb" mode on system and phone.
- [ ] Test screen share (resolution 1920×1080, scaling 100%).
- [ ] Audio test.
- [ ] Coffee 🙂.

### During
- [ ] Stick to the script. No improvised prompts.
- [ ] If something fails → see `13-riesgos-y-plan-b.md` and apply the contingency silently.

### After
- [ ] Q&A notes in a separate doc.
- [ ] Screenshots of key moments.
- [ ] Final system snapshot (in case there's a customer follow-up).
- [ ] Shut down (if C) cloud resources to save money.
- [ ] Send to the customer: thanks + 1 PDF summary + 1 clear question for next step.

---

## ✅ "Go / no-go" criterion at T-7

The demo runs only if **ALL** of these are green at T-7:
- [ ] The ~17-service subset boots and passes healthchecks (`/healthz` for each).
- [ ] Data volume ≥ 1.0 TB confirmed.
- [ ] Ontology loaded and queries < 2 s.
- [ ] 7 copilot prompts produce valid responses.
- [ ] 1 full end-to-end workflow < 30 s.
- [ ] Immutable audit log validated.
- [ ] Plan B video recorded.

If **one** fails → postpone the demo 1 week, non-negotiable.
