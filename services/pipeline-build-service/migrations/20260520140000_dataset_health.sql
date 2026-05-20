-- B06 §AC#5 — Data Health surface backed by check evaluations.
--
-- `pipeline-expression` evaluates per-row predicates (null-rate
-- thresholds, value-range checks, …) against the rows of a dataset.
-- A failed check emits a `dataset.health.degraded` event into this
-- table; the dataset's current health is `passing` when no degraded
-- event exists since the latest snapshot, else `degraded`.
--
-- The table is intentionally append-only: every check evaluation
-- creates a row even on PASS, so the UI panel can show a recent
-- history. Old PASS rows can be GC'd by a janitor (out of scope).

CREATE TABLE IF NOT EXISTS dataset_health_events (
    id                BIGSERIAL PRIMARY KEY,
    dataset_rid       TEXT        NOT NULL,
    snapshot_id       BIGINT      NULL,
    check_name        TEXT        NOT NULL,
    severity          TEXT        NOT NULL CHECK (severity IN ('info','warning','error','critical')),
    status            TEXT        NOT NULL CHECK (status IN ('passing','degraded')),
    metric_name       TEXT        NULL,
    metric_value      DOUBLE PRECISION NULL,
    threshold         DOUBLE PRECISION NULL,
    message           TEXT        NULL,
    details           JSONB       NOT NULL DEFAULT '{}'::jsonb,
    evaluated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "What's the current health of dataset X" reads the latest row per
-- (dataset, check_name).
CREATE INDEX IF NOT EXISTS idx_dataset_health_events_dataset_check
    ON dataset_health_events(dataset_rid, check_name, evaluated_at DESC);

-- Trend view: every event for a dataset, newest first.
CREATE INDEX IF NOT EXISTS idx_dataset_health_events_dataset
    ON dataset_health_events(dataset_rid, evaluated_at DESC);
