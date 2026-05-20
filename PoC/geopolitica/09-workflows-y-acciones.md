# 09 — Workflows and actions

> Foundry models human-driven and event-driven processes as combinations of **Action Types**, **Functions / AIP Logic**, **Notifications**, and **Webhooks** (see [Action Types — overview](https://www.palantir.com/docs/foundry/action-types/use-actions/), [notifications](https://www.palantir.com/docs/foundry/action-types/notifications/), [webhooks](https://www.palantir.com/docs/foundry/action-types/webhooks)). OpenFoundry's `workflow-automation-service` + `ontology-actions-service` + `notification-alerting-service` implement this. Anything that does not map cleanly to those primitives is labeled **OpenFoundry emulation**.

The two main workflows demoed are:
- **Watchlist → Alert → Acknowledge** (the "passive monitoring" loop).
- **Alert → Investigation Case → Evidence → Close** (the "active investigation" loop).

A third workflow exists on a branch only:
- **Propose Sanctions Extension → Branch Preview → Senior Review → Merge or Discard**.

---

## 1️⃣ Watchlist → Alert → Acknowledge

Trigger: a new `INVOLVED_IN` link is created between an `Actor` on an active `Watchlist` and a new `Event`. The `ontology.actor_alert` materialization job emits a new `ActorAlert` row; a notification side-effect fires.

```
            ┌──────────────────────────────────────────────────────────────┐
            │  ontology.actor_alert pipeline (incremental, every 5 min)    │
            │                                                              │
new Event ──▶  detect: Actor on any Watchlist? ──▶ create ActorAlert ──▶ │
            │      │                                  side effect:        │
            │      └─── trigger workflow:             notification         │
            │           watchlist-membership-changed (Foundry-native)      │
            └──────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                                   Sofía (analyst): inbox / Workshop "Latest Alerts" card
                                   │
                                   ▼
                                   Click "Acknowledge" → `acknowledge-alert` Action Type
                                   → ActionLog row + Alert.acknowledged_at_utc set
```

### Configuration

| Element | Type | Notes |
|---|---|---|
| Generator | Pipeline (`actor-alert-generator`) — incremental, every 5 min | Emits `ActorAlert` rows; alternatively a Function executed on new `INVOLVED_IN` link via Foundry's link-event hooks (Foundry public docs cover this less clearly — we label this OpenFoundry-emulated). |
| Action Type | `acknowledge-alert` | See [`05-ontologia-geopolitica.md`](05-ontologia-geopolitica.md). |
| Side effect | Notification (email + in-app) | Channel registered in `notification-alerting-service`. |
| SLA | Soft: alert acknowledged < 4 h | Tracked by `telemetry-governance-service`. |

---

## 2️⃣ Alert → Investigation Case → Evidence → Close (the demo crescendo)

This is **UC-5**. The flow shown end-to-end during the demo:

```
ActorAlert raised (UC-5 step 1)
        │
        ▼  (Sofía decides to escalate)
[Add to Watchlist]  ────────────────────►  ALREADY on watchlist (this is the alert)
[Open Investigation Case] (action button) ──▶ open-investigation-case  Action Type
        │
        ▼
InvestigationCase created (status=OPEN, assigned to Marcos)
        │  side effect: webhook to Slack / Mattermost channel #compliance-cases
        │  side effect: email to Marcos
        ▼
Marcos opens case in Workshop (filtered to selected case)
        │
        ▼
[Attach Evidence] (button) ──▶ attach-evidence-to-case   ──▶ EVIDENCE_OF links to N Events
        │
        ▼
Analyst review window (free-form `summary` edit, possibly via AIP `function.summarize_actor_activity`)
        │
        ▼
[Close Case] (button) ──▶ close-case  Action Type
        │  requires `approval:senior-compliance` → routes to branch-review / approval inbox
        │  outcome ∈ { CLOSED_NO_ACTION, ESCALATED }
        ▼
ActionLog: every step appears as a queryable row
```

### Side effects per Action Type

| Action | Notification | Webhook |
|---|---|---|
| `add-to-watchlist` | in-app to creator | — |
| `flag-actor` | in-app + email to actor's existing case owners (if any) | — |
| `open-investigation-case` | email to `assigned_to`, in-app to opener | `POST` to `https://chat.acme-intel.demo/api/hooks/case-opened` |
| `acknowledge-alert` | — | — |
| `attach-evidence-to-case` | in-app to case owner | — |
| `close-case` | email to opener + assignee + senior reviewer | `POST` to `https://chat.acme-intel.demo/api/hooks/case-closed` |

Failure semantics: notifications and webhooks are **post-commit** side effects. If they fail, the ontology edit is still durable; the side-effect-failure is logged and surfaces in Data Health.

---

## 3️⃣ Propose Sanctions Extension (branch only) — UC-6

This is the **branch demo**. It exercises:
- Global Branching across datasets, ontology, Workshop, and Actions.
- `propose-sanctions-extension` Action Type, restricted to branch context (server enforces `required_context: branch`).
- Branch review / merge with the senior compliance reviewer role.

```
Marcos creates branch "sanctions-extension-2026Q3" (Global Branch)
        │
        ▼
On the branch, [Propose Sanctions Extension] button enables
        │
        ▼  Marcos selects 12 candidate actors (via Object Table / Graph)
propose-sanctions-extension(actor_ids=[...12], rationale="...")
        │
        ▼  creates 12 SanctionsEntry rows + SANCTIONED_BY links — ONLY ON BRANCH
        │  Workshop now renders with branch data: those actors show is_sanctioned=true,
        │  Map / Graph / Object Table update
        ▼
Senior reviewer opens the branch in OpenFoundry's branch review surface
        │
        ▼
        ├── Merge → main updates, downstream pipelines re-run with the additions
        └── Discard → branch deleted, no impact on main
```

### Foundry-native constraints (and gaps)

- The branch must propagate through datasets, transforms, ontology, **and** the Workshop module. Per public docs the Workshop module supports branching ([Workshop branching](https://www.palantir.com/docs/foundry/workshop/branching-rebasing/)); the Quiver dashboard does **not** modify on a branch, so the branch demo does not touch Quiver.
- The "approval" surface is an OpenFoundry emulation if a generic approval primitive is not provided by Foundry's published surfaces — we model it as a `branch_review_request` resource and label the gap honestly.

---

## 4️⃣ Workflow runtime

OpenFoundry's `workflow-automation-service` is **not** the customer-facing concept — Foundry-native users see *Actions + side effects + AIP Logic*. The service runs the actual saga / outbox / idempotency machinery, but the demo script never names it. (See the contract in [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md).)

The retired Rust-era "saga" parity gate is not enforced today (per the repo CLAUDE.md); the integration tests on Postgres now cover it via the `integration` build tag. For this PoC we accept that contract.

---

## 📋 Per-action audit acceptance

For each Action Type, the demo verifies in real time:
1. The action submission produces a queryable `ActionLog` row (`audit-compliance-service`).
2. The row contains: `actor_user_id`, `action_type_id`, `target_object`, `parameters` (json), `outcome`, `produced_edits`, `submitted_at_utc`.
3. The same row is reachable from a deep link inside Workshop ("View action history") and from the AIP chatbot via the `ontology.query_actors` / `ontology.read_object` tools (when allowed by markings).

---

## ✅ Concrete actions (when the PoC is executed)

1. Configure side-effect channels in `notification-alerting-service`: email (SMTP / SES), in-app (websocket), and outbound webhooks for `case-opened` / `case-closed` to a demo Mattermost channel.
2. Wire the `actor-alert-generator` job to the ontology link-event stream (or run as a 5-min incremental Spark job — both are acceptable; document which one is used).
3. Smoke test the full chain: raise a synthetic `INVOLVED_IN` link for a watchlisted actor → confirm `ActorAlert` appears within 5 min → Sofía acknowledges → `acknowledge-alert` ActionLog row exists.
4. Smoke test escalation: open an investigation case from the Action button; confirm email + webhook fire; close the case with `senior-compliance` approval; confirm the Action Log shows both submissions.
5. Smoke test branch demo: create the branch, run `propose-sanctions-extension` for 12 candidates, confirm Workshop updates on branch, discard the branch — confirm `main` is unchanged.
