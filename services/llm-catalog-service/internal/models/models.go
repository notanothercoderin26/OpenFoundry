// Package models holds wire-format DTOs for llm-catalog-service.
//
// JSON shape mirrors proto/ai/v1/llm_catalog.proto. The proto-generated
// Go types live in libs/proto-gen/ai/v1 — they are the source of truth
// for the wire schema but their default protobuf JSON encoding is not
// idiomatic Go (proto3 well-known wrappers, enum integers, ...). These
// hand-rolled DTOs are the shape the HTTP handlers consume so apps/web
// gets the OpenAI-compatible body it expects.
package models

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Provider enumerates the upstream LLM platforms the catalog supports.
type Provider string

const (
	ProviderUnspecified Provider = ""
	ProviderAnthropic   Provider = "ANTHROPIC"
	ProviderOpenAI      Provider = "OPENAI"
	ProviderOllama      Provider = "OLLAMA"
	ProviderBedrock     Provider = "BEDROCK"
	// ProviderAzure is Azure OpenAI Service. Distinct from OPENAI
	// because the endpoint scheme differs
	// (https://{resource}.openai.azure.com/openai/deployments/{deployment}/...
	// + api-version query) and the demo pivot "Ollama vs Azure" wants
	// to surface them as separate badges. See B04 acceptance #3.
	ProviderAzure Provider = "AZURE"
)

// IsValid reports whether p is one of the known provider tokens.
func (p Provider) IsValid() bool {
	switch p {
	case ProviderAnthropic, ProviderOpenAI, ProviderOllama, ProviderBedrock, ProviderAzure:
		return true
	}
	return false
}

// Normalize returns the upper-case form, accepting any input case.
func NormalizeProvider(s string) Provider {
	return Provider(strings.ToUpper(strings.TrimSpace(s)))
}

// Capability enumerates the modalities + features a registered model
// advertises. CHAT is the conversational discriminator the Chatbot
// Studio dropdown filters on (B04 acceptance #2).
type Capability string

const (
	CapabilityChat   Capability = "CHAT"
	CapabilityText   Capability = "TEXT"
	CapabilityVision Capability = "VISION"
	CapabilityTools  Capability = "TOOLS"
)

// IsValid reports whether c is one of the known capability tokens.
func (c Capability) IsValid() bool {
	switch c {
	case CapabilityChat, CapabilityText, CapabilityVision, CapabilityTools:
		return true
	}
	return false
}

// NormalizeCapability returns the upper-case form, accepting any input case.
func NormalizeCapability(s string) Capability {
	return Capability(strings.ToUpper(strings.TrimSpace(s)))
}

// Quotas captures per-tenant and per-feature usage caps. Stored as a
// JSONB column so adding a new dimension later does not require a
// schema migration; the wire shape is flat for the apps/web Model
// Catalog admin form to manipulate.
type Quotas struct {
	RequestsPerMinute      int32 `json:"requests_per_minute,omitempty"`
	TokensPerMinute        int32 `json:"tokens_per_minute,omitempty"`
	MaxConcurrentRequests  int32 `json:"max_concurrent_requests,omitempty"`
	DailyTokenBudget       int64 `json:"daily_token_budget,omitempty"`
	DailyCostBudgetUSDCent int64 `json:"daily_cost_budget_usd_cents,omitempty"`
}

// Model is one row of the catalog as exposed to clients.
type Model struct {
	RID                 uuid.UUID    `json:"rid"`
	Provider            Provider     `json:"provider"`
	ModelID             string       `json:"model_id"`
	DisplayName         string       `json:"display_name"`
	ContextWindow       int32        `json:"context_window"`
	InputCostPer1K      float64      `json:"input_cost_per_1k"`
	OutputCostPer1K     float64      `json:"output_cost_per_1k"`
	Capabilities        []Capability `json:"capabilities"`
	Quotas              Quotas       `json:"quotas"`
	EnabledForFeatures  []string     `json:"enabled_for_features"`
	Enabled             bool         `json:"enabled"`
	CreatedAt           time.Time    `json:"created_at"`
	UpdatedAt           time.Time    `json:"updated_at"`
}

// RegisterModelRequest is the admin CRUD create body.
type RegisterModelRequest struct {
	Provider            Provider     `json:"provider"`
	ModelID             string       `json:"model_id"`
	DisplayName         string       `json:"display_name"`
	ContextWindow       int32        `json:"context_window"`
	InputCostPer1K      float64      `json:"input_cost_per_1k"`
	OutputCostPer1K     float64      `json:"output_cost_per_1k"`
	Capabilities        []Capability `json:"capabilities"`
	Quotas              *Quotas      `json:"quotas,omitempty"`
	EnabledForFeatures  []string     `json:"enabled_for_features,omitempty"`
	Enabled             *bool        `json:"enabled,omitempty"`
}

// UpdateModelRequest is the PATCH body. All fields optional; only the
// ones supplied by the caller are modified. Enables the
// "PATCH /models/{id} {enabled: false}" flow from B04 acceptance #4.
type UpdateModelRequest struct {
	DisplayName        *string      `json:"display_name,omitempty"`
	ContextWindow      *int32       `json:"context_window,omitempty"`
	InputCostPer1K     *float64     `json:"input_cost_per_1k,omitempty"`
	OutputCostPer1K    *float64     `json:"output_cost_per_1k,omitempty"`
	Capabilities       []Capability `json:"capabilities,omitempty"`
	Quotas             *Quotas      `json:"quotas,omitempty"`
	EnabledForFeatures []string     `json:"enabled_for_features,omitempty"`
	Enabled            *bool        `json:"enabled,omitempty"`
}

// ListModelsResponse is the list envelope (matches the existing
// `{"data": [...]}` convention used across services).
type ListModelsResponse struct {
	Data []Model `json:"data"`
}

// Message mirrors the OpenAI chat-completions message shape so the
// frontend handles every provider with one schema.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Tool is the forward-compat tool registration shape. v1 round-trips
// the schema unchanged; the invoke handler does not execute tools.
type Tool struct {
	Name                 string          `json:"name"`
	Description          string          `json:"description,omitempty"`
	ParametersJSONSchema json.RawMessage `json:"parameters_json_schema,omitempty"`
}

// InvokeRequest is the body of POST /api/v1/llm/invoke.
type InvokeRequest struct {
	ModelRID    uuid.UUID `json:"model_rid"`
	Messages    []Message `json:"messages"`
	MaxTokens   int32     `json:"max_tokens,omitempty"`
	Temperature float32   `json:"temperature,omitempty"`
	Tools       []Tool    `json:"tools,omitempty"`
	Stream      bool      `json:"stream,omitempty"`
}

// Usage mirrors the OpenAI usage block.
type Usage struct {
	PromptTokens     int32 `json:"prompt_tokens"`
	CompletionTokens int32 `json:"completion_tokens"`
	TotalTokens      int32 `json:"total_tokens"`
}

// InvokeResponse is the unified shape returned regardless of provider.
type InvokeResponse struct {
	Messages []Message `json:"messages"`
	Usage    Usage     `json:"usage"`
	ModelRID uuid.UUID `json:"model_rid"`
	CostUSD  float64   `json:"cost_usd"`
}
