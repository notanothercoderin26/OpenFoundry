package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
	"github.com/openfoundry/openfoundry-go/services/ontology-query-service/internal/handlers"
)

// ──────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────

type seededHit struct {
	id        string
	typeID    string
	payload   map[string]any
	embedding []float32
}

// seededBackend builds an in-memory SearchBackend prefilled with hits
// scoped to the given tenant. The default test tenant is fixed so
// every helper can resolve the same `claims.OrgID`.
func seededBackend(t *testing.T, tenant uuid.UUID, hits []seededHit) repos.SearchBackend {
	t.Helper()
	backend := searchabstraction.NewInMemoryBackend()
	for _, h := range hits {
		body, err := json.Marshal(h.payload)
		require.NoError(t, err)
		require.NoError(t, backend.Index(context.Background(), repos.IndexDoc{
			Tenant:    repos.TenantId(tenant.String()),
			ID:        repos.ObjectId(h.id),
			TypeID:    repos.TypeId(h.typeID),
			Payload:   body,
			Version:   1,
			Embedding: h.embedding,
		}))
	}
	return backend
}

func newSearchHandler(t *testing.T, tenant uuid.UUID, hits []seededHit) *handlers.Handlers {
	t.Helper()
	return handlers.New(handlers.AppState{Search: seededBackend(t, tenant, hits)})
}

func searchRequest(t *testing.T, claims *authmw.Claims, body map[string]any) *http.Request {
	t.Helper()
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	req := httptest.NewRequest("POST", "/api/v1/ontology/search", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	if claims == nil {
		claims = searchAdminClaims(uuid.New())
	}
	return req.WithContext(authmw.ContextWithClaims(req.Context(), claims))
}

func searchAdminClaims(tenant uuid.UUID) *authmw.Claims {
	return &authmw.Claims{Sub: uuid.New(), Roles: []string{"admin"}, OrgID: &tenant}
}

func searchAnalystClaims(tenant uuid.UUID, markings ...string) *authmw.Claims {
	scope := &authmw.SessionScope{AllowedMarkings: markings}
	return &authmw.Claims{Sub: uuid.New(), Roles: []string{"user"}, OrgID: &tenant, SessionScope: scope}
}

func decodeSearchResponse(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body
}

func resultIDs(body map[string]any) []string {
	rows, _ := body["data"].([]any)
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		m, ok := row.(map[string]any)
		if !ok {
			continue
		}
		if id, ok := m["id"].(string); ok {
			ids = append(ids, id)
		}
	}
	return ids
}

// ──────────────────────────────────────────────────────────────────
// Auth + wiring guards
// ──────────────────────────────────────────────────────────────────

func TestSearchRequiresAuth(t *testing.T) {
	t.Parallel()
	h := newSearchHandler(t, uuid.New(), nil)
	req := httptest.NewRequest("POST", "/search", bytes.NewReader([]byte(`{"query":"x"}`)))
	rec := httptest.NewRecorder()
	h.Search(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Contains(t, rec.Body.String(), "authentication required")
}

func TestSearchReturns503WhenBackendUnconfigured(t *testing.T) {
	t.Parallel()
	h := handlers.New(handlers.AppState{}) // no Search backend
	tenant := uuid.New()
	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{"query": "x"})
	rec := httptest.NewRecorder()
	h.Search(rec, req)
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
	assert.Contains(t, rec.Body.String(), "search backend not configured")
}

func TestSearchRejectsMalformedBody(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	h := newSearchHandler(t, tenant, nil)
	req := httptest.NewRequest("POST", "/search", bytes.NewReader([]byte(`{"query":`)))
	req = req.WithContext(authmw.ContextWithClaims(req.Context(), searchAdminClaims(tenant)))
	rec := httptest.NewRecorder()
	h.Search(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "invalid request body")
}

func TestSearchRejectsClaimsWithoutTenantOrAdminRole(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	h := newSearchHandler(t, tenant, nil)
	claims := &authmw.Claims{Sub: uuid.New(), Roles: []string{"user"}}
	req := searchRequest(t, claims, map[string]any{"query": "x"})
	rec := httptest.NewRecorder()
	h.Search(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "tenant")
}

