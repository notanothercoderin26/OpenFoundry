// Package handlers wires HTTP endpoints for vertex-service. The
// canonical Store interface is declared here (consumer-side) so the
// concrete pgx-backed Repo and the in-memory fake in tests both
// satisfy it implicitly.
package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
)

// Store is the persistence contract handlers depend on. Keep the
// surface tight — no leaking pgx, no leaking transactions.
type Store interface {
	// Graphs
	ListGraphs(ctx context.Context, ownerID uuid.UUID, projectID *uuid.UUID, search string, page, perPage int) ([]models.Graph, int, error)
	GetGraph(ctx context.Context, id uuid.UUID) (*models.Graph, error)
	CreateGraph(ctx context.Context, body *models.CreateGraphRequest, ownerID uuid.UUID) (*models.Graph, error)
	UpdateGraph(ctx context.Context, id uuid.UUID, body *models.UpdateGraphRequest) (*models.Graph, error)
	DeleteGraph(ctx context.Context, id uuid.UUID) (bool, error)
	ForkGraph(ctx context.Context, id uuid.UUID, newTitle string, ownerID uuid.UUID) (*models.Graph, error)

	// Versions
	CreateGraphVersion(ctx context.Context, graphID uuid.UUID, changelog string, authorID uuid.UUID) (*models.GraphVersion, error)
	ListGraphVersions(ctx context.Context, graphID uuid.UUID, page, perPage int) ([]models.GraphVersion, int, error)
	GetGraphVersion(ctx context.Context, graphID uuid.UUID, version int) (*models.GraphVersion, error)
	SetVersioningEnabled(ctx context.Context, id uuid.UUID, enabled bool) (*models.Graph, error)
	RevertToVersion(ctx context.Context, graphID uuid.UUID, version int, authorID uuid.UUID) (*models.Graph, error)

	// Grants / ACL
	ListGrants(ctx context.Context, graphID uuid.UUID) ([]models.GraphGrant, error)
	PutGrant(ctx context.Context, graphID uuid.UUID, body *models.PutGraphGrantRequest, grantedBy uuid.UUID) (*models.GraphGrant, error)
	DeleteGrant(ctx context.Context, graphID, grantID uuid.UUID) (bool, error)
	ResolveRole(ctx context.Context, graphID, caller uuid.UUID, groupIDs []uuid.UUID) (models.Role, error)

	// Link sharing
	GetLinkShare(ctx context.Context, graphID uuid.UUID) (*models.LinkShare, error)
	PutLinkShare(ctx context.Context, graphID uuid.UUID, body *models.UpdateLinkShareRequest) (*models.LinkShare, error)
	ResolveLinkShareToken(ctx context.Context, token string) (uuid.UUID, models.Role, error)
	LinkShareRoleFor(ctx context.Context, graphID uuid.UUID, presentedToken string) (models.Role, error)

	// Annotations
	ListAnnotations(ctx context.Context, graphID uuid.UUID) ([]models.Annotation, error)
	CreateAnnotation(ctx context.Context, graphID uuid.UUID, body *models.CreateAnnotationRequest, authorID uuid.UUID) (*models.Annotation, error)
	UpdateAnnotation(ctx context.Context, id uuid.UUID, body *models.UpdateAnnotationRequest) (*models.Annotation, error)
	DeleteAnnotation(ctx context.Context, id uuid.UUID) (bool, error)

	// Search Arounds
	ListSearchArounds(ctx context.Context, ownerID uuid.UUID, projectID *uuid.UUID, startingTypeID *uuid.UUID, search string, page, perPage int) ([]models.SearchAround, int, error)
	GetSearchAround(ctx context.Context, id uuid.UUID) (*models.SearchAround, error)
	CreateSearchAround(ctx context.Context, body *models.CreateSearchAroundRequest, ownerID uuid.UUID) (*models.SearchAround, error)
	UpdateSearchAround(ctx context.Context, id uuid.UUID, body *models.UpdateSearchAroundRequest) (*models.SearchAround, error)
	DeleteSearchAround(ctx context.Context, id uuid.UUID) (bool, error)

	// Scenarios
	ListScenarios(ctx context.Context, graphID uuid.UUID, page, perPage int) ([]models.Scenario, int, error)
	GetScenario(ctx context.Context, id uuid.UUID) (*models.Scenario, error)
	CreateScenario(ctx context.Context, graphID uuid.UUID, body *models.CreateScenarioRequest, authorID uuid.UUID) (*models.Scenario, error)
	UpdateScenario(ctx context.Context, id uuid.UUID, body *models.UpdateScenarioRequest) (*models.Scenario, error)
	DeleteScenario(ctx context.Context, id uuid.UUID) (bool, error)
	DiffScenario(ctx context.Context, id uuid.UUID) (*models.ScenarioDiff, error)

	// Derived property bindings
	ListDerivedPropertyBindings(ctx context.Context, objectTypeID *uuid.UUID) ([]models.DerivedPropertyBinding, error)
	CreateDerivedPropertyBinding(ctx context.Context, body *models.CreateDerivedPropertyBindingRequest, ownerID uuid.UUID) (*models.DerivedPropertyBinding, error)
	DeleteDerivedPropertyBinding(ctx context.Context, id uuid.UUID) (bool, error)
}

