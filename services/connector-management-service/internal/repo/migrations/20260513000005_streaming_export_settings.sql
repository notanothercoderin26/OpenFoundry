-- connector-management-service · streaming export settings.
--
-- SDC.31 adds streaming-export-specific policy for continuous stream-to-topic
-- exports, restart offsets, schedule-triggered restarts, replay behavior, and
-- duplicate/drop warnings.

ALTER TABLE IF EXISTS data_exports
    ADD COLUMN IF NOT EXISTS streaming_export JSONB NOT NULL DEFAULT '{}'::jsonb;
