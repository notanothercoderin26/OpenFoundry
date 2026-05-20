-- B04 §AC#3 — Seed the demo's "Ollama vs Azure" pivot.
--
-- The UNIQUE(provider, model_id) constraint from the foundation
-- migration makes both INSERTs idempotent under ON CONFLICT — a
-- replay of this file (or a re-deploy of the service against a
-- pre-seeded database) is a no-op rather than an error.
--
-- The seed deliberately enables BOTH models for the same three AIP
-- features so the Chatbot Studio dropdown can switch between them
-- without further admin intervention. Quotas are conservative
-- defaults — operators tune per tenant via PATCH /models/{rid}.

INSERT INTO llm_models (
    rid, provider, model_id, display_name, context_window,
    input_cost_per_1k, output_cost_per_1k, capabilities,
    quotas, enabled_for_features, enabled
) VALUES (
    '00000000-0000-4000-8000-000000000001'::uuid,
    'OLLAMA',
    'llama-3.1-70b',
    'Ollama · Llama 3.1 70B',
    131072,
    0.0,
    0.0,
    ARRAY['CHAT', 'TEXT', 'TOOLS'],
    jsonb_build_object(
        'requests_per_minute',     120,
        'tokens_per_minute',       240000,
        'max_concurrent_requests', 8,
        'daily_token_budget',      0,
        'daily_cost_budget_usd_cents', 0
    ),
    ARRAY['aip-chatbot', 'ai-analyst', 'document-ai'],
    TRUE
)
ON CONFLICT (provider, model_id) DO NOTHING;

INSERT INTO llm_models (
    rid, provider, model_id, display_name, context_window,
    input_cost_per_1k, output_cost_per_1k, capabilities,
    quotas, enabled_for_features, enabled
) VALUES (
    '00000000-0000-4000-8000-000000000002'::uuid,
    'AZURE',
    'gpt-4o',
    'Azure OpenAI · GPT-4o',
    128000,
    0.005,
    0.015,
    ARRAY['CHAT', 'TEXT', 'TOOLS', 'VISION'],
    jsonb_build_object(
        'requests_per_minute',     60,
        'tokens_per_minute',       120000,
        'max_concurrent_requests', 4,
        'daily_token_budget',      4000000,
        'daily_cost_budget_usd_cents', 50000
    ),
    ARRAY['aip-chatbot', 'ai-analyst', 'document-ai'],
    TRUE
)
ON CONFLICT (provider, model_id) DO NOTHING;
