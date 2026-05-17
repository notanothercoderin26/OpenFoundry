-- 0010: SG.12 — Marking CRUD and immutable lifecycle.
--
-- Markings live inside SG.11 categories. Public docs model them as
-- mandatory controls with distinct permission grants:
--
--   * administrator — manage marking metadata and permissions.
--   * remover       — remove / expand access for this marking.
--   * applier       — apply this marking to projects/resources.
--   * member        — satisfy this marking for protected resources.
--
-- Markings cannot be deleted or moved to another category; the
-- service exposes blocked endpoints that write audit evidence instead.

CREATE TABLE IF NOT EXISTS markings (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NULL,
    category_id  UUID NOT NULL REFERENCES marking_categories(id) ON DELETE RESTRICT,
    slug         TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by   UUID NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT markings_category_slug_unique UNIQUE (category_id, slug),
    CONSTRAINT markings_metadata_object_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS markings_tenant_category_idx
    ON markings (tenant_id, category_id);

CREATE INDEX IF NOT EXISTS markings_slug_idx
    ON markings (slug);

CREATE TABLE IF NOT EXISTS marking_permissions (
    marking_id     UUID NOT NULL REFERENCES markings(id) ON DELETE CASCADE,
    principal_kind TEXT NOT NULL,
    principal_id   UUID NOT NULL,
    permission     TEXT NOT NULL,
    granted_by     UUID NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (marking_id, principal_kind, principal_id, permission),
    CONSTRAINT marking_permissions_principal_kind_check
        CHECK (principal_kind IN ('user', 'group')),
    CONSTRAINT marking_permissions_permission_check
        CHECK (permission IN ('administrator', 'remover', 'applier', 'member'))
);

CREATE INDEX IF NOT EXISTS marking_permissions_principal_idx
    ON marking_permissions (principal_kind, principal_id);

CREATE TABLE IF NOT EXISTS marking_audit_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NULL,
    category_id    UUID NULL REFERENCES marking_categories(id) ON DELETE SET NULL,
    marking_id     UUID NULL REFERENCES markings(id) ON DELETE SET NULL,
    actor_id       UUID NOT NULL,
    action         TEXT NOT NULL,
    principal_kind TEXT NULL,
    principal_id   UUID NULL,
    permission     TEXT NULL,
    before_state   JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state    JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marking_audit_action_check
        CHECK (action IN (
            'marking.created',
            'marking.updated',
            'marking.permission_granted',
            'marking.permission_revoked',
            'marking.delete_blocked',
            'marking.category_move_blocked'
        )),
    CONSTRAINT marking_audit_principal_kind_check
        CHECK (principal_kind IS NULL OR principal_kind IN ('user', 'group')),
    CONSTRAINT marking_audit_permission_check
        CHECK (permission IS NULL OR permission IN ('administrator', 'remover', 'applier', 'member')),
    CONSTRAINT marking_audit_before_object_check
        CHECK (jsonb_typeof(before_state) = 'object'),
    CONSTRAINT marking_audit_after_object_check
        CHECK (jsonb_typeof(after_state) = 'object'),
    CONSTRAINT marking_audit_metadata_object_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS marking_audit_events_marking_idx
    ON marking_audit_events (marking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marking_audit_events_category_idx
    ON marking_audit_events (category_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marking_audit_events_tenant_idx
    ON marking_audit_events (tenant_id, created_at DESC);
