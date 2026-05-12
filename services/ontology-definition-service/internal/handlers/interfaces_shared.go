// Read-only list endpoints for `/ontology/interfaces` and
// `/ontology/shared-property-types`. The Ontology Manager UI loads
// both on first paint; before this slice the routes were unmounted
// and the page rendered "Not Found" with a console 404.
package handlers

import (
	"log/slog"
	"net/http"
	"strconv"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
)

const (
	defaultListPerPage = 50
	maxListPerPage     = 500
)

func parsePaging(r *http.Request) (page, perPage int) {
	page = 1
	perPage = defaultListPerPage
	if raw := r.URL.Query().Get("page"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			page = v
		}
	}
	if raw := r.URL.Query().Get("per_page"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			if v > maxListPerPage {
				v = maxListPerPage
			}
			perPage = v
		}
	}
	return page, perPage
}

func (h *Handlers) ListInterfaces(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	page, perPage := parsePaging(r)
	search := r.URL.Query().Get("search")
	items, total, err := h.Repo.ListInterfaces(r.Context(), page, perPage, search)
	if err != nil {
		slog.Error("list interfaces", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list interfaces")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data":     items,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func (h *Handlers) ListSharedPropertyTypes(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	page, perPage := parsePaging(r)
	search := r.URL.Query().Get("search")
	items, total, err := h.Repo.ListSharedPropertyTypes(r.Context(), page, perPage, search)
	if err != nil {
		slog.Error("list shared property types", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list shared property types")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data":     items,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}
