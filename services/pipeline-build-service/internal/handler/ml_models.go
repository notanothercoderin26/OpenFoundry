package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

// MLModelRepository persists the trained-model registry.
type MLModelRepository interface {
	ListMLModels(ctx context.Context) ([]models.MLModel, error)
	GetMLModel(ctx context.Context, idOrSlug string) (*models.MLModel, error)
	CreateMLModel(ctx context.Context, req models.CreateMLModelRequest, ownerID *uuid.UUID) (*models.MLModel, error)
	DeleteMLModel(ctx context.Context, id uuid.UUID) (bool, error)
}

type mlModelSlot struct {
	repo MLModelRepository
}

var mlModelRepository atomic.Value // stores *mlModelSlot

// SetMLModelRepository injects the persistence adapter and returns a restore
// function for tests.
func SetMLModelRepository(repo MLModelRepository) func() {
	previous, _ := mlModelRepository.Load().(*mlModelSlot)
	if previous == nil {
		previous = &mlModelSlot{}
	}
	mlModelRepository.Store(&mlModelSlot{repo: repo})
	return func() { mlModelRepository.Store(previous) }
}

func currentMLModelRepository() (MLModelRepository, bool) {
	slot, _ := mlModelRepository.Load().(*mlModelSlot)
	if slot == nil || slot.repo == nil {
		return nil, false
	}
	return slot.repo, true
}

func requireMLModelRepository(w http.ResponseWriter, detail string) (MLModelRepository, bool) {
	repo, ok := currentMLModelRepository()
	if !ok {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "ml_model_repository_not_configured", "detail": detail})
		return nil, false
	}
	return repo, true
}

// GET /ml-models — any authenticated principal can list the catalog.
func ListMLModels(w http.ResponseWriter, r *http.Request) {
	repo, ok := requireMLModelRepository(w, "ListMLModels requires DATABASE_URL-backed ml_models wiring")
	if !ok {
		return
	}
	items, err := repo.ListMLModels(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_ml_models_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /ml-models/{id} — any authenticated principal.
func GetMLModel(w http.ResponseWriter, r *http.Request) {
	repo, ok := requireMLModelRepository(w, "GetMLModel requires DATABASE_URL-backed ml_models wiring")
	if !ok {
		return
	}
	idOrSlug := strings.TrimSpace(chi.URLParam(r, "id"))
	if idOrSlug == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_ml_model_id"})
		return
	}
	model, err := repo.GetMLModel(r.Context(), idOrSlug)
	if err != nil {
		if isMLModelNotFound(err) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "ml_model_not_found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "get_ml_model_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, model)
}

// POST /ml-models — register a new trained model. Owner-only is loose: any
// authenticated principal can register since the registry is platform-wide.
func CreateMLModel(w http.ResponseWriter, r *http.Request) {
	repo, ok := requireMLModelRepository(w, "CreateMLModel requires DATABASE_URL-backed ml_models wiring")
	if !ok {
		return
	}
	if actorIDFromRequest(r) == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing_principal"})
		return
	}
	var req models.CreateMLModelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "detail": err.Error()})
		return
	}
	model, err := repo.CreateMLModel(r.Context(), req, actorIDFromRequest(r))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "create_ml_model_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, model)
}

// DELETE /ml-models/{id} — owner of the model only.
func DeleteMLModel(w http.ResponseWriter, r *http.Request) {
	repo, ok := requireMLModelRepository(w, "DeleteMLModel requires DATABASE_URL-backed ml_models wiring")
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_ml_model_id", "detail": err.Error()})
		return
	}
	actor := actorIDFromRequest(r)
	if actor == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing_principal"})
		return
	}
	model, err := repo.GetMLModel(r.Context(), id.String())
	if err != nil {
		if isMLModelNotFound(err) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ml_model_lookup_failed", "detail": err.Error()})
		return
	}
	if model.OwnerID != nil && *model.OwnerID != *actor {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "owner_required"})
		return
	}
	removed, err := repo.DeleteMLModel(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete_ml_model_failed", "detail": err.Error()})
		return
	}
	if !removed {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func isMLModelNotFound(err error) bool {
	if err == nil {
		return false
	}
	// Match the postgres-layer sentinel by string so the handler avoids a
	// circular dep on the postgres package.
	return errors.Is(err, errMLModelNotFoundSentinel) || err.Error() == "ml model not found"
}

var errMLModelNotFoundSentinel = errors.New("ml model not found")
