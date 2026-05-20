-- Per-lineage-node description text. Foundry's "Add description"
-- Properties helper used to be a `window.prompt` stub on the
-- frontend; this table moves it server-side so descriptions survive
-- sessions and become queryable.
--
-- The table is intentionally narrow: node_id PK, description TEXT,
-- updated_by + updated_at audit. We keep ownership of the row open
-- (any authenticated caller can overwrite) because descriptions
-- belong to the resource, not to the original author — Foundry
-- behaves the same way.

CREATE TABLE IF NOT EXISTS lineage_node_descriptions (
    node_id     UUID PRIMARY KEY,
    description TEXT NOT NULL,
    updated_by  UUID NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lineage_node_descriptions_updated_at
    ON lineage_node_descriptions(updated_at DESC);
