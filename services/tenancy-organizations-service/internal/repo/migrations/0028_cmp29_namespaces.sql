-- residency: us-east-1
-- 0028: CMP.29 - Compass namespaces.
--
-- A namespace is the top-level container the user sees in the Compass
-- breadcrumb (e.g. "Governance Documentation Namespace"). Projects belong
-- to at most one namespace; the column is nullable so existing projects
-- migrate cleanly without backfill.

CREATE TABLE IF NOT EXISTS compass_namespaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    organization_id UUID NULL,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS compass_namespaces_slug_uniq
    ON compass_namespaces (COALESCE(organization_id::text, ''), slug);

ALTER TABLE ontology_projects
    ADD COLUMN IF NOT EXISTS namespace_id UUID NULL REFERENCES compass_namespaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ontology_projects_namespace_idx
    ON ontology_projects (namespace_id)
    WHERE namespace_id IS NOT NULL;
