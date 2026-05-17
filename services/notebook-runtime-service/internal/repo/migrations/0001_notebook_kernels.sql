-- 0001_notebook_kernels: maps notebook-runtime-service sessions to
-- upstream jupyter/kernel-gateway kernel ids.
--
-- The notebooks/cells/sessions tables are provisioned externally; this
-- migration only owns the kernel-mapping side-table the gateway proxy
-- needs. Keep it idempotent so apply-on-boot is safe.

CREATE TABLE IF NOT EXISTS notebook_kernels (
    session_id      UUID PRIMARY KEY,
    notebook_id     UUID NOT NULL,
    gateway_kernel_id TEXT NOT NULL,
    kernel_spec     TEXT NOT NULL,
    started_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notebook_kernels_notebook_idx
    ON notebook_kernels (notebook_id);

CREATE INDEX IF NOT EXISTS notebook_kernels_last_activity_idx
    ON notebook_kernels (last_activity);
