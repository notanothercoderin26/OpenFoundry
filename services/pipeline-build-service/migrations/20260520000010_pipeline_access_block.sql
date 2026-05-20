-- Pipeline Builder access block:
--   - link sharing (tokenized share URL)
--   - resource-level role grants (per user/group)
--   - followers (subscribe to pipeline activity)
-- Mirrors the access primitives used by vertex-service (graph_grant /
-- vertex_link_share). The pipeline owner is implicit via pipelines.owner_id;
-- grants and link-shares only encode non-owner access.

ALTER TABLE pipelines
    ADD COLUMN IF NOT EXISTS link_sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS link_share_token     TEXT,
    ADD COLUMN IF NOT EXISTS link_share_role      TEXT;

ALTER TABLE pipelines
    DROP CONSTRAINT IF EXISTS pipelines_link_share_role_check;
ALTER TABLE pipelines
    ADD CONSTRAINT pipelines_link_share_role_check
        CHECK (link_share_role IS NULL
               OR link_share_role IN ('discoverer', 'viewer', 'editor'));

CREATE UNIQUE INDEX IF NOT EXISTS pipelines_link_share_token_idx
    ON pipelines(link_share_token)
    WHERE link_share_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS pipeline_grants (
    id              UUID PRIMARY KEY,
    pipeline_id     UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    principal_kind  TEXT NOT NULL CHECK (principal_kind IN ('user', 'group')),
    principal_id    UUID NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer', 'discoverer')),
    granted_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (pipeline_id, principal_kind, principal_id)
);

CREATE INDEX IF NOT EXISTS pipeline_grants_pipeline_idx
    ON pipeline_grants (pipeline_id);
CREATE INDEX IF NOT EXISTS pipeline_grants_principal_idx
    ON pipeline_grants (principal_kind, principal_id);

CREATE TABLE IF NOT EXISTS pipeline_followers (
    pipeline_id     UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    follower_id     UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (pipeline_id, follower_id)
);

CREATE INDEX IF NOT EXISTS pipeline_followers_follower_idx
    ON pipeline_followers (follower_id);