type Handlers struct{ Repo Store }

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func caller(r *http.Request) (uuid.UUID, bool) {
	c, ok := authmw.FromContext(r.Context())
	if !ok {
		return uuid.Nil, false
	}
	return c.Sub, true
}

func parseUUIDParam(r *http.Request, name string) (uuid.UUID, error) {
	return uuid.Parse(chi.URLParam(r, name))
}

func parseIntQuery(r *http.Request, name string, fallback int) int {
	v := r.URL.Query().Get(name)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func parseUUIDQuery(r *http.Request, name string) *uuid.UUID {
	v := r.URL.Query().Get(name)
	if v == "" {
		return nil
	}
	id, err := uuid.Parse(v)
	if err != nil {
		return nil
	}
	return &id
}

// shareTokenHeader is the canonical header name for an inbound link
// share token. ?share_token=... in the query string is also accepted
// for ergonomics when sharing URLs.
const shareTokenHeader = "X-Vertex-Share-Token"

func presentedShareToken(r *http.Request) string {
	if t := r.Header.Get(shareTokenHeader); t != "" {
		return t
	}
	return r.URL.Query().Get("share_token")
}

// requireGraphRole loads the caller's effective role against `graphID`
// and writes a 401/403/404 response when access is denied. The
// effective role is max(explicit_grant_role, link_share_role) — a
// valid link-share token lifts the caller to at least the role the
// owner configured.
//
// Behaviour:
//   * no auth                                            → 401
//   * caller has no relationship to the graph (RoleNone) → 404
//   * caller's role is below `minRole`                   → 403
//   * graph does not exist                               → 404
//
// 404-on-no-grant is deliberate: it prevents probing by RID. Owners
// always satisfy any minRole.
func (h *Handlers) requireGraphRole(w http.ResponseWriter, r *http.Request, graphID uuid.UUID, minRole models.Role) (uuid.UUID, models.Role, bool) {
	c, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return uuid.Nil, models.RoleNone, false
	}
	grantRole, err := h.Repo.ResolveRole(r.Context(), graphID, c.Sub, nil)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return uuid.Nil, models.RoleNone, false
	}
	// Combine with any presented link-share token. Token must match
	// the graph's currently-enabled share or it is ignored — there is
	// no signal back to the caller about whether the token was used.
	role := grantRole
	if token := presentedShareToken(r); token != "" {
		linkRole, err := h.Repo.LinkShareRoleFor(r.Context(), graphID, token)
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, err.Error())
			return uuid.Nil, models.RoleNone, false
		}
		if models.RoleAtLeast(linkRole, role) {
			role = linkRole
		}
	}
	if role == models.RoleNone {
		writeJSONErr(w, http.StatusNotFound, "graph not found")
		return uuid.Nil, models.RoleNone, false
	}
	if !models.RoleAtLeast(role, minRole) {
		writeJSONErr(w, http.StatusForbidden, "insufficient role for this graph")
		return uuid.Nil, models.RoleNone, false
	}
	return c.Sub, role, true
}

// ----- Graph -----

