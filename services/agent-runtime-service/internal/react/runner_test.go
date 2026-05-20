package react

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

// scriptedLLM returns canned responses in order. Tests use this to
// drive the runner through a multi-step plan without invoking a
// real model.
type scriptedLLM struct {
	mu        sync.Mutex
	responses []LLMResponse
	calls     []LLMInvocation
	err       error
}

func (s *scriptedLLM) Invoke(_ context.Context, _ string, req LLMInvocation) (*LLMResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, req)
	if s.err != nil {
		return nil, s.err
	}
	if len(s.responses) == 0 {
		return &LLMResponse{Final: "done"}, nil
	}
	resp := s.responses[0]
	s.responses = s.responses[1:]
	return &resp, nil
}

// recordingTools captures every tool invocation. By default returns
// an empty JSON object; tests override via `returns`.
type recordingTools struct {
	mu      sync.Mutex
	calls   []recordedToolCall
	returns map[string]json.RawMessage
	err     map[string]error
}

type recordedToolCall struct {
	Name string
	JWT  string
	Args json.RawMessage
}

func (r *recordingTools) Invoke(_ context.Context, callerJWT string, def models.ToolDefinition, args json.RawMessage) (json.RawMessage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls = append(r.calls, recordedToolCall{Name: def.Name, JWT: callerJWT, Args: append(json.RawMessage(nil), args...)})
	if e, ok := r.err[def.Name]; ok {
		return nil, e
	}
	if v, ok := r.returns[def.Name]; ok {
		return v, nil
	}
	return json.RawMessage(`{}`), nil
}

// recordingTraces is an in-memory TraceSink.
type recordingTraces struct {
	mu    sync.Mutex
	steps []traceStep
}

type traceStep struct {
	Kind     models.TraceStepKind
	ToolName string
	Payload  json.RawMessage
}

func (r *recordingTraces) Append(_ context.Context, _ uuid.UUID, _ *uuid.UUID, kind models.TraceStepKind, toolName *string, payload json.RawMessage, _ int32, _ int32, _ int32) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	tn := ""
	if toolName != nil {
		tn = *toolName
	}
	r.steps = append(r.steps, traceStep{Kind: kind, ToolName: tn, Payload: append(json.RawMessage(nil), payload...)})
	return nil
}

func newRunner(llm LLMClient, tools ToolRouter, traces TraceSink) *Runner {
	return &Runner{LLM: llm, Tools: tools, Traces: traces}
}

func newThread(tools ...models.ToolDefinition) models.Thread {
	return models.Thread{
		ID:              uuid.New(),
		ToolManifest:    models.ToolManifest{Tools: tools},
		MaxToolCalls:    6,
		MaxPromptTokens: 16000,
	}
}

func newUserMessage(content string) models.ThreadMessage {
	return models.ThreadMessage{ID: uuid.New(), Role: models.RoleUser, Content: content}
}

func TestRunner_FinalAnswerNoTools(t *testing.T) {
	t.Parallel()
	llm := &scriptedLLM{responses: []LLMResponse{
		{Final: "Hello", PromptTokens: 10, CompletionTokens: 3},
	}}
	traces := &recordingTraces{}
	r := newRunner(llm, &recordingTools{}, traces)

	out, err := r.Run(context.Background(), RunInput{
		Thread:      newThread(),
		UserMessage: newUserMessage("hi"),
	})
	require.NoError(t, err)
	assert.Equal(t, "Hello", out.AssistantContent)
	assert.False(t, out.BudgetExhausted)
	assert.Equal(t, 0, out.StepsUsed)
	// Plan + Final traces are recorded.
	require.GreaterOrEqual(t, len(traces.steps), 2)
	assert.Equal(t, models.TraceKindPlan, traces.steps[0].Kind)
	assert.Equal(t, models.TraceKindFinal, traces.steps[len(traces.steps)-1].Kind)
}

