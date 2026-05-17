package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/lineagegraph"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/openlineage"
)

// GraphHandlers wraps the OpenLineage graph repository for the
// HTTP-handler layer.
//
// The legacy /api/v1/lineage/datasets/{id} handlers in [Handlers] are
// untouched — these endpoints are additive (`/upstream/{rid}`,
// `/downstream/{rid}`, `/job/{ns}/{name}/runs`, `POST /events`) and
// the two graphs coexist in the database.
type GraphHandlers struct {
	Graph *lineagegraph.Repo
}

// NewGraphHandlers wires a *Repo into HTTP handlers.
func NewGraphHandlers(g *lineagegraph.Repo) *GraphHandlers { return &GraphHandlers{Graph: g} }

// Upstream serves GET /api/v1/lineage/upstream/{rid}?depth=N.
//
// `rid` may be any URL-encoded text — the canonical form emitted by
// the OL adapter is `<namespace>/<name>`, but tests pass plain `A`,
// `B`, … to make the BFS shape obvious.
func (h *GraphHandlers) Upstream(w http.ResponseWriter, r *http.Request) {
	h.bfsResponse(w, r, true)
}

// Downstream serves GET /api/v1/lineage/downstream/{rid}?depth=N.
func (h *GraphHandlers) Downstream(w http.ResponseWriter, r *http.Request) {
	h.bfsResponse(w, r, false)
}

func (h *GraphHandlers) bfsResponse(w http.ResponseWriter, r *http.Request, upstream bool) {
	rid, err := extractRID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	depth := 1
	if v := strings.TrimSpace(r.URL.Query().Get("depth")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "depth must be an integer")
			return
		}
		depth = n
	}
	var (
		graph *lineagegraph.GraphResponse
	)
	if upstream {
		graph, err = h.Graph.Upstream(r.Context(), rid, depth)
	} else {
		graph, err = h.Graph.Downstream(r.Context(), rid, depth)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSONPlain(w, http.StatusOK, graph)
}

// JobRuns serves GET /api/v1/lineage/job/{namespace}/{name}/runs.
//
// The path is split into two segments rather than a single composite
// because chi's URLParam doesn't tolerate slashes inside one segment.
// Limit is fixed at 50 to match the task contract.
func (h *GraphHandlers) JobRuns(w http.ResponseWriter, r *http.Request) {
	ns := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	if ns == "" || name == "" {
		writeError(w, http.StatusBadRequest, "namespace and name are required")
		return
	}
	runs, err := h.Graph.JobRuns(r.Context(), ns, name, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSONPlain(w, http.StatusOK, map[string]any{"runs": runs})
}

// PostEvent serves POST /api/v1/lineage/events with an OpenLineage
// RunEvent body. This is the dual entrypoint for producers that can't
// (or won't) speak Kafka.
func (h *GraphHandlers) PostEvent(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	ev, err := openlineage.DecodeEvent(body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.Graph.Ingest(r.Context(), ev); err != nil {
		if errors.Is(err, openlineage.ErrInvalidEvent) {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

// extractRID pulls the path parameter and URL-unescapes it. The
// canonical form is `<namespace>/<name>`, but the wildcard route lets
// callers pass an already-encoded `kafka%2Ftopic-a` form too.
func extractRID(r *http.Request) (string, error) {
	raw := chi.URLParam(r, "rid")
	if raw == "" {
		// Fall back to the chi wildcard parameter.
		raw = chi.URLParam(r, "*")
	}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("dataset rid is required")
	}
	decoded, err := url.PathUnescape(raw)
	if err != nil {
		return "", err
	}
	return decoded, nil
}

// writeJSONPlain is the non-query-plan-decorated JSON writer used by
// the OL graph endpoints. The legacy `writeJSON` in handlers.go writes
// the x-openfoundry-lineage-* headers that only apply to the older
// query router; the OL graph never sits behind that router.
func writeJSONPlain(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
