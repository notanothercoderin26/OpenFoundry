# Use case development

This section covers how platform capabilities become workflow-ready applications and user journeys.

## OpenFoundry mapping

- `services/application-composition-service` — Workshop app composition (pages, widgets, publish runtime)
- `services/workflow-automation-service` — workflow definitions, sagas, **approval steps** (native, no separate approvals binary)
- `services/notification-alerting-service` — inbox + email/Slack/Teams delivery + WebSocket fan-out
- `services/notebook-runtime-service` — notebooks for ad-hoc and analytical workbooks
- `apps/web/src/routes/apps`, `/workshop-editor` — Workshop App builder UI
- `apps/web/src/routes/workflows`, `/automate`, `/workflow-lineage` — workflow authoring + tracing
- `apps/web/src/routes/reports` — reports UI (no dedicated `report-service` binary yet — report jobs run as steps inside `workflow-automation-service`; the dedicated binary is on the [ROADMAP](../../ROADMAP.md))
- `apps/web/src/routes/notebooks` — Notebook editor

## Key concerns

- building operational apps
- composing workflows
- exposing reports and notebooks
- turning ontology and data assets into user-facing experiences

## Section map

- [Application builder](/use-case-development/application-builder)
- [Workflow composition](/use-case-development/workflow-composition)
- [Operational experiences](/use-case-development/operational-experiences)
- [Object Explorer equivalent](/use-case-development/object-explorer-equivalent/)
- [Workshop equivalent](/use-case-development/workshop-equivalent/)
- [Maps, reports, and notebooks](/use-case-development/maps-reports-notebooks/)
