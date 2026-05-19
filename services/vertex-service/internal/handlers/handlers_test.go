package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
)

// withClaims returns a request whose context already carries an
// authenticated caller, bypassing the JWT middleware that wraps the
// real routes. Pass a zero uuid to use a fresh random subject; pass
// a fixed uuid when subsequent requests in the same test need to
// look like the same user (e.g. owner-only operations).
func withClaims(req *http.Request, sub ...uuid.UUID) *http.Request {
	var s uuid.UUID
	if len(sub) > 0 && sub[0] != uuid.Nil {
		s = sub[0]
	} else {
		s = uuid.New()
	}
	claims := &authmw.Claims{Sub: s}
	return req.WithContext(authmw.ContextWithClaims(req.Context(), claims))
}

func newRouter(h *handlers.Handlers) chi.Router {
	r := chi.NewRouter()
	r.Get("/graphs", h.ListGraphs)
	r.Post("/graphs", h.CreateGraph)
	r.Get("/graphs/{id}", h.GetGraph)
	r.Patch("/graphs/{id}", h.UpdateGraph)
	r.Delete("/graphs/{id}", h.DeleteGraph)
	r.Post("/graphs/{id}/fork", h.ForkGraph)
	r.Post("/graphs/{id}/versions", h.CreateGraphVersion)
	r.Post("/graphs/{id}/versioning", h.SetVersioningEnabled)
	r.Post("/graphs/{id}/versions/{version}/revert", h.RevertGraphVersion)
	r.Get("/graphs/{id}/versions", h.ListGraphVersions)
	r.Get("/graphs/{id}/annotations", h.ListAnnotations)
	r.Post("/graphs/{id}/annotations", h.CreateAnnotation)
	r.Patch("/graphs/{id}/annotations/{annotationId}", h.UpdateAnnotation)
	r.Delete("/graphs/{id}/annotations/{annotationId}", h.DeleteAnnotation)
	r.Post("/graphs/{id}/scenarios", h.CreateScenario)
	r.Get("/graphs/{id}/scenarios", h.ListScenarios)
	r.Get("/graphs/{id}/scenarios/{scenarioId}", h.GetScenario)
	r.Post("/graphs/{id}/scenarios/{scenarioId}/diff", h.DiffScenario)
	r.Post("/graphs/{id}/scenarios/{scenarioId}/promote", h.PromoteScenario)
	r.Post("/search-arounds", h.CreateSearchAround)
	r.Get("/search-arounds", h.ListSearchArounds)
	r.Get("/search-arounds/{id}", h.GetSearchAround)
	r.Post("/derived-property-bindings", h.CreateDerivedPropertyBinding)
	r.Get("/derived-property-bindings", h.ListDerivedPropertyBindings)
	return r
}

func mustEncode(t *testing.T, v any) *bytes.Buffer {
	t.Helper()
	buf := &bytes.Buffer{}
	require.NoError(t, json.NewEncoder(buf).Encode(v))
	return buf
}

func decodeJSON(t *testing.T, body []byte, into any) {
	t.Helper()
	require.NoError(t, json.Unmarshal(body, into))
}

// ----- Graphs -----

