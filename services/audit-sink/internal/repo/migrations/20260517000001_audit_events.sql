-- Append-only hot store for AuditEnvelope records consumed from
-- audit.events.v1. Iceberg (`of_audit.events`) remains the cold tier;
-- this table is the queryable surface served by AuditService.QueryEvents.
--
-- event_id is the deterministic v5 UUID emitted by libs/audit-trail so
-- a replay after a crash collapses to ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS audit_events (
    event_id          UUID PRIMARY KEY,
    occurred_at       TIMESTAMPTZ NOT NULL,
    kind              TEXT NOT NULL,
    categories        TEXT[] NOT NULL DEFAULT '{}',
    actor_id          TEXT NOT NULL DEFAULT '',
    resource_rid      TEXT NOT NULL DEFAULT '',
    project_rid       TEXT NOT NULL DEFAULT '',
    action            TEXT NOT NULL DEFAULT '',
    markings_at_event TEXT[] NOT NULL DEFAULT '{}',
    source_service    TEXT NOT NULL DEFAULT '',
    request_id        TEXT NOT NULL DEFAULT '',
    correlation_id    TEXT NOT NULL DEFAULT '',
    ip                TEXT NOT NULL DEFAULT '',
    user_agent        TEXT NOT NULL DEFAULT '',
    payload           JSONB NOT NULL,
    envelope          JSONB NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_occurred_at
    ON audit_events (actor_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_resource_occurred_at
    ON audit_events (resource_rid, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_action_occurred_at
    ON audit_events (action, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
    ON audit_events (created_at DESC, event_id);
