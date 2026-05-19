package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
	"github.com/openfoundry/openfoundry-go/services/ontology-query-service/internal/handlers"
)

func TestLinkSummaryRequiresAuth(t *testing.T) {
	t.Parallel()
	h := handlers.New(handlers.AppState{Links: &fakeLinkStore{}})
	req := httptest.NewRequest("GET", "/objects/x/y/link-summary", nil)
	rec := httptest.NewRecorder()
	h.LinkSummary(rec, req)
	assert.Equal(t, 401, rec.Code)
}

func TestLinkSummaryAggregatesRequestedTypes(t *testing.T) {
	t.Parallel()
	links := &fakeLinkStore{
		outRes: repos.PagedResult[repos.Link]{Items: []repos.Link{{From: "x", To: "y"}}},
		inRes:  repos.PagedResult[repos.Link]{Items: []repos.Link{{From: "z", To: "x"}, {From: "w", To: "x"}}},
	}
	h := handlers.New(handlers.AppState{Links: links})
	tenant := uuid.New().String()
	object := uuid.New().String()
	req := authedReq("GET",
		"/objects/"+tenant+"/"+object+"/link-summary?link_types=DEPARTING_FLIGHT,ARRIVING_FLIGHT",
		map[string]string{"tenant": tenant, "object_id": object},
		&authmw.Claims{Sub: uuid.New(), Roles: []string{"admin"}})
	rec := httptest.NewRecorder()
	h.LinkSummary(rec, req)
	require.Equal(t, 200, rec.Code)
	var out handlers.LinkSummaryResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&out))
	require.Equal(t, 4, len(out.Entries))
}

// payloadObjectStore returns objects by id from a fixed map. Used to
// exercise traversal and histogram aggregation without spinning up a
// real backend.
type payloadObjectStore struct{ byID map[string]repos.Object }

func (s *payloadObjectStore) Get(_ context.Context, _ repos.TenantId, id repos.ObjectId, _ repos.ReadConsistency) (*repos.Object, error) {
	if obj, ok := s.byID[string(id)]; ok {
		cp := obj
		return &cp, nil
	}
	return nil, nil
}
func (s *payloadObjectStore) Put(context.Context, repos.Object, *uint64) (repos.PutOutcome, error) {
	return repos.PutOutcome{}, repos.Backend("not implemented")
}
func (s *payloadObjectStore) Delete(context.Context, repos.TenantId, repos.ObjectId) (bool, error) {
	return false, repos.Backend("not implemented")
}
func (s *payloadObjectStore) ListByType(context.Context, repos.TenantId, repos.TypeId, repos.Page, repos.ReadConsistency) (repos.PagedResult[repos.Object], error) {
	return repos.PagedResult[repos.Object]{}, repos.Backend("not implemented")
}
func (s *payloadObjectStore) ListByOwner(context.Context, repos.TenantId, repos.OwnerId, repos.Page, repos.ReadConsistency) (repos.PagedResult[repos.Object], error) {
	return repos.PagedResult[repos.Object]{}, repos.Backend("not implemented")
}
func (s *payloadObjectStore) ListByMarking(context.Context, repos.TenantId, repos.MarkingId, repos.Page, repos.ReadConsistency) (repos.PagedResult[repos.Object], error) {
	return repos.PagedResult[repos.Object]{}, repos.Backend("not implemented")
}

// postJSONReq returns an authed POST request whose body is the JSON
// encoding of `body`. Reuses authedReq from handlers_test.go.
func postJSONReq(t *testing.T, target string, body any) *http.Request {
	t.Helper()
	buf := &bytes.Buffer{}
	require.NoError(t, json.NewEncoder(buf).Encode(body))
	req := authedReq("POST", target, nil, &authmw.Claims{Sub: uuid.New(), Roles: []string{"admin"}})
	req.Body = io.NopCloser(buf)
	return req
}

func TestHistogramAggregatesProperties(t *testing.T) {
	t.Parallel()
	tenant := uuid.New().String()
	a := uuid.New().String()
	b := uuid.New().String()

	objects := &payloadObjectStore{byID: map[string]repos.Object{
		a: {ID: repos.ObjectId(a), TypeID: repos.TypeId("flight"), Payload: json.RawMessage(`{"Cancelled": false, "AirTime": 151}`)},
		b: {ID: repos.ObjectId(b), TypeID: repos.TypeId("flight"), Payload: json.RawMessage(`{"Cancelled": true,  "AirTime": 174}`)},
	}}
	h := handlers.New(handlers.AppState{Objects: objects, Links: &fakeLinkStore{}})

	body := handlers.HistogramRequest{
		Tenant: tenant,
		ObjectRefs: []handlers.ObjectRef{
			{ObjectTypeID: "flight", ObjectID: a},
			{ObjectTypeID: "flight", ObjectID: b},
		},
		Properties: []string{"Cancelled", "AirTime"},
	}
	req := postJSONReq(t, "/histogram", body)
	rec := httptest.NewRecorder()
	h.Histogram(rec, req)
	require.Equal(t, 200, rec.Code)
	var out handlers.HistogramResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&out))
	// 2 per-property facets (Cancelled, AirTime) + 1 synthetic
	// "Object Types" facet always prepended.
	require.Equal(t, 3, len(out.Facets))
	// First facet must be the cross-type breakdown.
	assert.Equal(t, "@object_type", out.Facets[0].Property)
	assert.Equal(t, int64(2), out.Facets[0].N)
	assert.Equal(t, int64(1), out.Facets[0].Uniq)
	for _, f := range out.Facets[1:] {
		assert.Equal(t, int64(2), f.N, "facet %s", f.Property)
	}
	for _, f := range out.Facets {
		if f.Property != "AirTime" {
			continue
		}
		require.NotNil(t, f.Numeric)
		assert.Equal(t, float64(325), f.Numeric.Sum)
		assert.Equal(t, int64(2), f.Numeric.N)
	}
}

