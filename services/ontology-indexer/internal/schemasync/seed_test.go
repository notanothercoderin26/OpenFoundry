package schemasync

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
)

type fakeSeedSink struct {
	mu      sync.Mutex
	seeded  []searchabstraction.TypeMapping
}

func (f *fakeSeedSink) SeedSchemas(m []searchabstraction.TypeMapping) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.seeded = append(f.seeded, m...)
}

func TestHTTPSeedSourceReturnsObjectTypes(t *testing.T) {
	t.Parallel()
	var seenAuth, seenPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		seenPath = r.URL.Path
		_, _ = w.Write([]byte(`{
			"items": [
				{"api_name":"Aircraft","primary_key":"id","properties":[{"name":"tail_number","property_type":"string","searchable":true}]},
				{"api_name":"Airport","properties":[{"name":"icao","property_type":"string","filterable":true}]}
			]
		}`))
	}))
	defer srv.Close()

	src := NewHTTPSeedSource(srv.URL)
	src.BearerToken = "service-account-token"
	out, err := src.ListObjectTypes(context.Background())
	require.NoError(t, err)
	require.Len(t, out, 2)
	assert.Equal(t, "Aircraft", out[0].APIName)
	assert.Equal(t, "Airport", out[1].APIName)
	assert.Equal(t, "Bearer service-account-token", seenAuth)
	assert.Equal(t, "/api/v1/ontology/types", seenPath)
}

func TestHTTPSeedSourceSurfacesNon200(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"missing token"}`))
	}))
	defer srv.Close()
	_, err := NewHTTPSeedSource(srv.URL).ListObjectTypes(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "401")
}

type fakeSeedSource struct{ types []ObjectTypePayload }

func (f *fakeSeedSource) ListObjectTypes(context.Context) ([]ObjectTypePayload, error) {
	return f.types, nil
}

func TestSeedMappingsFromTranslatesAndSinks(t *testing.T) {
	t.Parallel()
	src := &fakeSeedSource{types: []ObjectTypePayload{
		{APIName: "Aircraft", Properties: []PropertyPayload{{Name: "tail_number", PropertyType: "string", Searchable: true}}},
		{APIName: "Airport"},
		{}, // no api_name → skipped
	}}
	sink := &fakeSeedSink{}
	n, err := SeedMappingsFrom(context.Background(), src, sink)
	require.NoError(t, err)
	assert.Equal(t, 2, n)
	sink.mu.Lock()
	defer sink.mu.Unlock()
	require.Len(t, sink.seeded, 2)
	assert.Equal(t, "Aircraft", string(sink.seeded[0].TypeID))
	assert.Equal(t, "Airport", string(sink.seeded[1].TypeID))
}

func TestSeedMappingsFromAcceptsNilSink(t *testing.T) {
	t.Parallel()
	src := &fakeSeedSource{types: []ObjectTypePayload{{APIName: "Aircraft"}}}
	n, err := SeedMappingsFrom(context.Background(), src, nil)
	require.NoError(t, err)
	assert.Equal(t, 1, n)
}
