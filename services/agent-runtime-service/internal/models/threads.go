// B07 Threads + ReAct trace wire shapes.
//
// Distinct from the legacy `ai_conversations` shape (messages packed
// in a JSONB blob) — this surface persists one row per turn so the
// AI Threads UI can list, paginate, and stream incrementally.

package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ToolKind enumerates the Foundry tool taxonomy from Act 5.
type ToolKind string

const (
	ToolKindObjectQuery    ToolKind = "object_query"
	ToolKindAction         ToolKind = "action"
	ToolKindFunction       ToolKind = "function"
	ToolKindRetrieval      ToolKind = "retrieval"
	ToolKindCommand        ToolKind = "command"
	ToolKindClarification  ToolKind = "request_clarification"
)

// IsValid reports whether the kind is one we route. Stable wire
// token; the registry rejects unknowns at thread-creation time.
func (k ToolKind) IsValid() bool {
	switch k {
	case ToolKindObjectQuery, ToolKindAction, ToolKindFunction,
		ToolKindRetrieval, ToolKindCommand, ToolKindClarification:
		return true
	}
	return false
}

// ToolDefinition declares one tool the agent is allowed to call.
// Config carries kind-specific fields (object_type_id, action_id,
// function rid, knowledge_base_id, …).
type ToolDefinition struct {
	Name        string          `json:"name"`
	Kind        ToolKind        `json:"kind"`
	Description string          `json:"description,omitempty"`
	Config      json.RawMessage `json:"config,omitempty"`
}

// ToolManifest is the JSON shape stored in `threads.tool_manifest`.
type ToolManifest struct {
	Tools []ToolDefinition `json:"tools"`
}

// Thread is one chat thread as exposed to clients.
type Thread struct {
	ID              uuid.UUID       `json:"id"`
	UserID          *uuid.UUID      `json:"user_id,omitempty"`
	Title           string          `json:"title"`
	AgentID         *uuid.UUID      `json:"agent_id,omitempty"`
	ModelRID        *uuid.UUID      `json:"model_rid,omitempty"`
	ToolManifest    ToolManifest    `json:"tool_manifest"`
	MaxToolCalls    int32           `json:"max_tool_calls"`
	MaxPromptTokens int32           `json:"max_prompt_tokens"`
	Status          string          `json:"status"`
	Metadata        json.RawMessage `json:"metadata,omitempty"`
	// Mode is the AI Operator mode string (one of the 9 AgentMode
	// values; see libs/ai-kernel-go/domain/agents/mode_context.go).
	// Defaults to PLATFORM_QA at the DB layer.
	Mode string `json:"mode"`
	// ModeConfig is the JSON-encoded proto ModeConfig (oneof settings
	// + documentation_bundle_id). Empty object when the active mode
	// has no configurable knobs.
	ModeConfig json.RawMessage `json:"mode_config,omitempty"`
	// ActiveModeTools is the per-thread allowlist of tool execution
	// modes (subset of models.SupportedExecutionModes from the kernel).
	// Empty slice = fall back to the per-mode default.
	ActiveModeTools []string  `json:"active_mode_tools"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// SetModeRequest is the PATCH/POST /threads/{id}/mode body.
type SetModeRequest struct {
	Mode            string          `json:"mode"`
	ModeConfig      json.RawMessage `json:"mode_config,omitempty"`
	ActiveModeTools []string        `json:"active_mode_tools,omitempty"`
}

// CreateThreadRequest is the POST /threads body.
type CreateThreadRequest struct {
	Title           string          `json:"title"`
	AgentID         *uuid.UUID      `json:"agent_id,omitempty"`
	ModelRID        *uuid.UUID      `json:"model_rid,omitempty"`
	Tools           []ToolDefinition `json:"tools,omitempty"`
	MaxToolCalls    *int32          `json:"max_tool_calls,omitempty"`
	MaxPromptTokens *int32          `json:"max_prompt_tokens,omitempty"`
	Metadata        json.RawMessage `json:"metadata,omitempty"`
}

// ThreadListResponse is the GET /threads envelope.
type ThreadListResponse struct {
	Data []Thread `json:"data"`
}

// ThreadMessageRole is the OpenAI-compat role enum.
type ThreadMessageRole string

const (
	RoleSystem    ThreadMessageRole = "system"
	RoleUser      ThreadMessageRole = "user"
	RoleAssistant ThreadMessageRole = "assistant"
	RoleTool      ThreadMessageRole = "tool"
)

// ThreadMessage is one row of thread_messages.
type ThreadMessage struct {
	ID          uuid.UUID         `json:"id"`
	ThreadID    uuid.UUID         `json:"thread_id"`
	Position    int32             `json:"position"`
	Role        ThreadMessageRole `json:"role"`
	Content     string            `json:"content"`
	ToolName    *string           `json:"tool_name,omitempty"`
	ToolCallID  *string           `json:"tool_call_id,omitempty"`
	Metadata    json.RawMessage   `json:"metadata,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
}

// PostMessageRequest is the POST /threads/{id}/messages body. Posting
// a user message triggers the ReAct loop; posting an assistant
// message (with `from_replay: true`) is allowed for tests and replays.
type PostMessageRequest struct {
	Role     ThreadMessageRole `json:"role"`
	Content  string            `json:"content"`
	FromReplay bool            `json:"from_replay,omitempty"`
}

// PostMessageResponse bundles the user turn that was persisted +
// whatever assistant/tool turns the ReAct loop produced.
type PostMessageResponse struct {
	UserMessage      ThreadMessage   `json:"user_message"`
	AssistantMessage *ThreadMessage  `json:"assistant_message,omitempty"`
	ToolMessages     []ThreadMessage `json:"tool_messages,omitempty"`
	BudgetExhausted  bool            `json:"budget_exhausted,omitempty"`
	StepsUsed        int             `json:"steps_used"`
}

// ThreadMessagesResponse is the GET /threads/{id}/messages envelope.
type ThreadMessagesResponse struct {
	Data []ThreadMessage `json:"data"`
}

// TraceStepKind enumerates the kinds we persist in thread_traces.
type TraceStepKind string

const (
	TraceKindPlan             TraceStepKind = "plan"
	TraceKindToolCall         TraceStepKind = "tool_call"
	TraceKindObservation      TraceStepKind = "observation"
	TraceKindFinal            TraceStepKind = "final"
	TraceKindError            TraceStepKind = "error"
	TraceKindBudgetExhausted  TraceStepKind = "budget_exhausted"
)

// ThreadTraceStep is one row of thread_traces.
type ThreadTraceStep struct {
	ID               uuid.UUID       `json:"id"`
	ThreadID         uuid.UUID       `json:"thread_id"`
	MessageID        *uuid.UUID      `json:"message_id,omitempty"`
	StepIndex        int32           `json:"step_index"`
	Kind             TraceStepKind   `json:"kind"`
	ToolName         *string         `json:"tool_name,omitempty"`
	Payload          json.RawMessage `json:"payload,omitempty"`
	PromptTokens     int32           `json:"prompt_tokens"`
	CompletionTokens int32           `json:"completion_tokens"`
	LatencyMS        int32           `json:"latency_ms"`
	CreatedAt        time.Time       `json:"created_at"`
}

// ThreadTraceResponse is the GET /threads/{id}/trace envelope.
type ThreadTraceResponse struct {
	Data []ThreadTraceStep `json:"data"`
}
