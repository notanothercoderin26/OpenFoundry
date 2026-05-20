// HTTP handlers for the "Add description" Properties helper. Three
// CRUD endpoints mounted under /api/v1/lineage/nodes/{id}/description.

package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/lineage"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/queryrouter"
)

// NodeDescriptionRepo is the persistence surface the handlers need.
// The concrete *lineage.NodeDescriptionRepo satisfies it; handler
// tests use an in-memory fake.
type NodeDescriptionRepo interface {
	Get(ctx context.Context, nodeID uuid.UUID) (*models.NodeDescription, error)
	Upsert(ctx context.Context, nodeID, ownerID uuid.UUID, description string) (*models.NodeDescription, error)
	Delete(ctx context.Context, nodeID uuid.UUID) error
}

// NodeDescriptionHandlers groups the three description entrypoints.
type NodeDescriptionHandlers struct {
	Repo NodeDescriptionRepo
}

// NewNodeDescriptionHandlers wires the persistence layer.
func NewNodeDescriptionHandlers(repo NodeDescriptionRepo) *NodeDescriptionHandlers {
	return &NodeDescriptionHandlers{Repo: repo}
}

// Get returns the persisted description for the node or 404.
func (h *NodeDescriptionHandlers) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	desc, err := h.Repo.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, lineage.ErrNodeDescriptionNotFound) {
			writeError(w, http.StatusNotFound, "description not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, desc, queryrouter.QueryPlan{})
}

// Upsert overwrites the description. Empty body deletes the row and
// returns 204 (idempotent on the wire).
func (h *NodeDescriptionHandlers) Upsert(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "missing auth claims")
		return
	}
	ownerID := claims.Sub
	if ownerID == uuid.Nil {
		writeError(w, http.StatusBadRequest, "auth subject is empty")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	var body models.UpsertNodeDescriptionRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	upserted, err := h.Repo.Upsert(r.Context(), id, ownerID, body.Description)
	if err != nil {
		if errors.Is(err, lineage.ErrNodeDescriptionNotFound) {
			// Sanitized to empty → the repo deleted the row. Return
			// 204 so the frontend knows the description is now clear.
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, upserted, queryrouter.QueryPlan{})
}

// Delete removes the description. 204 either way (idempotent verb)
// to match Foundry's "clear" UX, even when the row was already missing.
func (h *NodeDescriptionHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	if err := h.Repo.Delete(r.Context(), id); err != nil && !errors.Is(err, lineage.ErrNodeDescriptionNotFound) {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
