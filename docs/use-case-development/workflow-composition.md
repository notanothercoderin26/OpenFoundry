# Workflow composition

Workflow composition is where platform capabilities become repeatable operational processes.

## Repository signals

- `services/workflow-automation-service` — workflow definitions, sagas, automation conditions, approval steps
- `services/notification-alerting-service` — notifications + delivery + WebSocket fan-out
- `services/ontology-definition-service`, `services/ontology-query-service`, `services/ontology-actions-service` — the ontology plane that workflows read from and write to (older docs referenced a single `ontology-service` — that binary does not exist; the ontology plane is intentionally split, see [Ontology building](/ontology-building/))
- `apps/web/src/routes/workflows`, `/automate`, `/workflow-lineage` — workflow authoring + tracing
- `proto/workflow/*` — wire contracts

## Why this matters

OpenFoundry is clearly aiming beyond static dashboards. Workflow composition is what allows the platform to coordinate:

- user actions
- system notifications
- rule outcomes
- approvals and escalations
- follow-up tasks and state transitions

## Design direction

This capability should eventually act as the orchestration layer that ties together ontology actions, notifications, analytics signals, and AI recommendations.
