package handlers

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/repo"
)

// Invoke wraps everything the /api/v1/llm/invoke endpoint needs: the
// catalog store (model lookup), the provider registry (dispatch), the
// rate limiter, and the Prometheus collectors.
type Invoke struct {
	Store     repo.Store
	Providers *ProviderRegistry
	Limiter   *RateLimiter
	Metrics   *InvokeMetrics
	Logger    *slog.Logger // nil falls back to slog.Default
}

const maxInvokeBodyBytes = 256 * 1024

type rawBodyCtxKey struct{}

// CaptureRawBody is a chi middleware that reads the request body into
// memory, exposes it via context (so the audit log can hash it) and
// restores r.Body so the JSON decoder still works. Enforces a 256 KB
// cap — the invoke surface should not accept multi-MB payloads.
func CaptureRawBody() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body == nil {
				next.ServeHTTP(w, r)
				return
			}
			limited := http.MaxBytesReader(w, r.Body, maxInvokeBodyBytes)
			raw, err := io.ReadAll(limited)
			_ = r.Body.Close()
			if err != nil {
				writeError(w, http.StatusRequestEntityTooLarge, "request body too large")
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(raw))
			ctx := context.WithValue(r.Context(), rawBodyCtxKey{}, raw)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// InvokeModel is the POST /api/v1/llm/invoke handler.
//
// Flow:
//  1. Resolve the calling subject from authmw.Claims (401 if missing).
//  2. Decode + validate the body (400 on bad input).
//  3. Look up the model by rid (404; 503 when disabled).
//  4. Token-bucket rate-limit per (subject, model) (429 on overflow).
//  5. Dispatch to the provider invoker.
//  6. Emit Prometheus counters + an audit slog line (category=audit,
//     kind=llm.invoke). The prompt body is intentionally not logged —
//     only its sha256 hash, token counts and cost.
func (h *Invoke) InvokeModel(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req models.InvokeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	if req.ModelRID == uuid.Nil {
		writeError(w, http.StatusBadRequest, "model_rid is required")
		return
	}
	if len(req.Messages) == 0 {
		writeError(w, http.StatusBadRequest, "messages cannot be empty")
		return
	}

	model, err := h.Store.Get(r.Context(), req.ModelRID)
	if errors.Is(err, repo.ErrModelNotFound) {
		writeError(w, http.StatusNotFound, "model not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !model.Enabled {
		writeError(w, http.StatusServiceUnavailable, "model is disabled")
		return
	}

	subject := claims.Sub.String()
	if !h.Limiter.Allow(subject, model.RID) {
		writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}

	invoker, err := h.Providers.Lookup(model.Provider)
	if err != nil {
		writeError(w, http.StatusNotImplemented, err.Error())
		return
	}

	started := time.Now()
	result, err := invoker.Invoke(r.Context(), model, req)
	latency := time.Since(started)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		h.emitAudit(r, claims, model, providerResult{}, 0, latency, err)
		return
	}

	costUSD := estimateCostUSD(model, result.PromptTokens, result.CompletionTokens)
	h.recordMetrics(model, result, costUSD)
	h.emitAudit(r, claims, model, result, costUSD, latency, nil)

	resp := models.InvokeResponse{
		Messages: []models.Message{{Role: "assistant", Content: result.Content}},
		Usage: models.Usage{
			PromptTokens:     result.PromptTokens,
			CompletionTokens: result.CompletionTokens,
			TotalTokens:      result.PromptTokens + result.CompletionTokens,
		},
		ModelRID: model.RID,
		CostUSD:  costUSD,
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Invoke) recordMetrics(model models.Model, result providerResult, costUSD float64) {
	if h.Metrics == nil {
		return
	}
	if result.PromptTokens > 0 {
		h.Metrics.Tokens.WithLabelValues(model.ModelID, "input").Add(float64(result.PromptTokens))
	}
	if result.CompletionTokens > 0 {
		h.Metrics.Tokens.WithLabelValues(model.ModelID, "output").Add(float64(result.CompletionTokens))
	}
	if costUSD > 0 {
		h.Metrics.Cost.WithLabelValues(model.ModelID).Add(costUSD)
	}
}

// emitAudit writes one `category=audit` structured slog record per
// invocation. The audit-compliance collector subscribes on that
// category — same path the chi audit middleware uses. Prompt body is
// intentionally not logged: only the sha256 of the request payload,
// plus token counts and cost.
func (h *Invoke) emitAudit(
	r *http.Request,
	claims *authmw.Claims,
	model models.Model,
	result providerResult,
	costUSD float64,
	latency time.Duration,
	invokeErr error,
) {
	lg := h.Logger
	if lg == nil {
		lg = slog.Default()
	}
	status := "ok"
	if invokeErr != nil {
		status = "error"
	}
	attrs := []slog.Attr{
		slog.String("category", "audit"),
		slog.String("kind", "llm.invoke"),
		slog.String("actor", claims.Sub.String()),
		slog.String("model_rid", model.RID.String()),
		slog.String("model_id", model.ModelID),
		slog.String("provider", string(model.Provider)),
		slog.String("status", status),
		slog.Int("prompt_tokens", int(result.PromptTokens)),
		slog.Int("completion_tokens", int(result.CompletionTokens)),
		slog.Float64("cost_usd", costUSD),
		slog.Int64("latency_ms", latency.Milliseconds()),
		slog.String("request_body_sha256", hashRequestBody(r)),
	}
	if invokeErr != nil {
		attrs = append(attrs, slog.String("error", invokeErr.Error()))
	}
	lg.LogAttrs(r.Context(), slog.LevelInfo, "llm.invoke", attrs...)
}

func hashRequestBody(r *http.Request) string {
	raw, ok := r.Context().Value(rawBodyCtxKey{}).([]byte)
	if !ok || len(raw) == 0 {
		return ""
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func estimateCostUSD(model models.Model, promptTokens, completionTokens int32) float64 {
	return (float64(promptTokens)/1000.0)*model.InputCostPer1K +
		(float64(completionTokens)/1000.0)*model.OutputCostPer1K
}
