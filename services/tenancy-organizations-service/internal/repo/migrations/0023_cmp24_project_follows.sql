-- residency: us-east-1
-- 0023: CMP.24 - Project follows for resource recommendations.
--
-- Stores explicit per-user project follows. Recommendations use these follows
-- alongside collaborator activity and recent opens, always intersected with
-- the caller's current accessible projects before returning resources.

CREATE TABLE IF NOT EXISTS compass_project_follows (
    user_id    UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES ontology_projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS compass_project_follows_project_idx
    ON compass_project_follows (project_id, created_at DESC);
