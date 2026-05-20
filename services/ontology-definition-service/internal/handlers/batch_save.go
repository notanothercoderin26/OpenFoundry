package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

// BatchSave is the HTTP entry point for the Review-edits modal.
//
// Request shape: BatchSaveRequest (list of edits, each with an
// expected_version for update/delete). Response shape:
// BatchSaveResponse — always 200 OK with the per-edit results, even
// when the batch fails. Domain failures (conflicts, validation errors)
// are not HTTP errors; they're encoded as Status="failed" on the
// response so the frontend can render them in the modal without
// special-casing transport-level errors.
//
// Genuine 4xx/5xx are reserved for:
//   - 401 missing auth
//   - 400 malformed JSON body
//   - 413 too many edits (>500)
//   - 500 unexpected infrastructure failure
//
// The save is atomic-or-nothing: either every edit applies and the
// audit log records the batch, or nothing changes.
const maxBatchEdits = 500

func (h *Handlers) BatchSave(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req models.BatchSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if len(req.Edits) > maxBatchEdits {
		writeJSONErr(w, http.StatusRequestEntityTooLarge,
			"batch exceeds the maximum number of edits per save")
		return
	}

	resp, err := h.Repo.SaveBatch(r.Context(), &req, caller.Sub)
	if err != nil {
		slog.Error("batch save",
			slog.String("error", err.Error()),
			slog.Int("edit_count", len(req.Edits)))
		writeJSONErr(w, http.StatusInternalServerError, "batch save failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}
