# B04 — LLM catalog — register Azure OpenAI + unblock Act 5 (geopolitics)

> **Geopolitics PoC scope** of the platform B04. The aviation PoC
> blocker file
> [`../../aviacion/blockers/B04-llm-catalog.md`](../../aviacion/blockers/B04-llm-catalog.md)
> was written when the service was still a stub. That description is
> now stale: `services/llm-catalog-service/` already has a real
> Postgres-backed catalog (`llm_models` table, admin CRUD), a unified
> `/api/v1/llm/invoke` surface, per-(subject, model) token-bucket
> rate-limiting, Prometheus + audit log emission, and provider
> invokers for Anthropic, OpenAI-compatible and Ollama. What this
> file owns is the **geopolitics-specific delta** needed to drive Act
> 5 of [`../11-guion-demo.md`](../11-guion-demo.md) and the network
> Plan B in [`../13-riesgos-y-plan-b.md`](../13-riesgos-y-plan-b.md):
> Azure OpenAI as a first-class provider, gateway path alignment, the
> demo-time provider flip, and the seed of both rows so the AIP
> Chatbot dropdown is non-empty.
>
> Severity: **High**. Without the Azure provider wired into the catalog
> the Plan B from §13 is structurally impossible: the air-gapped
> demo box runs `ollama/llama-3.1-70b-instruct`, the online demo
> needs `azure/gpt-4o`, and the script tells the audience "we just
> switched to the on-box LLM — same prompts, same answers, no
> internet."
>
> Tracked at **~70%** after this phase: provider + invoker + gateway +
> tests + OpenAPI land here; the UI dropdown + seed migration + Plan B
> failover ladder are tracked separately (see §Deferred).

## Identity

