-- SDC.40: Automatic retries and failure recovery.
--
-- Stores per-source retry/backoff policies for the four failure categories
-- (source, network, credential, destination) and a separate failure-context
-- table that captures the attempt counter, next-retry timestamp, failure
-- category, and a small checkpoint summary so transient failures do not force
-- a full rerun. The base sync_runs row is left untouched; SDC.40 reads this
-- table alongside the existing sync run history to drive retry decisions and
-- Data Health escalation.

CREATE TABLE IF NOT EXISTS source_retry_policies (
    source_id     UUID PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
    categories    JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by    TEXT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_run_failures (
    run_id              UUID PRIMARY KEY REFERENCES sync_runs(id) ON DELETE CASCADE,
    sync_def_id         UUID NOT NULL REFERENCES batch_sync_defs(id) ON DELETE CASCADE,
    attempt             INT NOT NULL DEFAULT 1
                        CHECK (attempt >= 1),
    max_attempts        INT NOT NULL DEFAULT 1
                        CHECK (max_attempts >= 1),
    failure_category    TEXT NOT NULL DEFAULT 'source'
                        CHECK (failure_category IN ('source','network','credential','destination','unknown')),
    error_message       TEXT,
    next_retry_at       TIMESTAMPTZ,
    has_checkpoint      BOOLEAN NOT NULL DEFAULT FALSE,
    checkpoint_summary  TEXT,
    escalated           BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_run_failures_def ON sync_run_failures(sync_def_id);
CREATE INDEX IF NOT EXISTS idx_sync_run_failures_recorded ON sync_run_failures(recorded_at DESC);