// ──────────────────────────────────────────────────────────────────
// Happy path: lexical search end-to-end
// ──────────────────────────────────────────────────────────────────

func TestSearchReturnsBackendHitsForLexicalQuery(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "a-1", typeID: "Actor", payload: map[string]any{
			"display_name": "Wagner Group",
			"description":  "Russian private military company",
			"country_iso2": "RU",
		}},
		{id: "a-2", typeID: "Actor", payload: map[string]any{
			"display_name": "Yevgeny Prigozhin",
			"description":  "Wagner Group founder",
			"country_iso2": "RU",
		}},
		{id: "a-3", typeID: "Actor", payload: map[string]any{
			"display_name": "Unrelated NGO",
			"country_iso2": "DE",
		}},
	}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{
		"query": "wagner",
		"limit": 10,
	})
	rec := httptest.NewRecorder()
	h.Search(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := decodeSearchResponse(t, rec)
	assert.Equal(t, "wagner", body["query"])
	ids := resultIDs(body)
	assert.ElementsMatch(t, []string{"a-1", "a-2"}, ids)

	rows, _ := body["data"].([]any)
	require.NotEmpty(t, rows)
	first, _ := rows[0].(map[string]any)
	assert.Equal(t, "object", first["kind"])
	assert.Equal(t, "Actor", first["object_type_id"])
	assert.Contains(t, first["route"], "/ontology/types/Actor/objects/")
}

func TestSearchEmptyQueryReturnsAllHitsWithinLimit(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "id-1", typeID: "Event", payload: map[string]any{"name": "one"}},
		{id: "id-2", typeID: "Event", payload: map[string]any{"name": "two"}},
		{id: "id-3", typeID: "Event", payload: map[string]any{"name": "three"}},
	}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{"query": ""})
	rec := httptest.NewRecorder()
	h.Search(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	body := decodeSearchResponse(t, rec)
	assert.Equal(t, float64(3), body["total"])
}

// ──────────────────────────────────────────────────────────────────
// Object-type scoping
// ──────────────────────────────────────────────────────────────────

func TestSearchScopesToObjectTypeID(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "p-1", typeID: "Person", payload: map[string]any{"name": "Alice"}},
		{id: "o-1", typeID: "Organization", payload: map[string]any{"name": "Alice Corp"}},
		{id: "p-2", typeID: "Person", payload: map[string]any{"name": "Bob"}},
	}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{
		"query":          "alice",
		"object_type_id": "Person",
	})
	rec := httptest.NewRecorder()
	h.Search(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	ids := resultIDs(decodeSearchResponse(t, rec))
	assert.Equal(t, []string{"p-1"}, ids)
}

func TestSearchClampsLimitToMaximum(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := make([]seededHit, 0, 150)
	for i := 0; i < 150; i++ {
		hits = append(hits, seededHit{
			id:      "id-" + string(rune('a'+(i%26))) + "-" + string(rune('0'+(i%10))),
			typeID:  "Event",
			payload: map[string]any{"name": "event"},
		})
	}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{"query": "event", "limit": 9999})
	rec := httptest.NewRecorder()
	h.Search(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	rows, _ := decodeSearchResponse(t, rec)["data"].([]any)
	assert.LessOrEqual(t, len(rows), 100, "limit must clamp to maxSearchLimit=100")
}

// ──────────────────────────────────────────────────────────────────
// Workshop-style filter pushdown (B03 G2)
// ──────────────────────────────────────────────────────────────────

func TestSearchPushesEqualsFiltersToBackend(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "ev-1", typeID: "Event", payload: map[string]any{"country_iso2": "UA", "cameo_quad_class": "MATERIAL_CONF", "name": "Skirmish"}},
		{id: "ev-2", typeID: "Event", payload: map[string]any{"country_iso2": "RU", "cameo_quad_class": "MATERIAL_CONF", "name": "Other"}},
		{id: "ev-3", typeID: "Event", payload: map[string]any{"country_iso2": "UA", "cameo_quad_class": "VERBAL_COOP", "name": "Diplomacy"}},
	}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{
		"query":          "",
		"object_type_id": "Event",
		"filters": []map[string]any{
			{"property_name": "country_iso2", "operator": "equals", "value": "UA"},
			{"property_name": "cameo_quad_class", "operator": "equals", "value": "MATERIAL_CONF"},
		},
	})
	rec := httptest.NewRecorder()
	h.Search(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	ids := resultIDs(decodeSearchResponse(t, rec))
	assert.Equal(t, []string{"ev-1"}, ids)
}

