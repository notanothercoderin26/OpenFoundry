-- ACL slice for vertex-service: graph-level grants + the
-- versioning_enabled toggle.
--
-- Roles (highest to lowest privilege):
--   owner       — read + write + manage sharing
--   editor      — read + write
--   viewer      — read (full layout + layers + seed data)
--   discoverer  — sees only {id, rid, title, owner_id, created_at}
--   none        — explicit deny; opaque even by RID
--
-- Resolution rule (computed at request time):
--   1. If caller is the graph owner          → owner
--   2. Best explicit grant in graph_grant    → that role
--   3. Link-share toggle (later slice)        → link_share_role
--   4. Otherwise                              → none
--
-- The `versioning_enabled` flag mirrors Palantir's "Enable
-- versioning" toggle on the Save dropdown — when false, version
-- writes are rejected so the resource history stays clean.
SET search_path TO vertex, public;

ALTER TABLE graph
    ADD COLUMN IF NOT EXISTS versioning_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS graph_grant (
    id                  UUID PRIMARY KEY,
    graph_id            UUID NOT NULL REFERENCES graph(id) ON DELETE CASCADE,
    -- principal_kind distinguishes user-vs-group so the future
    -- group-resolution path (via authorization-policy-service) does
    -- not need a schema change.
    principal_kind      TEXT NOT NULL CHECK (principal_kind IN ('user', 'group')),
    principal_id        UUID NOT NULL,
    role                TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer', 'discoverer')),
    granted_by          UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (graph_id, principal_kind, principal_id)
);

CREATE INDEX IF NOT EXISTS graph_grant_graph_idx     ON graph_grant (graph_id);
CREATE INDEX IF NOT EXISTS graph_grant_principal_idx ON graph_grant (principal_kind, principal_id);
