-- 0009: SG.11 — Marking categories.
--
-- Foundry marking categories are administrative containers for markings.
-- Public docs call out four parity constraints that this slice models:
--
--   1. category metadata: slug/display name/description plus arbitrary
--      metadata for local governance fields.
--   2. category visibility: visible by default, hidden when existence is
--      itself sensitive.
--   3. category permissions: administrator and viewer grants, to users or
--      groups.
--   4. immutable lifecycle: categories cannot be deleted; operators hide
--      them instead. The DELETE endpoint is intentionally blocked and
--      audited.

CREATE TABLE IF NOT EXISTS marking_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NULL,
    slug            TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    visibility      TEXT NOT NULL DEFAULT 'visible',
    organization_id UUID NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marking_categories_tenant_slug_unique UNIQUE (tenant_id, slug),
    CONSTRAINT marking_categories_visibility_check
        CHECK (visibility IN ('visible', 'hidden')),
    CONSTRAINT marking_categories_metadata_object_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS marking_categories_global_slug_unique
    ON marking_categories (slug)
    WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS marking_categories_tenant_visibility_idx
    ON marking_categories (tenant_id, visibility);

CREATE INDEX IF NOT EXISTS marking_categories_organization_idx
    ON marking_categories (organization_id)
    WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS marking_category_permissions (
    category_id    UUID NOT NULL REFERENCES marking_categories(id) ON DELETE CASCADE,
    principal_kind TEXT NOT NULL,
    principal_id   UUID NOT NULL,
    permission     TEXT NOT NULL,
    granted_by     UUID NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (category_id, principal_kind, principal_id, permission),
    CONSTRAINT marking_category_permissions_principal_kind_check
        CHECK (principal_kind IN ('user', 'group')),
    CONSTRAINT marking_category_permissions_permission_check
        CHECK (permission IN ('administrator', 'viewer'))
);

CREATE INDEX IF NOT EXISTS marking_category_permissions_principal_idx
    ON marking_category_permissions (principal_kind, principal_id);

CREATE TABLE IF NOT EXISTS marking_category_audit_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NULL,
    category_id     UUID NULL REFERENCES marking_categories(id) ON DELETE SET NULL,
    actor_id        UUID NOT NULL,
    action          TEXT NOT NULL,
    principal_kind  TEXT NULL,
    principal_id    UUID NULL,
    permission      TEXT NULL,
    before_state    JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state     JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marking_category_audit_action_check
        CHECK (action IN (
            'category.created',
            'category.updated',
            'category.permission_granted',
            'category.permission_revoked',
            'category.delete_blocked'
        )),
    CONSTRAINT marking_category_audit_principal_kind_check
        CHECK (principal_kind IS NULL OR principal_kind IN ('user', 'group')),
    CONSTRAINT marking_category_audit_permission_check
        CHECK (permission IS NULL OR permission IN ('administrator', 'viewer')),
    CONSTRAINT marking_category_audit_before_object_check
        CHECK (jsonb_typeof(before_state) = 'object'),
    CONSTRAINT marking_category_audit_after_object_check
        CHECK (jsonb_typeof(after_state) = 'object'),
    CONSTRAINT marking_category_audit_metadata_object_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS marking_category_audit_events_category_idx
    ON marking_category_audit_events (category_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marking_category_audit_events_tenant_idx
    ON marking_category_audit_events (tenant_id, created_at DESC);

INSERT INTO permissions (id, resource, action, description) VALUES
    ('0196c3f2-1100-7000-8000-000000000001', 'markings', 'read',  'List and inspect marking categories and visible metadata'),
    ('0196c3f2-1100-7000-8000-000000000002', 'markings', 'write', 'Create marking categories and manage category permissions'),
    ('0196c3f2-1100-7000-8000-000000000003', 'markings', 'audit', 'Read marking category audit events')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
    ('0196c3f1-7100-7000-8000-000000000031', '0196c3f2-1100-7000-8000-000000000001'),
    ('0196c3f1-7100-7000-8000-000000000033', '0196c3f2-1100-7000-8000-000000000001'),
    ('0196c3f1-7100-7000-8000-000000000033', '0196c3f2-1100-7000-8000-000000000002'),
    ('0196c3f1-7100-7000-8000-000000000033', '0196c3f2-1100-7000-8000-000000000003')
ON CONFLICT (role_id, permission_id) DO NOTHING;
