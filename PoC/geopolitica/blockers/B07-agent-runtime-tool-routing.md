# B07 — Agent runtime + tool routing — wire ExecutePlan into POST /runs (geopolitics)

> **Geopolitics PoC scope** of the platform B07. The aviation
> [`../../aviacion/blockers/B07-agent-runtime-tool-routing.md`](../../aviacion/blockers/B07-agent-runtime-tool-routing.md)
> labels the service as "agents endpoints persist metadata, never call
> the executor". That's exactly the regression this phase closes. The
> ReAct engine in
> [`libs/ai-kernel-go/domain/agents/executor.go`](../../../libs/ai-kernel-go/domain/agents/executor.go)
> — 1188 LOC covering 11 tool execution modes including the four
> `action.*` shapes the geopolitical Copilot needs
> ([`../08-aip-copiloto-prompts.md` §Tool catalog](../08-aip-copiloto-prompts.md))
> — was never reached from this service. The kernel's own
> `AgentsHandlers.ExecuteAgent` (`libs/ai-kernel-go/handlers/agents.go:227`)
> *does* call `ExecutePlan`, but it operates on the kernel-owned
> `ai_agents` table; the service-facing
> `POST /api/v1/agents/{id}/runs` route went through
> `agent-runtime-service/internal/handlers/handlers.go::StartRun`,
> which only ran a single `INSERT INTO agent_runs` and returned.
>
> Severity: **Critical** — Act 5 ("Geopolitical Copilot drives
> Ontology + Action tools") is structurally impossible without an
> executor on the demo path. Without this wire there are zero tool
> calls, zero plan traces, and the LLM ends up free-running with no
> grounding — *the hallucination outcome the customer is hired to
> prevent*.
>
> Tracked at **~50%** after this phase: the executor is wired
> end-to-end, traces land in `agent_run_steps`, the run reaches a
> terminal `completed` / `failed` state. LLM synthesis of the final
> answer (the bridge between the last trace observation and the
> analyst-friendly response shown in the chat panel) and the tool
> registry seeding remain.

## Identity

| Field | Value |
|---|---|
| OpenFoundry components | [`services/agent-runtime-service/`](../../../services/agent-runtime-service/) (the service that owns `agent_definitions` / `agent_runs` / `agent_run_steps`) + [`libs/ai-kernel-go/domain/agents/`](../../../libs/ai-kernel-go/domain/agents/) (the ReAct engine: `BuildPlan`, `ExecutePlan`, `ExecuteTool`, plus the 11 execution-mode dispatchers) |
| Launcher app(s) | **#21 AIP Analyst** (chat panel that exercises the copilot), **#22 Threads** (persistence layer for conversations), **#20 AIP Assist** (sidebar grounded in the same agent), **#24 Chatbot Studio** (designer surface) |
| Foundry product | [AIP Assist](https://www.palantir.com/docs/foundry/aip/aip-assist-overview/) + [AIP Analyst](https://www.palantir.com/docs/foundry/aip/aip-analyst-overview/) + [Threads](https://www.palantir.com/docs/foundry/aip/threads-overview/) + [Retrieval context](https://www.palantir.com/docs/foundry/aip/retrieval-context-overview/) + [Agent Studio tools](https://www.palantir.com/docs/foundry/agent-studio/tools/) |
| PoC act(s) | **Act 5** — *"Copilot — AIP Chatbot with Ontology context… Tools map to Foundry tool types"* ([`../11-guion-demo.md` §Act 5](../11-guion-demo.md)). Demo prompts P1-P6 from [`../08-aip-copiloto-prompts.md`](../08-aip-copiloto-prompts.md) each need a multi-step plan dispatched against the geopolitical tool catalog. |
| Tool catalog (geopolitics) | 14 tools across 6 categories ([`../08-aip-copiloto-prompts.md` §Tool catalog](../08-aip-copiloto-prompts.md)): `ontology.query_actors`, `ontology.query_events`, `ontology.expand_neighborhood`, `ontology.read_object` (Object query); `retrieval.search_news` (Retrieval); `function.summarize_actor_activity`, `function.country_situation_brief` (Function); `action.add_to_watchlist`, `action.flag_actor`, `action.open_investigation_case`, `action.acknowledge_alert` (Action); `command.update_variable`, `command.request_clarification` (Update variable / Request clarification). |
| Cascade | Depends on B02 ✅ (Ontology event surface), B04 ✅ (LLM catalog with Azure + Ollama for the chatbot), B05 ✅ (Approvals UI so `action.*` confirmations actually appear), B06 ✅ (Iceberg snapshots with idempotency so the retrieval index is stable). |

## What the audit got right

| Audit claim | Verified in the tree |
|---|---|
| "El motor ReAct existe en `libs/ai-kernel-go/domain/agents/executor.go` (1.188 LOC) pero no está cableado al router del servicio" | ✅ Yes. The router at `internal/server/server.go:94` mounts `api.Post("/agents/{id}/runs", h.StartRun)`. The handler at `internal/handlers/handlers.go:205` calls `h.Repo.StartRun(...)` only — a single INSERT — and never references `agents.ExecutePlan`. |
| "Los endpoints `/agents/{id}/runs` sólo persisten metadata, nunca llaman a `ExecutePlan`" | ✅ Confirmed. The same handler. |
| "0 tools ejecutables, 0 budget enforcement, 0 RAG, JWT no se propaga" | ✅ Confirmed pre-phase: `StartRun` ignored `body.Input`, never read `agent_definitions.tools`, never read `r.Header.Get("Authorization")`. |

## Gap to close in this phase

| # | Gap | Status after this phase |
|---|---|---|
| 1 | `POST /agents/{id}/runs` does not invoke the ReAct executor | ✅ Resolved: new `runner.go` plumbs the call from `StartRun` into `agents.BuildPlan` + `agents.ExecutePlan`. The dispatch runs in the background so the handler returns 201 immediately; the run row transitions to `completed` / `failed` once the executor finishes. |
| 2 | `agent_definitions.tools` (JSONB) was never decoded into `aimodels.ToolDefinition` | ✅ Resolved: `decodeAgentTools` accepts the canonical array shape and falls back to an empty slice on bad shape so the planner builds a no-tools plan rather than failing the run. |
| 3 | No traces ever landed in `agent_run_steps` from the executor | ✅ Resolved: each `aimodels.AgentExecutionTrace` is persisted as one `agent_run_steps` row with `kind ∈ {"tool", "retrieval", "synthesis"}` and the trace JSON in `payload`. Step index = trace index for stable ordering. |
| 4 | Run never transitioned out of `running` from the server side | ✅ Resolved: new `Repo.CompleteRun(ctx, runID, status, finalOutput)` method. On executor success the row gets `status="completed"` and the wire-stable envelope below; on executor error `status="failed"` and `{"error":"..."}`. |
| 5 | JWT not propagated to HTTP-mode tools (`http_json`, `openfoundry_api`) | ✅ Resolved: `snapshotForwardedHeaders` copies `Authorization`, `X-OpenFoundry-Tenant`, `X-OpenFoundry-Branch`, `X-OpenFoundry-Subject` into a fresh `http.Header` that the background goroutine hands to `agents.ExecutePlan`. Cookies and arbitrary headers are not propagated (no inadvertent leakage to downstream tools). |
| 6 | Legacy "client drives steps via POST /runs/{run_id}/steps" path would have broken | ✅ Resolved: when `body.Input.user_message` is empty the handler skips the executor entirely. The run stays in `running` and the legacy step-by-step client driver keeps the contract it had pre-phase. |
| 7 | No tests of the wire | ✅ Resolved: 9 unit tests in `runner_test.go` covering plan + trace emission with two simulated tools, objective fallback, no-tools synthesis, JSONB tool decoding (good + 6 bad shapes), trace-kind routing for tool / retrieval / synthesis, and header allowlist propagation. |

## Wire-stable final_output envelope

The handler writes one row into `agent_runs.final_output` per terminal
transition. Adding fields is allowed; renames break clients. Shape:

```json
{
  "user_message":      "List sanctioned actors in Sahel.",
  "objective":         "Top-5 entities with current OFAC or EU sanction.",
  "final_observation": "Prepared final synthesis with 3 successful tool invocation(s) and 0 knowledge hit(s).",
  "trace_count":       5,
  "tool_calls":        3,
  "knowledge_hits":    0
}
```

On executor error the row becomes `{"error":"<message>"}` so the UI
can render the failure cause inline. Per-step detail (the actual tool
outputs, observations, IDs) lives in `agent_run_steps` and is queried
separately through the existing `GET /api/v1/agents/{id}/runs/{run_id}/steps`
endpoint.

## Deferred (out of scope of this phase — own follow-ups)

| # | Deferred gap | Owner / rationale |
|---|---|---|
| D1 | **LLM synthesis of the final answer.** The kernel's `AgentsHandlers.ExecuteAgent` (handlers/agents.go:280) runs a `synthesiseFinalResponse` pass that mints an analyst-friendly summary from the trace list + provider in `agent_definitions.provider_id`. Wiring it here needs (a) a `llm-catalog-service` lookup against the LlmProvider RID, and (b) the budget enforcement (tokens, USD) that pairs with it. The audit's "0 budget enforcement" gap lives here. Tracked as **B07 Phase 2**. |
| D2 | **RAG / knowledge-base retrieval.** `agents.BuildPlan` injects a `retrieve-context` step when `knowledgeHits` is non-empty; today this phase passes `nil`. The kernel's `loadKnowledgeBaseDocuments` + `rag.Search` already exist; wiring the per-run `knowledge_base_id` from a yet-to-be-added column on `agent_definitions` is **B07 Phase 3**. The audit's "0 RAG" gap lives here. |
| D3 | **Tool registry seed for the geopolitics catalog.** The 14 tools listed in [`../08-aip-copiloto-prompts.md` §Tool catalog](../08-aip-copiloto-prompts.md) (`ontology.query_actors`, `function.summarize_actor_activity`, `action.add_to_watchlist`, …) need to be registered as `agent_definitions.tools` entries before P1-P6 can run end-to-end. The plumbing accepts them — the seed migration is the missing piece. Tracked as **B07 Phase 4** (paired with the demo seed package in `tools/poc-geopolitica/`). |
| D4 | **Per-tool execution config wiring.** `ToolDefinition.ExecutionConfig` is the JSON the kernel's `executeNativeOntologyTool` / `executeNativeReportTool` read. For the geopolitics PoC each `ontology.*` and `action.*` tool needs a config pointing at `ontology-definition-service`, `ontology-actions-service`, and the `object-database-service` query path. Tracked alongside D3. |
| D5 | **Purpose-checkpoint approval enforcement** for sensitive tools. The kernel's `enforceAgentPurposeCheckpoint` (handlers/agents.go:253) gates `Action` tools through a purpose-justification flow; this phase does not wire the checkpoint client. Tracked as **B07 Phase 5** (paired with the Approvals UI shipped in B05). |

## Acceptance criteria for the geopolitics PoC

1. `POST /api/v1/agents/{id}/runs` with `{"input":{"user_message":"...","objective":"..."}}` returns 201 and the run row transitions to `completed` within the executor's per-tool budget — confirmed by `GET /api/v1/agents/{id}/runs/{run_id}`. *(Covered by `TestPlanAndExecute_BuildsPlanWithTraces`; live verification needs a seeded agent + tools, deferred to D3.)*
2. The traces emitted by `ExecutePlan` land in `agent_run_steps` one row per trace with the canonical `kind` enum and the trace JSON in `payload`. *(Wire is covered by the handler test path; payload shape is tested in `TestTraceKindFor_*` and by the kernel's own executor tests.)*
3. A request without a `user_message` still returns 201 and behaves exactly as it did before this phase — the legacy `/runs/{run_id}/steps` driver flow stays green. *(Covered indirectly: the runner returns `ranExecutor=false` and the run stays in `running` with empty `final_output`. The 5 pre-existing agent runtime tests still pass.)*
4. `Authorization` + `X-OpenFoundry-Tenant` + `X-OpenFoundry-Branch` headers are forwarded to the executor's `http.Header` arg so `http_json` / `openfoundry_api` tools call downstream services as the inbound user. Arbitrary headers (Cookie, X-Custom, …) are NOT forwarded. *(Covered by `TestSnapshotForwardedHeaders_OnlyPropagatesAllowed`.)*
5. *(Deferred → D1.)* The chat panel receives an LLM-synthesised answer, not the raw last-trace observation.
6. *(Deferred → D2.)* Prompts that reference "context" (e.g. "Cite ontology IDs") pull RAG hits from a per-agent knowledge base.
7. *(Deferred → D3 + D4.)* The 14 geopolitical tools are registered with `execution_config` pointing at the real services so the planner actually dispatches them.

## Verification commands

```sh
go build ./services/agent-runtime-service/...
go test  ./services/agent-runtime-service/internal/handlers/... -run "PlanAndExecute|DecodeAgentTools|TraceKindFor|Snapshot|RunnerInput" -v
go test  ./services/agent-runtime-service/...
```

All three are green on `main` of this branch.

## Cross-references

- **B07 Phase 2** — LLM synthesis + budget enforcement (tokens, USD).
- **B07 Phase 3** — RAG / knowledge-base wire for `retrieve-context`.
- **B07 Phase 4** — Tool registry seed for the 14 geopolitical tools.
- **B07 Phase 5** — Purpose-checkpoint approval enforcement for `action.*` tools (pairs with B05 ApprovalsPage).
- [`../08-aip-copiloto-prompts.md`](../08-aip-copiloto-prompts.md) — system prompt + tool catalog + the six demo prompts P1-P6.
- [`../11-guion-demo.md` §Act 5](../11-guion-demo.md) — the climactic chat-panel beats.
- [`../13-riesgos-y-plan-b.md`](../13-riesgos-y-plan-b.md) — the Azure-fails-Plan-B narrative that runs through the same agent runtime.

## Files touched in this phase

- `services/agent-runtime-service/internal/handlers/runner.go` — new file. `planAndExecute` (pure function: plan + dispatch + result envelope), `runAgentForRun` (synchronous wiring: tools decode → plan/execute → per-trace `RecordStep` → `CompleteRun`), `runAgentBackground` (fire-and-forget goroutine that wraps the synchronous wiring with a snapshot of forwarded headers), `decodeAgentTools` / `traceKindFor` / `snapshotForwardedHeaders` helpers.
- `services/agent-runtime-service/internal/handlers/handlers.go` — `StartRun` now resolves the agent (404 if missing), persists the run row, then dispatches the executor through `runAgentBackground`. Returns 201 immediately with the run row in `running`; the terminal status lands asynchronously.
- `services/agent-runtime-service/internal/repo/repo.go` — new `CompleteRun(ctx, runID, status, finalOutput []byte)` method (single UPDATE; trailing `updated_at = NOW()`).
- `services/agent-runtime-service/internal/handlers/runner_test.go` — 9 unit tests covering the pure-function executor wrap.
- `PoC/geopolitica/blockers/B07-agent-runtime-tool-routing.md` (this file) + `README.md` index row.
