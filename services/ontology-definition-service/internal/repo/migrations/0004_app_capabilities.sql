-- App-specific capabilities on object types.
--
-- Adds a single JSONB column scoped per app so the platform can keep
-- per-application metadata without growing the columns of object_types
-- every time a new app wants to read or store a tag against an
-- ontology entity.
--
-- Concrete first consumer: Vertex graph rendering. When an object
-- type represents an event in the data model, Vertex consults
-- app_capabilities.vertex_event to decide
--   - the badge color shown on the related node (event_intent)
--   - which property carries the numeric severity / size (value_property_id)
--   - the unit string surfaced in the side panel (value_unit)
--
-- Shape (one key per app, free-form per-app):
--   {
--     "vertex_event": {
--        "event_intent":         "danger" | "warning" | "success" | "primary" | "none",
--        "value_property_id":    "<property api name>",
--        "value_unit":           "<free-form>"
--     }
--   }
--
-- Other apps can later add keys to the same JSONB without a migration.

SET search_path TO ontology_schema, public;

ALTER TABLE ontology_schema.object_types
    ADD COLUMN IF NOT EXISTS app_capabilities_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- A GIN index lets us answer "show me all object types where Vertex
-- has been told about an event_intent" without scanning every row.
CREATE INDEX IF NOT EXISTS object_types_app_capabilities_idx
    ON ontology_schema.object_types USING gin (app_capabilities_json);
