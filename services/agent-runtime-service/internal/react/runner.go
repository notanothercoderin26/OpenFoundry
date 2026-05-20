// Package react implements the budget-aware ReAct loop used by
// /threads/{id}/messages. The loop:
//
//   1. Builds an OpenAI-compatible Invoke request from the thread's
//      tool manifest + current message history.
//   2. Calls llm-catalog-service /invoke with the thread's resolved
//      model RID. Provider selection comes from the catalog (B07
//      §AC#5), so flipping ollama → azure in the catalog admin UI
//      changes the next message without a service restart.
//   3. Parses the assistant response. If the model emitted a tool
//      call, the runner dispatches via [ToolRouter] (object_query,
//      action, function, retrieval, …) — propagating the caller's
//      JWT verbatim so downstream services apply their own Cedar
//      / role checks (B07 §AC#6).
//   4. Records every plan / tool_call / observation in
//      thread_traces.
//   5. Stops on `final` (no tool call) OR when the step budget runs
//      out OR when the prompt-token budget would be exceeded. The
//      budget-exhausted path writes a graceful assistant message
//      (B07 §AC#3).

package react

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

// MaxToolPayloadBytes caps tool inputs + outputs we persist in the
// trace so a chatty tool doesn't bloat Postgres. The full payload is
// still passed to the LLM as the observation; the trace is the
// audit-trail.
const MaxToolPayloadBytes = 64 * 1024

// LLMInvocation is what the runner sends to the configured LLM
// adapter. Provider-agnostic: the adapter (llm-catalog-service) maps
// to OpenAI / Anthropic / Azure / Ollama internally.
type LLMInvocation struct {
	ModelRID    uuid.UUID         `json:"model_rid"`
	Messages    []LLMMessage      `json:"messages"`
	Tools       []LLMToolDecl     `json:"tools,omitempty"`
	MaxTokens   int32             `json:"max_tokens,omitempty"`
	Temperature float32           `json:"temperature,omitempty"`
}

type LLMMessage struct {
	Role       string `json:"role"`
	Content    string `json:"content"`
	ToolName   string `json:"tool_name,omitempty"`
	ToolCallID string `json:"tool_call_id,omitempty"`
}

type LLMToolDecl struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Parameters  json.RawMessage `json:"parameters_json_schema,omitempty"`
}

// LLMResponse is the unified shape the runner consumes. Either
// `final` is non-empty (LLM is done) OR `tool_call` is non-empty.
type LLMResponse struct {
	Final            string          `json:"final,omitempty"`
	ToolCall         *LLMToolCall    `json:"tool_call,omitempty"`
	PromptTokens     int32           `json:"prompt_tokens,omitempty"`
	CompletionTokens int32           `json:"completion_tokens,omitempty"`
}

// LLMToolCall is what the runner dispatches via ToolRouter.
type LLMToolCall struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

// LLMClient is the seam over llm-catalog-service. Production wires
// HTTPLLMClient; tests inject a deterministic stub.
type LLMClient interface {
	Invoke(ctx context.Context, callerJWT string, req LLMInvocation) (*LLMResponse, error)
}

// ToolRouter dispatches the LLM's tool call to a real downstream
// service. Each tool kind has its own routed implementation;
// `callerJWT` is propagated verbatim so the downstream Cedar policy
// gate sees the original user.
type ToolRouter interface {
	Invoke(ctx context.Context, callerJWT string, def models.ToolDefinition, args json.RawMessage) (json.RawMessage, error)
}

// TraceSink persists step rows. Production wires the threads repo;
// tests inject an in-memory recorder.
type TraceSink interface {
	Append(ctx context.Context, threadID uuid.UUID, messageID *uuid.UUID, kind models.TraceStepKind, toolName *string, payload json.RawMessage, promptTokens, completionTokens, latencyMS int32) error
}

// Runner orchestrates one user-turn → final-assistant-message loop.
type Runner struct {
	LLM    LLMClient
	Tools  ToolRouter
	Traces TraceSink
	Now    func() time.Time
}

// RunInput is what the message handler hands the runner: the
// thread's config + the freshly-persisted user message + the prior
// history.
type RunInput struct {
	Thread       models.Thread
	History      []models.ThreadMessage
	UserMessage  models.ThreadMessage
	CallerJWT    string
}

