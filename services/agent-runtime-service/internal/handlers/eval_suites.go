package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

func parseEvaluationSuiteID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return uuid.Nil, false
	}
	return id, true
}

func validateEvaluationSuiteSourceSurface(surface *string) bool {
	if surface == nil {
		return true
	}
	switch *surface {
	case "logic_preview", "evals_sidebar", "aip_evals_app", "code_function_published", "api":
		return true
	default:
		return false
	}
}

func (h *Handlers) CreateEvaluationSuite(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	var body models.CreateEvaluationSuiteRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, "name must not be empty")
		return
	}
	if isZeroUUID(body.ProjectID) || isZeroUUID(body.FolderID) {
		writeError(w, http.StatusBadRequest, "project_id and folder_id are required for evaluation suites")
		return
	}
	if !validateEvaluationSuiteSourceSurface(body.SourceSurface) {
		writeError(w, http.StatusBadRequest, "source_surface is invalid")
		return
	}
	suite, err := h.Repo.CreateEvaluationSuite(r.Context(), claims.Sub, body)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, suite)
}

func (h *Handlers) GetEvaluationSuite(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseEvaluationSuiteID(w, r)
	if !ok {
		return
	}
	includeArchived := r.URL.Query().Get("include_archived") == "true"
	suite, err := h.Repo.GetEvaluationSuite(r.Context(), id, claims.Sub, includeArchived, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if suite == nil {
		writeError(w, http.StatusNotFound, "evaluation suite not found")
		return
	}
	writeJSON(w, http.StatusOK, suite)
}

func (h *Handlers) ListEvaluationSuites(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	projectID, err := parseOptionalUUIDQuery(r.URL.Query().Get("project_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "project_id must be a uuid")
		return
	}
	folderID, err := parseOptionalUUIDQuery(r.URL.Query().Get("folder_id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "folder_id must be a uuid")
		return
	}
	includeArchived := r.URL.Query().Get("include_archived") == "true"
	suites, err := h.Repo.ListEvaluationSuites(r.Context(), projectID, folderID, claims.Sub, includeArchived, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, suites)
}

func (h *Handlers) UpdateEvaluationSuite(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseEvaluationSuiteID(w, r)
	if !ok {
		return
	}
	var body models.UpdateEvaluationSuiteRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Name != nil && strings.TrimSpace(*body.Name) == "" {
		writeError(w, http.StatusBadRequest, "name must not be empty")
		return
	}
	suite, err := h.Repo.UpdateEvaluationSuite(r.Context(), id, claims.Sub, body, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if suite == nil {
		writeError(w, http.StatusNotFound, "evaluation suite not found")
		return
	}
	writeJSON(w, http.StatusOK, suite)
}

func (h *Handlers) MoveEvaluationSuite(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseEvaluationSuiteID(w, r)
	if !ok {
		return
	}
	var body models.MoveEvaluationSuiteRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if isZeroUUID(body.ProjectID) || isZeroUUID(body.FolderID) {
		writeError(w, http.StatusBadRequest, "project_id and folder_id are required for evaluation suites")
		return
	}
	suite, err := h.Repo.MoveEvaluationSuite(r.Context(), id, claims.Sub, body, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if suite == nil {
		writeError(w, http.StatusNotFound, "evaluation suite not found")
		return
	}
	writeJSON(w, http.StatusOK, suite)
}

func (h *Handlers) DuplicateEvaluationSuite(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseEvaluationSuiteID(w, r)
	if !ok {
		return
	}
	var body models.DuplicateEvaluationSuiteRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Name != nil && strings.TrimSpace(*body.Name) == "" {
		writeError(w, http.StatusBadRequest, "name must not be empty")
		return
	}
	if (body.ProjectID == nil) != (body.FolderID == nil) {
		writeError(w, http.StatusBadRequest, "project_id and folder_id must be provided together")
		return
	}
	if body.ProjectID != nil && (isZeroUUID(*body.ProjectID) || isZeroUUID(*body.FolderID)) {
		writeError(w, http.StatusBadRequest, "project_id and folder_id are required for evaluation suites")
		return
	}
	suite, err := h.Repo.DuplicateEvaluationSuite(r.Context(), id, claims.Sub, body, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if suite == nil {
		writeError(w, http.StatusNotFound, "evaluation suite not found")
		return
	}
	writeJSON(w, http.StatusCreated, suite)
}

func (h *Handlers) ArchiveEvaluationSuite(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseEvaluationSuiteID(w, r)
	if !ok {
		return
	}
	suite, err := h.Repo.ArchiveEvaluationSuite(r.Context(), id, claims.Sub, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if suite == nil {
		writeError(w, http.StatusNotFound, "evaluation suite not found")
		return
	}
	writeJSON(w, http.StatusOK, suite)
}

func (h *Handlers) RestoreEvaluationSuite(w http.ResponseWriter, r *http.Request) {
	claims, ok := logicClaims(w, r)
	if !ok {
		return
	}
	id, ok := parseEvaluationSuiteID(w, r)
	if !ok {
		return
	}
	suite, err := h.Repo.RestoreEvaluationSuite(r.Context(), id, claims.Sub, claims.HasRole("admin"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if suite == nil {
		writeError(w, http.StatusNotFound, "evaluation suite not found")
		return
	}
	writeJSON(w, http.StatusOK, suite)
}
