-- B04 §AC#1 — Per-model quotas + enabled_for_features admin surface.
--
-- `quotas` is a free-form JSONB so adding a new dimension (e.g. cost
-- floor, P99 latency target) does not require another migration. The
-- application-layer struct in internal/models is the source of truth
-- for the supported keys; older rows decode as zero-valued fields.
--
-- `enabled_for_features` is a TEXT[] so the new
--   GET /models?capability=chat&feature=aip-chatbot
-- filter can be implemented as a plain `&& ARRAY[...]` predicate.
-- Indexed with GIN since the list dimension is "many features per
-- model" and the access pattern is "models containing this feature".

ALTER TABLE llm_models
    ADD COLUMN IF NOT EXISTS quotas               JSONB   NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS enabled_for_features TEXT[]  NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_llm_models_enabled_for_features
    ON llm_models USING GIN (enabled_for_features);

CREATE INDEX IF NOT EXISTS idx_llm_models_capabilities
    ON llm_models USING GIN (capabilities);
