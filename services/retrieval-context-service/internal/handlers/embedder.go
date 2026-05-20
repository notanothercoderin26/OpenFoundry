// Embedder — pluggable vector backend for the RAG ingest + retrieval
// surface defined in knowledge.go.
//
// Foundry-native context: Palantir's AIP Chatbot Studio reference for
// retrieval context (docs/foundry/agent-studio/retrieval-context/)
// describes three retrieval modes — Ontology object semantic search,
// Document semantic search (beta), Function-backed. All three require
// a "vector embedding property" but the public docs do NOT pin the
// embedder model; it is provider-specific BYO. The PoC contract
// (00-contrato-foundry-native.md §"Markings-based row/column
// visibility") explicitly treats marking-aware retrieval as
// OpenFoundry emulation — we do NOT claim Foundry parity on the
// embedder choice.
//
// What changes vs the stand-in in knowledge.go:
//
//  1. The handler depends on the Embedder interface — no more direct
//     calls to the package-level `embed(text)` function.
//  2. OfflineEmbedder wraps the legacy 15-dim hash so CI and dev
//     environments without an embedding provider stay deterministic.
//  3. RemoteEmbedder forwards to `libs/ai-kernel-go/domain/llm`'s
//     EmbedText, which dispatches to OpenAI-compatible `/embeddings`
//     or Ollama-style `/embeddings`. The PoC's two-mode requirement
//     (Ollama local for air-gapped, OpenAI for cloud) maps onto the
//     APIMode discriminator.
//  4. Each Embedder declares a stable `Model()` tag stored alongside
//     every chunk. Search filters chunks to the embedder currently
//     wired so mixed-dim corpora never silently return junk.

package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	aikernelllm "github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/domain/llm"
	aikernelmodels "github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/models"
)

// Embedder produces the vector + model tag for one piece of text. The
// model tag is what Knowledge stores in `knowledge_document_chunks
// .embedding_model` so search can filter to a homogeneous corpus.
type Embedder interface {
	// Embed turns text into a vector. Empty input returns an empty
	// vector (not an error) — callers treat that as "nothing to
	// index".
	Embed(ctx context.Context, text string) ([]float64, error)
	// Model is the stable identifier under which the vector is
	// stored. Format: "<provider>:<model_name>" (e.g.
	// "openai:text-embedding-3-small") or "offline-hash-15" for
	// the dev fallback.
	Model() string
}

// OfflineEmbedderModel is the canonical tag the legacy hash signature
// is stored under. Mirrors the DEFAULT in the 0003 migration.
const OfflineEmbedderModel = "offline-hash-15"

// OfflineEmbedder is the 15-dim hash bag-of-words signature retained
// from the original implementation. Deterministic, dependency-free,
// good enough for unit tests + bootstrap demos.
type OfflineEmbedder struct{}

// Embed projects text into a 15-dim L2-normalised hash signature.
// Bridges to the package-level `embed` function in knowledge.go to
// avoid duplicating the implementation in two places — that function
// is the historical source of truth for the offline path.
func (OfflineEmbedder) Embed(_ context.Context, text string) ([]float64, error) {
	if strings.TrimSpace(text) == "" {
		return []float64{}, nil
	}
	return embed(text), nil
}

// Model returns the persisted-tag value used by the search filter.
func (OfflineEmbedder) Model() string { return OfflineEmbedderModel }

// RemoteEmbedderConfig captures the small set of fields needed to
// build a LlmProvider compatible with libs/ai-kernel-go.
//
// EndpointURL is the base; api-kernel-go appends the per-mode suffix.
// APIMode is "chat_completions" (OpenAI / vLLM) or "chat" (Ollama).
// CredentialEnvVar names the env var the provider's bearer token is
// pulled from at request time — credentials are never held in this
// struct directly.
type RemoteEmbedderConfig struct {
	EndpointURL      string
	ModelName        string
	APIMode          string
	CredentialEnvVar string
	HTTPClient       *http.Client
}

// RemoteEmbedder calls libs/ai-kernel-go's EmbedText, which dispatches
// to OpenAI-compatible `/embeddings` or Ollama-style `/embeddings`
// per APIMode.
type RemoteEmbedder struct {
	provider *aikernelmodels.LlmProvider
	client   *http.Client
	tag      string
}

// NewRemoteEmbedder validates the config and builds the provider
// struct passed to EmbedText. Returns an error when the required
// fields are missing — failing-fast at startup is the contract.
func NewRemoteEmbedder(cfg RemoteEmbedderConfig) (*RemoteEmbedder, error) {
	if strings.TrimSpace(cfg.EndpointURL) == "" {
		return nil, errors.New("retrieval-context embedder: EndpointURL is required")
	}
	if strings.TrimSpace(cfg.ModelName) == "" {
		return nil, errors.New("retrieval-context embedder: ModelName is required")
	}
	mode := cfg.APIMode
	if mode == "" {
		mode = "chat_completions"
	}
	switch mode {
	case "chat_completions", "chat":
		// OK
	default:
		return nil, fmt.Errorf("retrieval-context embedder: unsupported APIMode %q (want chat_completions | chat)", mode)
	}
	provider := &aikernelmodels.LlmProvider{
		ModelName:   cfg.ModelName,
		EndpointURL: cfg.EndpointURL,
		APIMode:     mode,
	}
	if ref := strings.TrimSpace(cfg.CredentialEnvVar); ref != "" {
		provider.CredentialReference = &ref
	}
	client := cfg.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	return &RemoteEmbedder{
		provider: provider,
		client:   client,
		tag:      buildModelTag(mode, cfg.ModelName),
	}, nil
}

// Embed calls aikernelllm.EmbedTextWith and converts the returned
// []float32 to []float64 to match the existing DB column type.
func (e *RemoteEmbedder) Embed(ctx context.Context, text string) ([]float64, error) {
	if strings.TrimSpace(text) == "" {
		return []float64{}, nil
	}
	vec, err := aikernelllm.EmbedTextWith(ctx, e.client, e.provider, text)
	if err != nil {
		return nil, fmt.Errorf("remote embedder: %w", err)
	}
	out := make([]float64, len(vec))
	for i, v := range vec {
		out[i] = float64(v)
	}
	return out, nil
}

// Model returns the persisted-tag value (e.g. "openai:text-embedding-3-small").
func (e *RemoteEmbedder) Model() string { return e.tag }

// buildModelTag derives the stable storage tag from the API mode +
// model name. "chat_completions" is canonicalised to "openai" because
// that's how operators name the provider in practice; Ollama keeps
// its discriminator. Both are the same model registry, just different
// endpoints.
func buildModelTag(apiMode, modelName string) string {
	prefix := "openai"
	if apiMode == "chat" {
		prefix = "ollama"
	}
	return prefix + ":" + modelName
}
