// Package handler — gateway_execute.go streams execution output from
// jupyter/kernel-gateway back to the caller as NDJSON, one event per
// line. This is the user-facing execute endpoint for the kernel-
// gateway-backed path.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/kernelgw"
)

// ExecuteGatewayCell — POST /api/v1/notebooks/{notebook_id}/gateway-sessions/{session_id}/execute
// body: {"source":"print(2+2)"}
//
// Response: 200 + NDJSON stream. One JSON object per line (no array
// wrapper). The connection stays open until the upstream signals
// status=idle for our execute_request, or the client disconnects.
func (s *State) ExecuteGatewayCell(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	notebookID, err := pathUUID(r, "notebook_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid notebook id"))
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
		Source string `json:"source"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
		return
	}

	mapping, err := s.KernelMappings.GetBySession(r.Context(), sessionID)
	if errors.Is(err, kernelgw.ErrMappingNotFound) {
		writeJSON(w, http.StatusNotFound, errBody("session not found"))
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if mapping.NotebookID != notebookID {
		writeJSON(w, http.StatusNotFound, errBody("session does not belong to notebook"))
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, errBody("streaming not supported on this transport"))
		return
	}
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch := make(chan kernelgw.OutputEvent, 8)
	execCtx, cancel := context.WithCancel(r.Context())
	defer cancel()

	execErrCh := make(chan error, 1)
	go func() {
		execErrCh <- s.KernelGW.Execute(execCtx, mapping.GatewayKernelID, body.Source, ch)
	}()

	enc := json.NewEncoder(w)
	for ev := range ch {
		if err := enc.Encode(ev); err != nil {
			cancel()
			break
		}
		flusher.Flush()
	}
	// Drain the error result so we keep the goroutine pair tidy. The
	// channel close from Client.Execute is the loop exit signal above.
	<-execErrCh

	// Best-effort: touch last_activity so the GC sees this session as
	// alive. Failures are logged at debug elsewhere; nothing here is
	// fatal for the response stream that's already flushed.
	_ = s.KernelMappings.Touch(context.Background(), sessionID, time.Now().UTC())
}
