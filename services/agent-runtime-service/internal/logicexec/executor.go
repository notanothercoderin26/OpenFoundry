// Package logicexec executes an AIP Logic function against the live
// LLM + ontology stack. The frontend authors a function as a graph of
// typed blocks (use_llm, apply_action, execute_function, conditional,
// loop, create_variable); this package walks those blocks, propagates
// the invoking user's JWT to every downstream call, and returns real
// outputs plus a step-by-step log the UI renders verbatim.
//
// Foundry parity: AIP Logic tool calls execute "within the invoking
// user's permissions" (palantir.com/docs/foundry/logic/blocks). We
// thread `callerJWT` from the HTTP handler all the way to the
// ontology-query-service / ontology-actions-service so their Cedar
// gates evaluate the original user — never a service identity.
package logicexec

import (
	"context"
	"encoding/json"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

// Executor is the seam the repo layer calls when invoking a Logic
// function. Production wires HTTPExecutor; tests inject a fake.
type Executor interface {
	Execute(ctx context.Context, in Input) (*Result, error)
}

// Input bundles everything Execute needs. The Logic function carries
// its compiled definition (blocks + outputs); inputs are the
// parameters passed by the caller; callerJWT is the bearer token of
// the invoking user, propagated unchanged to every tool call.
type Input struct {
	Function  models.LogicFunction
	Inputs    json.RawMessage
	CallerJWT string
	Context   models.LogicExecutionContext
	Surface   string
}

// Result is what InvokeLogicFunction stores on the LogicRun row.
type Result struct {
	Status           string
	Outputs          json.RawMessage
	Logs             json.RawMessage
	DurationMS       int32
	PromptTokens     int32
	CompletionTokens int32
	ErrorMessage     string
}

// LogEntry is one structured event emitted while executing a Logic
// function: a block being entered, a tool call being dispatched, a
// tool observation being recorded, or a final LLM response. The
// frontend renders these directly under the run history view.
type LogEntry struct {
	Timestamp string          `json:"timestamp"`
	Block     string          `json:"block,omitempty"`
	BlockKind string          `json:"block_kind,omitempty"`
	Event     string          `json:"event"`
	Tool      string          `json:"tool,omitempty"`
	ToolKind  string          `json:"tool_kind,omitempty"`
	Detail    json.RawMessage `json:"detail,omitempty"`
}
