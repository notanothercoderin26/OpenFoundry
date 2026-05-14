-- AIPLE.17: Evaluation suite CRUD and placement metadata.
CREATE TABLE IF NOT EXISTS eval_suites (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    project_id UUID NOT NULL,
    folder_id UUID NOT NULL,
    owner_id UUID NOT NULL,
    target_functions JSONB NOT NULL DEFAULT '[]'::jsonb,
    test_case_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    test_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
    evaluators JSONB NOT NULL DEFAULT '[]'::jsonb,
    run_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    results_dataset_rid TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_surface TEXT NOT NULL DEFAULT 'aip_evals_app'
        CHECK (source_surface IN ('logic_preview', 'evals_sidebar', 'aip_evals_app', 'code_function_published', 'api')),
    source_resource_id TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (btrim(name) <> ''),
    CHECK (jsonb_typeof(target_functions) = 'array'),
    CHECK (jsonb_typeof(test_case_columns) = 'array'),
    CHECK (jsonb_typeof(test_cases) = 'array'),
    CHECK (jsonb_typeof(evaluators) = 'array'),
    CHECK (jsonb_typeof(run_history) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_eval_suites_project_folder
    ON eval_suites(project_id, folder_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_eval_suites_owner
    ON eval_suites(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_suites_source
    ON eval_suites(source_surface, source_resource_id);
CREATE INDEX IF NOT EXISTS idx_eval_suites_updated
    ON eval_suites(updated_at DESC);
