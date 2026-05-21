// HTTP clients for the LLM seam (llm-catalog-service /invoke) and
// the tool router (object-database, ontology-actions, ...).
//
// Both clients propagate the caller's JWT verbatim — that's the
// security invariant from B07 §AC#6: the agent never elevates
// privileges; downstream services apply their own Cedar policy gate.

package react

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

// HTTPLLMClient is the production [LLMClient]. Issues POST /api/v1/llm/invoke
// against llm-catalog-service. The response is normalised into
// LLMResponse so the runner stays provider-agnostic.
type HTTPLLMClient struct {
	BaseURL string
	HTTP    *http.Client
}

// NewHTTPLLMClient builds a client pointed at baseURL with a 30 s
// per-request timeout.
func NewHTTPLLMClient(baseURL string) *HTTPLLMClient {
	return &HTTPLLMClient{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: 30 * time.Second},
	}
}

// catalogInvokeRequest mirrors the llm-catalog-service InvokeRequest
// shape locally so we don't pull that service into the dep graph.
type catalogInvokeRequest struct {
	ModelRID    string             `json:"model_rid"`
	Messages    []catalogMessage   `json:"messages"`
	MaxTokens   int32              `json:"max_tokens,omitempty"`
	Temperature float32            `json:"temperature,omitempty"`
	Tools       []catalogTool      `json:"tools,omitempty"`
}

type catalogMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type catalogTool struct {
	Name                 string          `json:"name"`
	Description          string          `json:"description,omitempty"`
	ParametersJSONSchema json.RawMessage `json:"parameters_json_schema,omitempty"`
}

type catalogInvokeResponse struct {
	Messages []catalogMessage `json:"messages"`
	Usage    struct {
		PromptTokens     int32 `json:"prompt_tokens"`
		CompletionTokens int32 `json:"completion_tokens"`
	} `json:"usage"`
}

