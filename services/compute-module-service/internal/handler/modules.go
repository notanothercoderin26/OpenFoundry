package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/libs/core-models/pagination"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/repo"
)

// CreateComputeModuleRequest is the wire shape for POST /compute-modules.
type CreateComputeModuleRequest struct {
	Name          string                `json:"name"`
	Description   string                `json:"description,omitempty"`
	ProjectID     uuid.UUID             `json:"project_id"`
	FolderID      *uuid.UUID            `json:"folder_id,omitempty"`
	ExecutionMode models.ExecutionMode  `json:"execution_mode"`
	Labels        map[string]string     `json:"labels,omitempty"`
}

// UpdateComputeModuleRequest is the wire shape for PATCH /compute-modules/{id}.
type UpdateComputeModuleRequest struct {
	Name        *string            `json:"name,omitempty"`
	Description *string            `json:"description,omitempty"`
	Labels      *map[string]string `json:"labels,omitempty"`
}

// MoveComputeModuleRequest is the wire shape for POST /compute-modules/{id}/move.
type MoveComputeModuleRequest struct {
	ProjectID uuid.UUID  `json:"project_id"`
	FolderID  *uuid.UUID `json:"folder_id,omitempty"`
}

// DuplicateComputeModuleRequest is the wire shape for POST /compute-modules/{id}/duplicate.
type DuplicateComputeModuleRequest struct {
	NewName   string     `json:"new_name"`
	ProjectID *uuid.UUID `json:"project_id,omitempty"`
	FolderID  *uuid.UUID `json:"folder_id,omitempty"`
}

// Create handles POST /api/v1/compute-modules.
func (s *State) Create(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body CreateComputeModuleRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	params := models.CreateParams{
		Name:          body.Name,
		Description:   body.Description,
		ProjectID:     body.ProjectID,
		FolderID:      body.FolderID,
		ExecutionMode: body.ExecutionMode,
		Labels:        body.Labels,
		Actor:         caller,
	}
	if err := params.Validate(); err != nil {
		writeValidationError(w, err)
		return
	}
	m, err := s.Repo.Create(r.Context(), params)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

// List handles GET /api/v1/compute-modules.
//
// Query parameters:
//   - project_id (uuid)      — filter by project
//   - folder_id (uuid)       — filter by folder (omit for project root)
//   - execution_mode (str)   — "function" or "pipeline"
//   - state (str)            — "active" or "archived"
//   - include_archived (bool)— include archived alongside active when state is unset
//   - cursor (str)           — opaque pagination cursor
//   - limit (uint)           — page size (default 50, max 200)
func (s *State) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := repo.ListFilter{}

	if v := q.Get("project_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid project_id")
			return
		}
		filter.ProjectID = &id
	}
	if v := q.Get("folder_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid folder_id")
			return
		}
		filter.FolderID = &id
	}
	if v := q.Get("execution_mode"); v != "" {
		mode := models.ExecutionMode(v)
		if !mode.IsValid() {
			writeError(w, http.StatusBadRequest, "invalid execution_mode")
			return
		}
		filter.ExecutionMode = &mode
	}
	if v := q.Get("state"); v != "" {
		state := models.LifecycleState(v)
		if state != models.LifecycleActive && state != models.LifecycleArchived {
			writeError(w, http.StatusBadRequest, "invalid state")
			return
		}
		filter.State = &state
	}
	if v := q.Get("include_archived"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid include_archived")
			return
		}
		filter.IncludeArchived = b
	}

	page := repo.Page{}
	if v := q.Get("cursor"); v != "" {
		c := v
		page.Cursor = &c
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.ParseUint(v, 10, 32)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid limit")
			return
		}
		page.Limit = uint32(n)
	}

	res, err := s.Repo.List(r.Context(), filter, page)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, pagination.PageResponse[*models.ComputeModule]{
		Items:      res.Items,
		NextCursor: res.NextCursor,
	})
}

// Get handles GET /api/v1/compute-modules/{id}.
func (s *State) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	m, err := s.Repo.Get(r.Context(), id)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// UpdateMetadata handles PATCH /api/v1/compute-modules/{id}.
func (s *State) UpdateMetadata(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	var body UpdateComputeModuleRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	params := models.UpdateMetadataParams{
		Name:        body.Name,
		Description: body.Description,
		Labels:      body.Labels,
		Actor:       caller,
	}
	if err := params.Validate(); err != nil {
		writeValidationError(w, err)
		return
	}
	m, err := s.Repo.UpdateMetadata(r.Context(), id, params)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// Move handles POST /api/v1/compute-modules/{id}/move.
func (s *State) Move(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	var body MoveComputeModuleRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	params := models.MoveParams{
		ProjectID: body.ProjectID,
		FolderID:  body.FolderID,
		Actor:     caller,
	}
	if err := params.Validate(); err != nil {
		writeValidationError(w, err)
		return
	}
	m, err := s.Repo.Move(r.Context(), id, params)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// Duplicate handles POST /api/v1/compute-modules/{id}/duplicate.
func (s *State) Duplicate(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	var body DuplicateComputeModuleRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	params := models.DuplicateParams{
		NewName:   body.NewName,
		ProjectID: body.ProjectID,
		FolderID:  body.FolderID,
		Actor:     caller,
	}
	if err := params.Validate(); err != nil {
		writeValidationError(w, err)
		return
	}
	m, err := s.Repo.Duplicate(r.Context(), id, params)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

// Archive handles POST /api/v1/compute-modules/{id}/archive.
func (s *State) Archive(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	m, err := s.Repo.Archive(r.Context(), id, caller)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// Restore handles POST /api/v1/compute-modules/{id}/restore.
func (s *State) Restore(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	m, err := s.Repo.Restore(r.Context(), id, caller)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// Delete handles DELETE /api/v1/compute-modules/{id}. Hard delete is
// gated by caller permission outside this service (e.g. the audit-
// compliance flow); see CM.14 / CM.35.
func (s *State) Delete(w http.ResponseWriter, r *http.Request) {
	if _, ok := callerID(r); !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	if err := s.Repo.Delete(r.Context(), id); err != nil {
		writeRepoError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func pathUUID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	raw := chi.URLParam(r, "id")
	id, err := uuid.Parse(raw)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid module id")
		return uuid.UUID{}, false
	}
	return id, true
}
