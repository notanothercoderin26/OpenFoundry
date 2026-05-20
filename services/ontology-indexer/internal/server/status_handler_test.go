package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/status"
)

func TestStatusHandlerReturnsZerosForUnknownType(t *testing.T) {
	t.Parallel()
	tr := status.NewTracker()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ontology-indexer/status?objectType=Aircraft&tenant=acme", nil)

	newStatusHandler(tr)(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var body statusResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, "Aircraft", body.ObjectType)
	assert.Equal(t, "acme", body.Tenant)
	assert.Equal(t, uint64(0), body.IndexedCount)
	assert.Empty(t, body.LastIndexedAt)
	assert.Equal(t, 0.0, body.LagSeconds)
}

func TestStatusHandlerReturnsLiveCountersForKnownType(t *testing.T) {
	t.Parallel()
	tr := status.NewTracker()
	tr.RecordIndexed("acme", "Aircraft", time.Date(2026, 5, 20, 12, 0, 0, 0, time.UTC))
	tr.RecordIndexed("acme", "Aircraft", time.Date(2026, 5, 20, 12, 0, 1, 0, time.UTC))
	tr.RecordDeleted("acme", "Aircraft", time.Date(2026, 5, 20, 12, 0, 2, 0, time.UTC))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ontology-indexer/status?objectType=Aircraft&tenant=acme", nil)
	newStatusHandler(tr)(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var body statusResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, "Aircraft", body.ObjectType)
	assert.Equal(t, "acme", body.Tenant)
	assert.Equal(t, uint64(2), body.IndexedCount)
	assert.Equal(t, uint64(1), body.DeletedCount)
	assert.NotEmpty(t, body.LastIndexedAt)
	assert.NotEmpty(t, body.LastEventTime)
}

func TestStatusHandlerAggregatesAcrossTenantsWhenOmitted(t *testing.T) {
	t.Parallel()
	tr := status.NewTracker()
	now := time.Date(2026, 5, 20, 12, 0, 0, 0, time.UTC)
	tr.RecordIndexed("acme", "Aircraft", now)
	tr.RecordIndexed("globex", "Aircraft", now)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ontology-indexer/status?objectType=Aircraft", nil)
	newStatusHandler(tr)(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var body statusResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, "Aircraft", body.ObjectType)
	assert.Equal(t, "", body.Tenant)
	assert.Equal(t, uint64(2), body.IndexedCount)
}

func TestStatusHandlerListsEverythingWhenNoParams(t *testing.T) {
	t.Parallel()
	tr := status.NewTracker()
	tr.RecordIndexed("acme", "Aircraft", time.Now())
	tr.RecordIndexed("acme", "Airport", time.Now())
	tr.RecordIndexed("globex", "Aircraft", time.Now())

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ontology-indexer/status", nil)
	newStatusHandler(tr)(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var body statusListResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Len(t, body.Items, 3)
	// Sorted by (tenant, object_type).
	assert.Equal(t, "acme", body.Items[0].Tenant)
	assert.Equal(t, "Aircraft", body.Items[0].ObjectType)
	assert.Equal(t, "acme", body.Items[1].Tenant)
	assert.Equal(t, "Airport", body.Items[1].ObjectType)
	assert.Equal(t, "globex", body.Items[2].Tenant)
}
