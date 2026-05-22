package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/domain/agents"
	kernelmodels "github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/models"
	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/react"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/repo"
)

// Threads is the B07 HTTP shell. Wires CRUD + the ReAct loop driven
// by POST /messages.
type Threads struct {
	Repo   *repo.ThreadsRepo
	Runner *react.Runner
}

// Create handles POST /api/v1/threads.
func (h *Threads) Create(w http.ResponseWriter, r *http.Request) {
	var body models.CreateThreadRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body: " + err.Error()})
		return
	}
	userID := userIDFromClaims(r)
	thread, err := h.Repo.CreateThread(r.Context(), userID, body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, thread)
}

// List handles GET /api/v1/threads?limit=N.
func (h *Threads) List(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromClaims(r)
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	threads, err := h.Repo.ListThreads(r.Context(), userID, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, models.ThreadListResponse{Data: threads})
}

// Get handles GET /api/v1/threads/{id}.
func (h *Threads) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := threadIDParam(w, r)
	if !ok {
		return
	}
	thread, err := h.Repo.GetThread(r.Context(), id)
	if errors.Is(err, repo.ErrThreadNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "thread not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, thread)
}

// Delete handles DELETE /api/v1/threads/{id}.
func (h *Threads) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := threadIDParam(w, r)
	if !ok {
		return
	}
	if err := h.Repo.DeleteThread(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListMessages handles GET /api/v1/threads/{id}/messages.
func (h *Threads) ListMessages(w http.ResponseWriter, r *http.Request) {
	id, ok := threadIDParam(w, r)
	if !ok {
		return
	}
	msgs, err := h.Repo.ListMessages(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, models.ThreadMessagesResponse{Data: msgs})
}

// PostMessage handles POST /api/v1/threads/{id}/messages.
//
// Persists the user turn, drives the ReAct loop (when the runner is
// wired), and returns the freshly-persisted assistant + tool turns.
func (h *Threads) PostMessage(w http.ResponseWriter, r *http.Request) {
	id, ok := threadIDParam(w, r)
	if !ok {
		return
	}
	thread, err := h.Repo.GetThread(r.Context(), id)
	if errors.Is(err, repo.ErrThreadNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "thread not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	var body models.PostMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body: " + err.Error()})
		return
	}
	if body.Role == "" {
		body.Role = models.RoleUser
	}
	if body.Content == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "content is required"})
		return
	}

	// Persist the inbound message first so the trace is anchored to
	// a real row even if the ReAct loop fails.
	userMsg, err := h.Repo.AppendMessage(r.Context(), id, body.Role, body.Content, nil, nil, nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	resp := models.PostMessageResponse{UserMessage: *userMsg}
	if body.Role != models.RoleUser || body.FromReplay || h.Runner == nil {
		writeJSON(w, http.StatusAccepted, resp)
		return
	}
	history, err := h.Repo.ListMessages(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	// History returned by ListMessages includes the user message we
	// just appended; the ReAct runner expects "prior history excluding
	// the current user turn" so we slice it off.
	prior := history
	if n := len(history); n > 0 && history[n-1].ID == userMsg.ID {
		prior = history[:n-1]
	}
	// Stamp the initiating user on the context so the tool router can
	// attribute staged Action proposals to a real human, not the
	// agent's service identity (B07 §AC#6 + Foundry "proposal review"
	// semantics — the agent never owns the side effect).
	claims, _ := authmw.FromContext(r.Context())
	runCtx := r.Context()
	if claims != nil {
		runCtx = react.WithInitiatingUser(runCtx, claims.Sub.String())
	}
	result, err := h.Runner.Run(runCtx, react.RunInput{
		Thread:      *thread,
		History:     prior,
		UserMessage: *userMsg,
		CallerJWT:   bearerToken(r),
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "agent runtime: " + err.Error()})
		return
	}
	// Persist tool observations + the final assistant message in the
	// order the LLM produced them.
	for _, obs := range result.ToolMessages {
		toolName := obs.ToolName
		var toolCallID *string
		if obs.ToolCallID != "" {
			id := obs.ToolCallID
			toolCallID = &id
		}
		toolMsg, err := h.Repo.AppendMessage(r.Context(), id, models.RoleTool, obs.Output, &toolName, toolCallID, nil)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		resp.ToolMessages = append(resp.ToolMessages, *toolMsg)
	}
	if result.AssistantContent != "" || result.BudgetExhausted {
		meta := map[string]any{
			"steps_used":       result.StepsUsed,
			"budget_exhausted": result.BudgetExhausted,
			"prompt_tokens":    result.PromptTokensUsed,
		}
		mraw, _ := json.Marshal(meta)
		am, err := h.Repo.AppendMessage(r.Context(), id, models.RoleAssistant, result.AssistantContent, nil, nil, mraw)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		resp.AssistantMessage = am
		resp.BudgetExhausted = result.BudgetExhausted
		resp.StepsUsed = result.StepsUsed
	}
	writeJSON(w, http.StatusOK, resp)
}