func (h *Handlers) ListGraphs(w http.ResponseWriter, r *http.Request) {
	owner, ok := caller(r)
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	page := parseIntQuery(r, "page", 1)
	perPage := parseIntQuery(r, "per_page", 50)
	projectID := parseUUIDQuery(r, "project_id")
	search := r.URL.Query().Get("search")
	items, total, err := h.Repo.ListGraphs(r.Context(), owner, projectID, search, page, perPage)
	if err != nil {
		slog.Error("list graphs", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list graphs")
		return
	}
	writeJSON(w, http.StatusOK, models.Page[models.Graph]{
		Data: items, Total: total, Page: page, PerPage: perPage,
	})
}

func (h *Handlers) GetGraph(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	_, role, ok := h.requireGraphRole(w, r, id, models.RoleDiscoverer)
	if !ok {
		return
	}
	g, err := h.Repo.GetGraph(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if g == nil {
		writeJSONErr(w, http.StatusNotFound, "graph not found")
		return
	}
	// Discoverer sees only name + metadata, no layout / layers /
	// seed object refs. Any role at Viewer or above gets the full
	// payload.
	if role == models.RoleDiscoverer {
		writeJSON(w, http.StatusOK, g.Redacted())
		return
	}
	writeJSON(w, http.StatusOK, g)
}

func (h *Handlers) CreateGraph(w http.ResponseWriter, r *http.Request) {
	owner, ok := caller(r)
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body models.CreateGraphRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if strings.TrimSpace(body.Title) == "" {
		writeJSONErr(w, http.StatusBadRequest, "title required")
		return
	}
	g, err := h.Repo.CreateGraph(r.Context(), &body, owner)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, g)
}

func (h *Handlers) UpdateGraph(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, id, models.RoleEditor); !ok {
		return
	}
	var body models.UpdateGraphRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	g, err := h.Repo.UpdateGraph(r.Context(), id, &body)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if g == nil {
		writeJSONErr(w, http.StatusNotFound, "graph not found")
		return
	}
	writeJSON(w, http.StatusOK, g)
}

func (h *Handlers) DeleteGraph(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	// Delete is owner-only — editors can mutate but not remove.
	if _, _, ok := h.requireGraphRole(w, r, id, models.RoleOwner); !ok {
		return
	}
	deleted, err := h.Repo.DeleteGraph(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "graph not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) ForkGraph(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	// Forking creates a brand-new graph owned by the caller, so any
	// reader can fork.
	caller, _, ok := h.requireGraphRole(w, r, id, models.RoleViewer)
	if !ok {
		return
	}
	var body models.ForkGraphRequest
	_ = json.NewDecoder(r.Body).Decode(&body)
	g, err := h.Repo.ForkGraph(r.Context(), id, body.NewTitle, caller)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if g == nil {
		writeJSONErr(w, http.StatusNotFound, "graph not found")
		return
	}
	writeJSON(w, http.StatusCreated, g)
}

// ----- Versions -----

func (h *Handlers) CreateGraphVersion(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	author, _, ok := h.requireGraphRole(w, r, id, models.RoleEditor)
	if !ok {
		return
	}
	var body models.CreateGraphVersionRequest
	_ = json.NewDecoder(r.Body).Decode(&body)
	v, err := h.Repo.CreateGraphVersion(r.Context(), id, body.Changelog, author)
	if err != nil {
		// Map the disabled-versioning sentinel to a 409 so the
		// frontend can show "Enable versioning first".
		if strings.Contains(err.Error(), "versioning is disabled") {
			writeJSONErr(w, http.StatusConflict, err.Error())
			return
		}
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		writeJSONErr(w, http.StatusNotFound, "graph not found")
		return
	}
	writeJSON(w, http.StatusCreated, v)
}

func (h *Handlers) ListGraphVersions(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, id, models.RoleViewer); !ok {
		return
	}
	page := parseIntQuery(r, "page", 1)
	perPage := parseIntQuery(r, "per_page", 50)
	items, total, err := h.Repo.ListGraphVersions(r.Context(), id, page, perPage)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.Page[models.GraphVersion]{
		Data: items, Total: total, Page: page, PerPage: perPage,
	})
}

func (h *Handlers) GetGraphVersion(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, graphID, models.RoleViewer); !ok {
		return
	}
	versionStr := chi.URLParam(r, "version")
	version, err := strconv.Atoi(versionStr)
	if err != nil || version <= 0 {
		writeJSONErr(w, http.StatusBadRequest, "invalid version")
		return
	}
	v, err := h.Repo.GetGraphVersion(r.Context(), graphID, version)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		writeJSONErr(w, http.StatusNotFound, "version not found")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// RevertGraphVersion creates a new graph version whose contents match
