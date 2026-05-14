-- Data Connection health checks: safe credential health metadata.
--
-- The secret value remains write-only; these columns only support health
-- aggregation for validation state and expiration warnings.

ALTER TABLE source_credentials
    ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'untested',
    ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

