-- Pipeline view counter + flat comment thread.
-- Views are aggregated per (pipeline, day) to bound storage; the 30-day
-- counter just sums the most recent buckets. Comments are flat (no threading
-- in v1) and authored by an authenticated principal.

CREATE TABLE IF NOT EXISTS pipeline_views (
    pipeline_id  UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    viewed_on    DATE NOT NULL DEFAULT CURRENT_DATE,
    total_views  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (pipeline_id, viewed_on)
);

CREATE INDEX IF NOT EXISTS pipeline_views_viewed_on_idx
    ON pipeline_views (viewed_on);

CREATE TABLE IF NOT EXISTS pipeline_comments (
    id           UUID PRIMARY KEY,
    pipeline_id  UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    author_id    UUID NOT NULL,
    body         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipeline_comments_pipeline_idx
    ON pipeline_comments (pipeline_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_comments_author_idx
    ON pipeline_comments (author_id);
