CREATE TABLE IF NOT EXISTS app_audit_events (
    id UUID PRIMARY KEY,
    app_id UUID,
    app_slug TEXT,
    version_id UUID,
    actor_id UUID,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    permission TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_audit_events_app_id_created_at
    ON app_audit_events(app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_audit_events_actor_created_at
    ON app_audit_events(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_audit_events_event_type_created_at
    ON app_audit_events(event_type, created_at DESC);
