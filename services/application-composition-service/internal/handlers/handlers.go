// Package handlers exposes the HTTP surface of application-composition-service.
package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/application-composition-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/application-composition-service/internal/repo"
)

type Handlers struct {
	Repo *repo.Repo
}

// errorEnvelope is the JSON wire format returned for every 4xx/5xx
// response. Path is populated when the underlying cause is a
// models.ValidationError so editor UIs can highlight the offending
// widget / page / binding without parsing free-form text.
type errorEnvelope struct {
	Error errorBody `json:"error"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// writeError emits a JSON error envelope. The code is derived from the
// HTTP status when not supplied via writeErrorCode; if the wrapped error
// is a *models.ValidationError its Path/Code propagate into the envelope
// so the editor can map the failure back onto the widget tree.
func writeError(w http.ResponseWriter, status int, msg string) {
	writeErrorCode(w, status, defaultErrorCode(status), msg, "")
}

func writeErrorCode(w http.ResponseWriter, status int, code, message, path string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorEnvelope{Error: errorBody{
		Code:    code,
		Message: message,
		Path:    path,
	}})
}

// writeValidationError flattens a models.ValidationError into the JSON
// envelope. Falls back to a generic 400 with the bare message if the
// error chain does not carry one.
func writeValidationError(w http.ResponseWriter, status int, err error) {
	if ve := models.AsValidationError(err); ve != nil {
		writeErrorCode(w, status, ve.Code, ve.Message, ve.Path)
		return
	}
	writeErrorCode(w, status, defaultErrorCode(status), err.Error(), "")
}

func defaultErrorCode(status int) string {
	switch status {
	case http.StatusBadRequest:
		return "bad_request"
	case http.StatusUnauthorized:
		return "unauthorized"
	case http.StatusForbidden:
		return "forbidden"
	case http.StatusNotFound:
		return "not_found"
	case http.StatusConflict:
		return "conflict"
	default:
		return "internal_error"
	}
}

func (h *Handlers) ListItems(w http.ResponseWriter, r *http.Request) {
	rows, err := h.Repo.ListPrimary(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (h *Handlers) CreateItem(w http.ResponseWriter, r *http.Request) {
	var body models.CreatePrimaryRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	row, err := h.Repo.CreatePrimary(r.Context(), body.Payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, row)
}

func (h *Handlers) GetItem(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	row, err := h.Repo.GetPrimary(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if row == nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, row)
}

func (h *Handlers) ListSecondary(w http.ResponseWriter, r *http.Request) {
	parent, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	rows, err := h.Repo.ListSecondary(r.Context(), parent)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (h *Handlers) CreateSecondary(w http.ResponseWriter, r *http.Request) {
	parent, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a uuid")
		return
	}
	var body models.CreateSecondaryRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	row, err := h.Repo.CreateSecondary(r.Context(), parent, body.Payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, row)
}
