-- residency: us-east-1
-- 0024: CMP.25 - Project-level resource pinning.
--
-- A pin marks a bound resource as "important to this project" and is shared
-- across all members of the project. This is distinct from the per-user
-- favorites stored in compass_favorites: pins are project-scoped and visible
-- to everyone with access; favorites are private to the user who set them.
-- The pinned_at timestamp also determines the display order of the Pinned
-- band in the project dashboard.

ALTER TABLE ontology_project_resources
    ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS pinned_by UUID NULL;

CREATE INDEX IF NOT EXISTS idx_ontology_project_resources_pinned
    ON ontology_project_resources(project_id, pinned_at DESC)
    WHERE pinned_at IS NOT NULL;
