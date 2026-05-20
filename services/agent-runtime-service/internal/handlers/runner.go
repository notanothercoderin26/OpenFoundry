// Package handlers — runner.go wires the in-process ReAct executor from
// libs/ai-kernel-go into the agent-runtime-service POST /agents/{id}/runs
// surface.
//
// Before B07 Phase 1 this service's StartRun handler persisted a row in
// agent_runs and returned it — no tool dispatch, no agent execution, no
// per-step trace ever landed in agent_run_steps unless the client
// manually posted them through /agents/{id}/runs/{run_id}/steps. The
// ReAct engine in libs/ai-kernel-go/domain/agents/executor.go (1188
// LOC) was never called from this service; the kernel's own
// AgentsHandlers wire it but those operate on the kernel-owned
// ai_agents table, not the service-owned agent_definitions.
//
// This file is the bridge. It:
//
//   1. Parses StartRunRequest.Input for user_message / objective /
//      context (the legacy "metadata-only" call shape — no
//      user_message — is preserved by an early return, so callers that
//      only want to track a custom run from /runs/{id}/steps keep
//      working unchanged).
//   2. Decodes agent_definitions.tools (JSONB) into the kernel's
//      []ToolDefinition.
//   3. Calls agents.BuildPlan + agents.ExecutePlan.
//   4. Persists each AgentExecutionTrace as an agent_run_steps row.
//   5. Marks the run completed (or failed) with a wire-stable
//      final_output envelope.
//
// LLM synthesis of the final answer is intentionally NOT wired here —
// the kernel's AgentsHandlers do that against ai_agents.provider_id
// and require a resolved LlmProvider row. That cross-table integration
// is deferred to B07 Phase 2 (see PoC/geopolitica/blockers/B07-…).
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/domain/agents"
	aimodels "github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/models"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

// runnerInput is what the handler extracts from StartRunRequest.Input.
type runnerInput struct {
	UserMessage string          `json:"user_message"`
	Objective   string          `json:"objective"`
	Context     json.RawMessage `json:"context"`
}

// runnerResult is the wire-stable envelope persisted to agent_runs.final_output.
// Adding fields is allowed; existing fields stay; renames break clients.
type runnerResult struct {
	UserMessage      string `json:"user_message"`
	Objective        string `json:"objective"`
	FinalObservation string `json:"final_observation"`
	TraceCount       int    `json:"trace_count"`
	ToolCalls        int    `json:"tool_calls"`
	KnowledgeHits    int    `json:"knowledge_hits"`
}

// planAndExecute is the pure-function core: given a parsed agent +
// parsed input + parsed tools, build the plan and run it. No DB, no
// per-step persistence — that's the orchestrating handler's job.
// Pulled out so the wiring is testable without a Postgres pool.
func planAndExecute(
	ctx context.Context,
	client *http.Client,
	agent models.AgentDefinition,
	tools []aimodels.ToolDefinition,
	input runnerInput,
	incomingHeaders http.Header,
) (traces []aimodels.AgentExecutionTrace, result runnerResult) {
	objective := strings.TrimSpace(input.Objective)
	if objective == "" {
		objective = input.UserMessage
	}
	// Map the service's AgentDefinition to the kernel's AgentDefinition.
	// The planner reads ToolIDs/MaxIterations/Memory; the executor reads
	// tools through the second parameter so ToolIDs can stay empty.
	kernelAgent := aimodels.AgentDefinition{
		ID:               agent.ID,
		Name:             agent.Name,
		Description:      derefDescription(agent.Description),
		Status:           agent.Status,
		SystemPrompt:     derefDescription(agent.SystemPrompt),
		Objective:        objective,
		PlanningStrategy: "plan-act-observe",
		MaxIterations:    int32(len(tools)),
		Memory:           aimodels.AgentMemorySnapshot{},
	}
	if kernelAgent.MaxIterations < 1 {
		kernelAgent.MaxIterations = 1
	}

	steps := agents.BuildPlan(kernelAgent, objective, tools, nil)
	traces = agents.ExecutePlan(
		ctx, client, steps, tools,
		input.UserMessage, objective, input.Context,
		incomingHeaders, nil,
	)

	result = runnerResult{
		UserMessage: input.UserMessage,
		Objective:   objective,
		TraceCount:  len(traces),
	}
	for _, t := range traces {
		if t.ToolName != nil && *t.ToolName != "" {
			result.ToolCalls++
		}
	}
	if n := len(traces); n > 0 {
		result.FinalObservation = traces[n-1].Observation
	}
	return traces, result
}

