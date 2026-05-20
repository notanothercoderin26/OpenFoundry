-- Object Views storage for the Ontology Manager "Object Views" tab and
-- the per-object-type detail surfaces (Workshop, Object Explorer, etc.).
--
-- A view is a per-object-type rendering definition: the layout/sections
-- a user sees when they open an object. The `config` JSONB column
-- carries the form-factor-specific structure (tabs / sidebar links /
-- workshop widgets / panel hosts); the Go service treats it as an
-- opaque blob so the frontend can evolve the shape without a backend
-- migration.
--
-- Version column mirrors the convention introduced in migration 0006
-- so future batch-save support can detect stale view edits as
-- Conflicts.

SET search_path TO ontology_schema, public;

CREATE TABLE IF NOT EXISTS object_views (
    id              UUID PRIMARY KEY,
    name            TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    object_type_id  UUID NOT NULL REFERENCES object_types(id) ON DELETE CASCADE,
    mode            TEXT NOT NULL DEFAULT 'standard'
                        CHECK (mode IN ('standard', 'configured')),
    form_factor     TEXT NOT NULL DEFAULT 'full'
                        CHECK (form_factor IN ('full', 'panel')),
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    branch_label    TEXT,
    published       BOOLEAN NOT NULL DEFAULT FALSE,
    owner_id        UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version         INT NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_object_views_type_name_branch
    ON object_views(object_type_id, name, COALESCE(branch_label, ''));

CREATE INDEX IF NOT EXISTS idx_object_views_object_type
    ON object_views(object_type_id);

CREATE INDEX IF NOT EXISTS idx_object_views_form_factor
    ON object_views(form_factor);
