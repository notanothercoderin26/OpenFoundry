# 09 — Workflows and operational actions

> Foundry's differential value is not seeing data, it is **turning an insight into a coordinated action**. Here are the 3 workflows that will be demonstrated and their declarative definitions for `workflow-automation-service`.

---

## 🌀 Workflow 1 — `mro-inspection`

**Triggered by:** the `flag-aircraft-for-inspection` action (manual or via AIP copilot).

### Steps
1. **Create** `MaintenanceEvent` (already created by the action; the workflow picks it up).
2. **Assign** an engineer — `assign-maintenance-event` with criterion "lowest workload at home base".
3. **Reserve critical parts** — if the event references a `Part` with low stock, create `order-part` (see Workflow 2).
4. **Notify** the assigned engineer (email + UI push) via `notification-alerting-service`.
5. **Wait for approval** from `mro-lead` if `severity = CRITICAL` (`approval` step within `workflow-automation-service` — approvals are a native primitive of the workflow engine, not a separate service).
6. **Block the aircraft** — update `Aircraft.current_status = IN_MAINTENANCE` when started.
7. **SLA timer** — if the event is not closed by `due_by`, escalate to `mro-director`.
8. **Closure** — when the event is closed, recompute `recurring_defects` (trigger `gd-recurring-defects`) and notify.

### Declarative definition
```yaml
workflow:
  id: mro-inspection
  version: 1
  trigger:
    on_action: flag-aircraft-for-inspection
  variables:
    - { name: event,    from: "{{trigger.created_object}}" }
    - { name: aircraft, query: "ontology.get(Aircraft, tail_number={{event.tail_number}})" }
  steps:

    - id: assign-engineer
      type: action
      action: assign-maintenance-event
      params:
        target: "{{event.event_id}}"
        engineer_id: |
          {{ ontology.query("
            SELECT e.engineer_id
            FROM Engineer e
            WHERE e.home_base = '{{aircraft.home_base_airport}}'
            ORDER BY e.current_workload ASC LIMIT 1
          ") }}

    - id: check-parts
      type: branch
      condition: "{{ event.requires_parts_with_low_stock }}"
      then:
        - { type: trigger_workflow, workflow: order-critical-parts, params: { for_event: "{{event.event_id}}" } }

    - id: notify-engineer
      type: notify
      channel: [email, in-app]
      template: |
        New {{event.severity}} inspection assigned to you.
        Aircraft: {{aircraft.tail_number}} ({{aircraft.model_id}})
        Defect: {{event.description}}
        Due by: {{event.due_by}}

    - id: critical-approval
      type: branch
      condition: "{{ event.severity == 'CRITICAL' }}"
      then:
        - type: approval
          approver_role: mro-lead
          timeout: 30m
          on_timeout: escalate
          on_reject: cancel_workflow

    - id: ground-aircraft
      type: action
      action: update-object
      params:
        target: "{{aircraft.tail_number}}"
        fields: { current_status: IN_MAINTENANCE }

    - id: sla-timer
      type: timer
      until: "{{event.due_by}}"
      on_expire:
        - type: notify
          to_role: mro-director
          template: "SLA breached for event {{event.event_id}}"

    - id: post-close
      type: on_event
      event: "MaintenanceEvent.{{event.event_id}}.closed"
      do:
        - { type: trigger_pipeline, pipeline: gd-recurring-defects }
        - { type: notify, to_role: mro-lead, template: "Event {{event.event_id}} closed; recurrence stats refreshed." }
```

---

## 📦 Workflow 2 — `order-critical-parts`

**Triggered by:** another workflow (`mro-inspection`) or the `order-part` action.

### Steps
1. Validate current stock.
2. If stock < threshold, create PO (purchase order).
3. Notify `supply-chain` role.
4. Wait for supplier confirmation (mock: 1-min timer in the demo).
5. Mark part as "in transit" and record lead time.

