// Package handlers wires the HTTP surface for the lifecycle CRUD
// (POST/GET/PATCH/DELETE /api/v1/deployments).
package handlers

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	statemachine "github.com/openfoundry/openfoundry-go/libs/state-machine"
	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/domain"
	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/repo"
)

// DeploymentsHandlers is the chi-compatible lifecycle handler struct.
type DeploymentsHandlers struct {
	Repo repo.DeploymentRepository
}

// New returns a fresh handler bound to the given repository.
func New(r repo.DeploymentRepository) *DeploymentsHandlers {
	return &DeploymentsHandlers{Repo: r}
}

// Mount attaches every lifecycle route under prefix on r.
func (h *DeploymentsHandlers) Mount(r chi.Router, prefix string) {
	r.Route(prefix, func(sr chi.Router) {
		sr.Post("/", h.Create)
		sr.Get("/", h.List)
		sr.Get("/{id}", h.Get)
		sr.Patch("/{id}/status", h.UpdateStatus)
		sr.Delete("/{id}", h.Delete)
	})
}

// Create handles POST /api/v1/deployments.
func (h *DeploymentsHandlers) Create(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body models.CreateDeploymentRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.ModelID == uuid.Nil {
		writeJSONErr(w, http.StatusBadRequest, "model_id is required")
		return
	}
	body.Version = strings.TrimSpace(body.Version)
	if body.Version == "" {
		writeJSONErr(w, http.StatusBadRequest, "version is required")
		return
	}
	d, err := h.Repo.Create(r.Context(), models.Deployment{
		ModelID:     body.ModelID,
		Version:     body.Version,
		Status:      models.DeploymentStatusPending,
		EndpointURL: strings.TrimSpace(body.EndpointURL),
		OwnerUserID: caller.Sub,
	})
	if errors.Is(err, repo.ErrConflict) {
		writeJSONErr(w, http.StatusConflict, "deployment already exists")
		return
	}
	if err != nil {
		slog.Error("create deployment", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "create failed")
		return
	}
	writeJSON(w, http.StatusCreated, d)
}

// List handles GET /api/v1/deployments?status=&owner=.
func (h *DeploymentsHandlers) List(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	filter := models.ListFilter{}
	if raw := strings.TrimSpace(r.URL.Query().Get("status")); raw != "" {
		s := models.DeploymentStatus(raw)
		if !s.Valid() {
			writeJSONErr(w, http.StatusBadRequest, "invalid status")
			return
		}
		filter.Status = s
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("owner")); raw != "" {
		owner, err := uuid.Parse(raw)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, "invalid owner")
			return
		}
		filter.OwnerUserID = &owner
	}
	items, err := h.Repo.List(r.Context(), filter)
	if err != nil {
		slog.Error("list deployments", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "list failed")
		return
	}
	writeJSON(w, http.StatusOK, listResponse{Items: items})
}

type listResponse struct {
	Items []models.Deployment `json:"items"`
}

// Get handles GET /api/v1/deployments/{id}.
func (h *DeploymentsHandlers) Get(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	d, err := h.Repo.GetByID(r.Context(), id)
	if errors.Is(err, repo.ErrNotFound) {
		writeJSONErr(w, http.StatusNotFound, "deployment not found")
		return
	}
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, "get failed")
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// UpdateStatus handles PATCH /api/v1/deployments/{id}/status. The new
// status must be reachable from the current one per the state-machine
// graph in domain.DeploymentMachine.
func (h *DeploymentsHandlers) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body models.UpdateStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if !body.Status.Valid() {
		writeJSONErr(w, http.StatusBadRequest, "invalid status")
		return
	}
	current, err := h.Repo.GetByID(r.Context(), id)
	if errors.Is(err, repo.ErrNotFound) {
		writeJSONErr(w, http.StatusNotFound, "deployment not found")
		return
	}
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, "get failed")
		return
	}
	if current.OwnerUserID != caller.Sub {
		writeJSONErr(w, http.StatusForbidden, "not the deployment owner")
		return
	}
	machine := &domain.DeploymentMachine{ID: current.ID, State: current.Status}
	if err := machine.Apply(domain.StatusEvent{Target: body.Status}); err != nil {
		if statemachine.IsTransitionError(err) {
			writeJSONErr(w, http.StatusConflict, err.Error())
			return
		}
		writeJSONErr(w, http.StatusInternalServerError, "transition failed")
		return
	}
	updated, err := h.Repo.UpdateStatus(r.Context(), id, machine.State)
	if errors.Is(err, repo.ErrNotFound) {
		writeJSONErr(w, http.StatusNotFound, "deployment not found")
		return
	}
	if err != nil {
		slog.Error("update deployment status", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "update failed")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// Delete handles DELETE /api/v1/deployments/{id}.
func (h *DeploymentsHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	current, err := h.Repo.GetByID(r.Context(), id)
	if errors.Is(err, repo.ErrNotFound) {
		writeJSONErr(w, http.StatusNotFound, "deployment not found")
		return
	}
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, "get failed")
		return
	}
	if current.OwnerUserID != caller.Sub {
		writeJSONErr(w, http.StatusForbidden, "not the deployment owner")
		return
	}
	if err := h.Repo.Delete(r.Context(), id); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			writeJSONErr(w, http.StatusNotFound, "deployment not found")
			return
		}
		writeJSONErr(w, http.StatusInternalServerError, "delete failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
