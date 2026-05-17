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
)

// IsValid reports whether p is one of the known provider tokens.
func (p Provider) IsValid() bool {
	switch p {
	case ProviderAnthropic, ProviderOpenAI, ProviderOllama, ProviderBedrock:
		return true
	}
	return false
}

// Normalize returns the upper-case form, accepting any input case.
func NormalizeProvider(s string) Provider {
	return Provider(strings.ToUpper(strings.TrimSpace(s)))
}

// Capability enumerates the modalities a registered model advertises.
type Capability string

const (
	CapabilityText   Capability = "TEXT"
	CapabilityVision Capability = "VISION"
	CapabilityTools  Capability = "TOOLS"
)

// IsValid reports whether c is one of the known capability tokens.
func (c Capability) IsValid() bool {
	switch c {
	case CapabilityText, CapabilityVision, CapabilityTools:
		return true
	}
	return false
}

// Model is one row of the catalog as exposed to clients.
type Model struct {
	RID             uuid.UUID    `json:"rid"`
	Provider        Provider     `json:"provider"`
	ModelID         string       `json:"model_id"`
	DisplayName     string       `json:"display_name"`
	ContextWindow   int32        `json:"context_window"`
	InputCostPer1K  float64      `json:"input_cost_per_1k"`
	OutputCostPer1K float64      `json:"output_cost_per_1k"`
	Capabilities    []Capability `json:"capabilities"`
	Enabled         bool         `json:"enabled"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
}

// RegisterModelRequest is the admin CRUD create body.
type RegisterModelRequest struct {
	Provider        Provider     `json:"provider"`
	ModelID         string       `json:"model_id"`
	DisplayName     string       `json:"display_name"`
	ContextWindow   int32        `json:"context_window"`
	InputCostPer1K  float64      `json:"input_cost_per_1k"`
	OutputCostPer1K float64      `json:"output_cost_per_1k"`
	Capabilities    []Capability `json:"capabilities"`
	Enabled         *bool        `json:"enabled,omitempty"`
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
