package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
)

// ListGrants returns every grant on a graph. Only the graph owner can
// read or mutate grants.
func (h *Handlers) ListGrants(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, id, models.RoleOwner); !ok {
		return
	}
	items, err := h.Repo.ListGrants(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.GraphGrant]{Items: items})
}

// PutGrant upserts a (principal_kind, principal_id) → role grant on
// a graph. Passing role="" or role=null deletes the explicit grant
// (the caller's effective role then falls back to owner / link-share
// / none per ResolveRole).
func (h *Handlers) PutGrant(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	caller, _, ok := h.requireGraphRole(w, r, id, models.RoleOwner)
	if !ok {
		return
	}
	var body models.PutGraphGrantRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	g, err := h.Repo.PutGrant(r.Context(), id, &body, caller)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	// PutGrant returns (nil, nil) when the role was 'none', signalling
	// an effective delete.
	if g == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, g)
}

// DeleteGrant removes a grant by id. Owner-only.
func (h *Handlers) DeleteGrant(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, graphID, models.RoleOwner); !ok {
		return
	}
	grantID, err := parseUUIDParam(r, "grantId")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid grantId")
		return
	}
	deleted, err := h.Repo.DeleteGrant(r.Context(), graphID, grantID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "grant not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
