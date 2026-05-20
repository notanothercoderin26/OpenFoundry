package handler

import (
	"context"
	"net/http"
	"sync/atomic"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

// ComputeProfileRepository persists the build compute profile catalog.
type ComputeProfileRepository interface {
	ListComputeProfiles(ctx context.Context) ([]models.ComputeProfile, error)
	ComputeProfileExists(ctx context.Context, slug string) (bool, error)
}

type computeProfileSlot struct {
	repo ComputeProfileRepository
}

var computeProfileRepository atomic.Value // stores *computeProfileSlot

// SetComputeProfileRepository injects the persistence adapter and returns
// a restore function so tests can isolate handler globals.
func SetComputeProfileRepository(repo ComputeProfileRepository) func() {
	previous, _ := computeProfileRepository.Load().(*computeProfileSlot)
	if previous == nil {
		previous = &computeProfileSlot{}
	}
	computeProfileRepository.Store(&computeProfileSlot{repo: repo})
	return func() { computeProfileRepository.Store(previous) }
}

func currentComputeProfileRepository() (ComputeProfileRepository, bool) {
	slot, _ := computeProfileRepository.Load().(*computeProfileSlot)
	if slot == nil || slot.repo == nil {
		return nil, false
	}
	return slot.repo, true
}

// ListComputeProfiles serves GET /compute-profiles. Any authenticated
// principal can read the catalog.
func ListComputeProfiles(w http.ResponseWriter, r *http.Request) {
	repo, ok := currentComputeProfileRepository()
	if !ok {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":  "compute_profile_repository_not_configured",
			"detail": "ListComputeProfiles requires DATABASE_URL-backed compute_profiles wiring",
		})
		return
	}
	items, err := repo.ListComputeProfiles(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_compute_profiles_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}
