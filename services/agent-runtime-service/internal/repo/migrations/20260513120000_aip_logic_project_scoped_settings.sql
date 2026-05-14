-- AIPLE.22: configurable project-scoped run history settings on Logic files.
-- Stores the per-file project-scoped run history dataset RID override and the
-- maximum number of retained run rows so AIP Logic execution settings can
-- preserve run history at a documented or locally configured limit.
ALTER TABLE logic_files
    ADD COLUMN IF NOT EXISTS run_history_max_rows INTEGER NOT NULL DEFAULT 10000
        CHECK (run_history_max_rows BETWEEN 1 AND 1000000),
    ADD COLUMN IF NOT EXISTS run_history_dataset_rid TEXT;
