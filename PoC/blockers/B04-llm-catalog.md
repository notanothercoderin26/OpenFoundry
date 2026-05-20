# B04 — LLM catalog service is a stub

> Severity: **Critical** — blocks the "elige Ollama (Llama 3.1 70B) vs
> Azure OpenAI GPT-4o" pivot of Act 5, and is a dependency of the whole
> AIP family (Assist, Analyst, Threads, Chatbot Studio, Operator).
>
> **Scope revised 2026-05-20.** The "Current OpenFoundry surface" table
> below understated the state of the service: when the audit was
> written the service was already a Postgres-backed CRUD with an
> Anthropic / OpenAI / Ollama provider registry + unified invoke
> endpoint. Phase 1 of this commit closes the actual remaining gaps
> against the acceptance criteria — see "Status as of 2026-05-20"
> below. UI work for the Chatbot Studio dropdown and the AIP
> feature → models admin view is deferred to a separate ticket.

## Identity

| Field | Value |
|---|---|
| OpenFoundry service | [services/llm-catalog-service/](../../services/llm-catalog-service/) |
| Launcher app(s) | **#27 Model Catalog** (`/model-catalog`); cross-cutting dependency for **#19 AI Logic**, **#20 AI Assist**, **#21 AI Analyst**, **#22 AI Threads**, **#23 Document AI**, **#24 Chatbot Studio**, **#25 AI Evals**, **#26 AI Operator** ([launcher-app-mapping.md §E](../../docs/reference/launcher-app-mapping.md)) |
| Foundry product | [Model Catalog](https://www.palantir.com/docs/foundry/model-catalog/overview/) + [Model Integration](https://www.palantir.com/docs/foundry/model-integration/overview/) |
| PoC act(s) | **Act 5** — "Copilot — AIP Chatbot with Ontology context… Tools map to Foundry tool types" ([00-contrato §Foundry-native capability mapping](../00-contrato-foundry-native.md)) |
| 1-to-1 checklist | [foundry-aip-document-analyst-catalog-1to1-checklist.md](../../docs/migration/foundry-aip-document-analyst-catalog-1to1-checklist.md) |
| Parity matrix module | *AIP Document Intelligence / Analyst / Model Catalog* — currently `todo`, 0% ([foundry-feature-parity-matrix.md](../../docs/migration/foundry-feature-parity-matrix.md)) |

## Palantir reference (public docs)

| Page | Live URL | Local scraped MD | Full-page screenshot |
|---|---|---|---|
| Model Catalog overview | https://www.palantir.com/docs/foundry/model-catalog/overview/ | [Seed URLs/Model Catalog/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Model%20Catalog/Overview.md) | [Seed URLs/Model Catalog/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Model%20Catalog/Overview.screenshot.png) |
| Model integration overview | https://www.palantir.com/docs/foundry/model-integration/overview/ | [Seed URLs/Model Integration/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Model%20Integration/Overview.md) | [Seed URLs/Model Integration/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Model%20Integration/Overview.screenshot.png) |
| AIP overview (downstream) | https://www.palantir.com/docs/foundry/aip/overview/ | [Seed URLs/Aip/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Aip/Overview.md) | [Seed URLs/Aip/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Aip/Overview.screenshot.png) |
| AIP Chatbot Studio overview | https://www.palantir.com/docs/foundry/chatbot-studio/overview/ | [Seed URLs/Chatbot Studio/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Chatbot%20Studio/Overview.md) | [Seed URLs/Chatbot Studio/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Chatbot%20Studio/Overview.screenshot.png) |
| Agent Studio tools | https://www.palantir.com/docs/foundry/agent-studio/tools/ | [Seed URLs/Agent Studio/Tools.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Agent%20Studio/Tools.md) | [Seed URLs/Agent Studio/Tools.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Agent%20Studio/Tools.screenshot.png) |

## Foundry behavior to replicate (summary)

Model Catalog is the registry of **models available to consumers** in the
platform, including hosted LLMs, BYOM (bring-your-own-model) entries
registered by function interface, and capability tags (e.g. "supports
function-calling", "vision-capable"). Each model exposes per-tenant
quotas, allowed AIP features, and an OpenAI-compatible HTTP surface.
Consumers like Chatbot Studio choose a model by capability, not by
hard-coded provider name.

## Current OpenFoundry surface

| Layer | File | State |
|---|---|---|
| Service main | [services/llm-catalog-service/cmd/llm-catalog-service/main.go](../../services/llm-catalog-service/cmd/llm-catalog-service/main.go) | ~90 lines |
| Handlers | [services/llm-catalog-service/internal/handlers/](../../services/llm-catalog-service/internal/handlers/) | 6 handlers; mostly hard-coded responses |
| Migrations | none real | No persistence of registered models |
| Related kernel | [libs/ai-kernel-go/](../../libs/ai-kernel-go/) | ~10.5k LOC, real provider routing exists for runtime — but it does not read from a catalog, providers are configured statically |
| Frontend | [apps/web/src/routes/model-catalog/](../../apps/web/src/routes/model-catalog/) | Renders mock data per the launcher mapping note |

## Gap to close

1. **No model registry.** Cannot register `ollama/llama-3.1-70b` and
   `azure/gpt-4o` with their capabilities, quotas, and per-tenant
   allowance from the catalog UI or API.
2. **No capability tags.** Consumers cannot ask "give me a chat-capable
   model with tool calling" — they must hard-code provider IDs.
3. **No BYOM register-by-function-interface.** Foundry allows registering
   a function as a model adapter; OpenFoundry has no such hook.
4. **No OpenAI-compatible HTTP surface emitted by the catalog.** The
   runtime in `ai-kernel-go` has OpenAI-compatible endpoints, but they
   are not gated by catalog membership.
5. **No per-feature allocation.** "Enable AIP features" admin surface
   absent — cannot tell the customer "this model is enabled for AI
   Analyst but not Chatbot Studio".

## Acceptance criteria to unblock the PoC

1. `POST /models` registers a model with `id`, `provider`, `model_name`,
   `capabilities` (string set), `quotas`, and `enabled_for_features`.
2. `GET /models?capability=chat&feature=aip-chatbot` returns the active
   set for a given feature, filtered by capability.
3. The Chatbot Studio UI lists both `ollama/llama-3.1-70b` and
   `azure/gpt-4o` after a seed script registers them, and the user can
   switch between them in a single dropdown — picking either succeeds
   end-to-end against `agent-runtime-service` ([B07](B07-agent-runtime-tool-routing.md)).
4. Disabling a model via `PATCH /models/{id} {enabled: false}` removes it
   from the dropdown without a service restart.
5. An "AIP feature → models" admin view exists in the Model Catalog UI.
6. If Azure OpenAI network connectivity fails during a demo, the catalog
   fallback to Ollama is automatic and visible in the UI (status badge).

## Status as of 2026-05-20

| Gap | Status | Evidence |
|---|---|---|
| **AC#1** Register with quotas + enabled_for_features | ✅ Done | New migration [`20260520120000_llm_models_quotas_features.sql`](../../services/llm-catalog-service/internal/repo/migrations/20260520120000_llm_models_quotas_features.sql) adds `quotas JSONB` + `enabled_for_features TEXT[]` with GIN indices. `models.Quotas` carries the typed Go view (RequestsPerMinute, TokensPerMinute, MaxConcurrentRequests, DailyTokenBudget, DailyCostBudgetUSDCents). `RegisterModelRequest` accepts both; the PgStore + MemoryStore round-trip them. |
| **AC#2** GET /models?capability=…&feature=… | ✅ Done | New `repo.ListFilter` carries the four query knobs (provider/capability/feature/only_enabled). Postgres uses `$N = ANY(...)` against the GIN-indexed array columns; in-memory mirrors. New `CapabilityChat` token added to the enum so the Chatbot Studio dropdown can ask for `capability=CHAT`. |
| **AC#3** Seed Ollama + Azure GPT-4o | ✅ Done | New migration [`20260520120100_llm_models_seed_demo.sql`](../../services/llm-catalog-service/internal/repo/migrations/20260520120100_llm_models_seed_demo.sql) inserts the two demo models with deterministic UUIDs + `ON CONFLICT (provider, model_id) DO NOTHING` so replays are no-ops. New `ProviderAzure` enum value distinguishes Azure OpenAI from vanilla OpenAI — different endpoint scheme. |
| **AC#4** PATCH /models/{rid} flips enabled | ✅ Done | New `Catalog.UpdateModel` handler on `PATCH /api/v1/llm/models/{rid}` accepts an `UpdateModelRequest` with all-optional fields (display_name, context_window, costs, capabilities, quotas, enabled_for_features, enabled). PgStore builds the SET list dynamically so absent fields are never overwritten; MemoryStore mirrors. The list-by-`only_enabled=true` view drops the disabled model immediately — no service restart. |
| **AC#6** Provider status badge | ✅ Done | New `internal/providers.Prober` polls each configured upstream's standard liveness endpoint (Ollama `/api/tags`, OpenAI `/v1/models`, Azure `/openai/models?api-version=...`, Anthropic `/v1/messages`) every 30 s (configurable). Each response maps to `ok` / `degraded` (auth failed OR latency > 2 s) / `down` / `unknown`. `GET /api/v1/llm/providers/health` serves the JSON snapshot the UI badges off. Wired in `main.go::buildProber` from env (`OLLAMA_BASE_URL`, `OPENAI_BASE_URL`, `AZURE_OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL` + matching API-key envs). |
| **Edge-gateway routing** | ✅ Done | `/api/v1/llm/*` now routes to `LLMCatalog` upstream alongside the existing `/api/v1/ai/providers` rule — see [router_table.go](../../services/edge-gateway-service/internal/proxy/router_table.go). |
| **AC#3** Chatbot Studio dropdown switches Ollama ↔ Azure | ✅ Done | New [`ChatbotModelPicker`](../../apps/web/src/routes/ai/ChatbotModelPicker.tsx) wired into the Chatbot Studio hero strip: queries `?capability=CHAT&feature=aip-chatbot&only_enabled=true`, persists the chosen rid in `localStorage`, biases the default toward an `ok`-status provider, and marks `down` options as disabled. Live provider-health polls every 15 s so a falling Azure shows "DOWN" suffix and the dropdown auto-prefers Ollama. |
| **AC#5** AIP feature → models admin view | ✅ Done | New [`LlmCatalogPage`](../../apps/web/src/routes/llm-catalog/LlmCatalogPage.tsx) at `/llm-catalog` with three sections: (1) Provider-health badges (Online / Degraded / Down / Unknown with latency + last-check timestamp). (2) Registered-models table with provider/capability/feature filters, capability badges, quotas summary, and a one-click enabled toggle that issues `PATCH /api/v1/llm/models/{rid}`. (3) AIP feature → models matrix (one row per `aip-chatbot` / `ai-analyst` / `document-ai`, one column per model, "✓ wired" marker per cell with a struck-through variant when the model is registered for the feature but globally disabled). New `lib/api/llmCatalog.ts` is the canonical wire client. Verified by vitest: `llmCatalog.test.ts` (5 cases — querystring encoding, empty params, POST, PATCH, /providers/health), `ChatbotModelPicker.test.tsx` (6 — render both seeds, default rid, prefer healthy on init, DOWN option disabled, persist localStorage, empty placeholder), `LlmCatalogPage.test.tsx` (4 — render rows, status badges, wired-marker count, PATCH on toggle). |

## Implementation pointers

1. Materialize a `models` table (Postgres) with the columns above; add
   Goose migrations.
2. Make `agent-runtime-service` ([B07](B07-agent-runtime-tool-routing.md))
   query the catalog at request time instead of using `ai-kernel-go`
   static config.
3. Expose `GET /models` and `GET /models/{id}` from
   `edge-gateway-service` to the frontend.
4. Seed `ollama/llama-3.1-70b` and `azure/gpt-4o` in a startup migration
   so the demo always has both visible.
5. Track work against
   [foundry-aip-document-analyst-catalog-1to1-checklist.md](../../docs/migration/foundry-aip-document-analyst-catalog-1to1-checklist.md);
   that checklist is at 0% today, so every item is open.
