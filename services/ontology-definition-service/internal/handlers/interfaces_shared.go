// HTTP surface for the Foundry-equivalent Interface and Shared
// Property Type resources.
//
// Interface = "shape" that object types can implement for polymorphism
// (Foundry Object Link Types / Type Reference docs).
// Shared Property Type = semantic wrapper around a base type that can
// be reused across object types.
//
// List endpoints power the Ontology Manager catalog selectors; CRUD
// endpoints write through the same transactional outbox path used by
// object types and link types (internal/repo/interfaces_shared.go).
package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
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

// ── Interface CRUD ─────────────────────────────────────────────────────

func (h *Handlers) GetInterface(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	v, err := h.Repo.GetInterface(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		writeJSONErr(w, http.StatusNotFound, "interface not found")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *Handlers) CreateInterface(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body models.CreateOntologyInterfaceRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if body.Name == "" {
		writeJSONErr(w, http.StatusBadRequest, "name is required")
		return
	}
	created, err := h.Repo.CreateInterface(r.Context(), &body, caller.Sub)
	if err != nil {
		slog.Error("create interface", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h *Handlers) UpdateInterface(w http.ResponseWriter, r *http.Request) {
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
	var body models.UpdateOntologyInterfaceRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid json body")
		return
	}
	updated, err := h.Repo.UpdateInterface(r.Context(), id, &body, caller.Sub)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if updated == nil {
		writeJSONErr(w, http.StatusNotFound, "interface not found")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handlers) DeleteInterface(w http.ResponseWriter, r *http.Request) {
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
	deleted, err := h.Repo.DeleteInterface(r.Context(), id, caller.Sub)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "interface not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Shared property type CRUD ──────────────────────────────────────────

func (h *Handlers) GetSharedPropertyType(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	v, err := h.Repo.GetSharedPropertyType(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		writeJSONErr(w, http.StatusNotFound, "shared property type not found")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *Handlers) CreateSharedPropertyType(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body models.CreateSharedPropertyTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if body.Name == "" || body.PropertyType == "" {
		writeJSONErr(w, http.StatusBadRequest, "name + property_type are required")
		return
	}
	if err := models.ValidatePropertyType(body.PropertyType); err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	created, err := h.Repo.CreateSharedPropertyType(r.Context(), &body, caller.Sub)
	if err != nil {
		slog.Error("create shared property type", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h *Handlers) UpdateSharedPropertyType(w http.ResponseWriter, r *http.Request) {
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
	var body models.UpdateSharedPropertyTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid json body")
		return
	}
	updated, err := h.Repo.UpdateSharedPropertyType(r.Context(), id, &body, caller.Sub)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if updated == nil {
		writeJSONErr(w, http.StatusNotFound, "shared property type not found")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handlers) DeleteSharedPropertyType(w http.ResponseWriter, r *http.Request) {
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
	deleted, err := h.Repo.DeleteSharedPropertyType(r.Context(), id, caller.Sub)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "shared property type not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