// Invoke implements [LLMClient]. The catalog's `/invoke` returns a
// chat-completion-style response; we re-interpret that as either a
// final answer (no tool call) or a tool call (when the assistant's
// content is a JSON object with `tool` + `arguments` keys).
//
// This split is deliberately lightweight: production deployments can
// swap [LLMClient] for one that round-trips proper tool_calls in
// OpenAI's native shape once llm-catalog-service exposes them.
func (c *HTTPLLMClient) Invoke(ctx context.Context, callerJWT string, req LLMInvocation) (*LLMResponse, error) {
	if c.BaseURL == "" {
		return nil, fmt.Errorf("HTTPLLMClient: BaseURL is empty")
	}
	wire := catalogInvokeRequest{
		ModelRID: req.ModelRID.String(),
		Messages: make([]catalogMessage, 0, len(req.Messages)),
		Tools:    make([]catalogTool, 0, len(req.Tools)),
	}
	// Inject a small tool-protocol system message so the LLM knows to
	// emit JSON when it wants to call a tool. Placed first so it
	// doesn't drown the user's actual system prompt (if any).
	if len(req.Tools) > 0 {
		wire.Messages = append(wire.Messages, catalogMessage{
			Role: "system",
			Content: "When you want to use a tool, respond with a single JSON object: {\"tool\":\"<name>\",\"arguments\":{...}}. When you are done, respond with plain text only.",
		})
	}
	for _, m := range req.Messages {
		wire.Messages = append(wire.Messages, catalogMessage{Role: m.Role, Content: m.Content})
	}
	for _, t := range req.Tools {
		wire.Tools = append(wire.Tools, catalogTool{
			Name:                 t.Name,
			Description:          t.Description,
			ParametersJSONSchema: t.Parameters,
		})
	}
	body, err := json.Marshal(wire)
	if err != nil {
		return nil, err
	}
	req2, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/api/v1/llm/invoke", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req2.Header.Set("Content-Type", "application/json")
	if callerJWT != "" {
		req2.Header.Set("Authorization", "Bearer "+stripBearer(callerJWT))
	}
	resp, err := c.HTTP.Do(req2)
	if err != nil {
		return nil, fmt.Errorf("llm catalog: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		rb, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<12))
		return nil, fmt.Errorf("llm catalog HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(rb)))
	}
	var decoded catalogInvokeResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, fmt.Errorf("decode invoke response: %w", err)
	}
	if len(decoded.Messages) == 0 {
		return &LLMResponse{}, nil
	}
	last := decoded.Messages[len(decoded.Messages)-1]
	out := &LLMResponse{
		PromptTokens:     decoded.Usage.PromptTokens,
		CompletionTokens: decoded.Usage.CompletionTokens,
	}
	// Detect tool-call JSON. The system prompt above asks the LLM to
	// emit `{"tool":...,"arguments":...}` when it wants a tool.
	trimmed := strings.TrimSpace(last.Content)
	if strings.HasPrefix(trimmed, "{") && strings.Contains(trimmed, `"tool"`) {
		var maybeCall struct {
			Tool      string          `json:"tool"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal([]byte(trimmed), &maybeCall); err == nil && maybeCall.Tool != "" {
			args := maybeCall.Arguments
			if len(args) == 0 {
				args = json.RawMessage(`{}`)
			}
			out.ToolCall = &LLMToolCall{Name: maybeCall.Tool, Arguments: args}
			return out, nil
		}
	}
	out.Final = last.Content
	return out, nil
}

// stripBearer strips a leading "Bearer " from a header value so the
// caller can pass either the raw token or the full header line.
func stripBearer(v string) string {
	const prefix = "Bearer "
	if strings.HasPrefix(v, prefix) {
		return v[len(prefix):]
	}
	return v
}

// HTTPToolRouter is the production [ToolRouter]. Each kind maps to a
// specific downstream service; the caller JWT is propagated so
// permission decisions stay with the resource owners (B07 §AC#6).
type HTTPToolRouter struct {
	// ObjectDatabaseURL backs ToolKindObjectQuery.
	ObjectDatabaseURL string
	// OntologyActionsURL backs ToolKindAction.
	OntologyActionsURL string
	// FunctionsURL backs the generic "POST args to a function runtime"
	// flavour of ToolKindFunction. Kept for backwards compatibility;
	// LogicFunctionsURL takes precedence when the tool config carries
	// a function_rid (Foundry's AIP Logic invocation path).
	FunctionsURL string
	// LogicFunctionsURL is the base URL of agent-runtime-service so
	// ToolKindFunction with a function_rid in its config dispatches
	// to /api/v1/agent-runtime/logic/functions/{rid}/invoke. In
	// production this is the service's own URL (loopback through the
	// gateway so JWT validation and auditing still apply).
	LogicFunctionsURL string
	// RetrievalURL backs ToolKindRetrieval (retrieval-context-service).
	RetrievalURL string
	// Proposals is the sink action tools call when their config asks
	// for human-in-the-loop approval. Nil means "feature not wired";
	// the router falls back to executing the action immediately so
	// dev/test setups without a DB keep working — but production
	// wiring must set this when require_approval flags exist on any
	// agent's tools.
	Proposals ProposalSink
	HTTP      *http.Client
}

type initiatingUserCtxKey struct{}

// WithInitiatingUser threads the user_id of the human who owns the
// current run through the context so the tool router can stamp it on
// staged proposals without trusting LLM-supplied args.
func WithInitiatingUser(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, initiatingUserCtxKey{}, userID)
}

// InitiatingUserFromContext returns the stamped user id or empty
// string if none was set.
func InitiatingUserFromContext(ctx context.Context) string {
	v, _ := ctx.Value(initiatingUserCtxKey{}).(string)
	return v
}

// NewHTTPToolRouter builds the router with a 30 s per-request timeout.
func NewHTTPToolRouter() *HTTPToolRouter {
	return &HTTPToolRouter{HTTP: &http.Client{Timeout: 30 * time.Second}}
}

// objectQueryConfig is the per-tool config stored under
// ToolDefinition.Config for ToolKindObjectQuery.
type objectQueryConfig struct {
	TypeID string `json:"type_id"`
	Tenant string `json:"tenant,omitempty"`
}

// actionConfig is the per-tool config for ToolKindAction. The
// requires_human_approval flag stages the proposal through the
// ProposalSink instead of executing the action immediately —
// mirroring Foundry's "stage Actions for approval" automation mode.
type actionConfig struct {
	ActionID               string `json:"action_id"`
	RequiresHumanApproval  bool   `json:"requires_human_approval"`
	Justification          string `json:"justification,omitempty"`
}

// ProposalSink is the seam the router uses to stage an Action proposal
// for human review instead of executing it. Production wires the
// agent-runtime Repo; tests inject an in-memory recorder.
type ProposalSink interface {
	StageActionProposal(ctx context.Context, req ProposalStageRequest) (proposalID string, err error)
}

// ProposalStageRequest captures everything the proposal row needs.
// The router pulls these fields from the tool def + the call args; the
// sink implementation maps to models.CreateActionProposalRequest.
type ProposalStageRequest struct {
	ActionTypeID     string
	Arguments        json.RawMessage
	Justification    string
	// InitiatingUser is the human (or service identity) that owns the
	// agent run that emitted the proposal. The router resolves this
	// from the caller JWT context — never from the LLM's tool args.
	InitiatingUserID string
}

// retrievalConfig is the per-tool config for ToolKindRetrieval.
type retrievalConfig struct {
	KnowledgeBaseID string `json:"knowledge_base_id"`
}

// functionConfig is the per-tool config for ToolKindFunction. When
// FunctionRID is set, the router dispatches to the agent-runtime's
// own /logic/functions/{rid}/invoke endpoint (a Foundry AIP Logic
// function used as a tool). Otherwise it falls back to the legacy
// generic FunctionsURL endpoint.
type functionConfig struct {
	FunctionRID string `json:"function_rid"`
}

// MaxLogicInvocationDepth caps Logic→Tool→Logic recursion. Foundry's
// AIP Logic has a similar guard; without it a misbehaving function
// graph could chain calls forever, burning compute and amplifying
// downstream load on object-database / ontology-actions.
const MaxLogicInvocationDepth = 4

// LogicDepthHeader carries the recursion counter across service
// boundaries. The Logic invoke handler reads it on the inbound side
// and rejects requests that exceed the cap; this router increments
// it on every Logic-function tool dispatch.
const LogicDepthHeader = "X-Logic-Depth"

type logicDepthCtxKey struct{}

// WithLogicDepth threads the current invocation depth through the
// context so the executor knows what to send on the next hop.
func WithLogicDepth(ctx context.Context, depth int) context.Context {
	return context.WithValue(ctx, logicDepthCtxKey{}, depth)
}

// LogicDepthFromContext returns the recorded invocation depth, or
// zero if none was set (the request originated outside a Logic call).
func LogicDepthFromContext(ctx context.Context) int {
	v, _ := ctx.Value(logicDepthCtxKey{}).(int)
	return v
}

// Invoke implements [ToolRouter]. Dispatches based on `def.Kind`;
// unknown kinds return a sentinel error the runner persists as the
// tool observation.
func (r *HTTPToolRouter) Invoke(ctx context.Context, callerJWT string, def models.ToolDefinition, args json.RawMessage) (json.RawMessage, error) {
	switch def.Kind {
	case models.ToolKindObjectQuery:
		return r.invokeObjectQuery(ctx, callerJWT, def, args)
	case models.ToolKindAction:
		return r.invokeAction(ctx, callerJWT, def, args)
	case models.ToolKindRetrieval:
		return r.invokeRetrieval(ctx, callerJWT, def, args)
	case models.ToolKindFunction:
		return r.invokeFunction(ctx, callerJWT, def, args)
	case models.ToolKindCommand, models.ToolKindClarification:
		// These are UI-side concerns (command palette, clarification
		// prompt). The runner echoes the args back so the LLM sees
		// the user is being prompted.
		return args, nil
	default:
		return json.RawMessage(`{"error":"unknown tool kind"}`), nil
	}
}

func (r *HTTPToolRouter) invokeObjectQuery(ctx context.Context, callerJWT string, def models.ToolDefinition, args json.RawMessage) (json.RawMessage, error) {
	if r.ObjectDatabaseURL == "" {
		return json.RawMessage(`{"error":"object database not configured"}`), nil
	}
	var cfg objectQueryConfig
	_ = json.Unmarshal(def.Config, &cfg)
	if cfg.TypeID == "" {
		return json.RawMessage(`{"error":"object_query tool missing type_id in config"}`), nil
	}
	endpoint := fmt.Sprintf("%s/api/v1/ontology/types/%s/objects/query",
		strings.TrimRight(r.ObjectDatabaseURL, "/"),
		url.PathEscape(cfg.TypeID),
	)
	return r.invokePOST(ctx, callerJWT, endpoint, args, nil)
}

func (r *HTTPToolRouter) invokeAction(ctx context.Context, callerJWT string, def models.ToolDefinition, args json.RawMessage) (json.RawMessage, error) {
	var cfg actionConfig
	_ = json.Unmarshal(def.Config, &cfg)
	if cfg.ActionID == "" {
		return json.RawMessage(`{"error":"action tool missing action_id in config"}`), nil
	}
	// Human-in-the-loop gate. When the agent's tool config flags this
	// action as require-approval, we never call ontology-actions
	// directly — instead we stage a proposal the operator reviews.
	// Foundry's "Stage actions for approval" automation mode behaves
	// identically: the LLM gets a "staged, awaiting review" reply and
	// continues reasoning without the side effect.
	if cfg.RequiresHumanApproval {
		if r.Proposals == nil {
			return json.RawMessage(`{"error":"action requires approval but no proposal sink is wired; refusing to auto-execute"}`),
				fmt.Errorf("proposal sink not configured for require-approval action %q", cfg.ActionID)
		}
		proposalID, err := r.Proposals.StageActionProposal(ctx, ProposalStageRequest{
			ActionTypeID:     cfg.ActionID,
			Arguments:        args,
			Justification:    cfg.Justification,
			InitiatingUserID: InitiatingUserFromContext(ctx),
		})
		if err != nil {
			return json.RawMessage(fmt.Sprintf(`{"error":"failed to stage proposal: %s"}`, err.Error())), err
		}
		return json.RawMessage(fmt.Sprintf(
			`{"status":"staged","proposal_id":%q,"message":"Action %s requires human approval; the reviewer will see this in the proposals queue."}`,
			proposalID, cfg.ActionID,
		)), nil
	}
	if r.OntologyActionsURL == "" {
		return json.RawMessage(`{"error":"ontology actions not configured"}`), nil
	}
	endpoint := fmt.Sprintf("%s/api/v1/ontology/actions/%s/execute",
		strings.TrimRight(r.OntologyActionsURL, "/"),
		url.PathEscape(cfg.ActionID),
	)
	return r.invokePOST(ctx, callerJWT, endpoint, args, nil)
}

// invokeFunction is the production binding between the agent's ReAct
// loop and an AIP Logic function used as a tool. When the tool's
// config carries a function_rid, the router calls the
// /logic/functions/{rid}/invoke endpoint on agent-runtime-service so
// the published Logic function executes (real ontology queries, real
// action invocations) under the caller's permissions. The Logic
// response envelope is parsed and the `outputs` field is returned to
// the LLM — the LLM does not need to see the full run metadata.
//
// When function_rid is absent the router falls back to the legacy
// generic FunctionsURL (kept for callers that wired a separate
// function runtime before AIP Logic existed).
func (r *HTTPToolRouter) invokeFunction(ctx context.Context, callerJWT string, def models.ToolDefinition, args json.RawMessage) (json.RawMessage, error) {
	var cfg functionConfig
	_ = json.Unmarshal(def.Config, &cfg)
	functionRID := strings.TrimSpace(cfg.FunctionRID)
	if functionRID == "" {
		if strings.TrimSpace(r.FunctionsURL) == "" {
			return json.RawMessage(`{"error":"function tool kind not configured"}`), nil
		}
		return r.invokePOST(ctx, callerJWT, r.FunctionsURL, args, nil)
	}
	if strings.TrimSpace(r.LogicFunctionsURL) == "" {
		return json.RawMessage(`{"error":"logic function tool not configured (LogicFunctionsURL unset)"}`), nil
	}
	depth := LogicDepthFromContext(ctx)
	if depth >= MaxLogicInvocationDepth {
		return json.RawMessage(fmt.Sprintf(`{"error":"logic invocation depth %d exceeds limit %d"}`, depth+1, MaxLogicInvocationDepth)), nil
	}
	endpoint := fmt.Sprintf("%s/api/v1/agent-runtime/logic/functions/%s/invoke",
		strings.TrimRight(r.LogicFunctionsURL, "/"),
		url.PathEscape(functionRID),
	)
	// Wrap the LLM-supplied args under "inputs" — the Logic invoke
	// handler validates that shape (see models.InvokeLogicFunctionRequest).
	envelope := map[string]json.RawMessage{"inputs": args}
	if len(args) == 0 {
		envelope["inputs"] = json.RawMessage(`{}`)
	}
	body, err := json.Marshal(envelope)
	if err != nil {
		return nil, err
	}
	headers := map[string]string{LogicDepthHeader: strconv.Itoa(depth + 1)}
	raw, err := r.invokePOST(ctx, callerJWT, endpoint, body, headers)
	if err != nil {
		return raw, err
	}
	// Extract just the outputs field so the LLM sees the function's
	// declared return shape, not the run envelope. Malformed responses
	// fall through unchanged so the LLM can still observe the error.
	var envelopeResp struct {
		Outputs json.RawMessage `json:"outputs"`
		Status  string          `json:"status"`
		Error   string          `json:"error_message,omitempty"`
	}
	if err := json.Unmarshal(raw, &envelopeResp); err != nil || len(envelopeResp.Outputs) == 0 {
		return raw, nil
	}
	if envelopeResp.Status == "failed" && envelopeResp.Error != "" {
		return json.RawMessage(fmt.Sprintf(`{"error":%q,"outputs":%s}`, envelopeResp.Error, string(envelopeResp.Outputs))), nil
	}
	return envelopeResp.Outputs, nil
}

func (r *HTTPToolRouter) invokeRetrieval(ctx context.Context, callerJWT string, def models.ToolDefinition, args json.RawMessage) (json.RawMessage, error) {
	if r.RetrievalURL == "" {
		return json.RawMessage(`{"error":"retrieval-context not configured"}`), nil
	}
	var cfg retrievalConfig
	_ = json.Unmarshal(def.Config, &cfg)
	endpoint := strings.TrimRight(r.RetrievalURL, "/") + "/api/v1/retrieval/search"
	// Merge knowledge_base_id into the LLM-supplied arguments so the
	// LLM doesn't have to know our wire format.
	var merged map[string]any
	if err := json.Unmarshal(args, &merged); err != nil {
		merged = map[string]any{"query": string(args)}
	}
	if cfg.KnowledgeBaseID != "" {
		merged["knowledge_base_id"] = cfg.KnowledgeBaseID
	}
	body, _ := json.Marshal(merged)
	return r.invokePOST(ctx, callerJWT, endpoint, body, nil)
}

func (r *HTTPToolRouter) invokePOST(ctx context.Context, callerJWT, endpoint string, body []byte, extraHeaders map[string]string) (json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if callerJWT != "" {
		req.Header.Set("Authorization", "Bearer "+stripBearer(callerJWT))
	}
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}
	client := r.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("post %s: %w", endpoint, err)
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusUnauthorized {
		// Security inheritance (B07 §AC#6): bubble the original
		// status into the observation so the LLM can phrase a
		// "you don't have permission" response.
		return json.RawMessage(fmt.Sprintf(`{"error":"permission denied (%d)","detail":%q}`, resp.StatusCode, string(rb))), nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return json.RawMessage(fmt.Sprintf(`{"error":"tool returned %d","detail":%q}`, resp.StatusCode, string(rb))), nil
	}
	if len(rb) == 0 {
		return json.RawMessage(`{}`), nil
	}
	return json.RawMessage(rb), nil
}
