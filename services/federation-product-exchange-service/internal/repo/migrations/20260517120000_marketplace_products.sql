-- Marketplace "Products" feature — reusable bundles of ontology types,
-- action types, pipelines and apps that can be packaged once and
-- installed many times into different target workspaces.
--
-- Tables here are intentionally distinct from the legacy
-- marketplace_listings + marketplace_package_versions + marketplace_installs
-- triple: that surface tracks individual connector/widget/transform
-- packages (with dependency planning, fleets and review counts), while
-- the *products* surface is the Foundry-style multi-resource bundle
-- carrying a signed manifest + tar.gz payload.

CREATE TABLE IF NOT EXISTS marketplace_products (
    rid          TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    author       TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'DRAFT',
    resources    JSONB NOT NULL DEFAULT '[]'::jsonb,
    latest_version TEXT NOT NULL DEFAULT '',
    manifest_url TEXT NOT NULL DEFAULT '',
    signature    TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_products_status_chk
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS marketplace_products_status_idx
    ON marketplace_products (status);
CREATE INDEX IF NOT EXISTS marketplace_products_name_idx
    ON marketplace_products (LOWER(name));

CREATE TABLE IF NOT EXISTS marketplace_product_versions (
    rid          TEXT PRIMARY KEY,
    product_rid  TEXT NOT NULL REFERENCES marketplace_products (rid) ON DELETE CASCADE,
    version      TEXT NOT NULL,
    manifest     JSONB NOT NULL DEFAULT '{}'::jsonb,
    bundle_path  TEXT NOT NULL,
    signature    TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_product_versions_unique UNIQUE (product_rid, version)
);

CREATE INDEX IF NOT EXISTS marketplace_product_versions_product_idx
    ON marketplace_product_versions (product_rid);

CREATE TABLE IF NOT EXISTS marketplace_product_installations (
    rid                  TEXT PRIMARY KEY,
    product_rid          TEXT NOT NULL,
    version              TEXT NOT NULL,
    target_workspace_rid TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'PENDING',
    resource_mappings    JSONB NOT NULL DEFAULT '[]'::jsonb,
    failure_reason       TEXT NOT NULL DEFAULT '',
    installed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_product_installations_status_chk
        CHECK (status IN ('PENDING', 'INSTALLING', 'INSTALLED', 'FAILED', 'UNINSTALLED')),
    CONSTRAINT marketplace_product_installations_unique
        UNIQUE (product_rid, version, target_workspace_rid)
);

CREATE INDEX IF NOT EXISTS marketplace_product_installations_target_idx
    ON marketplace_product_installations (target_workspace_rid);
CREATE INDEX IF NOT EXISTS marketplace_product_installations_product_idx
    ON marketplace_product_installations (product_rid);