func TestSearchAppliesRangeFiltersPostFetch(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "ev-1", typeID: "Event", payload: map[string]any{"country_iso2": "UA", "goldstein_scale": -8.5}},
		{id: "ev-2", typeID: "Event", payload: map[string]any{"country_iso2": "UA", "goldstein_scale": -2.0}},
		{id: "ev-3", typeID: "Event", payload: map[string]any{"country_iso2": "UA", "goldstein_scale": 3.5}},
	}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{
		"query":          "",
		"object_type_id": "Event",
		"filters": []map[string]any{
			{"property_name": "country_iso2", "operator": "equals", "value": "UA"},
			{"property_name": "goldstein_scale", "operator": "lte", "value": -2.0},
		},
	})
	rec := httptest.NewRecorder()
	h.Search(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	ids := resultIDs(decodeSearchResponse(t, rec))
	assert.ElementsMatch(t, []string{"ev-1", "ev-2"}, ids)
}

func TestSearchAppliesContainsFilter(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "n-1", typeID: "NewsArticle", payload: map[string]any{"title": "Wagner Group activity near Bakhmut"}},
		{id: "n-2", typeID: "NewsArticle", payload: map[string]any{"title": "Diplomatic summit in Geneva"}},
	}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{
		"query":          "",
		"object_type_id": "NewsArticle",
		"filters": []map[string]any{
			{"property_name": "title", "operator": "contains", "value": "bakhmut"},
		},
	})
	rec := httptest.NewRecorder()
	h.Search(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	ids := resultIDs(decodeSearchResponse(t, rec))
	assert.Equal(t, []string{"n-1"}, ids)
}

func TestSearchAppliesInFilter(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "a-1", typeID: "Actor", payload: map[string]any{"name": "X", "country_iso2": "RU"}},
		{id: "a-2", typeID: "Actor", payload: map[string]any{"name": "Y", "country_iso2": "UA"}},
		{id: "a-3", typeID: "Actor", payload: map[string]any{"name": "Z", "country_iso2": "DE"}},
	}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{
		"query":          "",
		"object_type_id": "Actor",
		"filters": []map[string]any{
			{"property_name": "country_iso2", "operator": "in", "value": []any{"UA", "RU"}},
		},
	})
	rec := httptest.NewRecorder()
	h.Search(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	ids := resultIDs(decodeSearchResponse(t, rec))
	assert.ElementsMatch(t, []string{"a-1", "a-2"}, ids)
}

func TestSearchAppliesBetweenFilter(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "ev-cold", typeID: "Event", payload: map[string]any{"event_datetime_utc": "2026-05-01T00:00:00Z"}},
		{id: "ev-fresh-1", typeID: "Event", payload: map[string]any{"event_datetime_utc": "2026-05-18T12:00:00Z"}},
		{id: "ev-fresh-2", typeID: "Event", payload: map[string]any{"event_datetime_utc": "2026-05-19T18:00:00Z"}},
	}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{
		"query":          "",
		"object_type_id": "Event",
		"filters": []map[string]any{
			{"property_name": "event_datetime_utc", "operator": "between",
				"min": "2026-05-17T00:00:00Z",
				"max": "2026-05-20T00:00:00Z"},
		},
	})
	rec := httptest.NewRecorder()
	h.Search(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	ids := resultIDs(decodeSearchResponse(t, rec))
	assert.ElementsMatch(t, []string{"ev-fresh-1", "ev-fresh-2"}, ids)
}

// ──────────────────────────────────────────────────────────────────
// Marking enforcement (B03 acceptance #4 — UC-7 markings smoke)
// ──────────────────────────────────────────────────────────────────

