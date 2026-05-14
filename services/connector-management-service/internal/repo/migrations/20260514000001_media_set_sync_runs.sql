-- SDC.41: Media sync handoff history.
--
-- Persist each media set sync execution so source operators can audit which
-- paths were selected, which were accepted/skipped/mismatched, how many bytes
-- were dispatched to the media-sets-service, and which errors occurred. Media
-- schema, conversion, and reference behavior remain owned by the Media Sets
-- checklist; this table only records the *handoff* contract.

CREATE TABLE IF NOT EXISTS media_set_sync_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_def_id         UUID NOT NULL REFERENCES media_set_syncs(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','succeeded','failed','partially_succeeded')),
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at         TIMESTAMPTZ,
    accepted_files      INT  NOT NULL DEFAULT 0,
    skipped_files       INT  NOT NULL DEFAULT 0,
    schema_mismatched   INT  NOT NULL DEFAULT 0,
    dispatched_files    INT  NOT NULL DEFAULT 0,
    dispatch_errors     INT  NOT NULL DEFAULT 0,
    bytes_accepted      BIGINT NOT NULL DEFAULT 0,
    selected_paths      JSONB NOT NULL DEFAULT '[]'::jsonb,
    schema_mismatches   JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message       TEXT,
    triggered_by        TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_set_sync_runs_def ON media_set_sync_runs(sync_def_id);
CREATE INDEX IF NOT EXISTS idx_media_set_sync_runs_started ON media_set_sync_runs(started_at DESC);
