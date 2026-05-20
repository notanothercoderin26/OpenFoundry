-- B05 acceptance #1 / #2 / #3 / #6.
--
-- `notification_subscriptions` is the per-event-type subscriber list:
-- "for event_type X, deliver to channel Y at target Z with template T".
-- Each subscription owns its own HMAC secret (NULL = no signing) and
-- optional SLA escalation target.
--
-- `notification_events` is the inbound side: the raw payload submitted
-- by ontology-actions-service / workflow-automation-service. One event
-- triggers N deliveries (one per matching subscription).
--
-- `notification_event_deliveries` is the audit trail + the retry
-- queue. Status state machine:
--   pending  → first attempt not yet made
--   sent     → terminal success (HTTP 2xx for webhook; row written
--              for in_app)
--   retrying → at least one failure; next attempt scheduled
--   failed   → final failure (DLQ); no more retries
--   escalated → SLA timer fired (still considered terminal for
--              retry purposes)
--
-- Indexes: pull pending/retrying rows from oldest scheduled_at first.

CREATE TABLE IF NOT EXISTS notification_subscriptions (
    id                   UUID PRIMARY KEY,
    event_type           TEXT        NOT NULL,
    channel              TEXT        NOT NULL,
    target               TEXT        NOT NULL,
    template             JSONB       NOT NULL DEFAULT '{}'::jsonb,
    hmac_secret          TEXT,
    sla_seconds          INTEGER,
    escalation_target    TEXT,
    enabled              BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_event_type
    ON notification_subscriptions(event_type)
    WHERE enabled;

CREATE TABLE IF NOT EXISTS notification_events (
    id          UUID PRIMARY KEY,
    event_type  TEXT        NOT NULL,
    payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    source      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_events_type_created
    ON notification_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_event_deliveries (
    id                  UUID PRIMARY KEY,
    event_id            UUID        NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
    subscription_id     UUID        NOT NULL REFERENCES notification_subscriptions(id) ON DELETE CASCADE,
    channel             TEXT        NOT NULL,
    target              TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'pending',
    attempt             INTEGER     NOT NULL DEFAULT 0,
    max_attempts        INTEGER     NOT NULL DEFAULT 3,
    last_error          TEXT,
    signature_header    TEXT,
    scheduled_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_attempt_at     TIMESTAMPTZ,
    response            TEXT,
    sla_due_at          TIMESTAMPTZ,
    escalation_target   TEXT,
    escalated_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pull rows that need work, oldest first.
CREATE INDEX IF NOT EXISTS idx_notification_event_deliveries_due
    ON notification_event_deliveries(status, scheduled_at)
    WHERE status IN ('pending', 'retrying');

-- SLA escalation scan: pending deliveries whose due-by has passed.
CREATE INDEX IF NOT EXISTS idx_notification_event_deliveries_sla
    ON notification_event_deliveries(sla_due_at)
    WHERE status IN ('pending', 'retrying', 'sent') AND escalated_at IS NULL;

-- Audit / "GET /events/{id}/deliveries" listing.
CREATE INDEX IF NOT EXISTS idx_notification_event_deliveries_event
    ON notification_event_deliveries(event_id, created_at);
