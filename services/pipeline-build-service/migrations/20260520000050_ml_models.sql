-- Trained ML models registry. Mirrors Foundry's "Trained model" picker:
-- pipelines reference a model by id, the runtime loads the metadata at
-- execution time, and an optional inference_url can be wired to a hosted
-- serving endpoint (TorchServe / Triton / Vertex AI / …). When no
-- inference_url is set the runtime emits a deterministic mock prediction
-- per row so authors can wire up the pipeline end-to-end before the
-- serving stack is ready.

CREATE TABLE IF NOT EXISTS ml_models (
    id              UUID PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    framework       TEXT NOT NULL DEFAULT 'sklearn',
    version         TEXT NOT NULL DEFAULT '1.0.0',
    input_schema    JSONB NOT NULL DEFAULT '[]'::jsonb,
    output_schema   JSONB NOT NULL DEFAULT '[]'::jsonb,
    artifact_uri    TEXT NOT NULL DEFAULT '',
    inference_url   TEXT NOT NULL DEFAULT '',
    owner_id        UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ml_models_owner_idx ON ml_models (owner_id);

INSERT INTO ml_models (id, slug, display_name, description, framework, version, input_schema, output_schema, artifact_uri)
VALUES
    (
        '11111111-1111-1111-1111-111111111111',
        'demo-trail-classifier',
        'Trail condition classifier',
        'Demo sklearn model that predicts trail conditions from weather features. Mock predictions only — wire inference_url for real inference.',
        'sklearn',
        '0.1.0',
        '[{"name":"temperature_c","type":"float"},{"name":"precipitation_mm","type":"float"},{"name":"elevation_m","type":"integer"}]',
        '[{"name":"condition","type":"string"},{"name":"confidence","type":"float"}]',
        'mock://demo-trail-classifier'
    ),
    (
        '22222222-2222-2222-2222-222222222222',
        'demo-tabular-regressor',
        'Tabular score regressor',
        'Demo regression model returning a numeric score. Mock predictions only.',
        'sklearn',
        '0.2.0',
        '[{"name":"feature_a","type":"float"},{"name":"feature_b","type":"float"}]',
        '[{"name":"score","type":"float"}]',
        'mock://demo-tabular-regressor'
    )
ON CONFLICT (slug) DO NOTHING;
