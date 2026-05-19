-- Consolidated schema for the Vertex graph application.
--
-- Vertex owns:
--   * graph + graph_version            — the saved "Vertex Graph" resource
--   * graph_annotation                 — free-form overlays on a graph
--   * search_around + search_around_step + search_around_parameter
--                                      — typed multi-step traversal DSL
--   * scenario + scenario_edit         — what-if staged edits
--   * derived_property_binding         — (object_type, property) -> function rid
--
-- Traversal (link-summary, expand-neighbors, multi-hop execution,
-- histogram, path-finding, centrality) is hosted by ontology-query-service
-- and reads through to OSV2 / ontology storage. Nothing about traversal
-- is persisted here — the DSL definitions live in search_around, the
-- execution does not.
CREATE SCHEMA IF NOT EXISTS vertex;
SET search_path TO vertex, public;

-- ----- Graph -----

CREATE TABLE IF NOT EXISTS graph (
    id                          UUID PRIMARY KEY,
    rid                         TEXT NOT NULL UNIQUE,
    title                       TEXT NOT NULL,
    description                 TEXT NOT NULL DEFAULT '',
    seed_object_refs            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    branch_context              TEXT NOT NULL DEFAULT '',
    model_rid                   TEXT NOT NULL DEFAULT '',
    layout_state_json           JSONB NOT NULL DEFAULT '{}'::JSONB,
    layer_configuration_json    JSONB NOT NULL DEFAULT '{}'::JSONB,
    timeline_state_json         JSONB NOT NULL DEFAULT '{}'::JSONB,
    project_id                  UUID,
    organizations               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    markings                    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    owner_id                    UUID NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS graph_owner_idx     ON graph (owner_id);
CREATE INDEX IF NOT EXISTS graph_project_idx   ON graph (project_id);
CREATE INDEX IF NOT EXISTS graph_title_trgm    ON graph USING GIN (lower(title) gin_trgm_ops)
    WHERE FALSE; -- gated; left here as a hint for ops to enable pg_trgm if desired

CREATE TABLE IF NOT EXISTS graph_version (
    id              UUID PRIMARY KEY,
    graph_id        UUID NOT NULL REFERENCES graph(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    changelog       TEXT NOT NULL DEFAULT '',
    snapshot_json   JSONB NOT NULL,
    author_id       UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (graph_id, version)
);

CREATE INDEX IF NOT EXISTS graph_version_graph_idx ON graph_version (graph_id, version DESC);

-- ----- Annotation -----

CREATE TABLE IF NOT EXISTS graph_annotation (
    id              UUID PRIMARY KEY,
    graph_id        UUID NOT NULL REFERENCES graph(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('text', 'shape', 'callout')),
    text            TEXT NOT NULL DEFAULT '',
    geometry_json   JSONB NOT NULL DEFAULT '{}'::JSONB,
    author_id       UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS graph_annotation_graph_idx ON graph_annotation (graph_id);

-- ----- Search Around (typed multi-step traversal DSL) -----
--
-- search_around row holds the top-level resource; ordered steps live
-- in search_around_step. Parameters are stored separately so they can
-- be referenced from any step's filter via parameter_ref.

CREATE TABLE IF NOT EXISTS search_around (
    id                          UUID PRIMARY KEY,
    rid                         TEXT NOT NULL UNIQUE,
    title                       TEXT NOT NULL,
    description                 TEXT NOT NULL DEFAULT '',
    starting_object_type_id     UUID NOT NULL,
    project_id                  UUID,
    owner_id                    UUID NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS search_around_owner_idx          ON search_around (owner_id);
CREATE INDEX IF NOT EXISTS search_around_starting_type_idx  ON search_around (starting_object_type_id);

CREATE TABLE IF NOT EXISTS search_around_step (
    id                  UUID PRIMARY KEY,
    search_around_id    UUID NOT NULL REFERENCES search_around(id) ON DELETE CASCADE,
    ordinal             INTEGER NOT NULL,
    relation_id         UUID NOT NULL,
    direction           TEXT NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
    -- Filters serialised as a JSON array of {property, op, literal_json, parameter_ref}.
    filters_json        JSONB NOT NULL DEFAULT '[]'::JSONB,
    UNIQUE (search_around_id, ordinal)
);

CREATE INDEX IF NOT EXISTS search_around_step_parent_idx ON search_around_step (search_around_id);

CREATE TABLE IF NOT EXISTS search_around_parameter (
    id                  UUID PRIMARY KEY,
    search_around_id    UUID NOT NULL REFERENCES search_around(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    type                TEXT NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'date', 'timestamp')),
    description         TEXT NOT NULL DEFAULT '',
    default_value_json  JSONB,
    required            BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (search_around_id, name)
);

-- ----- Scenario (what-if) -----

CREATE TABLE IF NOT EXISTS scenario (
    id              UUID PRIMARY KEY,
    graph_id        UUID NOT NULL REFERENCES graph(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    branch_context  TEXT NOT NULL DEFAULT '',
    author_id       UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scenario_graph_idx ON scenario (graph_id);

CREATE TABLE IF NOT EXISTS scenario_edit (
    id              UUID PRIMARY KEY,
    scenario_id     UUID NOT NULL REFERENCES scenario(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('property_change', 'link_add', 'link_remove', 'action_dryrun')),
    target_ref      TEXT NOT NULL,
    property_name   TEXT NOT NULL DEFAULT '',
    old_value_json  JSONB,
    new_value_json  JSONB,
    action_id       UUID,
    ordinal         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS scenario_edit_parent_idx ON scenario_edit (scenario_id, ordinal);

-- ----- Derived property bindings -----
--
-- One row per (object_type_id, property_name). The actual computation
-- is delegated to function-runtime-service via function_rid.

CREATE TABLE IF NOT EXISTS derived_property_binding (
    id                  UUID PRIMARY KEY,
    object_type_id      UUID NOT NULL,
    property_name       TEXT NOT NULL,
    display_name        TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    function_rid        TEXT NOT NULL,
    return_type         TEXT NOT NULL CHECK (return_type IN ('string', 'number', 'boolean', 'date', 'timestamp')),
    owner_id            UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_type_id, property_name)
);

CREATE INDEX IF NOT EXISTS derived_property_binding_type_idx ON derived_property_binding (object_type_id);