// the snapshot of the requested earlier version, mirroring the
// "Revert" button in the Graph History sidebar.
func (h *Handlers) RevertGraphVersion(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	author, _, ok := h.requireGraphRole(w, r, graphID, models.RoleEditor)
	if !ok {
		return
	}
	versionStr := chi.URLParam(r, "version")
	version, err := strconv.Atoi(versionStr)
	if err != nil || version <= 0 {
		writeJSONErr(w, http.StatusBadRequest, "invalid version")
		return
	}
	g, err := h.Repo.RevertToVersion(r.Context(), graphID, version, author)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if g == nil {
		writeJSONErr(w, http.StatusNotFound, "graph or version not found")
		return
	}
	writeJSON(w, http.StatusOK, g)
}

// SetVersioningEnabled toggles the per-graph versioning flag (mirrors
// the "Enable Versioning" menu item in the Save dropdown). Empty body
// is treated as {enabled: true}.
func (h *Handlers) SetVersioningEnabled(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, id, models.RoleEditor); !ok {
		return
	}
	body := models.EnableVersioningRequest{Enabled: true}
	_ = json.NewDecoder(r.Body).Decode(&body)
	g, err := h.Repo.SetVersioningEnabled(r.Context(), id, body.Enabled)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if g == nil {
		writeJSONErr(w, http.StatusNotFound, "graph not found")
		return
	}
	writeJSON(w, http.StatusOK, g)
}

// ----- Annotations -----

func (h *Handlers) ListAnnotations(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, id, models.RoleViewer); !ok {
		return
	}
	items, err := h.Repo.ListAnnotations(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.Annotation]{Items: items})
}

