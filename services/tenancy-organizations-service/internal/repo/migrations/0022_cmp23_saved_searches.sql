-- residency: us-east-1
-- 0022: CMP.23 - Compass saved searches.
--
-- Stores per-user Quicksearch/Data Catalog queries so named searches can be
-- rendered in the user's sidebar and synced across devices.

CREATE TABLE IF NOT EXISTS compass_saved_searches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    name            TEXT NOT NULL,
    query           TEXT NOT NULL DEFAULT '',
    tab             TEXT NOT NULL DEFAULT 'files',
    resource_type   TEXT NULL,
    project_id      UUID NULL,
    project_rid     TEXT NULL,
    owner_id        UUID NULL,
    marking_rids    JSONB NOT NULL DEFAULT '[]'::jsonb,
    modified_bucket TEXT NULL,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT compass_saved_searches_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT compass_saved_searches_tab_check CHECK (tab IN ('top', 'apps', 'objects', 'datasets', 'files')),
    CONSTRAINT compass_saved_searches_modified_check CHECK (
        modified_bucket IS NULL OR modified_bucket IN ('24h', '7d', '30d', 'older')
    )
);

CREATE INDEX IF NOT EXISTS compass_saved_searches_user_order_idx
    ON compass_saved_searches (user_id, display_order ASC, updated_at DESC);

CREATE INDEX IF NOT EXISTS compass_saved_searches_user_updated_idx
    ON compass_saved_searches (user_id, updated_at DESC);
