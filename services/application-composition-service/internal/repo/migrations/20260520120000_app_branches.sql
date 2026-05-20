-- Branch awareness for Workshop apps (B01 acceptance criterion 5).
-- Mirrors the Foundry Workshop "Branching / Rebasing" contract: every app
-- and every version belongs to a branch, the implicit default is `main`,
-- and slug uniqueness is scoped per-branch so the same logical app can
-- diverge between experimental branches without colliding.

ALTER TABLE apps
    ADD COLUMN IF NOT EXISTS branch TEXT NOT NULL DEFAULT 'main';

ALTER TABLE app_versions
    ADD COLUMN IF NOT EXISTS branch TEXT NOT NULL DEFAULT 'main';

-- Replace the implicit slug UNIQUE with a (slug, branch) composite so the
-- same slug can exist on multiple branches. Postgres names the implicit
-- constraint `apps_slug_key`; we drop it defensively and re-create as an
-- index that is idempotent across re-runs.
ALTER TABLE apps DROP CONSTRAINT IF EXISTS apps_slug_key;
DROP INDEX IF EXISTS apps_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS apps_slug_branch_uniq ON apps (slug, branch);
CREATE INDEX IF NOT EXISTS idx_apps_branch ON apps (branch);

-- app_versions already has UNIQUE(app_id, version_number). Because each
-- (slug, branch) maps to its own apps.id, that uniqueness still holds
-- per branch. We keep the original constraint, but add an index on
-- (app_id, branch, version_number DESC) to make per-branch version
-- listing fast.
CREATE INDEX IF NOT EXISTS idx_app_versions_app_branch_version
    ON app_versions (app_id, branch, version_number DESC);