func (h *Handlers) CreateAnnotation(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	author, _, ok := h.requireGraphRole(w, r, graphID, models.RoleEditor)
	if !ok {
		return
	}
	var body models.CreateAnnotationRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a, err := h.Repo.CreateAnnotation(r.Context(), graphID, &body, author)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (h *Handlers) UpdateAnnotation(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, graphID, models.RoleEditor); !ok {
		return
	}
	id, err := parseUUIDParam(r, "annotationId")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body models.UpdateAnnotationRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	a, err := h.Repo.UpdateAnnotation(r.Context(), id, &body)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if a == nil {
		writeJSONErr(w, http.StatusNotFound, "annotation not found")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (h *Handlers) DeleteAnnotation(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, graphID, models.RoleEditor); !ok {
		return
	}
	id, err := parseUUIDParam(r, "annotationId")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	deleted, err := h.Repo.DeleteAnnotation(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "annotation not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ----- Search Arounds -----

func (h *Handlers) ListSearchArounds(w http.ResponseWriter, r *http.Request) {
	owner, ok := caller(r)
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	page := parseIntQuery(r, "page", 1)
	perPage := parseIntQuery(r, "per_page", 50)
	projectID := parseUUIDQuery(r, "project_id")
	startingTypeID := parseUUIDQuery(r, "starting_object_type_id")
	search := r.URL.Query().Get("search")
	items, total, err := h.Repo.ListSearchArounds(r.Context(), owner, projectID, startingTypeID, search, page, perPage)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.Page[models.SearchAround]{
		Data: items, Total: total, Page: page, PerPage: perPage,
	})
}

func (h *Handlers) GetSearchAround(w http.ResponseWriter, r *http.Request) {
	if _, ok := caller(r); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	sa, err := h.Repo.GetSearchAround(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if sa == nil {
		writeJSONErr(w, http.StatusNotFound, "search around not found")
		return
	}
	writeJSON(w, http.StatusOK, sa)
}

func (h *Handlers) CreateSearchAround(w http.ResponseWriter, r *http.Request) {
	owner, ok := caller(r)
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body models.CreateSearchAroundRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	sa, err := h.Repo.CreateSearchAround(r.Context(), &body, owner)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, sa)
}

func (h *Handlers) UpdateSearchAround(w http.ResponseWriter, r *http.Request) {
	if _, ok := caller(r); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body models.UpdateSearchAroundRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	sa, err := h.Repo.UpdateSearchAround(r.Context(), id, &body)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if sa == nil {
		writeJSONErr(w, http.StatusNotFound, "search around not found")
		return
	}
	writeJSON(w, http.StatusOK, sa)
}

func (h *Handlers) DeleteSearchAround(w http.ResponseWriter, r *http.Request) {
	if _, ok := caller(r); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	deleted, err := h.Repo.DeleteSearchAround(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "search around not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ----- Scenarios -----

func (h *Handlers) ListScenarios(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, graphID, models.RoleViewer); !ok {
		return
	}
	page := parseIntQuery(r, "page", 1)
	perPage := parseIntQuery(r, "per_page", 50)
	items, total, err := h.Repo.ListScenarios(r.Context(), graphID, page, perPage)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.Page[models.Scenario]{
		Data: items, Total: total, Page: page, PerPage: perPage,
	})
}

func (h *Handlers) GetScenario(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, graphID, models.RoleViewer); !ok {
		return
	}
	id, err := parseUUIDParam(r, "scenarioId")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	s, err := h.Repo.GetScenario(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if s == nil {
		writeJSONErr(w, http.StatusNotFound, "scenario not found")
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (h *Handlers) CreateScenario(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	author, _, ok := h.requireGraphRole(w, r, graphID, models.RoleEditor)
	if !ok {
		return
	}
	var body models.CreateScenarioRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	s, err := h.Repo.CreateScenario(r.Context(), graphID, &body, author)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, s)
}

func (h *Handlers) UpdateScenario(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, graphID, models.RoleEditor); !ok {
		return
	}
	id, err := parseUUIDParam(r, "scenarioId")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body models.UpdateScenarioRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	s, err := h.Repo.UpdateScenario(r.Context(), id, &body)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if s == nil {
		writeJSONErr(w, http.StatusNotFound, "scenario not found")
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (h *Handlers) DeleteScenario(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, graphID, models.RoleEditor); !ok {
		return
	}
	id, err := parseUUIDParam(r, "scenarioId")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	deleted, err := h.Repo.DeleteScenario(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "scenario not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) DiffScenario(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, graphID, models.RoleViewer); !ok {
		return
	}
	id, err := parseUUIDParam(r, "scenarioId")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	diff, err := h.Repo.DiffScenario(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if diff == nil {
		writeJSONErr(w, http.StatusNotFound, "scenario not found")
		return
	}
	writeJSON(w, http.StatusOK, diff)
}

// PromoteScenario produces a list of dry-run action invocation ids
// that the caller can submit through ontology-actions-service for
// approval. We do not invoke ontology-actions from here — this
// handler returns the synthesized invocation ids derived from the
// scenario edits so the frontend can show the upcoming action set.
func (h *Handlers) PromoteScenario(w http.ResponseWriter, r *http.Request) {
	graphID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, _, ok := h.requireGraphRole(w, r, graphID, models.RoleEditor); !ok {
		return
	}
	id, err := parseUUIDParam(r, "scenarioId")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	s, err := h.Repo.GetScenario(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if s == nil {
		writeJSONErr(w, http.StatusNotFound, "scenario not found")
		return
	}
	ids := make([]uuid.UUID, 0)
	for _, e := range s.Edits {
		if e.ActionID != nil && *e.ActionID != uuid.Nil {
			ids = append(ids, *e.ActionID)
		}
	}
	writeJSON(w, http.StatusOK, models.PromoteScenarioResponse{ActionInvocationIDs: ids})
}

// ----- Derived properties -----

func (h *Handlers) ListDerivedPropertyBindings(w http.ResponseWriter, r *http.Request) {
	if _, ok := caller(r); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	objectTypeID := parseUUIDQuery(r, "object_type_id")
	items, err := h.Repo.ListDerivedPropertyBindings(r.Context(), objectTypeID)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.DerivedPropertyBinding]{Items: items})
}

func (h *Handlers) CreateDerivedPropertyBinding(w http.ResponseWriter, r *http.Request) {
	owner, ok := caller(r)
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body models.CreateDerivedPropertyBindingRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	b, err := h.Repo.CreateDerivedPropertyBinding(r.Context(), &body, owner)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, b)
}

func (h *Handlers) DeleteDerivedPropertyBinding(w http.ResponseWriter, r *http.Request) {
	if _, ok := caller(r); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := parseUUIDParam(r, "id")
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	deleted, err := h.Repo.DeleteDerivedPropertyBinding(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "binding not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
