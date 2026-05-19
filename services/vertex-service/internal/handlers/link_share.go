package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
)

// GetLinkShare reveals the current link-share configuration. The
// token is included only when sharing is enabled — owners are the
// only role allowed here.
func (h *Handlers) GetLinkShare(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, id, models.RoleOwner); !ok {
		return
	}
	share, err := h.Repo.GetLinkShare(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if share == nil {
		writeJSONErr(w, http.StatusNotFound, "graph not found")
		return
	}
	writeJSON(w, http.StatusOK, share)
}

// PutLinkShare toggles link sharing, sets the conferred role, and
// optionally rotates the token. Owner-only.
func (h *Handlers) PutLinkShare(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, id, models.RoleOwner); !ok {
		return
	}
	var body models.UpdateLinkShareRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	share, err := h.Repo.PutLinkShare(r.Context(), id, &body)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if share == nil {
		writeJSONErr(w, http.StatusNotFound, "graph not found")
		return
	}
	writeJSON(w, http.StatusOK, share)
}

// ResolveShared is the public-ish (still auth-required) endpoint a
// shared URL points at: `GET /api/v1/vertex/shared/{token}`. It
// returns the graph + the effective role conferred by the link share.
// The caller's pre-existing explicit grants are taken into account so
// owners viewing their own shared link still see the full owner
// payload.
//
// Returns 404 for an unknown / disabled token to keep tokens opaque.
func (h *Handlers) ResolveShared(w http.ResponseWriter, r *http.Request) {
	c, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	token := chi.URLParam(r, "token")
	if token == "" {
		writeJSONErr(w, http.StatusBadRequest, "token required")
		return
	}
	graphID, linkShareRole, err := h.Repo.ResolveLinkShareToken(r.Context(), token)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if graphID == uuid.Nil || linkShareRole == models.RoleNone {
		writeJSONErr(w, http.StatusNotFound, "shared link not found")
		return
	}
	// Effective role for THIS caller: max(grant_role, link_share_role).
	grantRole, err := h.Repo.ResolveRole(r.Context(), graphID, c.Sub, nil)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	effective := grantRole
	if models.RoleAtLeast(linkShareRole, effective) {
		effective = linkShareRole
	}
	g, err := h.Repo.GetGraph(r.Context(), graphID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if g == nil {
		writeJSONErr(w, http.StatusNotFound, "shared link not found")
		return
	}
	resp := models.SharedGraphResponse{
		Role:          effective,
		LinkShareRole: linkShareRole,
	}
	if effective == models.RoleDiscoverer {
		resp.Discoverer = g.Redacted()
	} else {
		resp.Graph = g
	}
	writeJSON(w, http.StatusOK, resp)
}
