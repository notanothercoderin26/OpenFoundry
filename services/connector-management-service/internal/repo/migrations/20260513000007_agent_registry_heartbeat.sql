-- SDC.37 expands the connector-agent registry to carry heartbeat metadata,
-- source attachments, connector capabilities, assigned proxy policies, and
-- recent agent-related connection failures.

ALTER TABLE connector_agents
    ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS host TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS connected_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS supported_connector_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS assigned_proxy_policies JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS connection_failures JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_connector_agents_status
    ON connector_agents(status);

CREATE INDEX IF NOT EXISTS idx_connector_agents_last_heartbeat
    ON connector_agents(last_heartbeat_at DESC);
