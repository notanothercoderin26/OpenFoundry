// HTTP handlers for the Foundry "Save / Open graph" + "Get quick
// share link" lifecycle. Authenticated endpoints sit under
// /api/v1/lineage/saved-graphs; the unauthenticated read-only
// endpoint that resolves a share token sits at
// /api/v1/lineage/shared/{token} so it can be mounted outside the
// auth middleware group.

package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/lineage"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/queryrouter"
)

// SavedGraphRepo abstracts the persistence layer so handler tests
// can substitute an in-memory implementation. The concrete
// *lineage.SavedGraphRepo satisfies it.
type SavedGraphRepo interface {
	Create(ctx context.Context, ownerID uuid.UUID, in models.CreateSavedGraphRequest) (*models.SavedGraph, error)
	List(ctx context.Context, ownerID uuid.UUID) ([]models.SavedGraph, error)
	Get(ctx context.Context, ownerID, id uuid.UUID) (*models.SavedGraph, error)
	Update(ctx context.Context, ownerID, id uuid.UUID, in models.UpdateSavedGraphRequest) (*models.SavedGraph, error)
	Delete(ctx context.Context, ownerID, id uuid.UUID) error
	Share(ctx context.Context, ownerID, id uuid.UUID, readOnly bool) (*models.SavedGraph, error)
	RevokeShare(ctx context.Context, ownerID, id uuid.UUID) (*models.SavedGraph, error)
	GetByShareToken(ctx context.Context, token string) (*models.SavedGraph, error)
}

// SavedGraphHandlers groups the saved-graph HTTP entrypoints.
type SavedGraphHandlers struct {
	Repo SavedGraphRepo
}

// NewSavedGraphHandlers wires the persistence layer.
func NewSavedGraphHandlers(repo SavedGraphRepo) *SavedGraphHandlers {
	return &SavedGraphHandlers{Repo: repo}
}

// List returns the caller's saved graphs newest-first.
func (h *SavedGraphHandlers) List(w http.ResponseWriter, r *http.Request) {
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
	graphs, err := h.Repo.List(r.Context(), ownerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": graphs}, queryrouter.QueryPlan{})
}

// Create persists a new saved graph for the calling user.
func (h *SavedGraphHandlers) Create(w http.ResponseWriter, r *http.Request) {
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
	var body models.CreateSavedGraphRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	created, err := h.Repo.Create(r.Context(), ownerID, body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created, queryrouter.QueryPlan{})
}

// Get returns one saved graph owned by the caller.
func (h *SavedGraphHandlers) Get(w http.ResponseWriter, r *http.Request) {
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
	graph, err := h.Repo.Get(r.Context(), ownerID, id)
	if err != nil {
		if errors.Is(err, lineage.ErrSavedGraphNotFound) {
			writeError(w, http.StatusNotFound, "saved graph not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, graph, queryrouter.QueryPlan{})
}

// Update patches the saved graph identified by `id`.
func (h *SavedGraphHandlers) Update(w http.ResponseWriter, r *http.Request) {
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
	var body models.UpdateSavedGraphRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := h.Repo.Update(r.Context(), ownerID, id, body)
	if err != nil {
		if errors.Is(err, lineage.ErrSavedGraphNotFound) {
			writeError(w, http.StatusNotFound, "saved graph not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated, queryrouter.QueryPlan{})
}

// Delete removes the saved graph identified by `id`.
func (h *SavedGraphHandlers) Delete(w http.ResponseWriter, r *http.Request) {
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
	if err := h.Repo.Delete(r.Context(), ownerID, id); err != nil {
		if errors.Is(err, lineage.ErrSavedGraphNotFound) {
			writeError(w, http.StatusNotFound, "saved graph not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Share mints (or refreshes) a share token for the saved graph.
func (h *SavedGraphHandlers) Share(w http.ResponseWriter, r *http.Request) {
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
	// Default is read-only — Foundry's "Get quick share link" only
	// ever emits read-only links. The flag is wire-level future-proof
	// in case we add edit-collab links later.
	readOnly := true
	if value := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("read_only"))); value == "false" || value == "0" {
		readOnly = false
	}
	graph, err := h.Repo.Share(r.Context(), ownerID, id, readOnly)
	if err != nil {
		if errors.Is(err, lineage.ErrSavedGraphNotFound) {
			writeError(w, http.StatusNotFound, "saved graph not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if graph.ShareToken == nil || graph.SharedAt == nil {
		writeError(w, http.StatusInternalServerError, "share token not set after mint")
		return
	}
	writeJSON(w, http.StatusOK, models.ShareTokenResponse{
		Token:    *graph.ShareToken,
		ReadOnly: graph.ShareReadOnly,
		SharedAt: *graph.SharedAt,
	}, queryrouter.QueryPlan{})
}

// RevokeShare clears the share token on the saved graph.
func (h *SavedGraphHandlers) RevokeShare(w http.ResponseWriter, r *http.Request) {
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
	if _, err := h.Repo.RevokeShare(r.Context(), ownerID, id); err != nil {
		if errors.Is(err, lineage.ErrSavedGraphNotFound) {
			writeError(w, http.StatusNotFound, "saved graph not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetShared resolves an anonymous read-only request by token. Mounted
// OUTSIDE the auth middleware group so an unauthenticated viewer can
// open a presentation link without signing in.
func (h *SavedGraphHandlers) GetShared(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	graph, err := h.Repo.GetByShareToken(r.Context(), token)
	if err != nil {
		if errors.Is(err, lineage.ErrSavedGraphNotFound) {
			writeError(w, http.StatusNotFound, "share link not found or revoked")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, lineage.SharedResponseFrom(graph), queryrouter.QueryPlan{})
}

