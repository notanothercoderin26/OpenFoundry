-- residency: us-east-1
-- 0027: CMP.28 - Portfolios.
--
-- A portfolio groups projects across business lines. Membership is N:M
-- (projects can live in multiple portfolios). Org-scoped so each tenant
-- owns its own catalogue; nullable for instance-wide demo data.

CREATE TABLE IF NOT EXISTS compass_portfolios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    organization_id UUID NULL,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS compass_portfolios_slug_uniq
    ON compass_portfolios (COALESCE(organization_id::text, ''), slug);

CREATE TABLE IF NOT EXISTS compass_portfolio_projects (
    portfolio_id UUID NOT NULL REFERENCES compass_portfolios(id) ON DELETE CASCADE,
    project_id   UUID NOT NULL REFERENCES ontology_projects(id) ON DELETE CASCADE,
    added_by     UUID NOT NULL,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (portfolio_id, project_id)
);

CREATE INDEX IF NOT EXISTS compass_portfolio_projects_project_idx
    ON compass_portfolio_projects (project_id);
