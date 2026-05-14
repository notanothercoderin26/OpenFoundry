-- +goose Up
-- compute-module-service: CRUD foundation for Compute Module resources
-- (checklist CM.1). Image, container, replica, scaling, function spec,
-- pipeline spec, and history tables are tracked by later items.

CREATE TABLE IF NOT EXISTS compute_modules (
    id                  UUID        PRIMARY KEY,
    name                TEXT        NOT NULL,
    description         TEXT        NOT NULL DEFAULT '',
    project_id          UUID        NOT NULL,
    folder_id           UUID        NULL,
    execution_mode      TEXT        NOT NULL CHECK (execution_mode IN ('function', 'pipeline')),
    state               TEXT        NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'archived')),
    labels              JSONB       NOT NULL DEFAULT '{}'::jsonb,

    -- Pipeline-mode I/O config (CM.2). NULL for function-mode modules
    -- and for pipeline-mode modules that have not been configured yet.
    -- A NOT NULL value is forbidden on function-mode rows by the
    -- check constraint below; application-layer guards block the
    -- same write path on the way in.
    pipeline_io_config  JSONB       NULL,

    -- Container image reference + compatibility findings (CM.3).
    -- NULL until the caller publishes an image. Stored as a JSONB
    -- envelope so we can add fields (signing metadata, vulnerability
    -- scan results, base-image policy) without further migrations as
    -- CM.34 lands.
    container_image     JSONB       NULL,

    -- Single-container runtime configuration (CM.4): command/args,
    -- env, ports, resources, logging, health, role, secret bindings,
    -- and the policy findings produced during set. Stored verbatim
    -- (literal secret values are already redacted on the way in by
    -- the runtime policy).
    runtime_config      JSONB       NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID        NOT NULL,
    updated_by          UUID        NOT NULL,

    archived_at         TIMESTAMPTZ NULL,
    archived_by         UUID        NULL,

    CHECK ((state = 'archived') = (archived_at IS NOT NULL)),
    CHECK ((state = 'archived') = (archived_by IS NOT NULL)),
    CHECK (pipeline_io_config IS NULL OR execution_mode = 'pipeline')
);

CREATE INDEX IF NOT EXISTS idx_compute_modules_project
    ON compute_modules (project_id, state);

CREATE INDEX IF NOT EXISTS idx_compute_modules_folder
    ON compute_modules (project_id, folder_id, state);

-- Name uniqueness is scoped to project+folder and only enforced for
-- active modules: archived siblings should not block restore or
-- duplicate workflows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_compute_modules_active_name
    ON compute_modules (project_id, COALESCE(folder_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(name))
    WHERE state = 'active';

-- +goose Down
DROP INDEX IF EXISTS uq_compute_modules_active_name;
DROP INDEX IF EXISTS idx_compute_modules_folder;
DROP INDEX IF EXISTS idx_compute_modules_project;
DROP TABLE IF EXISTS compute_modules;
