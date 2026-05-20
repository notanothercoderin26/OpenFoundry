package pipelineruntime

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pp "github.com/openfoundry/openfoundry-go/libs/pipeline-plan"
)

type staticSchemaProvider struct {
	schema []FieldSpec
	calls  int32
}

func (p *staticSchemaProvider) Schema(context.Context, string, string, string) ([]FieldSpec, error) {
	atomic.AddInt32(&p.calls, 1)
	return p.schema, nil
}

func TestIcebergHTTPWriter_WritePOSTsAppendBatch(t *testing.T) {
	t.Parallel()
	var seenURL, seenAuth, seenProject string
	var seenBody appendBatchBody
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenURL = r.URL.Path
		seenAuth = r.Header.Get("Authorization")
		seenProject = r.Header.Get("x-of-project-rid")
		require.NoError(t, json.NewDecoder(r.Body).Decode(&seenBody))
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"namespace":"events","table":"logins","rows":2,"metadata_location":"s3://x/v3.metadata.json"}`))
	}))
	defer srv.Close()

	w := NewIcebergHTTPWriter(srv.URL)
	w.AuthHeader = "Bearer service-token"
	w.ProjectRID = "ri.compass.main.folder.demo"
	w.SchemaProvider = &staticSchemaProvider{schema: []FieldSpec{
		{ID: 1, Name: "id", Type: "string", Required: true},
		{ID: 2, Name: "ts", Type: "long", Required: true},
	}}

	err := w.Write(context.Background(), "main", "events", "logins", pp.WriteMode("replace"), []Row{
		{"id": "row-1", "ts": int64(1700000000)},
		{"id": "row-2", "ts": int64(1700000001)},
	})
	require.NoError(t, err)
	assert.Equal(t, appendPath, seenURL)
	assert.Equal(t, "Bearer service-token", seenAuth)
	assert.Equal(t, "ri.compass.main.folder.demo", seenProject)
	assert.Equal(t, "events", seenBody.Spec.Namespace)
	assert.Equal(t, "logins", seenBody.Spec.Table)
	assert.Equal(t, defaultPartitionTransform, seenBody.Spec.PartitionTransform)
	assert.Equal(t, defaultSortOrder, seenBody.Spec.SortOrder)
	require.Len(t, seenBody.Spec.Schema, 2)
	assert.Equal(t, "id", seenBody.Spec.Schema[0].Name)
	require.Len(t, seenBody.Rows, 2)
	assert.Equal(t, "row-1", seenBody.Rows[0]["id"])
}

func TestIcebergHTTPWriter_NoOpOnEmptyRows(t *testing.T) {
	t.Parallel()
	calls := int32(0)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()
	w := NewIcebergHTTPWriter(srv.URL)
	w.SchemaProvider = &staticSchemaProvider{}
	require.NoError(t, w.Write(context.Background(), "main", "events", "logins", pp.WriteMode("append"), nil))
	assert.Equal(t, int32(0), atomic.LoadInt32(&calls), "empty rows must not hit the catalog")
}

func TestIcebergHTTPWriter_SurfacesCatalogError(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"error":"row missing required column 'id'"}`))
	}))
	defer srv.Close()
	w := NewIcebergHTTPWriter(srv.URL)
	w.SchemaProvider = &staticSchemaProvider{schema: []FieldSpec{{ID: 1, Name: "id", Type: "string", Required: true}}}
	err := w.Write(context.Background(), "main", "events", "logins", pp.WriteMode("append"), []Row{{"name": "no-id"}})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "422")
}

func TestIcebergHTTPWriter_CachesSchemaPerTable(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	provider := &staticSchemaProvider{schema: []FieldSpec{{ID: 1, Name: "id", Type: "string", Required: true}}}
	w := NewIcebergHTTPWriter(srv.URL)
	w.SchemaProvider = provider
	for i := 0; i < 5; i++ {
		require.NoError(t, w.Write(context.Background(), "main", "events", "logins", pp.WriteMode("append"), []Row{{"id": "x"}}))
	}
	assert.Equal(t, int32(1), atomic.LoadInt32(&provider.calls), "schema is fetched once and cached")
}

func TestIcebergHTTPWriter_RejectsEmptyBaseURL(t *testing.T) {
	t.Parallel()
	w := &IcebergHTTPWriter{}
	err := w.Write(context.Background(), "main", "events", "logins", pp.WriteMode("append"), []Row{{"id": "x"}})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "BaseURL")
}

func TestCatalogSchemaProvider_DecodesIcebergSchema(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{
			"metadata": {
				"current-schema-id": 2,
				"schemas": [
					{"schema-id": 1, "fields": [{"id": 1, "name": "old", "type": "string", "required": true}]},
					{"schema-id": 2, "fields": [
						{"id": 1, "name": "id", "type": "string", "required": true},
						{"id": 2, "name": "amount", "type": "double", "required": false}
					]}
				]
			}
		}`))
	}))
	defer srv.Close()
	p := &catalogSchemaProvider{writer: NewIcebergHTTPWriter(srv.URL)}
	got, err := p.Schema(context.Background(), "main", "finance", "ledger")
	require.NoError(t, err)
	require.Len(t, got, 2)
	assert.Equal(t, "id", got[0].Name)
	assert.Equal(t, "amount", got[1].Name)
	assert.Equal(t, "double", got[1].Type)
}
