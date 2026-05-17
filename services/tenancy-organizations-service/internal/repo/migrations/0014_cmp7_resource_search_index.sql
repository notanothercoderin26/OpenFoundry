-- residency: us-east-1
-- 0014: CMP.7 - Compass resource search index.
--
-- Materializes the per-resource catalog/search projection used by Compass-style
-- discovery. Mutating handlers update this table in the same transaction as
-- the resource write and emit an outbox event so external search backends can
-- subscribe without polling every resource table.

CREATE SCHEMA IF NOT EXISTS outbox;

CREATE TABLE IF NOT EXISTS outbox.events (
    event_id     UUID PRIMARY KEY,
    aggregate    TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload      JSONB NOT NULL,
    headers      JSONB NOT NULL DEFAULT '{}'::jsonb,
    topic        TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE outbox.events REPLICA IDENTITY FULL;
EXCEPTION
    WHEN insufficient_privilege THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS compass_resource_search_index (
    resource_rid       TEXT PRIMARY KEY,
    resource_type      TEXT NOT NULL,
    display_name       TEXT NOT NULL,
    owning_project_id  UUID NULL,
    owning_project_rid TEXT NULL,
    organization_rids  JSONB NOT NULL DEFAULT '[]'::jsonb,
    marking_rids       JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_modified_at   TIMESTAMPTZ NOT NULL,
    owner_id           UUID NULL,
    tags               JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary            TEXT NOT NULL DEFAULT '',
    open_url           TEXT NOT NULL DEFAULT '',
    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,
    indexed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    search_vector      TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', COALESCE(display_name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(summary, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(resource_rid, '')), 'C') ||
        setweight(to_tsvector('simple', COALESCE(resource_type, '')), 'C')
    ) STORED
);

CREATE INDEX IF NOT EXISTS compass_resource_search_type_project_idx
    ON compass_resource_search_index (resource_type, owning_project_id, last_modified_at DESC);

CREATE INDEX IF NOT EXISTS compass_resource_search_owner_idx
    ON compass_resource_search_index (owner_id, last_modified_at DESC)
    WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS compass_resource_search_last_modified_idx
    ON compass_resource_search_index (last_modified_at DESC);

CREATE INDEX IF NOT EXISTS compass_resource_search_organizations_gin
    ON compass_resource_search_index USING GIN (organization_rids jsonb_path_ops);

CREATE INDEX IF NOT EXISTS compass_resource_search_markings_gin
    ON compass_resource_search_index USING GIN (marking_rids jsonb_path_ops);

CREATE INDEX IF NOT EXISTS compass_resource_search_tags_gin
    ON compass_resource_search_index USING GIN (tags jsonb_path_ops);

CREATE INDEX IF NOT EXISTS compass_resource_search_vector_gin
    ON compass_resource_search_index USING GIN (search_vector);

INSERT INTO compass_resource_search_index (
    resource_rid,
    resource_type,
    display_name,
    owning_project_id,
    owning_project_rid,
    organization_rids,
    marking_rids,
    last_modified_at,
    owner_id,
    tags,
    summary,
    open_url,
    is_deleted
)
SELECT
    COALESCE(p.rid, 'ri.compass.main.project.' || p.id::text),
    'project',
    p.display_name,
    p.id,
    COALESCE(p.rid, 'ri.compass.main.project.' || p.id::text),
    COALESCE(p.organization_rids, '[]'::jsonb),
    COALESCE(p.marking_rids, '[]'::jsonb),
    p.updated_at,
    p.owner_id,
    '[]'::jsonb,
    COALESCE(p.description, ''),
    '/projects/' || COALESCE(p.rid, 'ri.compass.main.project.' || p.id::text),
    COALESCE(p.is_deleted, FALSE)
FROM ontology_projects p
ON CONFLICT (resource_rid) DO UPDATE SET
    resource_type = EXCLUDED.resource_type,
    display_name = EXCLUDED.display_name,
    owning_project_id = EXCLUDED.owning_project_id,
    owning_project_rid = EXCLUDED.owning_project_rid,
    organization_rids = EXCLUDED.organization_rids,
    marking_rids = EXCLUDED.marking_rids,
    last_modified_at = EXCLUDED.last_modified_at,
    owner_id = EXCLUDED.owner_id,
    tags = EXCLUDED.tags,
    summary = EXCLUDED.summary,
    open_url = EXCLUDED.open_url,
    is_deleted = EXCLUDED.is_deleted,
    indexed_at = NOW();

INSERT INTO compass_resource_search_index (
    resource_rid,
    resource_type,
    display_name,
    owning_project_id,
    owning_project_rid,
    organization_rids,
    marking_rids,
    last_modified_at,
    owner_id,
    tags,
    summary,
    open_url,
    is_deleted
)
SELECT
    COALESCE(f.rid, 'ri.compass.main.folder.' || f.id::text),
    'folder',
    f.name,
    f.project_id,
    COALESCE(p.rid, 'ri.compass.main.project.' || p.id::text),
    COALESCE(p.organization_rids, '[]'::jsonb),
    COALESCE(p.marking_rids, '[]'::jsonb),
    f.updated_at,
    f.created_by,
    '[]'::jsonb,
    COALESCE(f.description, ''),
    '/projects/' || COALESCE(p.rid, 'ri.compass.main.project.' || p.id::text) ||
        '/folders/' || COALESCE(f.rid, 'ri.compass.main.folder.' || f.id::text),
    COALESCE(f.is_deleted, FALSE)
FROM ontology_project_folders f
JOIN ontology_projects p ON p.id = f.project_id
ON CONFLICT (resource_rid) DO UPDATE SET
    resource_type = EXCLUDED.resource_type,
    display_name = EXCLUDED.display_name,
    owning_project_id = EXCLUDED.owning_project_id,
    owning_project_rid = EXCLUDED.owning_project_rid,
    organization_rids = EXCLUDED.organization_rids,
    marking_rids = EXCLUDED.marking_rids,
    last_modified_at = EXCLUDED.last_modified_at,
    owner_id = EXCLUDED.owner_id,
    tags = EXCLUDED.tags,
    summary = EXCLUDED.summary,
    open_url = EXCLUDED.open_url,
    is_deleted = EXCLUDED.is_deleted,
    indexed_at = NOW();
