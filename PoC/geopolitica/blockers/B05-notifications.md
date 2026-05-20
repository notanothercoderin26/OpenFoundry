# B05 — Notifications — sign outbound webhooks + real Approvals UI (geopolitics)

> **Geopolitics PoC scope** of the platform B05. The aviation
> [`../../aviacion/blockers/B05-notifications.md`](../../aviacion/blockers/B05-notifications.md)
> still labels the service "a stub with logger sinks"; that's stale
> for the geopolitics PoC. `services/notification-alerting-service/`
> already ships:
>
> - `notifications`, `notification_deliveries`, `notification_preferences` tables (migration `0001_notifications.sql`);
> - real channel adapters for `in_app`, `email` (SMTP + STARTTLS + email-redaction policy), `slack` and `teams` (HTTP POST);
> - a NATS-backed `NotificationBus` + per-user durable WebSocket consumer (`/api/v1/notifications/ws` with short-lived ticket auth);
> - the `POST /internal/notifications` ingress that `libs/ontology-kernel/handlers/actions/side_effects.go:731` already calls from action side-effects (no rewire needed for Act 5's in-app inbox).
>
> What this file owns is the **geopolitics-specific delta** required
> to close Acts 5 and 6 of [`../11-guion-demo.md`](../11-guion-demo.md)
> and the network Plan B from [`../13-riesgos-y-plan-b.md`](../13-riesgos-y-plan-b.md):
>
> 1. Sign outbound webhooks (Mattermost / SIEM) so the security
>    surface in [`../10-seguridad-y-gobierno.md`](../10-seguridad-y-gobierno.md)
>    is not a tooltip.
> 2. Retry + at-least-once accounting so the SOC can audit deliveries
>    instead of guessing.
> 3. Make the Approvals UI tile (`/approvals`) actually be the
>    approvals queue, not a re-skin of the audit page.
>
> Severity: **High**. Tracked at **~55%** after this phase: signing,
> retry/DLQ accounting, OpenAPI documentation and the real ApprovalsPage
> land here; SLA-aware escalation timer + a dedicated `webhook_endpoints`
> registration table remain (own follow-ups, see §Deferred).

## Identity

| Field | Value |
|---|---|
| OpenFoundry service | [`services/notification-alerting-service/`](../../../services/notification-alerting-service/) (channels + WebSocket inbox) + [`services/workflow-automation-service/`](../../../services/workflow-automation-service/) (the approvals state machine + `/api/v1/approvals` API) |
| Launcher app | **#38 Approvals** (`/approvals`) — was previously a redirect to the audit page; now a real ApprovalsPage. Cross-cutting dependency for Operational Rules and Workflow side-effects. |
| Foundry product | [Action notifications](https://www.palantir.com/docs/foundry/action-types/notifications/) + [Action webhooks](https://www.palantir.com/docs/foundry/action-types/webhooks/) + [Approvals overview](https://www.palantir.com/docs/foundry/approvals/overview/) |
| PoC act(s) | **Act 5** — "Watchlist alert → InvestigationCase → analyst inbox + Mattermost webhook" ([`../11-guion-demo.md`](../11-guion-demo.md)) and **Act 6** — governance / audit trail with side-effect rows ([`../10-seguridad-y-gobierno.md`](../10-seguridad-y-gobierno.md)). |
| Plan B | [`../13-riesgos-y-plan-b.md` §Sin internet / webhook a Mattermost falla](../13-riesgos-y-plan-b.md) — Plan B says "the in-app notification still fires". With the retry + DLQ accounting added here, the webhook also has a defensible at-least-once track instead of a silent drop. |
| Preflight | [`../12-checklist-preparacion.md`](../12-checklist-preparacion.md): "Notifications: SMTP / in-app / webhook channels configured; the Mattermost / Slack hook reaches a demo channel and round-trips." |

## Why the aviation file is misleading for this vertical

`PoC/aviacion/blockers/B05-notifications.md` lists five gaps; only two
are still real in `main`:

| Aviation-listed gap | Real state in `main` |
|---|---|
| 1. No subscription model | The platform took the **action-side-effect** path instead of a generic subscription table. `libs/ontology-kernel/handlers/actions/side_effects.go::sendNotificationRequest` posts to `/internal/notifications` whenever an action fires; the body carries `user_id`, `channels`, `metadata`. Adequate for the geopolitics PoC. |
| 2. No real channels | False. `in_app`, `email` (with redaction policy), `slack` and `teams` all dispatch through real adapters in `internal/service/channels.go`. |
| 3. No retry / DLQ | **Real** before this phase — `PostWebhook` was a single attempt. **Resolved** by this phase. |
| 4. No Approvals queue projection | **Real** before this phase — `/approvals` rendered `AuditPage`. **Resolved** by this phase. |
| 5. No SLA / escalation timer | **Real**. Not addressed here — see §Deferred. |

Plus one gap not flagged in the aviation file but blocking the geopolitics governance demo:

| Geopolitics-specific gap | State |
|---|---|
| Webhooks were not signed | **Real** before this phase — `PostWebhook` set only `Content-Type`. **Resolved** by this phase. |

## Gap to close in this phase

| # | Gap | Status after this phase |
|---|---|---|
| 1 | Outbound webhooks unsigned | ✅ Resolved: `WebhookSigner` with HMAC-SHA256 over `<timestamp>.<body>`, headers `X-OpenFoundry-Signature: t=<unix>,v1=<hex>` and `X-OpenFoundry-Signature-Timestamp`. Empty `WEBHOOK_SIGNING_SECRET` disables signing (dev / test parity preserved). |
| 2 | Single-attempt webhook delivery; no DLQ accounting | ✅ Resolved: `WebhookRetryPolicy` with 3-attempt exponential backoff (1s / 2s / 4s × ±20% jitter). 4xx terminates immediately (not retried); 429 + 5xx retried. Final failure records `notification_deliveries.status = 'failed_after_retries'` — the deliveries table doubles as the DLQ audit, queryable through the existing list endpoint. |
| 3 | `/approvals` rendered the AuditPage | ✅ Resolved: `apps/web/src/routes/approvals/ApprovalsPage.tsx` (new) fetches `/api/v1/approvals` from `workflow-automation-service`, with status-filter chips (pending / escalated / approved / rejected / expired / all), inline comment field, and Approve / Reject actions that `POST /api/v1/approvals/{id}/decide`. Router updated: `/approvals` → ApprovalsPage; `/audit` → AuditPage (the inverse redirect is gone). |
| 4 | Frontend approvals client targeted the wrong path | ✅ Resolved: `apps/web/src/lib/api/workflows.ts::listWorkflowApprovals` now calls `GET /approvals` and `decideWorkflowApproval` calls `POST /approvals/{id}/decide` — the canonical chi routes mounted by `workflow-automation-service`. The legacy `/workflows/approvals` calls were 404-ing at the service (no GET there); four pages (Machinery, ObjectMonitors, FoundryRules, Workflows) recover transparently. |
| 5 | OpenAPI did not document the new signature contract | ✅ Resolved: `internal/openapi/openapi.yaml` describes the signature scheme, the header pair and the receiver verification recipe + the retry / DLQ accounting. |

## Deferred (out of scope of this phase — own blockers)

| # | Deferred gap | Owner / rationale |
|---|---|---|
| D1 | SLA-aware escalation timer (`due in 2h, escalate to manager`) — the approvals state machine already has `escalated` as a state and the legacy `approvals-timeout-sweep` cmd emits `escalate` events, but there is no timer worker reading `due_at` and transitioning rows automatically. | **B11** — Approvals SLA timer worker (new). Geopolitics §09 line 43 says SLA is "tracked by `telemetry-governance-service`", so the timer belongs there or in workflow-automation; not in notification-alerting. |
| D2 | A dedicated `webhook_endpoints` table with per-endpoint `signing_secret` / `enabled` / per-event filter. Today the signing secret is one global env. Acceptable for the demo (single Mattermost channel) but a follow-up for multi-tenant. | **B12** — Webhook endpoint registry (new). |
| D3 | Bring the `data-asset-catalog-service` / SOC sink onto the same signing scheme. Other services that emit webhooks (`connector-management-service` does **inbound** verification with the same scheme; nothing else emits outbound today). | Tracked when the next service grows an outbound webhook. |
| D4 | Replace the in-band, in-process retry loop with an outbox + Kafka delivery path (so retries survive a service restart). Today, an in-flight retry is lost if the pod restarts. The 3-attempt window completes inside ~7s of wall time so the demo blast radius is small. | **B13** — Notification outbox (new). |

## Acceptance criteria for the geopolitics PoC

1. A Mattermost / Slack webhook delivered by this service carries the
   two signature headers and a receiver can verify with
   `HMAC_SHA256(secret, "<ts>.<body>")` in constant time against the
   `v1=` component. *(Covered by `TestPostWebhook_SignatureVerifiesAtReceiver`.)*
2. With the signing secret unset (air-gapped demo box variant), the
   POST still goes out unsigned and the test fixtures stay green.
   *(Covered by `TestPostWebhook_NoSigningWhenSecretEmpty`.)*
3. A flaky webhook receiver returning `502 → 502 → 200` resolves as
   `sent` with `attempts=3` recorded in the deliveries row.
   *(Covered by `TestPostWebhook_RetriesOn5xx_ThenSucceeds`.)*
4. A receiver returning `500` forever ends with
   `notification_deliveries.status = 'failed_after_retries'` and the
   response field encodes the attempt count + last status — the SOC
   has the audit row to point at. *(Covered by
   `TestPostWebhook_FailedAfterRetries_DLQStatus`.)*
5. The `/approvals` route shows real approval rows from
   `workflow-automation-service`, not a misnamed audit dashboard.
   Approve / Reject buttons round-trip a real
   `POST /api/v1/approvals/{id}/decide` request. *(Manual smoke
   against a seeded approval row; the component compiles under
   `tsc -b --noEmit`.)*
6. *(Deferred → D1.)* "Due in 2h, escalate" timer flips the row to
   `escalated` automatically.

## Verification commands

```sh
go test ./services/notification-alerting-service/internal/service/...
go build ./services/notification-alerting-service/...
pnpm --filter @open-foundry/web check
```

All three should be green on `main` of this branch.

## Cross-references

- **B11** — Approvals SLA timer worker (escalation, due_at, expired transition).
- **B12** — Webhook endpoint registry (per-endpoint signing secret + filters).
- **B13** — Notification outbox (durable retry across restarts).
- [`../09-workflows-y-acciones.md`](../09-workflows-y-acciones.md) — the Watchlist → Alert → InvestigationCase flow that emits the `case-opened` webhook payload.
- [`../10-seguridad-y-gobierno.md`](../10-seguridad-y-gobierno.md) — the audit trail row shape, including the `side_effects[]` array the signed webhook is recorded in.
- [`../13-riesgos-y-plan-b.md`](../13-riesgos-y-plan-b.md) — Plan B narrative for the failed webhook case.

## Files touched in this phase

- `services/notification-alerting-service/internal/service/channels.go` — `WebhookSigner` + `WebhookRetryPolicy` types, `PostWebhook` rewrite (HMAC + retry + DLQ status), dispatch path for slack/teams now passes signer + policy.
- `services/notification-alerting-service/internal/service/notifier.go` — `Notifier.WebhookSigner` and `Notifier.WebhookRetry` fields.
- `services/notification-alerting-service/internal/service/webhook_test.go` — eight unit tests covering signer determinism, header presence, retry-then-success, DLQ status, 4xx fast-fail, 429 retried, receiver-side signature verification.
- `services/notification-alerting-service/internal/config/config.go` — `WebhookSigningSecret` field + `WEBHOOK_SIGNING_SECRET` env plumbing.
- `services/notification-alerting-service/cmd/notification-alerting-service/main.go` — wires the signer + default retry policy into the Notifier.
- `services/notification-alerting-service/internal/openapi/openapi.yaml` — top-of-file documentation of the signature scheme and retry / DLQ accounting.
- `apps/web/src/routes/approvals/ApprovalsPage.tsx` — new page (TanStack Query, status filter chips, decide actions).
- `apps/web/src/router.tsx` — `/approvals` → ApprovalsPage; `/audit` → AuditPage (the inverse redirect is removed).
- `apps/web/src/lib/api/workflows.ts` — `listWorkflowApprovals` and `decideWorkflowApproval` retargeted to the canonical `/approvals` paths.
- `PoC/geopolitica/blockers/B05-notifications.md` (this file) + `README.md` index row.