// SetMode handles POST /api/v1/threads/{id}/mode.
//
// Body shape:
//
//	{ "mode": "DATA_INTEGRATION",
//	  "mode_config": { ...proto ModeConfig... },
//	  "active_mode_tools": ["native_pipeline", "native_dataset"] }
//
// Validates that `mode` is one of the 9 AgentMode names (case-sensitive,
// matching the threads.mode CHECK constraint and the proto enum), that
// every entry in `active_mode_tools` is a known tool execution mode
// (from kernelmodels.SupportedExecutionModes), and persists all three
// columns in a single UPDATE. Returns the refreshed thread.
//
// `mode_config` is round-tripped as JSON without per-oneof validation —
// the proto is the documentation surface; the storage column is JSONB.
// Empty body for mode_config means "clear settings"; empty
// active_mode_tools means "fall back to the per-mode default".
func (h *Threads) SetMode(w http.ResponseWriter, r *http.Request) {
	id, ok := threadIDParam(w, r)
	if !ok {
		return
	}
	var body models.SetModeRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid body: " + err.Error(),
		})
		return
	}
	mode, err := agents.ValidateAgentMode(body.Mode)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if mode == agents.ModeUnspecified {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "mode is required",
		})
		return
	}
	for _, kind := range body.ActiveModeTools {
		if !kernelmodels.ValidateExecutionMode(kind) {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "unknown tool execution mode: " + kind,
			})
			return
		}
	}
	thread, err := h.Repo.SetThreadMode(
		r.Context(), id, string(mode), body.ModeConfig, body.ActiveModeTools,
	)
	if errors.Is(err, repo.ErrThreadNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "thread not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, thread)
}

// Trace handles GET /api/v1/threads/{id}/trace.
func (h *Threads) Trace(w http.ResponseWriter, r *http.Request) {
	id, ok := threadIDParam(w, r)
	if !ok {
		return
	}
	steps, err := h.Repo.ListTrace(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, models.ThreadTraceResponse{Data: steps})
}

// ── Helpers ─────────────────────────────────────────────────────────

func threadIDParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	raw := chi.URLParam(r, "id")
	id, err := uuid.Parse(raw)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id must be a uuid"})
		return uuid.Nil, false
	}
	return id, true
}

func userIDFromClaims(r *http.Request) *uuid.UUID {
	if claims, ok := authmw.FromContext(r.Context()); ok {
		return &claims.Sub
	}
	return nil
}

func bearerToken(r *http.Request) string {
	v := r.Header.Get("Authorization")
	if v == "" {
		return ""
	}
	const prefix = "Bearer "
	if strings.HasPrefix(v, prefix) {
		return v[len(prefix):]
	}
	return v
}

// repoTraceSink adapts ThreadsRepo to react.TraceSink. Kept on this
// file so the wiring lives next to the handler that consumes it.
type repoTraceSink struct{ Repo *repo.ThreadsRepo }

func (s *repoTraceSink) Append(ctx context.Context, threadID uuid.UUID, messageID *uuid.UUID, kind models.TraceStepKind, toolName *string, payload json.RawMessage, promptTokens, completionTokens, latencyMS int32) error {
	_, err := s.Repo.AppendTraceStep(ctx, threadID, messageID, kind, toolName, payload, promptTokens, completionTokens, latencyMS)
	return err
}

// NewTraceSink returns the production TraceSink adapter.
func NewTraceSink(r *repo.ThreadsRepo) react.TraceSink { return &repoTraceSink{Repo: r} }