func TestSearchRedactsHitsBeyondCallerClearance(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "open-1", typeID: "Actor", payload: map[string]any{
			"display_name": "Public actor",
			"markings":     []any{"OPEN-SOURCE"},
		}},
		{id: "redacted-1", typeID: "Actor", payload: map[string]any{
			"display_name": "Tradecraft actor",
			"markings":     []any{"OPEN-SOURCE", "TRADECRAFT"},
		}},
	}
	h := newSearchHandler(t, tenant, hits)

	// Sofía has both clearances — sees both.
	sofia := searchAnalystClaims(tenant, "OPEN-SOURCE", "TRADECRAFT")
	req := searchRequest(t, sofia, map[string]any{"query": "actor", "object_type_id": "Actor"})
	rec := httptest.NewRecorder()
	h.Search(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.ElementsMatch(t, []string{"open-1", "redacted-1"}, resultIDs(decodeSearchResponse(t, rec)))

	// Marcos has only OPEN-SOURCE — must not see the TRADECRAFT row.
	marcos := searchAnalystClaims(tenant, "OPEN-SOURCE")
	req = searchRequest(t, marcos, map[string]any{"query": "actor", "object_type_id": "Actor"})
	rec = httptest.NewRecorder()
	h.Search(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.Equal(t, []string{"open-1"}, resultIDs(decodeSearchResponse(t, rec)))
}

func TestSearchAllowsAdminWithoutMarkingScope(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "sec-1", typeID: "Actor", payload: map[string]any{
			"display_name": "Secret actor",
			"markings":     []any{"TRADECRAFT"},
		}},
	}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{"query": "actor", "object_type_id": "Actor"})
	rec := httptest.NewRecorder()
	h.Search(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, []string{"sec-1"}, resultIDs(decodeSearchResponse(t, rec)))
}

func TestSearchHonoursMarkingScalarField(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "scalar-1", typeID: "Actor", payload: map[string]any{
			"display_name": "Scalar-marked actor",
			"marking":      "TRADECRAFT",
		}},
	}
	h := newSearchHandler(t, tenant, hits)

	user := searchAnalystClaims(tenant, "OPEN-SOURCE")
	req := searchRequest(t, user, map[string]any{"query": "actor", "object_type_id": "Actor"})
	rec := httptest.NewRecorder()
	h.Search(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.Empty(t, resultIDs(decodeSearchResponse(t, rec)))
}

// ──────────────────────────────────────────────────────────────────
// Kind filter + result shape pinning
// ──────────────────────────────────────────────────────────────────

func TestSearchKindFilterExcludesLinkHits(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{
		{id: "obj-1", typeID: "Event", payload: map[string]any{"name": "alpha"}},
		{id: "link-1", typeID: "link:MENTIONED_IN", payload: map[string]any{"name": "alpha-link"}},
	}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{"query": "alpha", "kind": "object"})
	rec := httptest.NewRecorder()
	h.Search(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.Equal(t, []string{"obj-1"}, resultIDs(decodeSearchResponse(t, rec)))
}

func TestSearchResponseShapeMatchesFrontendContract(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	hits := []seededHit{{
		id:     "actor-1",
		typeID: "Actor",
		payload: map[string]any{
			"display_name": "Wagner Group",
			"description":  "PMC",
		},
	}}
	h := newSearchHandler(t, tenant, hits)

	req := searchRequest(t, searchAdminClaims(tenant), map[string]any{"query": "wagner"})
	rec := httptest.NewRecorder()
	h.Search(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := decodeSearchResponse(t, rec)
	// Top-level keys pin the frontend wire shape.
	for _, key := range []string{"query", "total", "data"} {
		_, has := body[key]
		assert.True(t, has, "response must contain key %q", key)
	}
	rows, _ := body["data"].([]any)
	require.Len(t, rows, 1)
	row, _ := rows[0].(map[string]any)
	for _, key := range []string{"kind", "id", "object_type_id", "title", "subtitle", "snippet", "score", "route", "metadata"} {
		_, has := row[key]
		assert.True(t, has, "result row must contain key %q", key)
	}
	assert.Equal(t, "Wagner Group", row["title"])
	assert.Contains(t, row["snippet"], "Wagner Group")
}
