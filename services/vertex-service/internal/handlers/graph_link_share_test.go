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

func linkShareRouter(h *handlers.Handlers) chi.Router {
	r := chi.NewRouter()
	r.Post("/graphs", h.CreateGraph)
	r.Get("/graphs/{id}", h.GetGraph)
	r.Patch("/graphs/{id}", h.UpdateGraph)
	r.Get("/graphs/{id}/link-share", h.GetLinkShare)
	r.Put("/graphs/{id}/link-share", h.PutLinkShare)
	r.Get("/shared/{token}", h.ResolveShared)
	return r
}

func TestLinkShareDefaultsToDisabled(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := linkShareRouter(h)
	owner := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	req := withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+g.ID.String()+"/link-share", nil), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var share models.LinkShare
	decodeJSON(t, rec.Body.Bytes(), &share)
	assert.False(t, share.Enabled)
	assert.Empty(t, share.Token)
	assert.Equal(t, models.RoleNone, share.Role)
}

func TestEnableLinkShareIssuesToken(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := linkShareRouter(h)
	owner := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/link-share",
		mustEncode(t, models.UpdateLinkShareRequest{Enabled: true, Role: models.RoleViewer})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var share models.LinkShare
	decodeJSON(t, rec.Body.Bytes(), &share)
	require.True(t, share.Enabled)
	require.NotEmpty(t, share.Token)
	assert.Equal(t, models.RoleViewer, share.Role)
}

func TestOwnerEscalatesLinkShareOwnerRoleToViewer(t *testing.T) {
	t.Parallel()
	// The repo deliberately rejects Owner-via-link-share. Confirm the
	// fake (and by extension the real repo) downgrades to Viewer.
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := linkShareRouter(h)
	owner := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/link-share",
		mustEncode(t, models.UpdateLinkShareRequest{Enabled: true, Role: models.RoleOwner})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var share models.LinkShare
	decodeJSON(t, rec.Body.Bytes(), &share)
	assert.Equal(t, models.RoleViewer, share.Role)
}

func TestRotateTokenPreservesRoleButChangesToken(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := linkShareRouter(h)
	owner := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	// Enable.
	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/link-share",
		mustEncode(t, models.UpdateLinkShareRequest{Enabled: true, Role: models.RoleEditor})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var first models.LinkShare
	decodeJSON(t, rec.Body.Bytes(), &first)
	require.NotEmpty(t, first.Token)

	// Rotate.
	req = withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/link-share",
		mustEncode(t, models.UpdateLinkShareRequest{
			Enabled: true, Role: models.RoleEditor, RotateToken: true,
		})), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var second models.LinkShare
	decodeJSON(t, rec.Body.Bytes(), &second)
	assert.NotEqual(t, first.Token, second.Token, "rotation must mint a fresh token")
	assert.Equal(t, models.RoleEditor, second.Role)
}

func TestDisableLinkShareClearsToken(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := linkShareRouter(h)
	owner := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	// Enable then disable.
	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/link-share",
		mustEncode(t, models.UpdateLinkShareRequest{Enabled: true, Role: models.RoleViewer})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var enabled models.LinkShare
	decodeJSON(t, rec.Body.Bytes(), &enabled)
	token := enabled.Token

	req = withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/link-share",
		mustEncode(t, models.UpdateLinkShareRequest{Enabled: false})), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var disabled models.LinkShare
	decodeJSON(t, rec.Body.Bytes(), &disabled)
	assert.False(t, disabled.Enabled)
	assert.Empty(t, disabled.Token)

	// The previously-issued token must no longer resolve.
	req = withClaims(httptest.NewRequest(http.MethodGet, "/shared/"+token, nil), uuid.New())
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestSharedResolvesForOutsiderAndLiftsRole(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	h := &handlers.Handlers{Repo: store}
	router := linkShareRouter(h)
	owner := uuid.New()
	stranger := uuid.New()
	g := createOwnedGraph(t, router, owner, "Hamburg Battery Line")

	// Stranger sees 404 without the token.
	req := withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+g.ID.String(), nil), stranger)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)

	// Owner enables link sharing with Viewer role.
	req = withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/link-share",
		mustEncode(t, models.UpdateLinkShareRequest{Enabled: true, Role: models.RoleViewer})), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var share models.LinkShare
	decodeJSON(t, rec.Body.Bytes(), &share)
	require.NotEmpty(t, share.Token)

	// Stranger now resolves through /shared/{token}.
	req = withClaims(httptest.NewRequest(http.MethodGet, "/shared/"+share.Token, nil), stranger)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var resp models.SharedGraphResponse
	decodeJSON(t, rec.Body.Bytes(), &resp)
	assert.Equal(t, models.RoleViewer, resp.Role)
	assert.Equal(t, models.RoleViewer, resp.LinkShareRole)
	require.NotNil(t, resp.Graph)
	assert.Equal(t, "Hamburg Battery Line", resp.Graph.Title)
}

