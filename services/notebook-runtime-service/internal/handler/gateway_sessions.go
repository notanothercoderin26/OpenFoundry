// Package handler — gateway_sessions.go owns the kernel-gateway-backed
// "session" lifecycle. A session in this context = an upstream
// jupyter/kernel-gateway kernel + a row in `notebook_kernels` that
// links it to the OpenFoundry notebook id.
//
// This is distinct from the legacy python-sidecar `sessions` table —
// the two paths coexist while we transition.
package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/kernelgw"
)

// CreateGatewaySession — POST /api/v1/notebooks/{notebook_id}/gateway-sessions
// body: {"spec":"python3"}  → creates an upstream kernel and a
// notebook_kernels row, returns the mapping shape.
func (s *State) CreateGatewaySession(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	notebookID, err := pathUUID(r, "notebook_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid notebook id"))
		return
	}
	if s.KernelGW == nil || s.KernelMappings == nil {
		writeJSON(w, http.StatusServiceUnavailable, errBody("kernel gateway is not configured"))
		return
	}
	if s.ExecuteGuard != nil {
		if err := s.ExecuteGuard.AuthorizeExecute(r.Context(), claims, notebookID); err != nil {
			if errors.Is(err, kernelgw.ErrExecuteForbidden) {
				writeJSON(w, http.StatusForbidden, errBody("execute forbidden"))
				return
			}
			writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
			return
		}
	}

	var body struct {
		Spec string `json:"spec"`
	}
	_ = decodeJSON(r, &body)
	spec := body.Spec
	if spec == "" {
		spec = "python3"
	}

	k, err := s.KernelGW.CreateKernel(r.Context(), spec)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errBody(err.Error()))
		return
	}

	sessionID, _ := uuid.NewV7()
	now := time.Now().UTC()
	mapping := kernelgw.Mapping{
		SessionID:       sessionID,
		NotebookID:      notebookID,
		GatewayKernelID: k.ID,
		KernelSpec:      spec,
		StartedBy:       claims.Sub,
		CreatedAt:       now,
		LastActivity:    now,
	}
	if err := s.KernelMappings.Insert(r.Context(), mapping); err != nil {
		// Best-effort cleanup of the orphaned upstream kernel; ignore
		// errors — the GC will eventually reap it.
		_ = s.KernelGW.DeleteKernel(r.Context(), k.ID)
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"session_id":        mapping.SessionID,
		"notebook_id":       mapping.NotebookID,
		"gateway_kernel_id": mapping.GatewayKernelID,
		"kernel_spec":       mapping.KernelSpec,
		"created_at":        mapping.CreatedAt,
		"last_activity":     mapping.LastActivity,
	})
}

// DeleteGatewaySession — DELETE /api/v1/notebooks/{notebook_id}/gateway-sessions/{session_id}
// removes the upstream kernel and the mapping row.
func (s *State) DeleteGatewaySession(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	sessionID, err := pathUUID(r, "session_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid session id"))
		return
	}
	if s.KernelGW == nil || s.KernelMappings == nil {
		writeJSON(w, http.StatusServiceUnavailable, errBody("kernel gateway is not configured"))
		return
	}
	mapping, err := s.KernelMappings.GetBySession(r.Context(), sessionID)
	if errors.Is(err, kernelgw.ErrMappingNotFound) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if err := s.KernelGW.DeleteKernel(r.Context(), mapping.GatewayKernelID); err != nil {
		writeJSON(w, http.StatusBadGateway, errBody(err.Error()))
		return
	}
	if err := s.KernelMappings.DeleteBySession(r.Context(), sessionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
