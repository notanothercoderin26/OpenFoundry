-- App-specific capabilities on link types.
--
-- Mirrors migration 0004 (object_types.app_capabilities_json) for
-- the link side of the ontology. The first consumer is Vertex —
-- specifically the edge direction renderer, which reads
-- app_capabilities.vertex_edge_direction to decide whether to paint
-- a single arrow (with the configured primary side), no arrow at
-- all (undirected), or arrows on both endpoints (bidirectional).
--
-- Shape (one key per app, free-form per-app):
--   {
--     "vertex_edge_direction": {
--        "mode":         "primary" | "undirected" | "bidirectional",
--        "primary_side": "source" | "target" | null
--     }
--   }
--
-- Other apps can later add keys to the same JSONB without a
-- migration.

SET search_path TO ontology_schema, public;

ALTER TABLE ontology_schema.link_types
    ADD COLUMN IF NOT EXISTS app_capabilities_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS link_types_app_capabilities_idx
    ON ontology_schema.link_types USING gin (app_capabilities_json);
