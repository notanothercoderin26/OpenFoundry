-- connector-management-service · table export settings.
--
-- SDC.30 adds table-export-specific policy for schema-bearing dataset row
-- exports into external database tables, including mirror/full-snapshot modes,
-- destination table existence, Parquet backing, schema matching, truncate
-- permission, and validation history.

ALTER TABLE IF EXISTS data_exports
    ADD COLUMN IF NOT EXISTS table_export JSONB NOT NULL DEFAULT '{}'::jsonb;
