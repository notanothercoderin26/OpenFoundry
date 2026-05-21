-- Track Foundry-worker migrations so users have a 30-day window to revert.
-- previous_config_snapshot keeps the agent-worker config that was active right
-- before the migration; migrated_at marks when the switch happened.

ALTER TABLE connections
    ADD COLUMN IF NOT EXISTS previous_config_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_connections_migrated_at ON connections(migrated_at);
