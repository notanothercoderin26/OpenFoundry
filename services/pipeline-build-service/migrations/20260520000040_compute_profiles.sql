-- Compute profiles catalog (Foundry's "Build settings" Default / Medium / Large).
-- The pipeline-build-service exposes this as a read-only catalog today;
-- admin CRUD lands in a follow-up. The Pipeline.compute_profile_id column
-- references this table by slug (TEXT) so existing rows with NULL stay
-- untouched.

CREATE TABLE IF NOT EXISTS compute_profiles (
    slug                TEXT PRIMARY KEY,
    display_name        TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    executor_cores      INTEGER NOT NULL,
    executor_memory_gb  NUMERIC(6,2) NOT NULL,
    is_default          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO compute_profiles (slug, display_name, description, executor_cores, executor_memory_gb, is_default)
VALUES
    ('default', 'Default', 'Auto-scaling profile with the smallest executor footprint. Best for development and exploration.', 1, 1.5, TRUE),
    ('medium',  'Medium',  'Slow scale up, quick scale down. Balanced compute for medium-sized batch jobs.',                  2, 4.0, FALSE),
    ('large',   'Large',   'Slow scale up, quick scale down. Larger executors for heavy joins or wide aggregations. Higher compute cost.', 4, 8.0, FALSE)
ON CONFLICT (slug) DO NOTHING;