func TestRunner_ToolCallThenFinal(t *testing.T) {
	t.Parallel()
	llm := &scriptedLLM{responses: []LLMResponse{
		{ToolCall: &LLMToolCall{Name: "FindAircraftByTail", Arguments: json.RawMessage(`{"tail":"N12345"}`)}},
		{Final: "Found N12345, scheduled."},
	}}
	tools := &recordingTools{returns: map[string]json.RawMessage{
		"FindAircraftByTail": json.RawMessage(`{"id":"ac-1","tail":"N12345"}`),
	}}
	traces := &recordingTraces{}
	thread := newThread(models.ToolDefinition{Name: "FindAircraftByTail", Kind: models.ToolKindObjectQuery})
	r := newRunner(llm, tools, traces)

	out, err := r.Run(context.Background(), RunInput{
		Thread:      thread,
		UserMessage: newUserMessage("look up N12345"),
		CallerJWT:   "service-token",
	})
	require.NoError(t, err)
	assert.Equal(t, "Found N12345, scheduled.", out.AssistantContent)
	require.Len(t, out.ToolMessages, 1)
	assert.Equal(t, "FindAircraftByTail", out.ToolMessages[0].ToolName)
	require.Len(t, tools.calls, 1)
	assert.Equal(t, "service-token", tools.calls[0].JWT, "caller JWT must propagate verbatim (B07 §AC#6)")
	// Plan + ToolCall + Observation + Plan + Final ≥ 5 steps.
	assert.GreaterOrEqual(t, len(traces.steps), 5)
}

func TestRunner_RespectsStepBudget(t *testing.T) {
	t.Parallel()
	// LLM keeps asking for tool calls; budget should cap at 2 calls.
	llm := &scriptedLLM{responses: []LLMResponse{
		{ToolCall: &LLMToolCall{Name: "Loop", Arguments: json.RawMessage(`{}`)}},
		{ToolCall: &LLMToolCall{Name: "Loop", Arguments: json.RawMessage(`{}`)}},
		{ToolCall: &LLMToolCall{Name: "Loop", Arguments: json.RawMessage(`{}`)}},
	}}
	tools := &recordingTools{}
	traces := &recordingTraces{}
	thread := newThread(models.ToolDefinition{Name: "Loop", Kind: models.ToolKindFunction})
	thread.MaxToolCalls = 2
	r := newRunner(llm, tools, traces)

	out, err := r.Run(context.Background(), RunInput{
		Thread:      thread,
		UserMessage: newUserMessage("loop forever"),
	})
	require.NoError(t, err)
	assert.True(t, out.BudgetExhausted)
	assert.Contains(t, out.AssistantContent, "maximum tool-call budget")
	// Exactly maxToolCalls tool calls fired.
	assert.Equal(t, 2, len(tools.calls))
	// budget_exhausted trace step was recorded.
	var sawBudget bool
	for _, s := range traces.steps {
		if s.Kind == models.TraceKindBudgetExhausted {
			sawBudget = true
		}
	}
	assert.True(t, sawBudget)
}

func TestRunner_RespectsPromptTokenBudget(t *testing.T) {
	t.Parallel()
	llm := &scriptedLLM{responses: []LLMResponse{{Final: "should never see this"}}}
	thread := newThread()
	thread.MaxPromptTokens = 1 // tiny budget — first message blows it
	r := newRunner(llm, &recordingTools{}, &recordingTraces{})
	long := newUserMessage("This message is intentionally long enough to overshoot a 1-token estimated budget.")
	out, err := r.Run(context.Background(), RunInput{Thread: thread, UserMessage: long})
	require.NoError(t, err)
	assert.True(t, out.BudgetExhausted)
	assert.Contains(t, out.AssistantContent, "prompt-token budget")
}

func TestRunner_UnknownToolFallsThrough(t *testing.T) {
	t.Parallel()
	llm := &scriptedLLM{responses: []LLMResponse{
		{ToolCall: &LLMToolCall{Name: "MysteryTool", Arguments: json.RawMessage(`{}`)}},
		{Final: "ok, recovered"},
	}}
	tools := &recordingTools{}
	traces := &recordingTraces{}
	r := newRunner(llm, tools, traces)
	out, err := r.Run(context.Background(), RunInput{
		Thread:      newThread(),
		UserMessage: newUserMessage("call mystery"),
	})
	require.NoError(t, err)
	assert.Equal(t, "ok, recovered", out.AssistantContent)
	// No tool was invoked since MysteryTool wasn't declared.
	assert.Empty(t, tools.calls)
	// The observation surfaced as an error trace step.
	var sawErr bool
	for _, s := range traces.steps {
		if s.Kind == models.TraceKindError {
			sawErr = true
		}
	}
	assert.True(t, sawErr)
}

func TestRunner_LLMTransportErrorPropagates(t *testing.T) {
	t.Parallel()
	llm := &scriptedLLM{err: errors.New("catalog 503")}
	traces := &recordingTraces{}
	r := newRunner(llm, &recordingTools{}, traces)
	_, err := r.Run(context.Background(), RunInput{
		Thread:      newThread(),
		UserMessage: newUserMessage("hi"),
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "catalog 503")
	var sawErr bool
	for _, s := range traces.steps {
		if s.Kind == models.TraceKindError {
			sawErr = true
		}
	}
	assert.True(t, sawErr)
}