func TestHistogramObjectTypesFacetSpansTypes(t *testing.T) {
	t.Parallel()
	tenant := uuid.New().String()
	a := uuid.New().String()
	b := uuid.New().String()
	c := uuid.New().String()

	objects := &payloadObjectStore{byID: map[string]repos.Object{
		a: {ID: repos.ObjectId(a), TypeID: repos.TypeId("flight"), Payload: json.RawMessage(`{}`)},
		b: {ID: repos.ObjectId(b), TypeID: repos.TypeId("flight"), Payload: json.RawMessage(`{}`)},
		c: {ID: repos.ObjectId(c), TypeID: repos.TypeId("airport"), Payload: json.RawMessage(`{}`)},
	}}
	h := handlers.New(handlers.AppState{Objects: objects, Links: &fakeLinkStore{}})

	body := handlers.HistogramRequest{
		Tenant: tenant,
		ObjectRefs: []handlers.ObjectRef{
			{ObjectTypeID: "flight", ObjectID: a},
			{ObjectTypeID: "flight", ObjectID: b},
			{ObjectTypeID: "airport", ObjectID: c},
		},
	}
	req := postJSONReq(t, "/histogram", body)
	rec := httptest.NewRecorder()
	h.Histogram(rec, req)
	require.Equal(t, 200, rec.Code)
	var out handlers.HistogramResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&out))
	require.GreaterOrEqual(t, len(out.Facets), 1)
	facet := out.Facets[0]
	require.Equal(t, "@object_type", facet.Property)
	require.Equal(t, int64(3), facet.N)
	require.Equal(t, int64(2), facet.Uniq)
	// Buckets are sorted by count descending; flight (2) must come first.
	require.Equal(t, 2, len(facet.Buckets))
	assert.Equal(t, int64(2), facet.Buckets[0].Count)
	assert.Equal(t, `"flight"`, string(facet.Buckets[0].ValueJSON))
	assert.Equal(t, int64(1), facet.Buckets[1].Count)
	assert.Equal(t, `"airport"`, string(facet.Buckets[1].ValueJSON))
}

func TestTraverseExecutesSingleHopWithFilters(t *testing.T) {
	t.Parallel()
	tenant := uuid.New().String()
	src := uuid.New().String()
	dst := uuid.New().String()
	links := &fakeLinkStore{
		outRes: repos.PagedResult[repos.Link]{Items: []repos.Link{{From: repos.ObjectId(src), To: repos.ObjectId(dst)}}},
	}
	objects := &payloadObjectStore{byID: map[string]repos.Object{
		dst: {ID: repos.ObjectId(dst), TypeID: repos.TypeId("flight"), Payload: json.RawMessage(`{"Cancelled": false}`)},
	}}
	h := handlers.New(handlers.AppState{Objects: objects, Links: links})
	body := handlers.TraverseRequest{
		Tenant: tenant,
		StartingSet: []handlers.ObjectRef{
			{ObjectTypeID: "airport", ObjectID: src},
		},
		Steps: []handlers.SearchAroundStep{
			{
				Ordinal:    0,
				RelationID: "DEPARTING_FLIGHT",
				Direction:  "outgoing",
				Filters: []handlers.SearchAroundFilter{
					{Property: "Cancelled", Op: "eq", LiteralJSON: json.RawMessage(`false`)},
				},
			},
		},
	}
	req := postJSONReq(t, "/traverse", body)
	rec := httptest.NewRecorder()
	h.Traverse(rec, req)
	require.Equal(t, 200, rec.Code)
	var out handlers.TraverseResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&out))
	require.Equal(t, 1, len(out.Groups))
	assert.Equal(t, "flight", out.Groups[0].ObjectTypeID)
	assert.Equal(t, 1, out.Groups[0].Total)
}

func TestTraverseFiltersOutMismatch(t *testing.T) {
	t.Parallel()
	tenant := uuid.New().String()
	src := uuid.New().String()
	dst := uuid.New().String()
	links := &fakeLinkStore{
		outRes: repos.PagedResult[repos.Link]{Items: []repos.Link{{From: repos.ObjectId(src), To: repos.ObjectId(dst)}}},
	}
	objects := &payloadObjectStore{byID: map[string]repos.Object{
		dst: {ID: repos.ObjectId(dst), TypeID: repos.TypeId("flight"), Payload: json.RawMessage(`{"Cancelled": true}`)},
	}}
	h := handlers.New(handlers.AppState{Objects: objects, Links: links})
	body := handlers.TraverseRequest{
		Tenant: tenant,
		StartingSet: []handlers.ObjectRef{
			{ObjectTypeID: "airport", ObjectID: src},
		},
		Steps: []handlers.SearchAroundStep{
			{
				RelationID: "DEPARTING_FLIGHT",
				Direction:  "outgoing",
				Filters: []handlers.SearchAroundFilter{
					{Property: "Cancelled", Op: "eq", LiteralJSON: json.RawMessage(`false`)},
				},
			},
		},
	}
	req := postJSONReq(t, "/traverse", body)
	rec := httptest.NewRecorder()
	h.Traverse(rec, req)
	require.Equal(t, 200, rec.Code)
	var out handlers.TraverseResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&out))
	require.Equal(t, 0, len(out.Groups))
}
