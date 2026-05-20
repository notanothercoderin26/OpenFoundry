-- Extend the working-state batch-save flow to shared property types.
--
-- Mirrors migration 0006 for object_types / link_types / properties /
-- object_type_groups: adds an `INT version` column so the Review-edits
-- modal can detect stale shared-property edits as Conflicts. The
-- existing single-resource handlers in interfaces_shared.go bump the
-- column on every UPDATE so legacy callers stay in sync with the
-- batch-save path.
--
-- The migration also extends the ontology_audit_log CHECK constraint
-- so the new `shared_property_type` resource kind is accepted. The
-- constraint must be dropped and re-added — Postgres has no
-- "ALTER CONSTRAINT ... ADD value" for CHECK constraints. The DROP
-- + ADD runs inside a single statement-level transaction so the
-- constraint window is never empty for concurrent writers.

SET search_path TO ontology_schema, public;

ALTER TABLE ontology_schema.shared_property_types
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE ontology_schema.ontology_audit_log
    DROP CONSTRAINT IF EXISTS ontology_audit_log_kind_chk;

ALTER TABLE ontology_schema.ontology_audit_log
    ADD CONSTRAINT ontology_audit_log_kind_chk
        CHECK (resource_kind IN (
            'object_type',
            'property',
            'link_type',
            'object_type_group',
            'shared_property_type'
        ));
