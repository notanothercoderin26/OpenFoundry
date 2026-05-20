# B07 — Agent runtime is partial: tool routing depends on stub ontology

> Severity: **Critical** — the climactic moment of Act 5 ("the copilot
> queries the ontology and triggers an action") requires the agent
> runtime to route tools against a *real* ontology surface. Today the
> runtime has the LLM kernel but the tools resolve against stubs
> ([B02](B02-ontology-definition.md), [B03](B03-ontology-indexer.md)).

## Identity

| Field | Value |
|---|---|
| OpenFoundry service | [services/agent-runtime-service/](../../services/agent-runtime-service/) + [services/retrieval-context-service/](../../services/retrieval-context-service/) |
| Launcher app(s) | **#20 AI Assist** (`/ai/assist`), **#21 AI Analyst** (`/ai/analyst`), **#22 AI Threads** (`/ai/threads`), **#26 AI Operator** (`/ai/operator`), **#24 Chatbot Studio** (`/ai/chatbot-studio`) — all listed as Phase-4-mock in [launcher-app-mapping.md](../../docs/reference/launcher-app-mapping.md) |
| Foundry product | [AIP Chatbot Studio](https://www.palantir.com/docs/foundry/chatbot-studio/overview/) + [Agent Studio tools](https://www.palantir.com/docs/foundry/agent-studio/tools/) + [Retrieval context](https://www.palantir.com/docs/foundry/agent-studio/retrieval-context/) + [AIP Assist](https://www.palantir.com/docs/foundry/assist/overview/) + [AIP Analyst](https://www.palantir.com/docs/foundry/aip-analyst/overview/) + [Threads](https://www.palantir.com/docs/foundry/threads/overview/) |
| PoC act(s) | **Act 5** — "Tools map to Foundry tool types: Action, Object query, Function, Update application variable, Command, Request clarification" ([00-contrato §Foundry-native capability mapping](../00-contrato-foundry-native.md)) |
| 1-to-1 checklist | [foundry-aip-agents-threads-assist-1to1-checklist.md](../../docs/migration/foundry-aip-agents-threads-assist-1to1-checklist.md) (`partial`, ~22%) |
| Parity matrix module | *AIP Agents / Threads / Assist* — verified gaps: "No Threads resource or document upload; Assist sidebar / custom content sources absent; ReAct-style tool dispatch loop and step budgeting not wired end-to-end" |

## Palantir reference (public docs)

| Page | Live URL | Local scraped MD | Full-page screenshot |
|---|---|---|---|
| AIP Assist overview | https://www.palantir.com/docs/foundry/assist/overview/ | [Seed URLs/Assist/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Assist/Overview.md) | [Seed URLs/Assist/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Assist/Overview.screenshot.png) |
| AIP Analyst overview | https://www.palantir.com/docs/foundry/aip-analyst/overview/ | [Seed URLs/Aip Analyst/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Aip%20Analyst/Overview.md) | [Seed URLs/Aip Analyst/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Aip%20Analyst/Overview.screenshot.png) |
| Threads overview | https://www.palantir.com/docs/foundry/threads/overview/ | [Seed URLs/Threads/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Threads/Overview.md) | [Seed URLs/Threads/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Threads/Overview.screenshot.png) |
| AI FDE (AI Operator) | https://www.palantir.com/docs/foundry/ai-fde/overview/ | [Seed URLs/Ai Fde/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Ai%20Fde/Overview.md) | [Seed URLs/Ai Fde/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Ai%20Fde/Overview.screenshot.png) |
| Retrieval context | https://www.palantir.com/docs/foundry/agent-studio/retrieval-context/ | [Seed URLs/Agent Studio/Retrieval Context.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Agent%20Studio/Retrieval%20Context.md) | [Seed URLs/Agent Studio/Retrieval Context.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Agent%20Studio/Retrieval%20Context.screenshot.png) |
| AIP Chatbot Studio overview | https://www.palantir.com/docs/foundry/chatbot-studio/overview/ | [Seed URLs/Chatbot Studio/Overview.md](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Chatbot%20Studio/Overview.md) | [Seed URLs/Chatbot Studio/Overview.screenshot.png](../../docs_original_palantir_foundry/foundry-docs/Seed%20URLs/Chatbot%20Studio/Overview.screenshot.png) |

## Foundry behavior to replicate (summary)

An AIP chatbot/agent is configured with **tools**: each tool has a typed
name and binds to an Ontology Object query, an Action Type, a Function,
an "update variable" callback, a shell-like Command, or a "request
clarification" prompt. The agent runs a **ReAct-style** loop: it
plans, calls a tool, observes, plans again, all under a budget
(steps + tokens). **Retrieval context** sources let it pull documents
or Ontology results into the prompt. **Threads** persist the
conversation and any uploaded documents; **Assist** is a sidebar variant
of the same agent across the platform. Security is inherited from
the calling user — the agent can never bypass Foundry permissions.

## Current OpenFoundry surface

| Layer | File | State |
|---|---|---|
| Service main | [services/agent-runtime-service/cmd/agent-runtime-service/main.go](../../services/agent-runtime-service/cmd/agent-runtime-service/main.go) | ~131 lines |
| Handlers | [services/agent-runtime-service/internal/](../../services/agent-runtime-service/internal/) | ~7.6k LOC + 13 migrations — partial, more advanced than most peers |
| LLM kernel | [libs/ai-kernel-go/](../../libs/ai-kernel-go/) | ~10.5k LOC, multi-provider LLM gateway, ReAct loop, tool routing |
| Retrieval | [services/retrieval-context-service/](../../services/retrieval-context-service/) | ~1.9k LOC, thin wrapper |
| Model source | (would be) [services/llm-catalog-service/](../../services/llm-catalog-service/) | **stub — see [B04](B04-llm-catalog.md)** |
| Ontology query (tool target) | [services/ontology-query-service/](../../services/ontology-query-service/) | Thin (~2.9k LOC, 0 migrations) — depends on [B02](B02-ontology-definition.md)/[B03](B03-ontology-indexer.md) for real data |
| Ontology actions (tool target) | [services/ontology-actions-service/](../../services/ontology-actions-service/) | ~1.2k LOC, explicit stub mode |
| Frontend | [apps/web/src/routes/ai/](../../apps/web/src/routes/ai/) | Pages exist but render Phase 4 mock per launcher mapping |

## Gap to close

1. **No Thread resource.** Conversations are not persisted; closing the
   tab loses context. The 1-to-1 checklist flags "No Threads resource or
   document upload / export".
2. **No document upload / RAG attachment.** `retrieval-context-service`
   does not accept document uploads, embed them, and serve them as tool
   responses.
3. **Tool dispatch loop not budgeted.** ReAct loop exists in
   `ai-kernel-go` but step / token budgeting and Assist sidebar
   integration are not wired end-to-end (per parity matrix verified gaps).
4. **Tools resolve against stubs.** Object query tool hits
   `ontology-query-service`, which has no indexed backend (depends on
   [B03](B03-ontology-indexer.md)); Action tool hits
   `ontology-actions-service`, which is mostly stub.
5. **Model selection bypasses catalog.** Provider is static in
   `ai-kernel-go` config rather than chosen via
   `llm-catalog-service` ([B04](B04-llm-catalog.md)).
6. **Security inheritance unverified.** The agent does not consistently
   propagate the caller's JWT to downstream Ontology calls, so
   permission boundaries are not enforced.

## Acceptance criteria to unblock the PoC

1. `POST /threads` creates a thread, `POST /threads/{id}/messages` appends
   user/assistant turns and persists them; the AI Threads UI lists prior
   conversations after a refresh.
2. An agent declared with three tools — *FindAircraftByTail* (Object
   query), *ScheduleMaintenance* (Action), *WeatherAt* (Function) — calls
   each correctly in a single conversation, with the ReAct trace
   visible at `GET /threads/{id}/trace`.
3. Step budget (e.g. max 6 tool calls) and token budget enforced; on
   overshoot the agent returns a graceful "budget exhausted" message
   surfaced in the UI.
4. A document uploaded via `POST /retrieval-context/documents` is
   embedded and retrievable; the agent cites it inline when relevant.
5. Provider selection comes from `llm-catalog-service`
   ([B04](B04-llm-catalog.md)); switching from `ollama/llama-3.1-70b`
   to `azure/gpt-4o` in the catalog changes the model used by the next
   message, no restart.
6. The agent receives the caller JWT; if the user does not have access
   to `Aircraft`, the tool call returns 403 and the agent surfaces
   "I cannot view that data" rather than hallucinating.
7. End-to-end demo: a presenter says *"schedule a B-check on N12345 next
   Tuesday"* — the agent queries the ontology, proposes the action,
   asks for confirmation, submits it, and the resulting notification
   ([B05](B05-notifications.md)) lands in the MRO inbox.

## Status as of 2026-05-20

| Gap | Status | Evidence |
|---|---|---|
| **AC#1** Threads + per-message persistence + listing | ✅ Done | New migration [`20260520150000_threads.sql`](../../services/agent-runtime-service/internal/repo/migrations/20260520150000_threads.sql) adds `threads`, `thread_messages`, `thread_traces`. `internal/repo/threads.go` exposes CRUD + `AppendMessage` (atomic MAX(position)+1 inside a tx) + `AppendTraceStep`. Endpoints: `POST/GET/DELETE /api/v1/agent-runtime/threads[/{id}]`, `GET/POST /api/v1/agent-runtime/threads/{id}/messages`, `GET /api/v1/agent-runtime/threads/{id}/trace`. |
| **AC#2** Three-tool ReAct loop + trace surface | ✅ Done | New `internal/react/runner.go`: budget-aware loop with `Plan/ToolCall/Observation/Final/Error/BudgetExhausted` trace kinds persisted into `thread_traces`. Tool registry covers `object_query` / `action` / `function` / `retrieval` / `command` / `request_clarification`. `internal/react/clients.go` wires the LLM seam to llm-catalog-service `/api/v1/llm/invoke` and the tool router to object-database / ontology-actions / retrieval-context via per-kind URLs. `GET /threads/{id}/trace` returns the step-by-step audit. |
| **AC#3** Step + token budgets | ✅ Done | `threads.max_tool_calls` (default 6) + `threads.max_prompt_tokens` (default 16000) configurable on POST /threads. Runner checks the token budget before each LLM call and the tool-call counter on every iteration; overshoot produces a `budget_exhausted` trace step + a graceful assistant message. Verified by `runner_test.go::TestRunner_RespectsStepBudget` and `TestRunner_RespectsPromptTokenBudget`. |
| **AC#4** Document upload + embedding + RAG | ✅ Done | New migration [`0002_knowledge_documents.sql`](../../services/retrieval-context-service/internal/repo/migrations/0002_knowledge_documents.sql) adds `knowledge_documents` + `knowledge_document_chunks`. `POST /api/v1/retrieval/documents` chunks the upload (≤1200 chars on whitespace boundaries) and computes a 15-dim BoW hash signature per chunk. `POST /api/v1/retrieval/search` runs cosine + lexical-overlap boost across the requested KB. The agent's `retrieval` tool kind is wired to this surface so the LLM can call `SearchManuals` end-to-end. PoC embedder; the shape is right and the production swap to `libs/ai-kernel-go/embeddings` is a localized change. |
| **AC#5** Provider selection from llm-catalog-service | ✅ Done | `Threads.model_rid` references an `llm_models.rid` from the catalog (B04). The runner's `LLMInvocation.ModelRID` is what `HTTPLLMClient` POSTs to `/api/v1/llm/invoke`; switching the catalog row's `enabled` flag or selecting a different model on thread creation changes the next message without an agent-runtime restart. |
| **AC#6** Caller JWT propagation to tools | ✅ Done | `Threads.PostMessage` extracts the bearer token from the inbound request and threads it into `RunInput.CallerJWT`. Both `HTTPLLMClient.Invoke` and every `HTTPToolRouter.invoke*` set `Authorization: Bearer <token>` on the downstream call. Forbidden / unauthorized responses bubble back as observations (`{"error":"permission denied (403)"}`) so the LLM can phrase a "I cannot view that data" reply rather than hallucinate. Verified by `clients_test.go::TestHTTPLLMClient_ParsesFinalAnswer` (auth header echoed) and `TestHTTPToolRouter_PropagatesForbiddenAsObservation`. |
| **AC#7** End-to-end demo | ✅ Plumbed | "Schedule a B-check on N12345 next Tuesday" closes once B01 (Workshop), B02/B03 (ontology), B05 (notifications) — all on this branch — and the demo seed data are wired. The agent runtime now has every seam in place: ReAct loop, real tool router, JWT pass-through, model selection, document upload. |

## UI (apps/web)

The previously-mocked `apps/web/src/routes/ai/ThreadsPage.tsx` is
replaced by a three-pane page wired to the real APIs:

- **Left:** thread list (auto-selects most recent, refetches every 30 s).
- **Center:** message stream + composer; sending POSTs to
  `/threads/{id}/messages` and re-renders with the user, tool, and
  assistant turns the ReAct loop produced.
- **Right:** ReAct trace panel (5 s polling) + document uploader that
  POSTs to `/api/v1/retrieval/documents` against the `ops-manuals`
  knowledge base so the agent's `SearchManuals` tool can find it.

New `lib/api/threads.ts` mirrors the Go wire shapes.

## Tests

- `internal/react/runner_test.go`: 6 cases — final-no-tool, tool-call-then-final
  (with JWT propagation assertion), step-budget cap, prompt-token cap,
  unknown-tool fallthrough, LLM transport error.
- `internal/react/clients_test.go`: 7 cases — final parsing, tool-call
  JSON detection, non-2xx surfacing, object-query path/auth, action
  path/auth, forbidden-as-observation, unconfigured-endpoint
  friendly observation.
- `services/retrieval-context-service/internal/handlers/knowledge_test.go`:
  7 cases — chunk splitting on whitespace, deterministic + unit
  embedding, cosine identity, cosine separation, lexical boost,
  score sort.
- `apps/web/src/lib/api/threads.test.ts`: 7 cases mirroring every
  helper method.
- `apps/web/src/routes/ai/ThreadsPage.test.tsx`: 4 UI cases — render
  list + budget summary, trace pane shows steps, empty state, "+ New"
  invokes POST.

## Implementation pointers

1. Add `threads`, `thread_messages`, `thread_traces` Postgres tables to
   `agent-runtime-service`.
2. Lift the ReAct loop from `ai-kernel-go` to use catalog-resolved
   models and propagate the caller JWT to every tool call.
3. Implement document upload + embedding in `retrieval-context-service`;
   reuse `libs/ai-kernel-go` embedding providers.
4. Plumb step / token budget config per agent and per request; reject on
   overshoot.
5. Once [B02](B02-ontology-definition.md), [B03](B03-ontology-indexer.md)
   and [B04](B04-llm-catalog.md) are unblocked, the tool targets become
   real and the end-to-end demo collapses into a smoke test.
6. Track progress against
   [foundry-aip-agents-threads-assist-1to1-checklist.md](../../docs/migration/foundry-aip-agents-threads-assist-1to1-checklist.md).
