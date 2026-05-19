-- 0002_notepad_documents: own the notepad tables that the
-- /api/v1/notepad/* surface depends on. Previously assumed to be
-- provisioned externally, but no out-of-tree DDL existed in the repo,
-- so dev installs were silently broken after `notepad_documents` writes.
--
-- This migration is idempotent (CREATE TABLE IF NOT EXISTS + ADD
-- COLUMN IF NOT EXISTS) so it is safe to apply repeatedly and on
-- environments that already have the legacy schema.

CREATE TABLE IF NOT EXISTS notepad_documents (
    id              UUID PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    owner_id        UUID NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    template_key    TEXT,
    widgets         JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_indexed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notepad_documents_owner_idx
    ON notepad_documents (owner_id, updated_at DESC);

-- Slice A: rich-text TipTap migration. `content_doc` stores the
-- ProseMirror JSON document. `content` (markdown) stays as a derived
-- back-compat field for the HTML mini-renderer and Knowledge-Base
-- ingestion path until they are migrated to consume `content_doc`.
ALTER TABLE notepad_documents
    ADD COLUMN IF NOT EXISTS content_doc JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS notepad_presence (
    id            UUID PRIMARY KEY,
    document_id   UUID NOT NULL REFERENCES notepad_documents(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL,
    session_id    TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    cursor_label  TEXT NOT NULL DEFAULT '',
    color         TEXT NOT NULL DEFAULT '#0f766e',
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, user_id, session_id)
);

CREATE INDEX IF NOT EXISTS notepad_presence_document_idx
    ON notepad_presence (document_id, last_seen_at DESC);
