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
	// FunctionsURL backs ToolKindFunction (typically agent-runtime's
	// own functions surface).
	FunctionsURL string
	// RetrievalURL backs ToolKindRetrieval (retrieval-context-service).
	RetrievalURL string
	HTTP         *http.Client
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

// actionConfig is the per-tool config for ToolKindAction.
type actionConfig struct {
	ActionID string `json:"action_id"`
}

// retrievalConfig is the per-tool config for ToolKindRetrieval.
type retrievalConfig struct {
	KnowledgeBaseID string `json:"knowledge_base_id"`
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
		// Functions live on agent-runtime-service itself today;
		// callers wire FunctionsURL only if they have a separate
		// runtime. When empty, surface a friendly observation rather
		// than 500.
		if strings.TrimSpace(r.FunctionsURL) == "" {
			return json.RawMessage(`{"error":"function tool kind not configured"}`), nil
		}
		return r.invokePOST(ctx, callerJWT, r.FunctionsURL, args)
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
	return r.invokePOST(ctx, callerJWT, endpoint, args)
}

func (r *HTTPToolRouter) invokeAction(ctx context.Context, callerJWT string, def models.ToolDefinition, args json.RawMessage) (json.RawMessage, error) {
	if r.OntologyActionsURL == "" {
		return json.RawMessage(`{"error":"ontology actions not configured"}`), nil
	}
	var cfg actionConfig
	_ = json.Unmarshal(def.Config, &cfg)
	if cfg.ActionID == "" {
		return json.RawMessage(`{"error":"action tool missing action_id in config"}`), nil
	}
	endpoint := fmt.Sprintf("%s/api/v1/ontology/actions/%s/execute",
		strings.TrimRight(r.OntologyActionsURL, "/"),
		url.PathEscape(cfg.ActionID),
	)
	return r.invokePOST(ctx, callerJWT, endpoint, args)
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
	return r.invokePOST(ctx, callerJWT, endpoint, body)
}

func (r *HTTPToolRouter) invokePOST(ctx context.Context, callerJWT, endpoint string, body []byte) (json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if callerJWT != "" {
		req.Header.Set("Authorization", "Bearer "+stripBearer(callerJWT))
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
