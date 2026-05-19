-- 0003_notepad_revisions: Slice F (Foundry-parity version history).
--
-- Captures every accepted edit so the document can be rolled back and
-- diffed. Two snapshot kinds:
--   * 'autosave' — created by UpdateDocument when the last accepted
--                  edit was >5 minutes ago and the new payload is
--                  meaningfully different.
--   * 'manual'   — created by POST /notepad/documents/{id}/revisions.
--                  May carry an optional `name` and an `endorsed`
--                  badge for highlighting.
--
-- `rev` is monotonic per document so the UI can label versions as
-- v0, v1, v2…; `(document_id, rev)` is enforced unique.

CREATE TABLE IF NOT EXISTS notepad_revisions (
    id           UUID PRIMARY KEY,
    document_id  UUID NOT NULL REFERENCES notepad_documents(id) ON DELETE CASCADE,
    rev          BIGINT NOT NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('autosave','manual','initial')),
    name         TEXT NOT NULL DEFAULT '',
    endorsed     BOOLEAN NOT NULL DEFAULT FALSE,
    author_id    UUID NOT NULL,
    title        TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    content      TEXT NOT NULL DEFAULT '',
    content_doc  JSONB NOT NULL DEFAULT '{}'::jsonb,
    widgets      JSONB NOT NULL DEFAULT '[]'::jsonb,
    template_key TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, rev)
);

CREATE INDEX IF NOT EXISTS notepad_revisions_doc_created_idx
    ON notepad_revisions (document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notepad_revisions_doc_kind_idx
    ON notepad_revisions (document_id, kind);
