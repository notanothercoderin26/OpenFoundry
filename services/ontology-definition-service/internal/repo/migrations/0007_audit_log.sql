-- Ontology change audit log.
--
-- One row per resource-level mutation. The History panels in the
-- ontology-manager UI (both global and per-resource) read from this
-- table. Saves that go through the batch-save endpoint share a single
-- `batch_id` so the UI can group them as a single "edit session" in
-- the History view and can implement the "merge changes by the same
-- author" filter without re-deriving authorship.
--
-- We keep `before_state` and `after_state` as JSONB snapshots rather
-- than per-field deltas because the producers are heterogeneous
-- (object types vs link types vs properties have completely different
-- shapes) and the History renderer has to display a unified diff for
-- all of them. `field_diffs` is a precomputed list of {path, before,
-- after} entries that the modal and History view render directly,
-- letting us evolve the diff algorithm without rewriting every reader.

SET search_path TO ontology_schema, public;

CREATE TABLE IF NOT EXISTS ontology_schema.ontology_audit_log (
    id               UUID PRIMARY KEY,
    batch_id         UUID,
    resource_kind    TEXT NOT NULL,
    resource_id      UUID NOT NULL,
    operation        TEXT NOT NULL,
    changed_by       UUID NOT NULL,
    changed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_version INT,
    new_version      INT NOT NULL,
    before_state     JSONB,
    after_state      JSONB,
    field_diffs      JSONB NOT NULL DEFAULT '[]'::jsonb,
    source           TEXT NOT NULL DEFAULT 'ontology-manager',
    note             TEXT,

    CONSTRAINT ontology_audit_log_kind_chk
        CHECK (resource_kind IN ('object_type', 'property', 'link_type', 'object_type_group')),
    CONSTRAINT ontology_audit_log_op_chk
        CHECK (operation IN ('create', 'update', 'delete'))
);

CREATE INDEX IF NOT EXISTS idx_ontology_audit_log_resource
    ON ontology_schema.ontology_audit_log (resource_kind, resource_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ontology_audit_log_changed_at
    ON ontology_schema.ontology_audit_log (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ontology_audit_log_batch
    ON ontology_schema.ontology_audit_log (batch_id)
    WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ontology_audit_log_author
    ON ontology_schema.ontology_audit_log (changed_by, changed_at DESC);