| Field | Value |
|---|---|
| OpenFoundry service | [`services/llm-catalog-service/`](../../../services/llm-catalog-service/) (catalog CRUD + `/invoke`) plus [`services/agent-runtime-service/`](../../../services/agent-runtime-service/) (consumes the catalog at request time — currently uses static env config; tracked separately under B07) |
| Launcher app | **#27 Model Catalog** (`/model-catalog`) — cross-cutting dependency for AIP family (Assist, Analyst, Threads, Chatbot Studio, Operator). |
| Foundry product | [Model Catalog](https://www.palantir.com/docs/foundry/model-catalog/overview/) + [Model Integration](https://www.palantir.com/docs/foundry/model-integration/overview/) |
| PoC act(s) | **Act 5** — *"Copilot — AIP Chatbot with Ontology context… Tools map to Foundry tool types"* ([`../11-guion-demo.md` §Act 5](../11-guion-demo.md)) |
| Plan B | [`../13-riesgos-y-plan-b.md` §Sin internet / Azure cae](../13-riesgos-y-plan-b.md) |
| Provider matrix | [`../08-aip-copiloto-prompts.md` §Provider](../08-aip-copiloto-prompts.md) |

## Why the aviation file is misleading for this vertical

The aviation file describes the catalog as a stub with "mostly hard-coded
responses" and "no persistence of registered models". That is no longer
true in `main`:

- `services/llm-catalog-service/internal/repo/migrations/20260517190000_llm_models_foundation.sql` defines `llm_models(rid, provider, model_id, display_name, context_window, input_cost_per_1k, output_cost_per_1k, capabilities[], enabled, created_at, updated_at)` with a `(provider, model_id)` unique constraint and the expected indices.
- `services/llm-catalog-service/internal/handlers/catalog.go` serves the full admin surface: `POST/GET /models`, `GET /models/{rid}`, `POST /models/{rid}/{enable,disable}`.
- `services/llm-catalog-service/internal/handlers/invoke.go` serves `POST /invoke` with per-(subject, model) rate-limiting, audit log emission, and a 256 KB body cap.
- `services/llm-catalog-service/internal/handlers/provider.go` wires the dispatch path with `anthropicInvoker`, `openAICompatibleInvoker` (also serves Ollama via the same chat-completions shape), and now `azureOpenAIInvoker`.

What blocks Act 5 is much narrower than the aviation file suggests.

## Acts of the demo that depend on this blocker

| Act | Demand on the catalog |
|---|---|
| Act 5 — *AIP Chatbot* | The Geopolitical Analyst chatbot must call **one** of two models: `azure/gpt-4o` (online demo) or `ollama/llama-3.1-70b-instruct` (air-gapped / Plan B). Both must be selectable at `/invoke` time via their RID. |
| Plan B from [`../13-riesgos-y-plan-b.md`](../13-riesgos-y-plan-b.md) | When Azure connectivity fails mid-demo, the presenter flips the active provider from Azure to Ollama. The catalog must hold both rows; the flip is a frontend selection change, not a redeploy. |

## Gap to close in this phase

| # | Gap | Status after this phase |
|---|---|---|
| 1 | Provider enum lacks `AZURE` — registration of an Azure model returns `400 "provider must be one of ANTHROPIC, OPENAI, OLLAMA, BEDROCK"` | ✅ Resolved: `models.ProviderAzure` added, `IsValid()` extended, proto regenerated (`Provider_AZURE = 5`). |
| 2 | No Azure invoker — even if registration succeeded `/invoke` would return 501 (`ErrProviderUnimplemented`) | ✅ Resolved: `azureOpenAIInvoker` added. Uses `api-key` header (not Bearer), per-deployment URL `{base}/openai/deployments/{model_id}/chat/completions?api-version=…`, deployment carried in `model_id`. |
| 3 | Config has no `AZURE_OPENAI_*` envs | ✅ Resolved: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL`, `AZURE_OPENAI_API_VERSION` (default `2024-08-01-preview`) plumbed through `internal/config/config.go` and `main.go` into `ProviderRegistry`. |
| 4 | Gateway routed only `/api/v1/ai/providers` to LLMCatalog, while the service mounts `/api/v1/llm` — frontend calls would 404 at the proxy boundary | ✅ Resolved: `services/edge-gateway-service/internal/proxy/router_table.go` now also matches `/api/v1/llm/` and routes it to `LLMCatalog`. The `ai/providers` alias is preserved. Test added in `router_table_test.go`. |
| 5 | No OpenAPI surface for the service | ✅ Resolved: `services/llm-catalog-service/api/openapi.yaml` added (7 paths, 11 schemas). |
| 6 | No Azure dispatch test | ✅ Resolved: `TestInvoke_AzureOpenAI_DispatchAndUsage` and `TestInvoke_AzureOpenAI_MissingAPIKey_Returns502` in `invoke_test.go` cover URL shape, `api-version`, `api-key` header, and the missing-key failure path. |

## Deferred (out of scope of this phase — own blockers)

| # | Deferred gap | Owner |
|---|---|---|
| D1 | `agent-runtime-service` does not consult `llm-catalog-service` at request time; it picks Anthropic from env at boot and falls back to a fake provider when no key is set. The catalog row is invisible to the runtime today. | **B07** — agent-runtime tool routing & provider lookup. |
| D2 | `apps/web/src/routes/model-catalog/` does not exist. ChatbotStudioPage is full mock data — `MOCK_CHATBOTS` const at `apps/web/src/routes/ai/ChatbotStudioPage.tsx:17`. The provider-flip control needs UI. | **B11** — Workshop / AIP UI wiring. |
| D3 | No seed migration for `azure/gpt-4o` and `ollama/llama-3.1-70b-instruct`. Until a startup hook registers them, the demo box ships with an empty `llm_models` table. | This blocker, second phase (admin script + Helm values overlay). |
| D4 | Capability tags + per-feature allocation (`enabled_for_features`) and BYOM by function interface (Foundry parity items §5 of the aviation file) are not Act 5 blockers. Tracked as a follow-up after the parity matrix is opened. | **B12** — AIP feature gating (new). |

## Acceptance criteria for the geopolitics PoC

1. `POST /api/v1/llm/models` with `{"provider": "AZURE", "model_id": "gpt-4o-geopolitics", …}` returns `201` and persists the row. *(Covered by the unit-test suite + manual smoke against a local Postgres.)*
2. `POST /api/v1/llm/invoke` with the Azure RID + a single user message dispatches to the Azure-shaped URL (`/openai/deployments/{deployment}/chat/completions?api-version=2024-08-01-preview`), sets `api-key` (not `Authorization: Bearer`), and folds the OpenAI-shaped reply into the unified `InvokeResponse`. *(Covered by `TestInvoke_AzureOpenAI_DispatchAndUsage`.)*
3. Frontend calls to the gateway under `/api/v1/llm/*` reach the catalog service. *(Covered by `router_table_test.go` cases for `/api/v1/llm/models` and `/api/v1/llm/invoke`.)*
4. Disabling either model via `POST /api/v1/llm/models/{rid}/disable` makes `/invoke` return `503` against that RID without a restart. *(Already covered by `TestInvoke_DisabledModel_Returns503`.)*
5. *(Deferred → D2.)* The chatbot UI lists both providers and the user can switch between them in one dropdown.
6. *(Deferred → B07.)* `agent-runtime-service` looks up the active model from the catalog instead of env.
7. *(Deferred → D3.)* The seed migration registers both rows on first boot.

## Verification commands

```sh
go build ./services/llm-catalog-service/... ./services/edge-gateway-service/...
go test  ./services/llm-catalog-service/internal/handlers/... -run TestInvoke_AzureOpenAI
go test  ./services/edge-gateway-service/internal/proxy/... -run TestRouteFor
```

All three should be green on `main` of this branch.

## Cross-references

- **B07** — agent-runtime tool routing & provider lookup. The "agent-runtime should consult the catalog" item from §5 of the aviation B04 lives there; this file does not own it.
- **B11** — Workshop / AIP UI wiring (the model-catalog page and the chatbot-studio dropdown).
- **B12** — AIP feature gating (capability tags × per-feature allocation × BYOM).
- [`../08-aip-copiloto-prompts.md`](../08-aip-copiloto-prompts.md) — provider matrix and system-prompt sources.
- [`../13-riesgos-y-plan-b.md`](../13-riesgos-y-plan-b.md) — the network Plan B that makes Azure failover demo-critical.

## Files touched in this phase

- `proto/ai/v1/llm_catalog.proto` — `AZURE = 5` added to the `Provider` enum (regenerated into `libs/proto-gen/ai/v1/llm_catalog.pb.go` via `make gen-proto`).
- `services/llm-catalog-service/internal/models/models.go` — `ProviderAzure` constant, `ValidProviders` slice, extended `IsValid()`.
- `services/llm-catalog-service/internal/handlers/catalog.go` — admin error messages updated to list `AZURE`.
- `services/llm-catalog-service/internal/handlers/provider.go` — `azureOpenAIInvoker` struct, `Lookup` case for `ProviderAzure`.
- `services/llm-catalog-service/internal/handlers/invoke_test.go` — Azure dispatch + missing-key tests.
- `services/llm-catalog-service/internal/config/config.go` — Azure env triplet.
- `services/llm-catalog-service/cmd/llm-catalog-service/main.go` — Azure values piped into `ProviderRegistry`.
- `services/llm-catalog-service/api/openapi.yaml` — service OpenAPI surface (new).
- `services/edge-gateway-service/internal/proxy/router_table.go` — `/api/v1/llm/` routed to LLMCatalog upstream.
- `services/edge-gateway-service/internal/proxy/router_table_test.go` — gateway routing cases for `/api/v1/llm/models` and `/api/v1/llm/invoke`.
