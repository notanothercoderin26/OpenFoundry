-- Deployment lifecycle table for model-deployment-service.
-- Distinct from libs/ml-kernel-go's ml_deployments table, which backs
-- the legacy /api/v1/model-deployment/* surface.

CREATE TABLE IF NOT EXISTS model_lifecycle_deployments (
    id              UUID PRIMARY KEY,
    model_id        UUID NOT NULL,
    version         TEXT NOT NULL,
    status          TEXT NOT NULL,
    endpoint_url    TEXT NOT NULL DEFAULT '',
    owner_user_id   UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT model_lifecycle_deployments_status_check
        CHECK (status IN ('pending', 'running', 'degraded', 'terminated'))
);

CREATE INDEX IF NOT EXISTS idx_model_lifecycle_deployments_status
    ON model_lifecycle_deployments(status);
CREATE INDEX IF NOT EXISTS idx_model_lifecycle_deployments_owner
    ON model_lifecycle_deployments(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_model_lifecycle_deployments_model
    ON model_lifecycle_deployments(model_id);
