-- Graph templates for the Vertex application.
--
-- A graph template is a reusable recipe that produces a Vertex graph
-- from a small set of user-supplied inputs. The owner saves an
-- existing graph as a template, declares which object inputs become
-- parameters (and optionally which scalar inputs), wires Search
-- Arounds and layer styling, and consumers later supply values to
-- regenerate the graph.
--
-- All structured configuration (parameters, search-around bindings,
-- layer inclusion, defaults) is stored as JSONB to keep the schema
-- stable while the typed structures evolve in models.go.

SET search_path TO vertex, public;

CREATE TABLE IF NOT EXISTS graph_template (
    id                          UUID PRIMARY KEY,
    rid                         TEXT NOT NULL UNIQUE,
    title                       TEXT NOT NULL,
    description                 TEXT NOT NULL DEFAULT '',
    source_graph_id             UUID NULL REFERENCES graph(id) ON DELETE SET NULL,
    object_parameters_json      JSONB NOT NULL DEFAULT '[]'::JSONB,
    non_object_parameters_json  JSONB NOT NULL DEFAULT '[]'::JSONB,
    search_arounds_json         JSONB NOT NULL DEFAULT '[]'::JSONB,
    layer_config_json           JSONB NOT NULL DEFAULT '[]'::JSONB,
    graph_config_json           JSONB NOT NULL DEFAULT '{}'::JSONB,
    defaults_json               JSONB NOT NULL DEFAULT '{}'::JSONB,
    owner_id                    UUID NOT NULL,
    project_id                  UUID NULL,
    organizations               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    markings                    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS graph_template_owner_idx
    ON graph_template(owner_id);

CREATE INDEX IF NOT EXISTS graph_template_source_graph_idx
    ON graph_template(source_graph_id)
    WHERE source_graph_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS graph_template_updated_idx
    ON graph_template(updated_at DESC);
