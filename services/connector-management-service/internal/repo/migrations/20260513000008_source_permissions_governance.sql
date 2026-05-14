-- connector-management-service · Source permissions and governance.
--
-- Data Connection source visibility, credential metadata visibility, external
-- sample visibility, and output dataset permissions are intentionally stored as
-- separate governance surfaces. Source permissions grant access to the source;
-- output datasets keep their own dataset-service permissions.

CREATE TABLE IF NOT EXISTS source_permission_grants (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id      UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    principal_id   TEXT NOT NULL,
    principal_type TEXT NOT NULL DEFAULT 'user'
                   CHECK (principal_type IN ('user','group','service_account','organization')),
    principal_name TEXT NOT NULL DEFAULT '',
    roles          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    granted_by     UUID,
    reason         TEXT NOT NULL DEFAULT '',
    expires_at     TIMESTAMPTZ,
    granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_id, principal_type, principal_id)
);

CREATE INDEX IF NOT EXISTS idx_source_permission_grants_source
    ON source_permission_grants(source_id);
CREATE INDEX IF NOT EXISTS idx_source_permission_grants_principal
    ON source_permission_grants(principal_type, principal_id);
CREATE INDEX IF NOT EXISTS idx_source_permission_grants_roles
    ON source_permission_grants USING GIN(roles);

CREATE TABLE IF NOT EXISTS source_visibility_policies (
    source_id                              UUID PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
    source_visibility_roles                TEXT[] NOT NULL DEFAULT ARRAY['source_view','source_edit','source_owner']::TEXT[],
    credential_visibility_roles            TEXT[] NOT NULL DEFAULT ARRAY['source_edit','code_import','source_owner']::TEXT[],
    external_sample_visibility_roles       TEXT[] NOT NULL DEFAULT ARRAY['source_use','source_edit','source_owner']::TEXT[],
    output_dataset_permission_roles        TEXT[] NOT NULL DEFAULT ARRAY['dataset:view','dataset:edit']::TEXT[],
    credential_values_visible              BOOLEAN NOT NULL DEFAULT FALSE,
    external_samples_persisted             BOOLEAN NOT NULL DEFAULT FALSE,
    output_dataset_permissions_enforced    BOOLEAN NOT NULL DEFAULT TRUE,
    output_dataset_permission_system       TEXT NOT NULL DEFAULT 'dataset-service',
    created_at                             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_governance_audit_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id               UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    actor_id                UUID,
    event_type              TEXT NOT NULL,
    action                  TEXT NOT NULL,
    result                  TEXT NOT NULL DEFAULT 'succeeded',
    principal_id            TEXT NOT NULL DEFAULT '',
    principal_type          TEXT NOT NULL DEFAULT '',
    roles                   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    capability              TEXT NOT NULL DEFAULT '',
    job_rid                 TEXT NOT NULL DEFAULT '',
    downstream_resource_rid TEXT NOT NULL DEFAULT '',
    message                 TEXT NOT NULL DEFAULT '',
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_governance_audit_source_created
    ON source_governance_audit_events(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_governance_audit_actor
    ON source_governance_audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_source_governance_audit_event_type
    ON source_governance_audit_events(event_type);
