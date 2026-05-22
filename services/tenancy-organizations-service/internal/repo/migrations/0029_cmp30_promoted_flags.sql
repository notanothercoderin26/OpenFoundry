-- residency: us-east-1
-- 0029: CMP.30 - Promoted resources / projects.
--
-- "Promoted" is the Compass curation flag for items deemed authoritative
-- by data stewards. Surfaced in the Compass filter rail under "Status",
-- in the Promoted items quick-filter card, and as a badge on the row.
-- Stewards toggle via /promote endpoints; readers cannot self-promote.

ALTER TABLE ontology_projects
    ADD COLUMN IF NOT EXISTS is_promoted     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS promoted_at     TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS promoted_by     UUID NULL;

ALTER TABLE ontology_project_resources
    ADD COLUMN IF NOT EXISTS is_promoted     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS promoted_at     TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS promoted_by     UUID NULL;

CREATE INDEX IF NOT EXISTS ontology_projects_promoted_idx
    ON ontology_projects (is_promoted)
    WHERE is_promoted = TRUE;

CREATE INDEX IF NOT EXISTS ontology_project_resources_promoted_idx
    ON ontology_project_resources (project_id, is_promoted)
    WHERE is_promoted = TRUE;