// runAgentForRun is the wiring layer: it loads tools from the agent
// row, calls planAndExecute, then persists each trace as an
// agent_run_steps row and marks the run completed.
//
// Returns (ranExecutor, error):
//   - ranExecutor=false means the request did not opt into execution
//     (no user_message). The run stays in status "running" so the
//     legacy /runs/{run_id}/steps client path keeps working — that
//     was the contract before B07 Phase 1.
//   - error is wrapped at completion time and the run is marked
//     "failed" before being returned to the handler.
func runAgentForRun(
	ctx context.Context,
	h *Handlers,
	agent *models.AgentDefinition,
	run models.AgentRun,
	body models.StartRunRequest,
	incomingHeaders http.Header,
) (bool, error) {
	var input runnerInput
	if len(body.Input) > 0 {
		_ = json.Unmarshal(body.Input, &input)
	}
	if strings.TrimSpace(input.UserMessage) == "" {
		// Preserve the legacy "metadata-only" submit path so callers
		// that drive the run loop client-side via /runs/{run_id}/steps
		// keep their contract.
		return false, nil
	}

	tools := decodeAgentTools(agent.Tools)
	client := &http.Client{}
	traces, result := planAndExecute(ctx, client, *agent, tools, input, incomingHeaders)

	for i, trace := range traces {
		payload, err := json.Marshal(trace)
		if err != nil {
			return true, fmt.Errorf("marshal trace %d: %w", i, err)
		}
		if _, err := h.Repo.RecordStep(ctx, run.ID, models.RecordStepRequest{
			StepIndex: int32(i),
			Kind:      traceKindFor(trace),
			Payload:   payload,
		}); err != nil {
			return true, fmt.Errorf("record step %d: %w", i, err)
		}
	}

	resultJSON, err := json.Marshal(result)
	if err != nil {
		return true, fmt.Errorf("marshal final_output: %w", err)
	}
	if err := h.Repo.CompleteRun(ctx, run.ID, "completed", resultJSON); err != nil {
		return true, fmt.Errorf("complete run: %w", err)
	}
	return true, nil
}

// decodeAgentTools parses the tools JSONB column. The column accepts
// either an array of full ToolDefinition shapes (preferred — produced
// by the agent CRUD handler) or `[]` for an unscoped agent. Anything
// else falls back to an empty slice so the planner builds a no-tools
// plan rather than failing the run.
func decodeAgentTools(raw json.RawMessage) []aimodels.ToolDefinition {
	if len(raw) == 0 || string(raw) == "null" || string(raw) == `""` {
		return nil
	}
	var out []aimodels.ToolDefinition
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

// traceKindFor maps the kernel's per-step trace shape onto the
// service's agent_run_steps.kind enum. Three buckets:
//   - "tool"        — the step dispatched to a named tool.
//   - "retrieval"   — the built-in retrieve-context step.
//   - "synthesis"   — analyze-request and synthesize-answer.
func traceKindFor(trace aimodels.AgentExecutionTrace) string {
	if trace.ToolName != nil && *trace.ToolName != "" {
		return "tool"
	}
	if trace.StepID == "retrieve-context" {
		return "retrieval"
	}
	return "synthesis"
}

// derefDescription pulls *string into string with a "" default. Kept
// local because *string→string is too generic to merit a package-level
// helper but appears in two places below.
func derefDescription(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// runAgentBackground is the fire-and-forget variant used when we want
// the StartRun handler to return immediately (the demo's "click Run"
// beat expects an HTTP 201 inside a few hundred ms even when the plan
// dispatches three tools). The background context is decoupled from
// the request context so the run can finish even if the client
// disconnects mid-execution.
//
// Errors from the background path are logged but do not surface to
// the StartRun response — the client polls /agents/{id}/runs/{run_id}
// for the final status.
func runAgentBackground(
	parent context.Context,
	h *Handlers,
	agent *models.AgentDefinition,
	run models.AgentRun,
	body models.StartRunRequest,
	incomingHeaders http.Header,
	logger interface{ Warn(string, ...any) },
) {
	// Snapshot the headers we care about (auth, branch) so we don't
	// hand the entire incoming request's Header pointer to a goroutine
	// that outlives the handler scope.
	snap := snapshotForwardedHeaders(incomingHeaders)
	go func() {
		ctx, cancel := context.WithCancel(context.Background())
		_ = parent // background context is independent on purpose.
		defer cancel()
		ran, err := runAgentForRun(ctx, h, agent, run, body, snap)
		if err != nil && logger != nil {
			logger.Warn("agent run failed",
				"run_id", run.ID.String(),
				"agent_id", run.AgentID.String(),
				"error", err.Error(),
			)
			// Best-effort: mark the run as failed so the UI can render
			// the trace + error rather than hanging on "running".
			_ = h.Repo.CompleteRun(ctx, run.ID, "failed",
				json.RawMessage(fmt.Sprintf(`{"error":%q}`, err.Error())))
			return
		}
		// ran=false (no user_message) leaves the run in "running" so the
		// legacy client-driven flow keeps owning it.
		_ = ran
	}()
}

// snapshotForwardedHeaders copies the subset of inbound headers the
// kernel's tool dispatch reads (Authorization for JWT propagation;
// X-OpenFoundry-* for tenant context). Defensive: avoids passing a
// raw http.Header reference into a goroutine outliving the handler.
func snapshotForwardedHeaders(in http.Header) http.Header {
	if in == nil {
		return http.Header{}
	}
	out := make(http.Header, 4)
	for _, k := range []string{
		"Authorization",
		"X-OpenFoundry-Tenant",
		"X-OpenFoundry-Branch",
		"X-OpenFoundry-Subject",
	} {
		if v := in.Get(k); v != "" {
			out.Set(k, v)
		}
	}
	return out
}

// guard: keep uuid import live; the file references it via models.AgentRun
// fields but golangci-lint sometimes flags transitive uses. No-op at runtime.
var _ = uuid.Nil