func TestCreateGraphRequiresAuth(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	req := httptest.NewRequest(http.MethodPost, "/graphs", strings.NewReader(`{"title":"x"}`))
	rec := httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestCreateGraphRequiresTitle(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	req := withClaims(httptest.NewRequest(http.MethodPost, "/graphs", mustEncode(t, models.CreateGraphRequest{})))
	rec := httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestGraphCRUD(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	h := &handlers.Handlers{Repo: store}
	router := newRouter(h)
	owner := uuid.New()

	// Create
	body := mustEncode(t, models.CreateGraphRequest{Title: "Hamburg Battery Line"})
	req := withClaims(httptest.NewRequest(http.MethodPost, "/graphs", body), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var created models.Graph
	decodeJSON(t, rec.Body.Bytes(), &created)
	require.NotEqual(t, uuid.Nil, created.ID)
	require.True(t, strings.HasPrefix(created.RID, "ri.vertex.main.graph."))

	// Get (owner sees full payload)
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+created.ID.String(), nil), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// Patch
	title := "Hamburg Electrode Line"
	body = mustEncode(t, models.UpdateGraphRequest{Title: &title})
	req = withClaims(httptest.NewRequest(http.MethodPatch, "/graphs/"+created.ID.String(), body), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var updated models.Graph
	decodeJSON(t, rec.Body.Bytes(), &updated)
	require.Equal(t, title, updated.Title)

	// Fork
	body = mustEncode(t, models.ForkGraphRequest{NewTitle: "Hamburg Electrode Line (copy)"})
	req = withClaims(httptest.NewRequest(http.MethodPost, "/graphs/"+created.ID.String()+"/fork", body), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var fork models.Graph
	decodeJSON(t, rec.Body.Bytes(), &fork)
	require.NotEqual(t, created.ID, fork.ID)
	require.Equal(t, "Hamburg Electrode Line (copy)", fork.Title)

	// List (each graph created by `owner` so list returns at least both)
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graphs?per_page=10", nil), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var page models.Page[models.Graph]
	decodeJSON(t, rec.Body.Bytes(), &page)
	require.GreaterOrEqual(t, page.Total, 2)

	// Delete
	req = withClaims(httptest.NewRequest(http.MethodDelete, "/graphs/"+fork.ID.String(), nil), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestGraphVersioning(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	h := &handlers.Handlers{Repo: store}
	router := newRouter(h)
	owner := uuid.New()

	body := mustEncode(t, models.CreateGraphRequest{Title: "Flight Delay Impact"})
	req := withClaims(httptest.NewRequest(http.MethodPost, "/graphs", body), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var g models.Graph
	decodeJSON(t, rec.Body.Bytes(), &g)

	// Versions default off — first save must be rejected.
	body = mustEncode(t, models.CreateGraphVersionRequest{Changelog: "initial save"})
	req = withClaims(httptest.NewRequest(http.MethodPost, "/graphs/"+g.ID.String()+"/versions", body), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusConflict, rec.Code)

	// Enable versioning.
	body = mustEncode(t, models.EnableVersioningRequest{Enabled: true})
	req = withClaims(httptest.NewRequest(http.MethodPost, "/graphs/"+g.ID.String()+"/versioning", body), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// Save version v1
	body = mustEncode(t, models.CreateGraphVersionRequest{Changelog: "initial save"})
	req = withClaims(httptest.NewRequest(http.MethodPost, "/graphs/"+g.ID.String()+"/versions", body), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var v1 models.GraphVersion
	decodeJSON(t, rec.Body.Bytes(), &v1)
	require.Equal(t, 1, v1.Version)

	// Save version v2
	body = mustEncode(t, models.CreateGraphVersionRequest{Changelog: "after layout tweak"})
	req = withClaims(httptest.NewRequest(http.MethodPost, "/graphs/"+g.ID.String()+"/versions", body), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var v2 models.GraphVersion
	decodeJSON(t, rec.Body.Bytes(), &v2)
	require.Equal(t, 2, v2.Version)

	// List versions
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graphs/"+g.ID.String()+"/versions", nil), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var page models.Page[models.GraphVersion]
	decodeJSON(t, rec.Body.Bytes(), &page)
	require.Equal(t, 2, page.Total)
}

// ----- Scenarios -----

func TestScenarioCRUDAndDiff(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	h := &handlers.Handlers{Repo: store}
	router := newRouter(h)
	owner := uuid.New()

	body := mustEncode(t, models.CreateGraphRequest{Title: "Production Line"})
	req := withClaims(httptest.NewRequest(http.MethodPost, "/graphs", body), owner)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var g models.Graph
	decodeJSON(t, rec.Body.Bytes(), &g)

	edits := []models.StagedEdit{
		{Kind: "property_change", TargetRef: "type-a:obj-1", PropertyName: "Cancelled", NewValueJSON: json.RawMessage(`true`)},
		{Kind: "link_add", TargetRef: "link-type-a:src:dst"},
		{Kind: "link_remove", TargetRef: "link-type-b:src:dst"},
	}
	body = mustEncode(t, models.CreateScenarioRequest{
		Name:  "Cancel flight AA1004",
		Edits: edits,
	})
	req = withClaims(httptest.NewRequest(http.MethodPost, "/graphs/"+g.ID.String()+"/scenarios", body), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var s models.Scenario
	decodeJSON(t, rec.Body.Bytes(), &s)
	require.Equal(t, 3, len(s.Edits))

	// Diff
	req = withClaims(httptest.NewRequest(http.MethodPost,
		"/graphs/"+g.ID.String()+"/scenarios/"+s.ID.String()+"/diff", nil), owner)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var diff models.ScenarioDiff
	decodeJSON(t, rec.Body.Bytes(), &diff)
	require.Equal(t, 1, diff.ChangedNodeCount)
	require.Equal(t, 1, diff.AddedCount)
	require.Equal(t, 1, diff.RemovedCount)
	require.Equal(t, 3, len(diff.ImpactedObjectRefs))
}

// ----- Search Arounds -----

func TestSearchAroundRoundTrip(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	h := &handlers.Handlers{Repo: store}
	router := newRouter(h)

	startingType := uuid.New()
	relation := uuid.New()
	body := mustEncode(t, models.CreateSearchAroundRequest{
		Title:                "Flights into NY from SFO between dates",
		StartingObjectTypeID: startingType,
		Steps: []models.SearchAroundStep{
			{
				Ordinal:    0,
				RelationID: relation,
				Direction:  "outgoing",
				Filters: []models.SearchAroundFilter{
					{Property: "Date", Op: "range", ParameterRef: "DateRange"},
				},
			},
		},
		Parameters: []models.SearchAroundParameter{
			{Name: "DateRange", Type: "date", Required: true},
			{Name: "State", Type: "string", DefaultValueJSON: json.RawMessage(`"NY"`)},
		},
	})
	req := withClaims(httptest.NewRequest(http.MethodPost, "/search-arounds", body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var sa models.SearchAround
	decodeJSON(t, rec.Body.Bytes(), &sa)
	require.Equal(t, "Flights into NY from SFO between dates", sa.Title)
	require.Equal(t, 1, len(sa.Steps))
	require.Equal(t, 2, len(sa.Parameters))
	require.True(t, strings.HasPrefix(sa.RID, "ri.vertex.main.search-around."))

	// Get
	req = withClaims(httptest.NewRequest(http.MethodGet, "/search-arounds/"+sa.ID.String(), nil))
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
}

// ----- Derived properties -----

func TestDerivedPropertyBinding(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	h := &handlers.Handlers{Repo: store}
	router := newRouter(h)
	objectType := uuid.New()

	body := mustEncode(t, models.CreateDerivedPropertyBindingRequest{
		ObjectTypeID: objectType,
		PropertyName: "Airport Route Alert Count",
		DisplayName:  "Airport Route Alert Count",
		FunctionRID:  "ri.functions.main.fn.count-route-alerts",
		ReturnType:   "number",
	})
	req := withClaims(httptest.NewRequest(http.MethodPost, "/derived-property-bindings", body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var binding models.DerivedPropertyBinding
	decodeJSON(t, rec.Body.Bytes(), &binding)
	require.Equal(t, "Airport Route Alert Count", binding.DisplayName)

	// List filtered by object type
	req = withClaims(httptest.NewRequest(http.MethodGet, "/derived-property-bindings?object_type_id="+objectType.String(), nil))
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var list models.ListResponse[models.DerivedPropertyBinding]
	decodeJSON(t, rec.Body.Bytes(), &list)
	require.Equal(t, 1, len(list.Items))
}

// Compile-time check that the fake satisfies the real Store interface.
var _ handlers.Store = (*fakeStore)(nil)

// Silence the unused context warning on the imports.
var _ = context.Background
