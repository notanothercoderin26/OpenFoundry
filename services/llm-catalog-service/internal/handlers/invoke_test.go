package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/repo"
)

// fakeAnthropic returns a single text block with a fixed usage block.
// Counts inbound calls so tests can assert dispatch happened.
type fakeAnthropic struct {
	server *httptest.Server
	calls  int
}

func newFakeAnthropic(t *testing.T, replyText string, in, out int32) *fakeAnthropic {
	t.Helper()
	f := &fakeAnthropic{}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.calls++
		assert.Equal(t, "/messages", r.URL.Path)
		assert.Equal(t, "sk-fake", r.Header.Get("x-api-key"))
		assert.Equal(t, "2023-06-01", r.Header.Get("anthropic-version"))
		var body map[string]any
		raw, _ := io.ReadAll(r.Body)
		require.NoError(t, json.Unmarshal(raw, &body))
		w.Header().Set("Content-Type", "application/json")
		payload := map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": replyText},
			},
			"usage": map[string]any{
				"input_tokens":  in,
				"output_tokens": out,
			},
		}
		_ = json.NewEncoder(w).Encode(payload)
	}))
	t.Cleanup(f.server.Close)
	return f
}

func buildInvokeFixture(t *testing.T, capacity, refill float64) (
	store *repo.MemoryStore,
	inv *handlers.Invoke,
	metrics *handlers.InvokeMetrics,
	logBuf *bytes.Buffer,
	fake *fakeAnthropic,
	modelRID uuid.UUID,
) {
	t.Helper()
	store = repo.NewMemoryStore()
	fake = newFakeAnthropic(t, "hello from claude", 12, 5)
	m, err := store.Register(context.Background(), models.RegisterModelRequest{
		Provider:        models.ProviderAnthropic,
		ModelID:         "claude-sonnet-4-6",
		DisplayName:     "Claude Sonnet 4.6",
		ContextWindow:   200000,
		InputCostPer1K:  0.003,
		OutputCostPer1K: 0.015,
		Capabilities:    []models.Capability{models.CapabilityText},
	})
	require.NoError(t, err)
	modelRID = m.RID

	logBuf = &bytes.Buffer{}
	logger := slog.New(slog.NewJSONHandler(logBuf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	metricsHandle := observability.NewMetrics()
	metrics = handlers.NewInvokeMetrics(metricsHandle)
	inv = &handlers.Invoke{
		Store: store,
		Providers: &handlers.ProviderRegistry{
			HTTPClient:       fake.server.Client(),
			AnthropicAPIKey:  "sk-fake",
			AnthropicBaseURL: fake.server.URL,
		},
		Limiter: handlers.NewRateLimiter(capacity, refill),
		Metrics: metrics,
		Logger:  logger,
	}
	return
}

// withClaimsMiddleware wraps a handler so the inner handler sees a
// fixed JWT claims set, mirroring what authmw.Middleware would attach
// from a real bearer token. The body-capture middleware runs first so
// the audit hash matches the body the inner handler decoded.
func withClaimsMiddleware(claims *authmw.Claims, next http.Handler) http.Handler {
	cap := handlers.CaptureRawBody()(next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := authmw.ContextWithClaims(r.Context(), claims)
		cap.ServeHTTP(w, r.WithContext(ctx))
	})
}

func newAuthedClaims() *authmw.Claims {
	return &authmw.Claims{Sub: uuid.New(), Email: "test@local", Roles: []string{"viewer"}}
}

func TestInvoke_Success_ReturnsOpenAIShapeAndRecordsMetrics(t *testing.T) {
	t.Parallel()
	_, inv, metrics, logBuf, fake, modelRID := buildInvokeFixture(t, 10, 10)
	handler := withClaimsMiddleware(newAuthedClaims(), http.HandlerFunc(inv.InvokeModel))

	body, _ := json.Marshal(models.InvokeRequest{
		ModelRID: modelRID,
		Messages: []models.Message{{Role: "user", Content: "ping"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/invoke", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var resp models.InvokeResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Messages, 1)
	assert.Equal(t, "assistant", resp.Messages[0].Role)
	assert.Equal(t, "hello from claude", resp.Messages[0].Content)
	assert.EqualValues(t, 12, resp.Usage.PromptTokens)
	assert.EqualValues(t, 5, resp.Usage.CompletionTokens)
	assert.EqualValues(t, 17, resp.Usage.TotalTokens)
	assert.Equal(t, modelRID, resp.ModelRID)
	expectedCost := (12.0/1000)*0.003 + (5.0/1000)*0.015
	assert.InDelta(t, expectedCost, resp.CostUSD, 1e-9)
	assert.Equal(t, 1, fake.calls)

	// Prometheus counters bumped.
	inputCount := testutil.ToFloat64(metrics.Tokens.With(prometheus.Labels{"model": "claude-sonnet-4-6", "kind": "input"}))
	outputCount := testutil.ToFloat64(metrics.Tokens.With(prometheus.Labels{"model": "claude-sonnet-4-6", "kind": "output"}))
	costCount := testutil.ToFloat64(metrics.Cost.With(prometheus.Labels{"model": "claude-sonnet-4-6"}))
	assert.Equal(t, 12.0, inputCount)
	assert.Equal(t, 5.0, outputCount)
	assert.InDelta(t, expectedCost, costCount, 1e-9)

	// Audit log emitted with category=audit, kind=llm.invoke and a body hash.
	logRecords := splitJSONLines(logBuf)
	require.Len(t, logRecords, 1)
	rec0 := logRecords[0]
	assert.Equal(t, "audit", rec0["category"])
	assert.Equal(t, "llm.invoke", rec0["kind"])
	assert.Equal(t, modelRID.String(), rec0["model_rid"])
	assert.Equal(t, "ok", rec0["status"])
	assert.NotEmpty(t, rec0["request_body_sha256"])
	assert.EqualValues(t, 12, rec0["prompt_tokens"])
	assert.EqualValues(t, 5, rec0["completion_tokens"])
}

func TestInvoke_MissingClaims_Returns401(t *testing.T) {
	t.Parallel()
	_, inv, _, _, _, modelRID := buildInvokeFixture(t, 10, 10)
	// Don't inject claims — only the body-capture middleware runs.
	handler := handlers.CaptureRawBody()(http.HandlerFunc(inv.InvokeModel))
	body, _ := json.Marshal(models.InvokeRequest{
		ModelRID: modelRID,
		Messages: []models.Message{{Role: "user", Content: "ping"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/invoke", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestInvoke_RateLimit_Returns429(t *testing.T) {
	t.Parallel()
	// Capacity=1, refill=0 — second request must 429.
	_, inv, _, _, _, modelRID := buildInvokeFixture(t, 1, 0)
	handler := withClaimsMiddleware(newAuthedClaims(), http.HandlerFunc(inv.InvokeModel))
	mkReq := func() *http.Request {
		body, _ := json.Marshal(models.InvokeRequest{
			ModelRID: modelRID,
			Messages: []models.Message{{Role: "user", Content: "ping"}},
		})
		return httptest.NewRequest(http.MethodPost, "/invoke", bytes.NewReader(body))
	}

	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, mkReq())
	require.Equal(t, http.StatusOK, rec1.Code, rec1.Body.String())

	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, mkReq())
	assert.Equal(t, http.StatusTooManyRequests, rec2.Code, rec2.Body.String())
}

func TestInvoke_ModelNotFound_Returns404(t *testing.T) {
	t.Parallel()
	_, inv, _, _, _, _ := buildInvokeFixture(t, 10, 10)
	handler := withClaimsMiddleware(newAuthedClaims(), http.HandlerFunc(inv.InvokeModel))
	body, _ := json.Marshal(models.InvokeRequest{
		ModelRID: uuid.New(),
		Messages: []models.Message{{Role: "user", Content: "ping"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/invoke", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestInvoke_DisabledModel_Returns503(t *testing.T) {
	t.Parallel()
	store, inv, _, _, _, modelRID := buildInvokeFixture(t, 10, 10)
	_, err := store.SetEnabled(context.Background(), modelRID, false)
	require.NoError(t, err)
	handler := withClaimsMiddleware(newAuthedClaims(), http.HandlerFunc(inv.InvokeModel))
	body, _ := json.Marshal(models.InvokeRequest{
		ModelRID: modelRID,
		Messages: []models.Message{{Role: "user", Content: "ping"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/invoke", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
}

func TestInvoke_BedrockProvider_Returns501(t *testing.T) {
	t.Parallel()
	store := repo.NewMemoryStore()
	m, err := store.Register(context.Background(), models.RegisterModelRequest{
		Provider: models.ProviderBedrock,
		ModelID:  "anthropic.claude-3-haiku",
	})
	require.NoError(t, err)
	inv := &handlers.Invoke{
		Store:     store,
		Providers: &handlers.ProviderRegistry{},
		Limiter:   handlers.NewRateLimiter(10, 10),
		Metrics:   handlers.NewInvokeMetrics(observability.NewMetrics()),
		Logger:    slog.New(slog.NewJSONHandler(io.Discard, nil)),
	}
	handler := withClaimsMiddleware(newAuthedClaims(), http.HandlerFunc(inv.InvokeModel))
	body, _ := json.Marshal(models.InvokeRequest{
		ModelRID: m.RID,
		Messages: []models.Message{{Role: "user", Content: "ping"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/invoke", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotImplemented, rec.Code)
}

func TestInvoke_OpenAICompatible_DispatchAndUsage(t *testing.T) {
	t.Parallel()
	store := repo.NewMemoryStore()
	openai := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/chat/completions", r.URL.Path)
		assert.Equal(t, "Bearer sk-openai", r.Header.Get("Authorization"))
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"content": "hi"}},
			},
			"usage": map[string]any{
				"prompt_tokens":     7,
				"completion_tokens": 3,
			},
		})
	}))
	defer openai.Close()

	m, err := store.Register(context.Background(), models.RegisterModelRequest{
		Provider:        models.ProviderOpenAI,
		ModelID:         "gpt-4o-mini",
		InputCostPer1K:  0.001,
		OutputCostPer1K: 0.002,
	})
	require.NoError(t, err)
	inv := &handlers.Invoke{
		Store: store,
		Providers: &handlers.ProviderRegistry{
			HTTPClient:    openai.Client(),
			OpenAIAPIKey:  "sk-openai",
			OpenAIBaseURL: openai.URL,
		},
		Limiter: handlers.NewRateLimiter(10, 10),
		Metrics: handlers.NewInvokeMetrics(observability.NewMetrics()),
		Logger:  slog.New(slog.NewJSONHandler(io.Discard, nil)),
	}
	handler := withClaimsMiddleware(newAuthedClaims(), http.HandlerFunc(inv.InvokeModel))
	body, _ := json.Marshal(models.InvokeRequest{
		ModelRID: m.RID,
		Messages: []models.Message{
			{Role: "system", Content: "be terse"},
			{Role: "user", Content: "ping"},
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/invoke", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var resp models.InvokeResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "hi", resp.Messages[0].Content)
	assert.EqualValues(t, 7, resp.Usage.PromptTokens)
	assert.EqualValues(t, 3, resp.Usage.CompletionTokens)
}

func TestInvoke_AzureOpenAI_DispatchAndUsage(t *testing.T) {
	t.Parallel()
	store := repo.NewMemoryStore()
	const deployment = "gpt-4o-geopolitics"
	const apiVersion = "2024-08-01-preview"
	azure := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// URL shape: /openai/deployments/{deployment}/chat/completions
		assert.Equal(t,
			"/openai/deployments/"+deployment+"/chat/completions",
			r.URL.Path,
		)
		assert.Equal(t, apiVersion, r.URL.Query().Get("api-version"))
		assert.Equal(t, "az-fake", r.Header.Get("api-key"))
		// Azure ignores Authorization header; ensure we did not set it.
		assert.Empty(t, r.Header.Get("Authorization"))
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"content": "hola desde Azure"}},
			},
			"usage": map[string]any{
				"prompt_tokens":     11,
				"completion_tokens": 4,
			},
		})
	}))
	defer azure.Close()

	m, err := store.Register(context.Background(), models.RegisterModelRequest{
		Provider:        models.ProviderAzure,
		ModelID:         deployment,
		InputCostPer1K:  0.005,
		OutputCostPer1K: 0.015,
	})
	require.NoError(t, err)
	inv := &handlers.Invoke{
		Store: store,
		Providers: &handlers.ProviderRegistry{
			HTTPClient:            azure.Client(),
			AzureOpenAIAPIKey:     "az-fake",
			AzureOpenAIBaseURL:    azure.URL,
			AzureOpenAIAPIVersion: apiVersion,
		},
		Limiter: handlers.NewRateLimiter(10, 10),
		Metrics: handlers.NewInvokeMetrics(observability.NewMetrics()),
		Logger:  slog.New(slog.NewJSONHandler(io.Discard, nil)),
	}
	handler := withClaimsMiddleware(newAuthedClaims(), http.HandlerFunc(inv.InvokeModel))
	body, _ := json.Marshal(models.InvokeRequest{
		ModelRID: m.RID,
		Messages: []models.Message{{Role: "user", Content: "ping"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/invoke", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var resp models.InvokeResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "hola desde Azure", resp.Messages[0].Content)
	assert.EqualValues(t, 11, resp.Usage.PromptTokens)
	assert.EqualValues(t, 4, resp.Usage.CompletionTokens)
}

func TestInvoke_AzureOpenAI_MissingAPIKey_Returns502(t *testing.T) {
	t.Parallel()
	store := repo.NewMemoryStore()
	m, err := store.Register(context.Background(), models.RegisterModelRequest{
		Provider: models.ProviderAzure,
		ModelID:  "gpt-4o-geopolitics",
	})
	require.NoError(t, err)
	inv := &handlers.Invoke{
		Store: store,
		Providers: &handlers.ProviderRegistry{
			AzureOpenAIBaseURL: "https://example.openai.azure.com",
		},
		Limiter: handlers.NewRateLimiter(10, 10),
		Metrics: handlers.NewInvokeMetrics(observability.NewMetrics()),
		Logger:  slog.New(slog.NewJSONHandler(io.Discard, nil)),
	}
	handler := withClaimsMiddleware(newAuthedClaims(), http.HandlerFunc(inv.InvokeModel))
	body, _ := json.Marshal(models.InvokeRequest{
		ModelRID: m.RID,
		Messages: []models.Message{{Role: "user", Content: "ping"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/invoke", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadGateway, rec.Code)
	assert.Contains(t, rec.Body.String(), "AZURE_OPENAI_API_KEY")
}

func TestInvoke_BadRequest_EmptyMessages_Returns400(t *testing.T) {
	t.Parallel()
	_, inv, _, _, _, modelRID := buildInvokeFixture(t, 10, 10)
	handler := withClaimsMiddleware(newAuthedClaims(), http.HandlerFunc(inv.InvokeModel))
	body, _ := json.Marshal(models.InvokeRequest{ModelRID: modelRID})
	req := httptest.NewRequest(http.MethodPost, "/invoke", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func splitJSONLines(buf *bytes.Buffer) []map[string]any {
	out := []map[string]any{}
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if line == "" {
			continue
		}
		var rec map[string]any
		_ = json.Unmarshal([]byte(line), &rec)
		out = append(out, rec)
	}
	return out
}
