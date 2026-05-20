package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/reindex"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/status"
)

// ReindexDeps bundles the dependencies the reindex HTTP handlers need.
// A nil Source disables the endpoints — useful when the operator has
// not configured OBJECT_DATABASE_URL and we want to keep the worker
// running for streaming-only consumption.
type ReindexDeps struct {
	Source   reindex.ObjectsSource
	Backend  searchabstraction.SearchBackend
	Tracker  *status.Tracker
	Registry *reindex.Registry
	PageSize uint32
	Log      *slog.Logger
	// run isolates "spawn a goroutine to do the backfill" so tests can
	// drive it synchronously.
	run func(jobID string, tenant repos.TenantId, typeID repos.TypeId)
}

func (d *ReindexDeps) configured() bool {
	return d != nil && d.Source != nil && d.Backend != nil && d.Registry != nil
}

func newReindexStartHandler(deps *ReindexDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !deps.configured() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "reindex endpoint not configured (OBJECT_DATABASE_URL missing)",
			})
			return
		}
		objectType := strings.TrimSpace(r.URL.Query().Get("objectType"))
		tenant := strings.TrimSpace(r.URL.Query().Get("tenant"))
		if objectType == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "objectType query parameter required"})
			return
		}
		if tenant == "" {
			tenant = "default"
		}
		job := deps.Registry.Create(repos.TenantId(tenant), repos.TypeId(objectType))
		spawn := deps.run
		if spawn == nil {
			spawn = func(id string, t repos.TenantId, ty repos.TypeId) {
				go runBackfill(deps, id, t, ty)
			}
		}
		spawn(job.ID, repos.TenantId(tenant), repos.TypeId(objectType))
		writeJSON(w, http.StatusAccepted, map[string]any{
			"job_id":     job.ID,
			"status":     string(reindex.JobPending),
			"status_url": "/api/v1/ontology-indexer/reindex/" + job.ID,
			"tenant":     tenant,
			"object_type": objectType,
		})
	}
}

func newReindexStatusHandler(deps *ReindexDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !deps.configured() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "reindex endpoint not configured (OBJECT_DATABASE_URL missing)",
			})
			return
		}
		id := chi.URLParam(r, "job_id")
		if id == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "job_id required"})
			return
		}
		job := deps.Registry.Get(id)
		if job == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
			return
		}
		writeJSON(w, http.StatusOK, job)
	}
}

// runBackfill is the goroutine entry point for the start handler.
// Exposed so the spawn function can target it from tests.
func runBackfill(deps *ReindexDeps, jobID string, tenant repos.TenantId, typeID repos.TypeId) {
	deps.Registry.MarkRunning(jobID)
	runner := &reindex.Runner{
		Source:   deps.Source,
		Backend:  deps.Backend,
		Tracker:  deps.Tracker,
		PageSize: deps.PageSize,
		Log:      deps.Log,
	}
	res, err := runner.Backfill(context.Background(), tenant, typeID)
	if err != nil {
		deps.Registry.Fail(jobID, res, err)
		return
	}
	deps.Registry.Complete(jobID, res)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