func TestSharedDiscovererRoleReturnsRedactedView(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := linkShareRouter(h)
	owner := uuid.New()
	stranger := uuid.New()
	g := createOwnedGraph(t, router, owner, "Top Secret Plan")

	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/link-share",
		mustEncode(t, models.UpdateLinkShareRequest{Enabled: true, Role: models.RoleDiscoverer})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var share models.LinkShare
	decodeJSON(t, rec.Body.Bytes(), &share)

	req = withClaims(httptest.NewRequest(http.MethodGet, "/shared/"+share.Token, nil), stranger)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var resp models.SharedGraphResponse
	decodeJSON(t, rec.Body.Bytes(), &resp)
	assert.Equal(t, models.RoleDiscoverer, resp.Role)
	assert.Nil(t, resp.Graph, "Graph must be nil when discoverer-only")
	require.NotNil(t, resp.Discoverer)
	assert.Equal(t, "Top Secret Plan", resp.Discoverer.Title)
}

func TestTokenViaQueryStringElevatesRole(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := linkShareRouter(h)
	owner := uuid.New()
	stranger := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/link-share",
		mustEncode(t, models.UpdateLinkShareRequest{Enabled: true, Role: models.RoleEditor})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var share models.LinkShare
	decodeJSON(t, rec.Body.Bytes(), &share)

	// PATCH via stranger + share_token query → 200 (token lifts to Editor).
	title := "Edited via link"
	req = withClaims(httptest.NewRequest(http.MethodPatch,
		"/graphs/"+g.ID.String()+"?share_token="+share.Token,
		mustEncode(t, models.UpdateGraphRequest{Title: &title})), stranger)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var updated models.Graph
	decodeJSON(t, rec.Body.Bytes(), &updated)
	assert.Equal(t, "Edited via link", updated.Title)

	// PATCH WITHOUT the token → 404 (stranger has no relationship).
	req = withClaims(httptest.NewRequest(http.MethodPatch, "/graphs/"+g.ID.String(),
		mustEncode(t, models.UpdateGraphRequest{Title: &title})), stranger)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestTokenViaHeaderAlsoElevates(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := linkShareRouter(h)
	owner := uuid.New()
	stranger := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/link-share",
		mustEncode(t, models.UpdateLinkShareRequest{Enabled: true, Role: models.RoleViewer})), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var share models.LinkShare
	decodeJSON(t, rec.Body.Bytes(), &share)

	req = withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+g.ID.String(), nil), stranger)
	req.Header.Set("X-Vertex-Share-Token", share.Token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
}

func TestNonOwnerCannotManageLinkShare(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	router := linkShareRouter(h)
	owner := uuid.New()
	editor := uuid.New()
	g := createOwnedGraph(t, router, owner, "Demo")

	// Add editor grant first.
	store := h.Repo.(*fakeStore)
	_, err := store.PutGrant(nil, g.ID,
		&models.PutGraphGrantRequest{
			PrincipalKind: models.PrincipalKindUser,
			PrincipalID:   editor,
			Role:          models.RoleEditor,
		}, owner)
	require.NoError(t, err)

	// Editor tries to enable link sharing → 403.
	req := withClaims(httptest.NewRequest(http.MethodPut, "/graphs/"+g.ID.String()+"/link-share",
		mustEncode(t, models.UpdateLinkShareRequest{Enabled: true, Role: models.RoleViewer})), editor)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusForbidden, rec.Code)

	// Editor tries to read link-share config → 403.
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+g.ID.String()+"/link-share", nil), editor)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusForbidden, rec.Code)
}
