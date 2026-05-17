ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS session_scope JSONB;
