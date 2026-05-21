-- residency: us-east-1
-- 0026: CMP.27 - Project-level external references.
--
-- An external reference points to a resource living outside this Compass
-- instance (Foundry-compatible domain, vendor API, etc.). Internal references
-- between resources already live in compass_resource_references and are
-- aggregated at the project level on read; this table is only for URLs that
-- have no internal counterpart.

CREATE TABLE IF NOT EXISTS compass_project_external_references (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES ontology_projects(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    url         TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    added_by    UUID NOT NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS compass_project_external_references_project_idx
    ON compass_project_external_references (project_id, added_at DESC);
