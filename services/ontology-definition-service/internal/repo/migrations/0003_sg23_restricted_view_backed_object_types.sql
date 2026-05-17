-- residency: us-east-1
-- SG.23 restricted-view-backed object types.
--
-- Object types can now declare that their backing datasource is a
-- restricted view instead of a raw dataset. The version counters mirror
-- Foundry's Object Storage V1 propagation concern: policy changes must be
-- registered/indexed before local object reads are trusted.

CREATE SCHEMA IF NOT EXISTS ontology_schema;
SET search_path TO ontology_schema, public;

ALTER TABLE object_types
    ADD COLUMN IF NOT EXISTS backing_datasource_type TEXT NOT NULL DEFAULT 'dataset',
    ADD COLUMN IF NOT EXISTS backing_restricted_view_id TEXT,
    ADD COLUMN IF NOT EXISTS restricted_view_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS restricted_view_policy_version INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS restricted_view_registered_policy_version INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS restricted_view_indexed_policy_version INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS restricted_view_storage_mode TEXT NOT NULL DEFAULT 'remote',
    ADD COLUMN IF NOT EXISTS restricted_view_policy_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS restricted_view_registered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS restricted_view_indexed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_object_types_backing_restricted_view
    ON object_types(backing_restricted_view_id)
    WHERE backing_restricted_view_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_object_types_restricted_view_policy
    ON object_types USING GIN (restricted_view_policy);
