-- connector-management-service · file export settings.
--
-- SDC.29 adds file-export-specific policy for modified-file incrementality,
-- overwrite behavior, destination subfolder guidance, one-off full re-export
-- requests, and source file manifests used to record export history.

ALTER TABLE IF EXISTS data_exports
    ADD COLUMN IF NOT EXISTS file_export JSONB NOT NULL DEFAULT '{}'::jsonb;
