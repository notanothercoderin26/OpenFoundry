# B05 — Notification & alerting service is a stub

> Severity: **High** — breaks the "asignar tarea con SLA y notificación"
> closing beat of Act 5 and the Act 6 governance demo (audit + webhook /
> email side-effects). The customer expects to see a task land in an
> inbox with a deadline, not a swallowed event.

## Identity

| Field | Value |
|---|---|
| OpenFoundry service | [services/notification-alerting-service/](../../../services/notification-alerting-service/) |
| Launcher app(s) | Not a launcher tile of its own; transversal dependency for **#36 Operational Rules** (`/foundry-rules`), **#37 Dynamic Schedules** (`/dynamic-scheduling`), **#38 Approvals** (`/approvals`), and action-type side effects ([launcher-app-mapping.md §G/H](../../../docs/reference/launcher-app-mapping.md)) |
| Foundry product | [Action notifications](https://www.palantir.com/docs/foundry/action-types/notifications/) + [Webhooks](https://www.palantir.com/docs/foundry/action-types/webhooks/) + [Approvals](https://www.palantir.com/docs/foundry/approvals/overview/) |
| PoC act(s) | **Act 5** (action submission → notification) and **Act 6** (governance / approvals trail) |
| 1-to-1 checklist | [foundry-automate-rules-1to1-checklist.md](../../../docs/migration/foundry-automate-rules-1to1-checklist.md) (`partial`, ~20%) |
| Parity matrix module | *Automate / Rules* (notifications slice) |

## Palantir reference (public docs)

| Page | Live URL | Local scraped MD | Full-page screenshot |
|---|---|---|---|
| Action notifications | https://www.palantir.com/docs/foundry/action-types/notifications/ | [Seed URLs/Action Types/Notifications.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Notifications.md) | [Seed URLs/Action Types/Notifications.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Notifications.screenshot.png) |
| Action webhooks | https://www.palantir.com/docs/foundry/action-types/webhooks/ | [Seed URLs/Action Types/Webhooks.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Webhooks.md) | [Seed URLs/Action Types/Webhooks.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Webhooks.screenshot.png) |
| Action log | https://www.palantir.com/docs/foundry/action-types/action-log/ | [Seed URLs/Action Types/Action Log.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Action%20Log.md) | [Seed URLs/Action Types/Action Log.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Action%20Types/Action%20Log.screenshot.png) |
| Approvals overview | https://www.palantir.com/docs/foundry/approvals/overview/ | [Seed URLs/Approvals/Overview.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Approvals/Overview.md) | [Seed URLs/Approvals/Overview.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Approvals/Overview.screenshot.png) |
| Foundry Rules overview | https://www.palantir.com/docs/foundry/foundry-rules/overview/ | [Seed URLs/Foundry Rules/Overview.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Foundry%20Rules/Overview.md) | [Seed URLs/Foundry Rules/Overview.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Foundry%20Rules/Overview.screenshot.png) |
| Dynamic scheduling | https://www.palantir.com/docs/foundry/dynamic-scheduling/scheduling-overview/ | [Seed URLs/Dynamic Scheduling/Scheduling Overview.md](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Dynamic%20Scheduling/Scheduling%20Overview.md) | [Seed URLs/Dynamic Scheduling/Scheduling Overview.screenshot.png](../../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Dynamic%20Scheduling/Scheduling%20Overview.screenshot.png) |

## Foundry behavior to replicate (summary)

Notifications and webhooks are **action side effects** in Foundry: when
an Action Type is submitted (or an Operational Rule fires), the platform
fans out to subscribers via email/in-app/webhook channels with templated
payloads. Failed side effects retry on their own track; the action
itself is durable regardless. The Approvals app shows the same events
as a reviewer queue with SLAs.

## Current OpenFoundry surface

| Layer | File | State |
|---|---|---|
| Service main | [services/notification-alerting-service/cmd/notification-alerting-service/main.go](../../../services/notification-alerting-service/cmd/notification-alerting-service/main.go) | ~128 lines |
| Handlers | [services/notification-alerting-service/internal/handlers/](../../../services/notification-alerting-service/internal/handlers/) | 4 handlers; no real channel implementations |
| Migrations | [services/notification-alerting-service/internal/repo/migrations/](../../../services/notification-alerting-service/internal/repo/migrations/) | Directory present, no production-grade subscription / delivery tables |
| Consumers | `ontology-actions-service`, `workflow-automation-service` | Both have hooks that would route to this service, currently no-ops |
| Approvals UI | [apps/web/src/routes/approvals/](../../../apps/web/src/routes/approvals/) | Renders Phase 4 mock per launcher mapping |

## Gap to close

1. **No subscription model.** Cannot declare "for action `ScheduleMaintenance`,
   notify `mro-team@…` and POST to `https://acme.example.com/hooks/…`".
2. **No real channels.** Email, in-app, and webhook delivery are not
   implemented; only a logger sink exists.
3. **No retry / dead-letter.** Failed deliveries are silently dropped.
4. **No Approvals queue projection.** The UI mock does not connect to a
   queue backed by this service.
5. **No SLA / escalation timer.** Foundry shows "due in 2h, escalate to
   manager"; OpenFoundry has no timer dispatcher.

## Acceptance criteria to unblock the PoC

1. `POST /subscriptions` declares a subscription `{event, channel, target, template}`
   and persists it.
2. `POST /events` (called by `ontology-actions-service` and
   `workflow-automation-service`) fans out to all matching subscriptions.
3. The webhook channel delivers a JSON POST to a configurable URL with
   HMAC signature and 3-retry exponential backoff; failures end in a DLQ
   visible via `GET /events/{id}/deliveries`.
4. The in-app channel emits a record that the Approvals UI picks up at
   `/approvals` as a real row (not mock).
5. A `Schedule maintenance` action submitted from Workshop
   ([B01](B01-workshop-backend.md)) lands in the MRO inbox within 5
   seconds and is also written to the action log.
6. A scheduled rule (e.g. "Aircraft overdue by >7 days") fires through
   `workflow-automation-service` and produces the same notification path.

## Implementation pointers

1. Materialize `subscriptions`, `events`, `deliveries` Postgres tables.
2. Implement two channels first: `webhook` (HTTP POST with HMAC) and
   `in-app` (Postgres row consumed by the Approvals UI). Email can come
   later; the demo can use the in-app channel.
3. Use the existing Kafka bus (`libs/event-bus-data`) for the
   producer→consumer hop instead of inline calls — it lets retries live
   on the broker, not in memory.
4. Add a small timer worker for SLA escalation (Postgres LISTEN/NOTIFY
   or a cron column scan, your choice).
5. Track unimplemented items in
   [foundry-automate-rules-1to1-checklist.md](../../../docs/migration/foundry-automate-rules-1to1-checklist.md).
