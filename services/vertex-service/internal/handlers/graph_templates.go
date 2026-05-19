// Package handlers: HTTP endpoints for Vertex graph templates.
//
// A template is created by saving an existing graph, declaring its
// inputs, and pinning the search-around behaviour + layer styling it
// should ship with. Consumers later supply parameter values to
// instantiate a fresh graph from the recipe.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/repo"
)

func (h *Handlers) ListGraphTemplates(w http.ResponseWriter, r *http.Request) {
	caller, ok := caller(r)
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "missing caller")
		return
	}
	projectID := parseUUIDQuery(r, "project_id")
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	page := parseIntQuery(r, "page", 1)
	perPage := parseIntQuery(r, "per_page", 50)

	items, total, err := h.Repo.ListGraphTemplates(r.Context(), caller, projectID, search, page, perPage)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []models.GraphTemplate{}
	}
	writeJSON(w, http.StatusOK, models.ListGraphTemplatesResult{Items: items, Total: total})
}

func (h *Handlers) GetGraphTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	tpl, err := h.Repo.GetGraphTemplate(r.Context(), id)
	if errors.Is(err, repo.ErrGraphTemplateNotFound) {
		writeJSONErr(w, http.StatusNotFound, "graph template not found")
		return
	}
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, tpl)
}

func (h *Handlers) CreateGraphTemplate(w http.ResponseWriter, r *http.Request) {
	owner, ok := caller(r)
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "missing caller")
		return
	}
	var body models.CreateGraphTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if msg := validateGraphTemplate(&body); msg != "" {
		writeJSONErr(w, http.StatusBadRequest, msg)
		return
	}
	tpl, err := h.Repo.CreateGraphTemplate(r.Context(), &body, owner)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, tpl)
}

func (h *Handlers) UpdateGraphTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	tpl, err := h.Repo.GetGraphTemplate(r.Context(), id)
	if errors.Is(err, repo.ErrGraphTemplateNotFound) {
		writeJSONErr(w, http.StatusNotFound, "graph template not found")
		return
	}
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	caller, ok := caller(r)
	if !ok || caller != tpl.OwnerID {
		writeJSONErr(w, http.StatusForbidden, "only the owner can update this template")
		return
	}
	var body models.UpdateGraphTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	updated, err := h.Repo.UpdateGraphTemplate(r.Context(), id, &body)
	if errors.Is(err, repo.ErrGraphTemplateNotFound) {
		writeJSONErr(w, http.StatusNotFound, "graph template not found")
		return
	}
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handlers) DeleteGraphTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	tpl, err := h.Repo.GetGraphTemplate(r.Context(), id)
	if errors.Is(err, repo.ErrGraphTemplateNotFound) {
		writeJSONErr(w, http.StatusNotFound, "graph template not found")
		return
	}
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	caller, ok := caller(r)
	if !ok || caller != tpl.OwnerID {
		writeJSONErr(w, http.StatusForbidden, "only the owner can delete this template")
		return
	}
	if _, err := h.Repo.DeleteGraphTemplate(r.Context(), id); err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// InstantiateGraphTemplate creates a fresh draft graph from a
// template plus the supplied parameter values. The new graph is
// owned by the caller (not necessarily the template owner) so
// consumers can iterate without polluting the original.
func (h *Handlers) InstantiateGraphTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	caller, ok := caller(r)
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "missing caller")
		return
	}
	tpl, err := h.Repo.GetGraphTemplate(r.Context(), id)
	if errors.Is(err, repo.ErrGraphTemplateNotFound) {
		writeJSONErr(w, http.StatusNotFound, "graph template not found")
		return
	}
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	var body models.InstantiateGraphTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if msg := validateInstantiate(tpl, &body); msg != "" {
		writeJSONErr(w, http.StatusBadRequest, msg)
		return
	}
	resp, err := h.Repo.InstantiateGraphTemplate(r.Context(), tpl, &body, caller)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

// validateGraphTemplate checks structural invariants on a create
// payload before the row hits Postgres.
func validateGraphTemplate(body *models.CreateGraphTemplateRequest) string {
	if strings.TrimSpace(body.Title) == "" {
		return "title is required"
	}
	seen := map[string]bool{}
	for _, p := range body.ObjectParameters {
		if p.ID == "" || p.Name == "" {
			return "object parameter is missing id or name"
		}
		if seen[p.ID] {
			return "duplicate object parameter id: " + p.ID
		}
		seen[p.ID] = true
	}
	seen = map[string]bool{}
	for _, p := range body.NonObjectParameters {
		if p.ID == "" || p.Name == "" {
			return "non-object parameter is missing id or name"
		}
		if seen[p.ID] {
			return "duplicate non-object parameter id: " + p.ID
		}
		seen[p.ID] = true
		switch p.ValueType {
		case "integer", "string", "boolean", "double":
		default:
			return "unsupported non-object value type: " + p.ValueType
		}
	}
	// Search arounds must reference declared object parameters and
	// carry a supported kind.
	paramByID := map[string]bool{}
	for _, p := range body.ObjectParameters {
		paramByID[p.ID] = true
	}
	for _, sa := range body.SearchArounds {
		if !paramByID[sa.ObjectParameterID] {
			return "search around references unknown object parameter: " + sa.ObjectParameterID
		}
		switch sa.Kind {
		case "relation", "function", "saved":
		default:
			return "unsupported search around kind: " + sa.Kind
		}
	}
	return ""
}

// validateInstantiate enforces that required object parameters were
// supplied and non-object types were honoured (strings stay strings,
// integers parse as numbers, etc.).
func validateInstantiate(tpl *models.GraphTemplate, body *models.InstantiateGraphTemplateRequest) string {
	if body.ObjectParameterValues == nil {
		body.ObjectParameterValues = map[string][]string{}
	}
	if body.NonObjectParameterValues == nil {
		body.NonObjectParameterValues = map[string]json.RawMessage{}
	}
	for _, p := range tpl.ObjectParameters {
		vals, ok := body.ObjectParameterValues[p.ID]
		if !ok || len(vals) == 0 {
			if p.Required {
				return "missing required object parameter: " + p.Name
			}
			continue
		}
		if p.SingleObject && len(vals) > 1 {
			return "parameter " + p.Name + " expects a single object"
		}
	}
	for _, p := range tpl.NonObjectParameters {
		if _, ok := body.NonObjectParameterValues[p.ID]; !ok && p.Required {
			return "missing required parameter: " + p.Name
		}
	}
	return ""
}
