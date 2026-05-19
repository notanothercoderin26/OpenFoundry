-- 0004_notepad_templates: Slice G (templates v2). Templates are
-- standalone artifacts separate from notepad_documents so the same
-- template can spawn many documents and have its own lifecycle
-- (rename, delete, parameter schema edits) without touching every
-- derived doc.
--
-- `inputs_schema` is a JSON array of input definitions:
--   [{"key":"airport_name","label":"Airport","type":"string","required":true,"default":"…"},
--    {"key":"region","label":"Region","type":"enum","options":["EMEA","AMER","APAC"]}]
-- Token substitution happens server-side in /templates/{id}/instantiate.

CREATE TABLE IF NOT EXISTS notepad_templates (
    id            UUID PRIMARY KEY,
    owner_id      UUID NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    title         TEXT NOT NULL DEFAULT '',
    -- Body fields mirror NotepadDocument so a doc can be "saved as
    -- template" in one shot.
    content       TEXT NOT NULL DEFAULT '',
    content_doc   JSONB NOT NULL DEFAULT '{}'::jsonb,
    widgets       JSONB NOT NULL DEFAULT '[]'::jsonb,
    inputs_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- visibility is reserved for later org-wide sharing; private =
    -- only the owner sees the template.
    visibility    TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'organization')),
    template_key  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notepad_templates_owner_idx
    ON notepad_templates (owner_id, updated_at DESC);
