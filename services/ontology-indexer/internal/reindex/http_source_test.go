package reindex

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHTTPSourcePagesAndPropagatesTenantHeader(t *testing.T) {
	t.Parallel()
	var seenTenant, seenPath, seenQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenTenant = r.Header.Get("x-of-tenant")
		seenPath = r.URL.Path
		seenQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"data": [
				{"id":"ac-1","object_type_id":"Aircraft","properties":{"tail_number":"N12345"}},
				{"id":"ac-2","object_type_id":"Aircraft","properties":{"tail_number":"N67890"}}
			],
			"total": 5,
			"page": 1,
			"per_page": 2
		}`))
	}))
	defer srv.Close()

	src := NewHTTPSource(srv.URL)
	out, err := src.ListByType(context.Background(), "acme", "Aircraft", 1, 2)
	require.NoError(t, err)
	require.Len(t, out.Items, 2)
	assert.Equal(t, "ac-1", out.Items[0].ID)
	assert.Equal(t, "Aircraft", out.Items[0].TypeID)
	assert.Equal(t, "N12345", out.Items[0].Properties["tail_number"])
	assert.Equal(t, 5, out.Total)
	assert.True(t, out.HasNext, "page 1 of 5 should have a next page")
	assert.Equal(t, "acme", seenTenant)
	assert.Equal(t, "/api/v1/ontology/types/Aircraft/objects", seenPath)
	assert.Contains(t, seenQuery, "page=1")
	assert.Contains(t, seenQuery, "per_page=2")
}

func TestHTTPSourceNoNextWhenAllPagesConsumed(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"ac-1","object_type_id":"Aircraft","properties":{}}],"total":1,"page":1,"per_page":50}`))
	}))
	defer srv.Close()
	out, err := NewHTTPSource(srv.URL).ListByType(context.Background(), "acme", "Aircraft", 1, 50)
	require.NoError(t, err)
	assert.False(t, out.HasNext)
}

func TestHTTPSourceErrorsOn5xx(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":"upstream"}`))
	}))
	defer srv.Close()
	_, err := NewHTTPSource(srv.URL).ListByType(context.Background(), "acme", "Aircraft", 1, 50)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "502")
}

func TestHTTPSourceRejectsEmptyBaseURL(t *testing.T) {
	t.Parallel()
	_, err := (&HTTPSource{}).ListByType(context.Background(), "acme", "Aircraft", 1, 50)
	assert.ErrorContains(t, err, "BaseURL")
}
