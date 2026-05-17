// Package handlers exposes the LLM catalog admin CRUD + the unified
// invoke endpoint.
//
// Routing is wired in server.go:
//   - /api/v1/llm/models{,/...}  — admin-only CRUD (RequireAdmin guard)
//   - /api/v1/llm/invoke         — any authenticated caller
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/repo"
)

// Catalog wraps the Store and exposes the admin CRUD HTTP handlers.
type Catalog struct {
	Store repo.Store
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

type errorBody struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorBody{Error: msg})
}

func (c *Catalog) RegisterModel(w http.ResponseWriter, r *http.Request) {
	var body models.RegisterModelRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	body.Provider = models.NormalizeProvider(string(body.Provider))
	if !body.Provider.IsValid() {
		writeError(w, http.StatusBadRequest, "provider must be one of ANTHROPIC, OPENAI, OLLAMA, BEDROCK")
		return
	}
	if strings.TrimSpace(body.ModelID) == "" {
		writeError(w, http.StatusBadRequest, "model_id is required")
		return
	}
	if strings.TrimSpace(body.DisplayName) == "" {
		body.DisplayName = body.ModelID
	}
	for _, cap := range body.Capabilities {
		if !cap.IsValid() {
			writeError(w, http.StatusBadRequest, "capability must be one of TEXT, VISION, TOOLS")
			return
		}
	}
	m, err := c.Store.Register(r.Context(), body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (c *Catalog) ListModels(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	provider := models.NormalizeProvider(q.Get("provider"))
	if provider != "" && !provider.IsValid() {
		writeError(w, http.StatusBadRequest, "provider must be one of ANTHROPIC, OPENAI, OLLAMA, BEDROCK")
		return
	}
	onlyEnabled := q.Get("only_enabled") == "true"
	out, err := c.Store.List(r.Context(), provider, onlyEnabled)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.ListModelsResponse{Data: out})
}

func (c *Catalog) GetModel(w http.ResponseWriter, r *http.Request) {
	rid, err := uuid.Parse(chi.URLParam(r, "rid"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "rid must be a uuid")
		return
	}
	m, err := c.Store.Get(r.Context(), rid)
	if errors.Is(err, repo.ErrModelNotFound) {
		writeError(w, http.StatusNotFound, "model not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (c *Catalog) setEnabled(w http.ResponseWriter, r *http.Request, enabled bool) {
	rid, err := uuid.Parse(chi.URLParam(r, "rid"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "rid must be a uuid")
		return
	}
	m, err := c.Store.SetEnabled(r.Context(), rid, enabled)
	if errors.Is(err, repo.ErrModelNotFound) {
		writeError(w, http.StatusNotFound, "model not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (c *Catalog) EnableModel(w http.ResponseWriter, r *http.Request)  { c.setEnabled(w, r, true) }
func (c *Catalog) DisableModel(w http.ResponseWriter, r *http.Request) { c.setEnabled(w, r, false) }
