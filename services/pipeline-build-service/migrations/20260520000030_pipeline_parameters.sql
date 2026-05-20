-- Reusable pipeline-level parameters (Foundry: "Parameters" dropdown in the
-- canvas toolbar). Stored as a JSONB array of {name, type, default_value,
-- description, required} entries. Substituted into transform configs at
-- preview / run time via the internal/domain/parameters package.

ALTER TABLE pipelines
    ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '[]'::jsonb;
