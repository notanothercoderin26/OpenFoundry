-- AIPLE.13: saved draft versions, published callable Logic functions, and
-- version-history metadata for comparison views.
CREATE TABLE IF NOT EXISTS logic_versions (
    id UUID PRIMARY KEY,
    logic_file_id UUID NOT NULL REFERENCES logic_files(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    author_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'superseded')),
    definition JSONB NOT NULL DEFAULT '{"inputs":[],"blocks":[],"outputs":[]}'::jsonb,
    change_summary JSONB NOT NULL DEFAULT
        '{"inputs":[],"blocks":[],"outputs":[],"prompt_changes":[],"model_changes":[]}'::jsonb,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (logic_file_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_logic_versions_file_number
    ON logic_versions(logic_file_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_logic_versions_status
    ON logic_versions(logic_file_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS logic_functions (
    id UUID PRIMARY KEY,
    logic_file_id UUID NOT NULL REFERENCES logic_files(id) ON DELETE CASCADE,
    published_version_id UUID NOT NULL REFERENCES logic_versions(id) ON DELETE RESTRICT,
    function_rid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    signature JSONB NOT NULL DEFAULT '{"inputs":[],"outputs":[]}'::jsonb,
    definition JSONB NOT NULL,
    published_by UUID NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (logic_file_id)
);

CREATE INDEX IF NOT EXISTS idx_logic_functions_version
    ON logic_functions(published_version_id);

-- Backfill a baseline draft version for AIPLE.1 Logic files created before
-- this migration. New application code creates the first draft in the same
-- transaction as the Logic file.
INSERT INTO logic_versions (
    id,
    logic_file_id,
    version_number,
    author_id,
    status,
    definition,
    change_summary,
    created_at
)
SELECT
    current_draft_version_id,
    id,
    1,
    owner_id,
    'draft',
    '{"inputs":[],"blocks":[],"outputs":[]}'::jsonb,
    '{"inputs":[],"blocks":[],"outputs":[],"prompt_changes":[],"model_changes":[]}'::jsonb,
    created_at
FROM logic_files
WHERE NOT EXISTS (
    SELECT 1
    FROM logic_versions existing
    WHERE existing.logic_file_id = logic_files.id
)
ON CONFLICT (id) DO NOTHING;
