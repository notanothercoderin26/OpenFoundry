package handlers_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
)

// aclRouter mounts the graph + grants + versioning routes the ACL
// tests exercise. Kept separate from newRouter to avoid bloating
// every handler test with grants endpoints.
func aclRouter(h *handlers.Handlers) chi.Router {
	r := chi.NewRouter()
	r.Post("/graphs", h.CreateGraph)
	r.Get("/graphs/{id}", h.GetGraph)
	r.Patch("/graphs/{id}", h.UpdateGraph)
	r.Delete("/graphs/{id}", h.DeleteGraph)
	r.Get("/graphs/{id}/grants", h.ListGrants)
	r.Put("/graphs/{id}/grants", h.PutGrant)
	r.Delete("/graphs/{id}/grants/{grantId}", h.DeleteGrant)
	r.Post("/graphs/{id}/versions", h.CreateGraphVersion)
	r.Post("/graphs/{id}/versions/{version}/revert", h.RevertGraphVersion)
	r.Post("/graphs/{id}/versioning", h.SetVersioningEnabled)
	return r
}

func createOwnedGraph(t *testing.T, router chi.Router, owner uuid.UUID, title string) models.Graph {
	t.Helper()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/graphs",
		mustEncode(t, models.CreateGraphRequest{Title: title})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var g models.Graph
	decodeJSON(t, rec.Body.Bytes(), &g)
	return g
}

func TestNonOwnerCannotGetGraph(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := aclRouter(h)
	owner := uuid.New()
	g := createOwnedGraph(t, router, owner, "Owner-only")

	// A different user without any grant should see 404 — the RID
	// is deliberately opaque to outsiders.
	stranger := uuid.New()
	req := withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+g.ID.String(), nil), stranger)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestViewerGetsFullPayloadDiscovererSeesRedacted(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	h := &handlers.Handlers{Repo: store}
	router := aclRouter(h)
	owner := uuid.New()
	viewer := uuid.New()
	discoverer := uuid.New()
	g := createOwnedGraph(t, router, owner, "Hamburg Battery Line")

	// Owner grants Viewer + Discoverer roles.
	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/grants",
		mustEncode(t, models.PutGraphGrantRequest{
			PrincipalKind: models.PrincipalKindUser, PrincipalID: viewer, Role: models.RoleViewer,
		})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	req = withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/grants",
		mustEncode(t, models.PutGraphGrantRequest{
			PrincipalKind: models.PrincipalKindUser, PrincipalID: discoverer, Role: models.RoleDiscoverer,
		})), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// Viewer pulls the full Graph payload (has layout/layers fields).
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+g.ID.String(), nil), viewer)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), "layout_state_json")
	assert.Contains(t, rec.Body.String(), "layer_configuration_json")

	// Discoverer pulls the redacted view — name + metadata only.
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+g.ID.String(), nil), discoverer)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	body := rec.Body.String()
	assert.Contains(t, body, "Hamburg Battery Line")
	assert.NotContains(t, body, "layout_state_json")
	assert.NotContains(t, body, "layer_configuration_json")
	assert.NotContains(t, body, "seed_object_refs")
}

func TestViewerCannotEditOrDelete(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := aclRouter(h)
	owner := uuid.New()
	viewer := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/grants",
		mustEncode(t, models.PutGraphGrantRequest{
			PrincipalKind: models.PrincipalKindUser, PrincipalID: viewer, Role: models.RoleViewer,
		})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// PATCH as viewer → 403.
	title := "Renamed"
	req = withClaims(httptest.NewRequest(http.MethodPatch, "/graphs/"+g.ID.String(),
		mustEncode(t, models.UpdateGraphRequest{Title: &title})), viewer)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)

	// DELETE as viewer → 403.
	req = withClaims(httptest.NewRequest(http.MethodDelete, "/graphs/"+g.ID.String(), nil), viewer)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestEditorCanPatchButNotDelete(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := aclRouter(h)
	owner := uuid.New()
	editor := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/grants",
		mustEncode(t, models.PutGraphGrantRequest{
			PrincipalKind: models.PrincipalKindUser, PrincipalID: editor, Role: models.RoleEditor,
		})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// PATCH succeeds.
	title := "Renamed by Editor"
	req = withClaims(httptest.NewRequest(http.MethodPatch, "/graphs/"+g.ID.String(),
		mustEncode(t, models.UpdateGraphRequest{Title: &title})), editor)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// DELETE 403 — owner-only.
	req = withClaims(httptest.NewRequest(http.MethodDelete, "/graphs/"+g.ID.String(), nil), editor)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestRevertCreatesNewVersionMatchingSnapshot(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := aclRouter(h)
	owner := uuid.New()
	g := createOwnedGraph(t, router, owner, "Initial Title")

	// Enable versioning.
	req := withClaims(httptest.NewRequest(http.MethodPost, "/graphs/"+g.ID.String()+"/versioning",
		mustEncode(t, models.EnableVersioningRequest{Enabled: true})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// Save v1 (captures "Initial Title").
	req = withClaims(httptest.NewRequest(http.MethodPost, "/graphs/"+g.ID.String()+"/versions",
		mustEncode(t, models.CreateGraphVersionRequest{Changelog: "v1"})), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)

	// Edit the title.
	title := "Modified Title"
	req = withClaims(httptest.NewRequest(http.MethodPatch, "/graphs/"+g.ID.String(),
		mustEncode(t, models.UpdateGraphRequest{Title: &title})), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// Save v2 (captures "Modified Title").
	req = withClaims(httptest.NewRequest(http.MethodPost, "/graphs/"+g.ID.String()+"/versions",
		mustEncode(t, models.CreateGraphVersionRequest{Changelog: "v2"})), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)

	// Revert to v1 — current state should snap back to "Initial Title".
	req = withClaims(httptest.NewRequest(http.MethodPost,
		"/graphs/"+g.ID.String()+"/versions/1/revert", nil), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var reverted models.Graph
	decodeJSON(t, rec.Body.Bytes(), &reverted)
	assert.Equal(t, "Initial Title", reverted.Title)
}

func TestGrantRoleNoneRevokes(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := aclRouter(h)
	owner := uuid.New()
	viewer := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	// Grant viewer.
	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/grants",
		mustEncode(t, models.PutGraphGrantRequest{
			PrincipalKind: models.PrincipalKindUser, PrincipalID: viewer, Role: models.RoleViewer,
		})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// Viewer can read.
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+g.ID.String(), nil), viewer)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// Revoke by sending role="" (RoleNone) → 204.
	req = withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/grants",
		mustEncode(t, models.PutGraphGrantRequest{
			PrincipalKind: models.PrincipalKindUser, PrincipalID: viewer, Role: models.RoleNone,
		})), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNoContent, rec.Code)

	// Viewer now sees 404 again.
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+g.ID.String(), nil), viewer)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestOnlyOwnerCanManageGrants(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := aclRouter(h)
	owner := uuid.New()
	editor := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	// Owner grants editor.
	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/grants",
		mustEncode(t, models.PutGraphGrantRequest{
			PrincipalKind: models.PrincipalKindUser, PrincipalID: editor, Role: models.RoleEditor,
		})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// Editor tries to add a new grant → 403 (owner-only).
	stranger := uuid.New()
	req = withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/grants",
		mustEncode(t, models.PutGraphGrantRequest{
			PrincipalKind: models.PrincipalKindUser, PrincipalID: stranger, Role: models.RoleViewer,
		})), editor)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)

	// Editor cannot list grants either.
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+g.ID.String()+"/grants", nil), editor)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}