// RunResult is what the runner returns to the handler — used to
// shape the HTTP response without a second SELECT.
type RunResult struct {
	AssistantContent string
	ToolMessages     []ToolObservation
	BudgetExhausted  bool
	StepsUsed        int
	PromptTokensUsed int32
}

// ToolObservation is one tool-call/observation pair the runner
// produced. The handler turns each into a `tool`-role thread_messages
// row so the UI can render the call sequence.
type ToolObservation struct {
	ToolName   string
	ToolCallID string
	Output     string
}

// Run drives the loop until final / budget-exhausted / error.
func (r *Runner) Run(ctx context.Context, input RunInput) (*RunResult, error) {
	if r.LLM == nil {
		return nil, errors.New("react.Runner: LLM client is nil")
	}
	if r.Now == nil {
		r.Now = time.Now
	}
	modelRID := uuid.Nil
	if input.Thread.ModelRID != nil {
		modelRID = *input.Thread.ModelRID
	}
	tools := buildLLMTools(input.Thread.ToolManifest.Tools)
	llmHistory := projectHistory(input.History)
	llmHistory = append(llmHistory, LLMMessage{
		Role:    "user",
		Content: input.UserMessage.Content,
	})

	result := &RunResult{}
	maxCalls := int(input.Thread.MaxToolCalls)
	for step := 0; step <= maxCalls; step++ {
		// Token budget pre-check: rough heuristic = sum of message
		// character lengths / 4. If exceeded, return the graceful
		// exhaustion path.
		if estTokens := estimatePromptTokens(llmHistory); estTokens > input.Thread.MaxPromptTokens {
			result.BudgetExhausted = true
			result.AssistantContent = "Conversation context exceeds the per-thread prompt-token budget. Start a new thread or shorten earlier messages."
			r.recordTrace(ctx, input.Thread.ID, &input.UserMessage.ID, models.TraceKindBudgetExhausted, nil, mustJSON(map[string]any{"reason": "max_prompt_tokens", "estimated_tokens": estTokens, "limit": input.Thread.MaxPromptTokens}), 0, 0, 0)
			return result, nil
		}

		started := r.Now()
		resp, err := r.LLM.Invoke(ctx, input.CallerJWT, LLMInvocation{
			ModelRID: modelRID,
			Messages: llmHistory,
			Tools:    tools,
		})
		latency := int32(r.Now().Sub(started).Milliseconds())
		if err != nil {
			r.recordTrace(ctx, input.Thread.ID, &input.UserMessage.ID, models.TraceKindError, nil, mustJSON(map[string]any{"error": err.Error()}), 0, 0, latency)
			return nil, fmt.Errorf("llm invoke: %w", err)
		}
		result.PromptTokensUsed += resp.PromptTokens
		r.recordTrace(ctx, input.Thread.ID, &input.UserMessage.ID, models.TraceKindPlan, nil, mustJSON(map[string]any{
			"final":     resp.Final,
			"tool_call": resp.ToolCall,
		}), resp.PromptTokens, resp.CompletionTokens, latency)

		// Final answer — exit the loop.
		if resp.ToolCall == nil || resp.ToolCall.Name == "" {
			result.AssistantContent = resp.Final
			r.recordTrace(ctx, input.Thread.ID, &input.UserMessage.ID, models.TraceKindFinal, nil, mustJSON(map[string]any{"content": resp.Final}), resp.PromptTokens, resp.CompletionTokens, 0)
			result.StepsUsed = step
			return result, nil
		}

		// Tool call branch — budget check first.
		if step >= maxCalls {
			result.BudgetExhausted = true
			result.AssistantContent = "Reached the maximum tool-call budget without arriving at a final answer."
			r.recordTrace(ctx, input.Thread.ID, &input.UserMessage.ID, models.TraceKindBudgetExhausted, nil, mustJSON(map[string]any{"reason": "max_tool_calls", "limit": maxCalls}), 0, 0, 0)
			result.StepsUsed = step
			return result, nil
		}

		// Look up the tool definition + dispatch.
		def, ok := findTool(input.Thread.ToolManifest.Tools, resp.ToolCall.Name)
		if !ok {
			obs := fmt.Sprintf(`{"error":"tool %q is not declared on this thread"}`, resp.ToolCall.Name)
			toolName := resp.ToolCall.Name
			r.recordTrace(ctx, input.Thread.ID, &input.UserMessage.ID, models.TraceKindError, &toolName, mustJSON(map[string]any{"error": "tool not declared"}), 0, 0, 0)
			llmHistory = append(llmHistory,
				LLMMessage{Role: "assistant", Content: "", ToolName: resp.ToolCall.Name},
				LLMMessage{Role: "tool", Content: obs, ToolName: resp.ToolCall.Name})
			result.ToolMessages = append(result.ToolMessages, ToolObservation{ToolName: resp.ToolCall.Name, Output: obs})
			continue
		}

		callStarted := r.Now()
		callPayload := truncateJSON(resp.ToolCall.Arguments)
		toolName := resp.ToolCall.Name
		r.recordTrace(ctx, input.Thread.ID, &input.UserMessage.ID, models.TraceKindToolCall, &toolName, callPayload, 0, 0, 0)
		out, toolErr := r.Tools.Invoke(ctx, input.CallerJWT, def, resp.ToolCall.Arguments)
		callLatency := int32(r.Now().Sub(callStarted).Milliseconds())
		if toolErr != nil {
			out = json.RawMessage(fmt.Sprintf(`{"error":%q}`, toolErr.Error()))
			r.recordTrace(ctx, input.Thread.ID, &input.UserMessage.ID, models.TraceKindError, &toolName, mustJSON(map[string]any{"error": toolErr.Error()}), 0, 0, callLatency)
		} else {
			r.recordTrace(ctx, input.Thread.ID, &input.UserMessage.ID, models.TraceKindObservation, &toolName, truncateJSON(out), 0, 0, callLatency)
		}

		llmHistory = append(llmHistory,
			LLMMessage{Role: "assistant", Content: "", ToolName: resp.ToolCall.Name},
			LLMMessage{Role: "tool", Content: string(out), ToolName: resp.ToolCall.Name})
		result.ToolMessages = append(result.ToolMessages, ToolObservation{
			ToolName: resp.ToolCall.Name,
			Output:   string(out),
		})
	}
	// Fallthrough — should never reach here because the loop returns
	// inside on final or budget-exhausted, but defensively close it.
	result.BudgetExhausted = true
	result.AssistantContent = "Reached the maximum tool-call budget without arriving at a final answer."
	result.StepsUsed = maxCalls
	return result, nil
}

