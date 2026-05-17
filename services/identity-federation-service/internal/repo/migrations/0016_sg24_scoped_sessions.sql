-- residency: us-east-1
-- SG.24 scoped sessions: persist per-refresh-token session scope (project/marking constraints).
ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS session_scope JSONB;
