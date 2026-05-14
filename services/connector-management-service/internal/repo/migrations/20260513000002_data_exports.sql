-- connector-management-service · Data Connection export resources.
--
-- Data Connection exports push Foundry datasets or streams to an external
-- source. The first-class model tracks file, table, and streaming exports with
-- their destination, schedule/start-stop semantics, governance controls,
-- operational history, and health.

CREATE TABLE IF NOT EXISTS data_exports (
    id UUID PRIMARY KEY,
    source_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    export_type TEXT NOT NULL CHECK (export_type IN ('file', 'table', 'streaming')),
    export_mode TEXT NOT NULL,
    input_dataset_id UUID,
    input_dataset_rid TEXT,
    input_stream_id TEXT,
    destination_path TEXT,
    destination_table TEXT,
    destination_topic TEXT,
    schedule_cron TEXT,
    start_behavior TEXT NOT NULL DEFAULT 'manual',
    stop_behavior TEXT NOT NULL DEFAULT 'after_run',
    export_controls JSONB NOT NULL DEFAULT '{}'::jsonb,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',
    health JSONB NOT NULL DEFAULT '{"state":"not_run"}'::jsonb,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_run_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (export_type = 'streaming' AND input_stream_id IS NOT NULL)
        OR (export_type IN ('file', 'table') AND (input_dataset_id IS NOT NULL OR NULLIF(input_dataset_rid, '') IS NOT NULL))
    ),
    CHECK (
        (export_type = 'file' AND destination_path IS NOT NULL)
        OR (export_type = 'table' AND destination_table IS NOT NULL)
        OR (export_type = 'streaming' AND destination_topic IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_data_exports_source
    ON data_exports(source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_exports_status
    ON data_exports(status);
