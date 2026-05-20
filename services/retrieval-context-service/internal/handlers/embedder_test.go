package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// --- OfflineEmbedder --------------------------------------------------------

func TestOfflineEmbedderReturnsDeterministic15DimVector(t *testing.T) {
	e := OfflineEmbedder{}
	v1, err := e.Embed(context.Background(), "hello world")
	require.NoError(t, err)
	require.Len(t, v1, 15)

	v2, err := e.Embed(context.Background(), "hello world")
	require.NoError(t, err)
	require.Equal(t, v1, v2, "offline embedder must be deterministic")
}

func TestOfflineEmbedderEmptyTextReturnsEmptyVector(t *testing.T) {
	e := OfflineEmbedder{}
	v, err := e.Embed(context.Background(), "")
	require.NoError(t, err)
	require.Empty(t, v)

	v, err = e.Embed(context.Background(), "   \t  \n ")
	require.NoError(t, err)
	require.Empty(t, v)
}

func TestOfflineEmbedderModelTagIsStable(t *testing.T) {
	require.Equal(t, "offline-hash-15", OfflineEmbedder{}.Model())
	require.Equal(t, OfflineEmbedderModel, OfflineEmbedder{}.Model())
}

// --- RemoteEmbedder ---------------------------------------------------------

func TestNewRemoteEmbedderValidatesRequiredFields(t *testing.T) {
	_, err := NewRemoteEmbedder(RemoteEmbedderConfig{})
	require.Error(t, err)
	require.Contains(t, err.Error(), "EndpointURL")

	_, err = NewRemoteEmbedder(RemoteEmbedderConfig{EndpointURL: "http://x"})
	require.Error(t, err)
	require.Contains(t, err.Error(), "ModelName")

	_, err = NewRemoteEmbedder(RemoteEmbedderConfig{
		EndpointURL: "http://x", ModelName: "m", APIMode: "banana",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "unsupported APIMode")
}

func TestNewRemoteEmbedderDefaultsToChatCompletionsAPIMode(t *testing.T) {
	e, err := NewRemoteEmbedder(RemoteEmbedderConfig{
		EndpointURL: "http://x", ModelName: "text-embedding-3-small",
	})
	require.NoError(t, err)
	require.Equal(t, "openai:text-embedding-3-small", e.Model())
}

func TestRemoteEmbedderOpenAIPath(t *testing.T) {
	var capturedPath, capturedAuth string
	var capturedBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		capturedAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		require.NoError(t, json.Unmarshal(body, &capturedBody))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"embedding":[0.1,0.2,0.3]}]}`))
	}))
	defer srv.Close()

	t.Setenv("FAKE_TOKEN", "secret")
	e, err := NewRemoteEmbedder(RemoteEmbedderConfig{
		EndpointURL:      srv.URL,
		ModelName:        "text-embedding-3-small",
		APIMode:          "chat_completions",
		CredentialEnvVar: "FAKE_TOKEN",
	})
	require.NoError(t, err)

	v, err := e.Embed(context.Background(), "hello")
	require.NoError(t, err)
	require.InDeltaSlice(t, []float64{0.1, 0.2, 0.3}, v, 1e-6,
		"libs/ai-kernel-go returns []float32, widened to []float64 — compare with tolerance")
	require.Equal(t, "/embeddings", capturedPath)
	require.Equal(t, "Bearer secret", capturedAuth)
	require.Equal(t, "text-embedding-3-small", capturedBody["model"])
	require.Equal(t, "hello", capturedBody["input"])
	require.Equal(t, "openai:text-embedding-3-small", e.Model())
}

func TestRemoteEmbedderOllamaPath(t *testing.T) {
	var capturedPath string
	var capturedBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		body, _ := io.ReadAll(r.Body)
		require.NoError(t, json.Unmarshal(body, &capturedBody))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"embedding":[0.4,0.5,0.6,0.7]}`))
	}))
	defer srv.Close()

	e, err := NewRemoteEmbedder(RemoteEmbedderConfig{
		EndpointURL: srv.URL,
		ModelName:   "nomic-embed-text",
		APIMode:     "chat",
	})
	require.NoError(t, err)

	v, err := e.Embed(context.Background(), "hola mundo")
	require.NoError(t, err)
	require.InDeltaSlice(t, []float64{0.4, 0.5, 0.6, 0.7}, v, 1e-6,
		"libs/ai-kernel-go returns []float32, widened to []float64 — compare with tolerance")
	require.Equal(t, "/embeddings", capturedPath)
	require.Equal(t, "nomic-embed-text", capturedBody["model"])
	// Ollama uses `prompt`, not `input`. This is what
	// libs/ai-kernel-go's embedOllama does.
	require.Equal(t, "hola mundo", capturedBody["prompt"])
	require.Equal(t, "ollama:nomic-embed-text", e.Model())
}

func TestRemoteEmbedderEmptyInputReturnsEmptyVectorWithoutHTTPCall(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		t.Fatal("HTTP call should not happen on empty input")
	}))
	defer srv.Close()

	e, err := NewRemoteEmbedder(RemoteEmbedderConfig{
		EndpointURL: srv.URL, ModelName: "m", APIMode: "chat_completions",
	})
	require.NoError(t, err)

	v, err := e.Embed(context.Background(), "  ")
	require.NoError(t, err)
	require.Empty(t, v)
}

func TestRemoteEmbedderPropagatesProviderError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"bad token"}`))
	}))
	defer srv.Close()

	e, err := NewRemoteEmbedder(RemoteEmbedderConfig{
		EndpointURL: srv.URL, ModelName: "m", APIMode: "chat_completions",
	})
	require.NoError(t, err)

	_, err = e.Embed(context.Background(), "x")
	require.Error(t, err)
	require.True(t,
		strings.Contains(err.Error(), "401") ||
			strings.Contains(err.Error(), "bad token") ||
			strings.Contains(err.Error(), "embedding provider returned"),
		"error should bubble provider status: %v", err)
}

// --- Knowledge embedder() helper --------------------------------------------

func TestKnowledgeEmbedderHelperFallsBackToOffline(t *testing.T) {
	h := &Knowledge{}
	require.Equal(t, "offline-hash-15", h.embedder().Model())
}

func TestKnowledgeEmbedderHelperHonoursInjection(t *testing.T) {
	h := &Knowledge{Embedder: OfflineEmbedder{}}
	require.Equal(t, OfflineEmbedderModel, h.embedder().Model())
}
