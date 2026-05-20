// HTTP surface for Object Views — the per-object-type rendering
// definitions surfaced in the Ontology Manager "Object Views" tab and
// consumed by Workshop, Object Explorer and Vertex.
//
// The endpoints mirror the Foundry contract: list (filterable by
// object_type_id / form_factor / paginated), get, create, update,
// delete. Writes go through the same `runRepoTx` + outbox path as
// every other ontology resource so consumers see
// `ontology.object_view.changed.v1` events.
package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

func (h *Handlers) ListObjectViews(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var objectTypeID *uuid.UUID
	if raw := r.URL.Query().Get("object_type_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, "invalid object_type_id")
			return
		}
		objectTypeID = &id
	}
	formFactor := r.URL.Query().Get("form_factor")
	if formFactor != "" {
		if err := models.ValidateObjectViewFormFactor(formFactor); err != nil {
			writeJSONErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	page, perPage := parsePaging(r)
	items, total, err := h.Repo.ListObjectViews(r.Context(), objectTypeID, formFactor, page, perPage)
	if err != nil {
		slog.Error("list object views", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list object views")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data":     items,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func (h *Handlers) GetObjectView(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	v, err := h.Repo.GetObjectView(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		writeJSONErr(w, http.StatusNotFound, "object view not found")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *Handlers) CreateObjectView(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body models.CreateObjectViewRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if body.Name == "" {
		writeJSONErr(w, http.StatusBadRequest, "name is required")
		return
	}
	if body.ObjectTypeID == uuid.Nil {
		writeJSONErr(w, http.StatusBadRequest, "object_type_id is required")
		return
	}
	if err := models.ValidateObjectViewMode(body.Mode); err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := models.ValidateObjectViewFormFactor(body.FormFactor); err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	created, err := h.Repo.CreateObjectView(r.Context(), &body, caller.Sub)
	if err != nil {
		slog.Error("create object view", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h *Handlers) UpdateObjectView(w http.ResponseWriter, r *http.Request) {
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
	var body models.UpdateObjectViewRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if body.Mode != nil {
		if err := models.ValidateObjectViewMode(*body.Mode); err != nil {
			writeJSONErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if body.FormFactor != nil {
		if err := models.ValidateObjectViewFormFactor(*body.FormFactor); err != nil {
			writeJSONErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	updated, err := h.Repo.UpdateObjectView(r.Context(), id, &body, caller.Sub)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if updated == nil {
		writeJSONErr(w, http.StatusNotFound, "object view not found")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handlers) DeleteObjectView(w http.ResponseWriter, r *http.Request) {
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
	deleted, err := h.Repo.DeleteObjectView(r.Context(), id, caller.Sub)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "object view not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
