package domain

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/entity-resolution-service/internal/models"
)

func TestBuildEntityRecordPicksDisplayPropertyPreference(t *testing.T) {
	source := models.DatasetSourceBinding{
		SourceLabel:     "ofac_sdn",
		ObjectTypeID:    "Person",
		DisplayProperty: "preferred_name",
	}
	rec := BuildEntityRecord(source, "obj-1", map[string]any{
		"preferred_name": "Alice Anderson",
		"name":           "Alice A.",
		"alias":          "AA",
	}, 0.85)
	require.Equal(t, "Alice Anderson", rec.DisplayName)
	require.Equal(t, "ofac_sdn", rec.Source)
	require.Equal(t, "obj-1", rec.ExternalID)
	require.Equal(t, "ofac_sdn:Person:obj-1", rec.RecordID)
}

func TestBuildEntityRecordFallsBackToDefaultDisplayOrder(t *testing.T) {
	source := models.DatasetSourceBinding{SourceLabel: "eu", ObjectTypeID: "Person"}
	cases := []struct {
		name string
		in   map[string]any
		want string
	}{
		{"display_name wins", map[string]any{"display_name": "A"}, "A"},
		{"name fallback", map[string]any{"name": "B"}, "B"},
		{"title fallback", map[string]any{"title": "C"}, "C"},
		{"label fallback", map[string]any{"label": "D"}, "D"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := BuildEntityRecord(source, "id", tc.in, 0.7)
			require.Equal(t, tc.want, rec.DisplayName)
		})
	}
}

func TestBuildEntityRecordFallsBackToExternalIDWhenNoDisplayProperty(t *testing.T) {
	source := models.DatasetSourceBinding{SourceLabel: "src", ObjectTypeID: "Org"}
	rec := BuildEntityRecord(source, "the-id", map[string]any{"unrelated": 7}, 0.5)
	require.Equal(t, "the-id", rec.DisplayName)
	require.Equal(t, "the-id", rec.ExternalID)
}

func TestBuildEntityRecordHonoursRecordIDProperty(t *testing.T) {
	source := models.DatasetSourceBinding{
		SourceLabel:      "wikidata",
		ObjectTypeID:     "Person",
		RecordIDProperty: "wikidata_qid",
	}
	rec := BuildEntityRecord(source, "obj-internal", map[string]any{
		"wikidata_qid": "Q12345",
		"name":         "Test",
	}, 0.9)
	require.Equal(t, "Q12345", rec.ExternalID)
	require.Equal(t, "wikidata:Person:Q12345", rec.RecordID)
}

func TestBuildEntityRecordProjectsAttributesSubset(t *testing.T) {
	source := models.DatasetSourceBinding{
		SourceLabel:         "src",
		ObjectTypeID:        "Org",
		AttributeProperties: []string{"name", "country"},
	}
	rec := BuildEntityRecord(source, "id", map[string]any{
		"name":      "Acme",
		"country":   "US",
		"secret":    "hidden",
		"unrelated": 42,
	}, 0.85)
	require.Equal(t, map[string]any{"name": "Acme", "country": "US"}, rec.Attributes)
}

func TestBuildEntityRecordCopiesAllAttributesByDefault(t *testing.T) {
	source := models.DatasetSourceBinding{SourceLabel: "src", ObjectTypeID: "Org"}
	props := map[string]any{"a": 1, "b": "x"}
	rec := BuildEntityRecord(source, "id", props, 0.85)
	require.Equal(t, props, rec.Attributes)
	// mutating the record's attrs must not poison the source map
	rec.Attributes["a"] = 999
	require.Equal(t, 1, props["a"])
}

func TestBuildEntityRecordUsesPerRowConfidenceWhenPresent(t *testing.T) {
	source := models.DatasetSourceBinding{SourceLabel: "src", ObjectTypeID: "Org"}
	rec := BuildEntityRecord(source, "id", map[string]any{"confidence": 0.42}, 0.85)
	require.InDelta(t, float32(0.42), rec.Confidence, 0.0001)
}

func TestBuildEntityRecordFallsBackToDefaultConfidence(t *testing.T) {
	source := models.DatasetSourceBinding{SourceLabel: "src", ObjectTypeID: "Org"}
	rec := BuildEntityRecord(source, "id", map[string]any{}, 0.6)
	require.InDelta(t, float32(0.6), rec.Confidence, 0.0001)
}

