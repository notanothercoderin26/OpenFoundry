-- Saved lineage graphs — Foundry's "Save / Open graph" + "Get quick
-- share link" persistence. Snapshots used to live in localStorage on
-- the client only, which prevented cross-device sharing and survived
-- only as long as the browser kept the entry. This table moves them
-- server-side and gives them a stable identity plus an optional
-- read-only share token that the frontend renders as a copyable URL.

CREATE TABLE IF NOT EXISTS lineage_saved_graphs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL,
    name            TEXT NOT NULL,
    branch          TEXT NOT NULL DEFAULT 'master',
    coloring_mode   TEXT NOT NULL DEFAULT 'resource_type',
    -- Full opaque payload from the frontend (graph_state, camera,
    -- selected_node_ids, expand stepper depths, etc.). Schema lives in
    -- the React snapshot type and is not constrained at the DB layer.
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- When non-null this graph is reachable via /api/v1/lineage/shared
    -- without authentication. The token is sized for ≥ 128 bits of
    -- entropy when encoded base32 (26 chars) and is enforced unique.
    share_token     TEXT,
    share_read_only BOOLEAN NOT NULL DEFAULT TRUE,
    shared_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lineage_saved_graphs_share_token
    ON lineage_saved_graphs(share_token)
    WHERE share_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lineage_saved_graphs_owner
    ON lineage_saved_graphs(owner_id, updated_at DESC);
