package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/domain/executionmode"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
)

// GetExecutionMode handles
// GET /api/v1/compute-modules/{id}/execution-mode.
//
// The response is the canonical executionmode.Snapshot — mode plus the
// UI affordance bundle. The UI uses this to decide which tabs and
// actions to render; the backend uses the same package to enforce
// the matching guards.
func (s *State) GetExecutionMode(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	m, err := s.Repo.Get(r.Context(), id)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, executionmode.SnapshotFor(m))
}

// SetPipelineIOConfigRequest is the wire shape for
// PUT /api/v1/compute-modules/{id}/pipeline-io. The body equals the
// stored config so callers can round-trip GET → PUT.
type SetPipelineIOConfigRequest = models.PipelineIOConfig

// SetPipelineIOConfig handles
// PUT /api/v1/compute-modules/{id}/pipeline-io.
//
// Function-mode modules are rejected with 409 Conflict; the same code
// fires for pipeline-mode modules whose config fails validation
// (empty bindings, duplicate aliases, etc.).
func (s *State) SetPipelineIOConfig(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}

	var body models.PipelineIOConfig
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := body.Validate(); err != nil {
		writeValidationError(w, err)
		return
	}

	// Resolve the module so we can map the mode-mismatch case to the
	// policy-aware error message before delegating to the repo guard.
	m, err := s.Repo.Get(r.Context(), id)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	if err := executionmode.EnsurePipelineMode(m); err != nil {
		writeExecutionModeError(w, err)
		return
	}

	updated, err := s.Repo.SetPipelineIOConfig(r.Context(), id, body, caller)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// ClearPipelineIOConfig handles
// DELETE /api/v1/compute-modules/{id}/pipeline-io.
func (s *State) ClearPipelineIOConfig(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	m, err := s.Repo.Get(r.Context(), id)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	if err := executionmode.EnsurePipelineMode(m); err != nil {
		writeExecutionModeError(w, err)
		return
	}
	updated, err := s.Repo.ClearPipelineIOConfig(r.Context(), id, caller)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// FunctionQueryAck is the placeholder response surfaced before the
// function gateway lands in CM.6 / CM.8. It exists today so the
// execution-mode guard has a real endpoint to defend.
type FunctionQueryAck struct {
	ModuleID string `json:"module_id"`
	Accepted bool   `json:"accepted"`
	Pending  string `json:"pending,omitempty"`
}

// QueryFunction handles POST /api/v1/compute-modules/{id}/functions/query.
//
// CM.2 enforces the mode boundary only: pipeline-mode modules are
// rejected with 409 Conflict (the body identifies the offending
// execution mode), and function-mode modules receive a 202 Accepted
// placeholder pointing at CM.6/CM.8. The real dispatcher will replace
// this body once those items land.
func (s *State) QueryFunction(w http.ResponseWriter, r *http.Request) {
	if _, ok := callerID(r); !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	m, err := s.Repo.Get(r.Context(), id)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	if err := executionmode.EnsureFunctionMode(m); err != nil {
		writeExecutionModeError(w, err)
		return
	}
	// Drain & ignore the body for now — function spec/dispatcher
	// validation lands in CM.6 and CM.8.
	_ = r.Body.Close()
	writeJSON(w, http.StatusAccepted, FunctionQueryAck{
		ModuleID: m.ID.String(),
		Accepted: true,
		Pending:  "function dispatcher not implemented yet (tracked by CM.6/CM.8)",
	})
}

type executionModeErrorBody struct {
	Error         string               `json:"error"`
	RequiredMode  models.ExecutionMode `json:"required_mode"`
	ModuleMode    models.ExecutionMode `json:"module_mode,omitempty"`
}

// writeExecutionModeError emits a structured 409 the UI can switch on
// without parsing free-form text.
func writeExecutionModeError(w http.ResponseWriter, err error) {
	body := executionModeErrorBody{Error: err.Error()}
	switch {
	case errors.Is(err, executionmode.ErrFunctionOnly):
		body.RequiredMode = models.ExecutionModeFunction
	case errors.Is(err, executionmode.ErrPipelineOnly):
		body.RequiredMode = models.ExecutionModePipeline
	default:
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusConflict, body)
}
