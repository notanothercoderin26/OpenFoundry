-- SDC.21: first-class CDC sync setup metadata.
--
-- CDC syncs write to streams rather than batch datasets, so the generic sync
-- definition needs output-kind metadata plus the changelog resolution contract
-- derived from the connector.

ALTER TABLE batch_sync_defs
    ALTER COLUMN output_dataset_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS capability_type TEXT NOT NULL DEFAULT 'batch_sync',
    ADD COLUMN IF NOT EXISTS output_kind TEXT NOT NULL DEFAULT 'dataset',
    ADD COLUMN IF NOT EXISTS output_stream_id TEXT,
    ADD COLUMN IF NOT EXISTS output_media_set_id TEXT,
    ADD COLUMN IF NOT EXISTS source_selector TEXT,
    ADD COLUMN IF NOT EXISTS source_path TEXT,
    ADD COLUMN IF NOT EXISTS source_table TEXT,
    ADD COLUMN IF NOT EXISTS source_topic TEXT,
    ADD COLUMN IF NOT EXISTS schema_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS write_mode TEXT,
    ADD COLUMN IF NOT EXISTS transaction_mode TEXT,
    ADD COLUMN IF NOT EXISTS build_integration TEXT,
    ADD COLUMN IF NOT EXISTS dataset_transaction_type TEXT,
    ADD COLUMN IF NOT EXISTS file_sync JSONB,
    ADD COLUMN IF NOT EXISTS table_sync JSONB,
    ADD COLUMN IF NOT EXISTS cdc_sync JSONB;

UPDATE batch_sync_defs
SET capability_type = COALESCE(NULLIF(capability_type, ''), 'batch_sync'),
    output_kind = CASE
        WHEN output_stream_id IS NOT NULL THEN 'stream'
        WHEN output_media_set_id IS NOT NULL THEN 'media_set'
        ELSE COALESCE(NULLIF(output_kind, ''), 'dataset')
    END,
    schema_json = COALESCE(schema_json, '[]'::jsonb);

ALTER TABLE batch_sync_defs
    DROP CONSTRAINT IF EXISTS batch_sync_defs_capability_type_check,
    ADD CONSTRAINT batch_sync_defs_capability_type_check
        CHECK (capability_type IN ('batch_sync','streaming_sync','cdc_sync','media_sync')),
    DROP CONSTRAINT IF EXISTS batch_sync_defs_output_kind_check,
    ADD CONSTRAINT batch_sync_defs_output_kind_check
        CHECK (output_kind IN ('dataset','stream','media_set')),
    DROP CONSTRAINT IF EXISTS batch_sync_defs_output_target_check,
    ADD CONSTRAINT batch_sync_defs_output_target_check
        CHECK (
            (output_kind = 'dataset' AND output_dataset_id IS NOT NULL)
            OR (output_kind = 'stream' AND output_stream_id IS NOT NULL)
            OR (output_kind = 'media_set' AND output_media_set_id IS NOT NULL)
        ),
    DROP CONSTRAINT IF EXISTS batch_sync_defs_cdc_shape_check,
    ADD CONSTRAINT batch_sync_defs_cdc_shape_check
        CHECK (capability_type <> 'cdc_sync' OR (output_kind = 'stream' AND cdc_sync IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_batch_sync_defs_capability
    ON batch_sync_defs(source_id, capability_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_sync_defs_output_stream
    ON batch_sync_defs(output_stream_id)
    WHERE output_stream_id IS NOT NULL;
