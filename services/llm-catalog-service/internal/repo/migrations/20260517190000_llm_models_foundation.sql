-- LLM catalog foundation. Stores one row per registered LLM endpoint
-- (Anthropic, OpenAI, Ollama, Bedrock, ...) keyed by an internal rid
-- so callers can switch providers behind a stable handle.
CREATE TABLE IF NOT EXISTS llm_models (
    rid                    UUID PRIMARY KEY,
    provider               TEXT NOT NULL,
    model_id               TEXT NOT NULL,
    display_name           TEXT NOT NULL,
    context_window         INTEGER NOT NULL DEFAULT 0,
    input_cost_per_1k      DOUBLE PRECISION NOT NULL DEFAULT 0,
    output_cost_per_1k     DOUBLE PRECISION NOT NULL DEFAULT 0,
    capabilities           TEXT[] NOT NULL DEFAULT '{}',
    enabled                BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, model_id)
);

CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models(provider);
CREATE INDEX IF NOT EXISTS idx_llm_models_enabled  ON llm_models(enabled);
