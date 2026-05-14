-- connector-management-service · Source imports in Python transforms.
--
-- Data Connection sources can be allowlisted for source-based external
-- transforms. Code stores only the source RID/binding alias; credentials,
-- egress policy bindings, connector config, and exportable markings are
-- resolved from the source at build start.

CREATE TABLE IF NOT EXISTS source_code_imports (
    source_id UUID PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    friendly_name TEXT NOT NULL DEFAULT '',
    python_identifier TEXT NOT NULL DEFAULT '',
    code_repositories JSONB NOT NULL DEFAULT '[]'::jsonb,
    export_controls JSONB NOT NULL DEFAULT '{"allow_foundry_inputs":false,"allowed_markings":[],"allowed_organizations":[]}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_code_imports_enabled
    ON source_code_imports(enabled);
