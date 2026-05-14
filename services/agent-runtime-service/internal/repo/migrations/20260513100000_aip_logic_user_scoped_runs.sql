-- AIPLE.15: user-scoped Logic execution context, private run logs, and
-- 24-hour retention for user-scoped execution history.
CREATE TABLE IF NOT EXISTS logic_runs (
    id UUID PRIMARY KEY,
    logic_file_id UUID NOT NULL REFERENCES logic_files(id) ON DELETE CASCADE,
    published_version_id UUID NOT NULL REFERENCES logic_versions(id) ON DELETE RESTRICT,
    function_rid TEXT NOT NULL,
    actor_id UUID NOT NULL,
    execution_mode TEXT NOT NULL
        CHECK (execution_mode IN ('user_scoped', 'project_scoped')),
    permission_subject_kind TEXT NOT NULL
        CHECK (permission_subject_kind IN ('user', 'project')),
    permission_subject_id UUID NOT NULL,
    invocation_surface TEXT NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('succeeded', 'failed')),
    inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    retention_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logic_runs_file_actor_created
    ON logic_runs(logic_file_id, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logic_runs_retention
    ON logic_runs(retention_expires_at);
CREATE INDEX IF NOT EXISTS idx_logic_runs_function_created
    ON logic_runs(function_rid, created_at DESC);