```yaml
workflow:
  id: order-critical-parts
  trigger:
    on_action: order-part
  steps:
    - { id: check-stock,    type: query,  query: "SELECT stock FROM Part WHERE part_id='{{params.part_id}}'" }
    - { id: create-po,      type: action, action: create-purchase-order, params: { ... } }
    - { id: notify-supply,  type: notify, to_role: supply-chain }
    - { id: wait-confirm,   type: wait,   timeout: 60s, on_timeout: notify_escalate }
    - { id: mark-in-transit,type: action, action: update-object, params: { fields: { status: IN_TRANSIT } } }
```

---

## 🌪 Workflow 3 — `weather-disruption-response`

**Triggered by:** event from `telemetry-governance-service` (monitoring rules — the "monitoring rules" capability lives here, not in a separate service) when a hub airport falls below weather thresholds.

### Steps
1. Detect disruption (rule: `visibility < 800 m` or `wind_speed > 40 kt` for 30 min).
2. List affected flights (next 6h to/from that airport).
3. Recompute `risk_score` for those flights (trigger incremental pipeline).
4. Create an aggregated "incident card" for Ops Controllers.
5. Suggest reroutes via the AIP copilot (the `reroute-flight` action requires duty-manager approval).

```yaml
workflow:
  id: weather-disruption-response
  trigger:
    on_event: "monitoring-rules.airport-weather-breach"
  steps:
    - id: list-affected
      type: query
      query: |
        SELECT flight_id FROM Flight
        WHERE (origin_iata='{{trigger.airport}}' OR destination_iata='{{trigger.airport}}')
          AND scheduled_departure_utc BETWEEN now() AND now()+INTERVAL '6 hours'

    - id: rescore
      type: trigger_pipeline
      pipeline: gd-flights-enriched
      partition_filter: "flight_id IN ({{list-affected.results}})"

    - id: create-incident
      type: action
      action: create-incident
      params:
        severity: HIGH
        title: "Weather disruption at {{trigger.airport}}"
        affected_flights: "{{list-affected.results}}"

    - id: notify-ops
      type: notify
      to_role: ops-controller
      with_link: "/incidents/{{create-incident.id}}"
```

---

## 🔔 Notifications (`notification-alerting-service` service)

| Channel | Configuration | Demo usage |
|---|---|---|
| In-app (UI badge) | native | All |
| Email (SMTP) | mailtrap.io or real SMTP | Act 5 (to engineer and mro-lead) |
| Webhook | Slack / Teams | If the client wants to see Slack integration we show our own workspace |
| Mobile push | (out-of-scope PoC) | — |

Templates stored in `PoC/assets/notifications/*.tpl` (to be materialized at execution time).

---

## ✋ Approvals (native step of `workflow-automation-service`)

> Approvals are modeled as an `approval` step inside the workflow definition (see `mro-inspection` above). There is no separate `approvals-service` binary: the approval inbox is rendered from the state of running workflows. The `saga` lib covers distributed coordination and `state-machine` (Postgres-backed) persists progress.

Demo flow:
1. The `reroute-flight` action requires approval from a user with the `duty-manager` role.
2. The UI displays an "approval inbox" for `duty-manager`.
3. Approved → the action is executed and recorded in audit with `approved_by`.
4. Rejected → it is cancelled and the initiator is notified with the reason.

For the demo we create a third user `marta@acme-airlines.demo` with the `duty-manager` role to show this flow only if time permits.

---

## 📊 Workflow visualization in the UI

The trace of each workflow run is exposed by `workflow-automation-service` itself (REST endpoint `/runs/{id}` + WebSocket progress). In `apps/web` there are dedicated routes: `/workflows`, `/automate` and `/workflow-lineage`. Each one shows:
- Visual workflow timeline (simplified gantt).
- State of each step (pending/running/done/failed).
- Click on step → logs and output.

It is what the client sees after Act 5, when the copilot executed the actions.

---

## ✅ Concrete actions (when the PoC is executed)

1. Materialize the 3 YAMLs in `PoC/assets/workflows/`.
2. Register them in `workflow-automation-service`.
3. Create the 3 users (`ana`, `luis`, `marta`) in Keycloak with their roles.
4. Configure test SMTP (mailtrap) and our own Slack workspace.
5. Run smoke test: launch `flag-aircraft-for-inspection` → see the workflow run in `/workflows` (frontend) or `GET /api/workflows/v1/runs/{id}` (served by `workflow-automation-service`) → receive notification.
