-- 0005_notepad_documents_favorite: backing column for the Notepad
-- list-page favourites tab (T3.3) and the favourite toggle endpoint
-- (T8.3). Single global flag per document — multi-user favourites are
-- a follow-up if/when sharing lands.

ALTER TABLE notepad_documents
    ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS notepad_documents_favorite_idx
    ON notepad_documents (owner_id, updated_at DESC)
    WHERE is_favorite;
