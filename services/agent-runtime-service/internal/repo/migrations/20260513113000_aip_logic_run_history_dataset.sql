-- AIPLE.23: project-scoped Logic run history dataset rows.
-- Project-scoped executions append one permission-scoped JSON row per run and
-- preserve the most recent rows up to the local/documented limit.
ALTER TABLE logic_runs
    ADD COLUMN IF NOT EXISTS run_history_dataset_rid TEXT,
    ADD COLUMN IF NOT EXISTS run_history_dataset_row JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS trace_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS branch_name TEXT,
    ADD COLUMN IF NOT EXISTS model_provider_id TEXT,
    ADD COLUMN IF NOT EXISTS service_context JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_logic_runs_history_dataset_created
    ON logic_runs(run_history_dataset_rid, created_at DESC)
    WHERE run_history_dataset_rid IS NOT NULL;