func (r *Runner) recordTrace(ctx context.Context, threadID uuid.UUID, messageID *uuid.UUID, kind models.TraceStepKind, toolName *string, payload json.RawMessage, promptTokens, completionTokens, latencyMS int32) {
	if r.Traces == nil {
		return
	}
	if err := r.Traces.Append(ctx, threadID, messageID, kind, toolName, payload, promptTokens, completionTokens, latencyMS); err != nil {
		// Best-effort: trace gaps degrade observability but never
		// fail the user request.
		_ = err
	}
}

func projectHistory(msgs []models.ThreadMessage) []LLMMessage {
	out := make([]LLMMessage, 0, len(msgs))
	for _, m := range msgs {
		mm := LLMMessage{Role: string(m.Role), Content: m.Content}
		if m.ToolName != nil {
			mm.ToolName = *m.ToolName
		}
		if m.ToolCallID != nil {
			mm.ToolCallID = *m.ToolCallID
		}
		out = append(out, mm)
	}
	return out
}

func buildLLMTools(tools []models.ToolDefinition) []LLMToolDecl {
	out := make([]LLMToolDecl, 0, len(tools))
	for _, t := range tools {
		out = append(out, LLMToolDecl{
			Name:        t.Name,
			Description: t.Description,
			Parameters:  t.Config,
		})
	}
	return out
}

func findTool(tools []models.ToolDefinition, name string) (models.ToolDefinition, bool) {
	for _, t := range tools {
		if t.Name == name {
			return t, true
		}
	}
	return models.ToolDefinition{}, false
}

// estimatePromptTokens is a deliberately cheap heuristic: 4 bytes
// per token, summed across content. Real token counters are
// provider-specific; this gives us a uniform pre-check the runner
// can use without a network round-trip.
func estimatePromptTokens(msgs []LLMMessage) int32 {
	total := 0
	for _, m := range msgs {
		total += len(m.Content) / 4
	}
	return int32(total)
}

func truncateJSON(in json.RawMessage) json.RawMessage {
	if len(in) <= MaxToolPayloadBytes {
		return in
	}
	return json.RawMessage(fmt.Sprintf(`{"truncated":true,"size":%d}`, len(in)))
}

func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return b
}
