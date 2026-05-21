# 09 — Workflows and actions

> Foundry models human-driven and event-driven processes as combinations of **Action Types**, **Functions / AIP Logic**, **Notifications**, and **Webhooks** (see [Action Types — overview](https://www.palantir.com/docs/foundry/action-types/use-actions/), [notifications](https://www.palantir.com/docs/foundry/action-types/notifications/), [webhooks](https://www.palantir.com/docs/foundry/action-types/webhooks)). OpenFoundry's `workflow-automation-service` + `ontology-actions-service` + `notification-alerting-service` implement this. Anything that does not map cleanly to those primitives is labeled **OpenFoundry emulation**.
>
> The workflow definitions + per-action side-effect matrix + notification templates are the declarative SOT in [`assets/workflows-seguridad-urbana.yaml`](assets/workflows-seguridad-urbana.yaml). The operator registers them via [`infra/scripts/poc-seguridad-urbana/register-workflows.sh`](../../infra/scripts/poc-seguridad-urbana/register-workflows.sh). Each definition round-trips into a valid `CreateWorkflowRequest` at `make test`, so YAML drift breaks CI rather than the demo. The YAML wins on drift with this doc.

The two main workflows demoed are:
- **Incident-alert → reinforcement** (UC-5; the real-time loop).
- **Daily-briefing cycle** (07:00 Europe/Madrid trigger; the routine loop).

A third workflow exists on a branch only:
- **Propose chronic-priority neighborhoods → Branch Preview → Senior Review → Merge or Discard** (UC-6).

---

## 🧭 Action Types — catalog

| Action Type | Parameters | Roles allowed | Side effects | Idempotency | Branch context |
|---|---|---|---|---|---|
| `mark-reinforcement-zone` | `neighborhood_ids[]`, `motive`, `start_at`, `end_at`, `shift` | `commander` | in-app to Jordi, webhook to Mattermost `#guardia-urbana-ops` | dedupe on `(neighborhood_id, shift, start_at)` for 60 s | `main` or branch (preview-only on branch) |
| `generate-daily-briefing` | `target_date`, `scope_districts?` | `commander` or `analyst` | SMTP (PDF attached) to briefing distribution list, in-app to Anna | dedupe on `(target_date, scope_hash)` for 5 min | `main` |
| `close-reinforcement-zone` | `outcome ∈ {EFFECTIVE, INCONCLUSIVE, NO_INCIDENTS, ESCALATED}`, `narrative` | `commander` (initiate) + `senior-commander` (approve) | in-app to opener + approver; SMTP to after-action distribution | dedupe on `zone_id` | `main` |
| `register-zone-outcome` | `incident_count_during_zone`, `narrative` | `commander` | in-app to opener; ActionLog row | dedupe on `zone_id` for the shift window | `main` |
| `acknowledge-incident-alert` | `alert_id`, `note?` | `commander` or `analyst` | — (ActionLog only) | dedupe on `alert_id` | `main` |
| `propose-chronic-priority` | `neighborhood_ids[]`, `rationale` | `commander` | in-app to senior reviewer | dedupe on `(branch_id, neighborhood_set_hash)` | **branch only** — server returns HTTP 409 if `branch_context == "main"` |

Retry policy across all action types: 3 retries with exponential back-off (250 ms → 1 s → 4 s) on transient failures (5xx, network). Permanent failures (4xx, policy rejection) do not retry; they still write an ActionLog row with `outcome ∈ {POLICY_REJECT, VALIDATION_FAIL}`.

Failure semantics: notifications and webhooks are **post-commit** side effects. If they fail, the ontology edit is still durable; the side-effect failure is logged in Data Health and re-driven from the outbox.

---

## 1️⃣ Incident-alert → reinforcement (UC-5, the live loop)

Trigger: a synthetic CAD feed produces an `IncidentAlert` (e.g. a cluster of dispatch calls exceeds a threshold for a Neighborhood within a Shift window). The alert is materialized to the ontology and a notification side-effect fires.

```
            ┌─────────────────────────────────────────────────────────────────┐
            │  cad-alert-generator pipeline (synthetic feed, every 60 s)      │
            │                                                                 │
synthetic ──▶ detect: dispatch-call cluster > threshold in Neighborhood × ───▶│
CAD feed    │  Shift window? ──▶ create IncidentAlert row ──▶ side effect:    │
            │      │             notification (in-app to Jordi, in-app to     │
            │      │             Anna)                                         │
            │      └─── RAISED_FOR link to Neighborhood                       │
            └─────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                          Jordi (analyst): inbox / Workshop "Active Alerts" card
                                          │
                                          ▼
                          Jordi requests reinforcement from Anna (out-of-band: phone)
                                          │
                                          ▼
                          Anna opens Workshop, selects affected Neighborhood
                                          │
                                          ▼
                          [Mark Reinforcement Zone] (button) ──▶ mark-reinforcement-zone
                                          │
                                          ▼
                          ReinforcementZone created, REINFORCES link to Neighborhood
                                          │  side effects:
                                          │   - in-app notification to Jordi
                                          │   - Mattermost webhook to #guardia-urbana-ops
                                          ▼
                          ActionLog row appears (queryable from "Action Log" deep link)
```

### Configuration

| Element | Type | Notes |
|---|---|---|
| Generator | Pipeline (`cad-alert-generator`) — every 60 s | Emits `IncidentAlert` rows from the synthetic CAD fixture. Replay command is on the demo index card. |
| Action Type | `mark-reinforcement-zone` | See top table. |
| Side effect | in-app + Mattermost webhook | Channel registered in `notification-alerting-service`. |
| SLA | Soft: alert acknowledged < 5 min | Tracked by `telemetry-governance-service`. |
| After-action close | `register-zone-outcome` after the shift ends + `close-reinforcement-zone` (with senior-commander approval) | Closes the decision loop — this is the headline pattern (action → outcome → after-action review). |

---

## 2️⃣ Daily-briefing cycle (the routine loop)

Trigger: cron at 07:00 Europe/Madrid. The job calls `generate-daily-briefing` for the current day; the AIP drafts the bullet content; a human approves before the PDF is rendered and distributed.

```
07:00 Europe/Madrid (cron, workflow-automation-service)
        │
        ▼
generate-daily-briefing(target_date=today, scope_districts=ALL)
        │
        ▼
AIP function.country_situation_brief equivalent here is the briefing-composer
function (TacticalBriefing draft) — cites Incident IDs, LoadForecast IDs,
WeatherEvent IDs
        │
        ▼
TacticalBriefing object created with status=DRAFT
        │  side effect: in-app to Anna ("Briefing draft ready for approval")
        ▼
Anna opens the draft in Workshop, edits as needed, hits [Approve & Distribute]
        │
        ▼
TacticalBriefing.status = APPROVED
        │
        ▼  Render PDF (briefing-render-service, OpenFoundry-emulated — not a
        │  Foundry-native primitive; honest label in the YAML)
        ▼
PDF stored in MinIO + linked from TacticalBriefing
        │  side effects:
        │   - SMTP to briefing distribution list (PDF attached)
        │   - Mattermost webhook to #guardia-urbana-briefings
        ▼
ActionLog row for both `generate-daily-briefing` and the implicit approve step
```

### Configuration

| Element | Type | Notes |
|---|---|---|
| Trigger | cron 07:00 Europe/Madrid | `workflow-automation-service` |
| Latency budget | AIP draft + render ≤ 4 s (see KPI panel) | Measured on every rehearsal |
| Notification routing | SMTP (PDF) + in-app + Mattermost webhook | All three registered in `notification-alerting-service` |
| Failure mode | If AIP draft fails, the workflow stops at DRAFT-PENDING-MANUAL; Anna gets an in-app "draft failed, please compose manually" notification. No silent failure. |

---

## 3️⃣ Propose chronic-priority (branch only) — UC-6

This is the **branch demo**. It exercises:
- Global Branching across datasets, ontology, and Workshop.
- `propose-chronic-priority` Action Type, restricted to branch context (server enforces `required_context: branch`).
- Branch review / merge with the senior reviewer role.

```
Anna creates branch "chronic-priority-2026Q2" (Global Branch)
        │
        ▼
On the branch, [Propose Chronic Priority] button enables
        │
        ▼  Anna selects 3 candidate Neighborhoods (via the candidates table
        │  produced by P3 in 08-aip-copiloto-prompts.md)
propose-chronic-priority(neighborhood_ids=[NBHD-..., NBHD-..., NBHD-...],
                         rationale="...")
        │
        ▼  creates 3 ChronicPriority enrichments on the Neighborhood rows —
        │  ONLY ON BRANCH
        │  Workshop now renders with branch data: those neighborhoods show
        │  chronic_priority=true, Map updates the visual highlight
        ▼
Senior reviewer opens the branch in OpenFoundry's branch review surface
        │
        ▼
        ├── Merge → main updates; the standing roster now permanently flags those 3
        └── Discard → branch deleted, no impact on main
```

### Foundry-native constraints (and gaps)

- The branch must propagate through datasets, transforms, ontology, **and** the Workshop module. Per public docs the Workshop module supports branching ([Workshop branching](https://www.palantir.com/docs/foundry/workshop/branching-rebasing/)); the Quiver dashboard does **not** modify on a branch, so the branch demo does not touch Quiver.
- The "approval" surface is an OpenFoundry emulation; we model it as a `branch_review_request` resource and label the gap honestly.

---

## 📋 Per-action audit acceptance

For each Action Type, the demo verifies in real time:
1. The action submission produces a queryable `ActionLog` row (`audit-compliance-service`).
2. The row contains: `actor_user_id`, `action_type_id`, `target_object`, `parameters` (json), `outcome`, `produced_edits`, `submitted_at_utc`, `policy_decisions`.
3. The same row is reachable from a deep link inside Workshop ("View action history") and from the AIP chatbot via the `ontology.read_object` tool (when allowed by markings).

---

## 4️⃣ Workflow runtime

OpenFoundry's `workflow-automation-service` is **not** the customer-facing concept — Foundry-native users see *Actions + side effects + AIP Logic*. The service runs the saga / outbox / idempotency machinery, but the demo script never names it (see [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md)).

The retired Rust-era "saga" parity gate is not enforced today (per the repo CLAUDE.md); the integration tests on Postgres now cover it via the `integration` build tag. For this PoC we accept that contract.

---

## ✅ Concrete actions (when the PoC is executed)

1. Configure side-effect channels in `notification-alerting-service`: SMTP (briefing PDF), in-app (alerts + briefing draft notifications), outbound webhooks for `mark-reinforcement-zone` and `briefing-distributed` to a demo Mattermost channel.
2. Wire the `cad-alert-generator` job to the synthetic CAD fixture and confirm the every-60s cadence end-to-end.
3. Smoke test the full incident-alert chain: replay a fixture spike → `IncidentAlert` row appears within 60 s → Jordi gets the in-app notification → Anna marks the zone → ActionLog row exists with the Mattermost webhook delivered.
4. Smoke test the daily-briefing cycle: trigger the 07:00 job manually → AIP draft within ≤ 4 s → Anna approves → PDF is rendered and delivered to SMTP + Mattermost.
5. Smoke test the after-action close: run `register-zone-outcome` followed by `close-reinforcement-zone` (requires senior-commander approval) → confirm both rows in the ActionLog and the after-action distribution mail goes out.
6. Smoke test the branch flow: create the branch, run `propose-chronic-priority` for 3 candidates, confirm Workshop updates on branch, discard — confirm `main` is unchanged.
