-- Optimistic-concurrency `version` column for ontology resources.
--
-- The ontology-manager change-management flow ("Review edits") sends a
-- batch of mutations together with the `expected_version` the client
-- saw when it loaded each resource. The backend bumps `version` on
-- every successful UPDATE and rejects mismatches as a conflict, which
-- the modal renders in its "Conflicts" tab.
--
-- We do NOT use a trigger here. Increments live in the repo layer so
-- the same SQL statement that mutates the row also computes the new
-- version and returns it (RETURNING version), keeping the
-- read-after-write story simple for the handler.

SET search_path TO ontology_schema, public;

ALTER TABLE ontology_schema.object_types
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE ontology_schema.properties
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE ontology_schema.link_types
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE ontology_schema.object_type_groups
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
