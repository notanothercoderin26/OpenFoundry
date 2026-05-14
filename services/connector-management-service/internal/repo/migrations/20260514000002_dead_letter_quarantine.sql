-- SDC.47: Dead-letter sinks and quarantine record storage.
--
-- One dead-letter sink per sync def (stream or dataset RID with retention and
-- redaction rules). A separate quarantine table records records that failed
-- schema validation, serialization, permission checks, or destination writes.
-- Payloads are stored already-redacted (the runtime is responsible for
-- applying the sink's redaction rules before persisting). Retention is
-- enforced at read time via expires_at filtering and at maintenance time via
-- the PurgeExpiredQuarantinedRecords repo method.

CREATE TABLE IF NOT EXISTS sync_dead_letter_sinks (
    sync_def_id     UUID PRIMARY KEY REFERENCES batch_sync_defs(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL DEFAULT 'dataset'
                    CHECK (kind IN ('dataset','stream')),
    target_rid      TEXT NOT NULL,
    retention_days  INT  NOT NULL DEFAULT 14
                    CHECK (retention_days BETWEEN 1 AND 365),
    redaction_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quarantined_records (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_def_id          UUID NOT NULL REFERENCES batch_sync_defs(id) ON DELETE CASCADE,
    run_id               UUID REFERENCES sync_runs(id) ON DELETE SET NULL,
    failure_category     TEXT NOT NULL
                         CHECK (failure_category IN ('schema_validation','serialization','permission_check','destination_write','unknown')),
    error_message        TEXT NOT NULL,
    record_key           TEXT,
    redacted_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    redacted_headers     JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at           TIMESTAMPTZ NOT NULL,
    replay_requested_at  TIMESTAMPTZ,
    replay_requested_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_quarantined_records_def ON quarantined_records(sync_def_id);
CREATE INDEX IF NOT EXISTS idx_quarantined_records_category ON quarantined_records(sync_def_id, failure_category);
CREATE INDEX IF NOT EXISTS idx_quarantined_records_recorded ON quarantined_records(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_quarantined_records_expires ON quarantined_records(expires_at);