func TestHTTPObjectTypeLoaderFlattensMultipleSources(t *testing.T) {
	var hits []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits = append(hits, r.URL.Path)
		require.Equal(t, "intel", r.Header.Get("x-of-tenant"))
		// Encode a small page based on the type
		typeID := strings.TrimPrefix(strings.TrimSuffix(r.URL.Path, "/objects"), "/api/v1/ontology/types/")
		var data []ontologyObjectWire
		switch typeID {
		case "Person":
			data = []ontologyObjectWire{
				{ID: "p1", ObjectTypeID: "Person", Properties: map[string]any{"name": "Alice"}},
				{ID: "p2", ObjectTypeID: "Person", Properties: map[string]any{"name": "Bob"}},
			}
		case "Organization":
			data = []ontologyObjectWire{
				{ID: "o1", ObjectTypeID: "Organization", Properties: map[string]any{"name": "Acme"}},
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": data, "total": len(data), "page": 1, "per_page": 25})
	}))
	defer srv.Close()

	loader := NewHTTPObjectTypeLoader(srv.URL, "intel")
	records, err := loader.LoadEntityRecords(context.Background(), []models.DatasetSourceBinding{
		{SourceLabel: "ofac", ObjectTypeID: "Person", Limit: 25},
		{SourceLabel: "opencorp", ObjectTypeID: "Organization", Limit: 25},
	}, 12)
	require.NoError(t, err)
	require.Len(t, records, 3)
	require.Equal(t, "ofac", records[0].Source)
	require.Equal(t, "p1", records[0].ExternalID)
	require.Equal(t, "Alice", records[0].DisplayName)
	require.Equal(t, "opencorp", records[2].Source)
	require.Equal(t, "Acme", records[2].DisplayName)
	require.ElementsMatch(t, []string{
		"/api/v1/ontology/types/Person/objects",
		"/api/v1/ontology/types/Organization/objects",
	}, hits)
}

func TestHTTPObjectTypeLoaderFailsLoudlyOn5xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("boom"))
	}))
	defer srv.Close()

	loader := NewHTTPObjectTypeLoader(srv.URL, "intel")
	_, err := loader.LoadEntityRecords(context.Background(), []models.DatasetSourceBinding{
		{SourceLabel: "src", ObjectTypeID: "Person"},
	}, 10)
	require.Error(t, err)
	require.Contains(t, err.Error(), "500")
}

func TestHTTPObjectTypeLoaderRequiresBaseURL(t *testing.T) {
	loader := &HTTPObjectTypeLoader{}
	_, err := loader.LoadEntityRecords(context.Background(), []models.DatasetSourceBinding{
		{SourceLabel: "src", ObjectTypeID: "Person"},
	}, 1)
	require.Error(t, err)
}

func TestHTTPObjectTypeLoaderRejectsMissingObjectTypeID(t *testing.T) {
	loader := NewHTTPObjectTypeLoader("http://example.invalid", "intel")
	_, err := loader.LoadEntityRecords(context.Background(), []models.DatasetSourceBinding{
		{SourceLabel: "src"},
	}, 1)
	require.Error(t, err)
	require.Contains(t, err.Error(), "object_type_id")
}

func TestHTTPObjectTypeLoaderClampsPerPageTo5000(t *testing.T) {
	var capturedQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{}})
	}))
	defer srv.Close()

	loader := NewHTTPObjectTypeLoader(srv.URL, "")
	_, err := loader.LoadEntityRecords(context.Background(), []models.DatasetSourceBinding{
		{SourceLabel: "src", ObjectTypeID: "Person", Limit: 99_999},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "per_page=5000", capturedQuery)
}

func TestHTTPObjectTypeLoaderHonoursAuthHeader(t *testing.T) {
	var seenAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{}})
	}))
	defer srv.Close()

	loader := NewHTTPObjectTypeLoader(srv.URL, "intel")
	loader.AuthHeader = "Bearer test-token"
	_, err := loader.LoadEntityRecords(context.Background(), []models.DatasetSourceBinding{
		{SourceLabel: "src", ObjectTypeID: "Person"},
	}, 5)
	require.NoError(t, err)
	require.Equal(t, "Bearer test-token", seenAuth)
}
