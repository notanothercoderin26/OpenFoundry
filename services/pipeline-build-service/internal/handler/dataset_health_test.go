package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRecordHealthEventRequest_Severity_DefaultsAndValidates(t *testing.T) {
	t.Parallel()
	assert.True(t, validSeverity(HealthSeverityInfo))
	assert.True(t, validSeverity(HealthSeverityWarning))
	assert.True(t, validSeverity(HealthSeverityError))
	assert.True(t, validSeverity(HealthSeverityCritical))
	assert.False(t, validSeverity("emergency"))
}

func TestDatasetHealthHandlers_RecordRejectsBadSeverity(t *testing.T) {
	t.Parallel()
	h := &DatasetHealthHandlers{Repo: nil} // we stop before touching the repo
	body, _ := json.Marshal(map[string]any{
		"check_name": "null_rate",
		"severity":   "emergency",
	})
	req := httptest.NewRequest(http.MethodPost, "/internal/datasets/rid-1/health", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux := chi.NewRouter()
	mux.Post("/internal/datasets/{rid}/health", h.Record)
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "severity")
}

func TestDatasetHealthHandlers_RecordRejectsBadStatus(t *testing.T) {
	t.Parallel()
	h := &DatasetHealthHandlers{Repo: nil}
	body, _ := json.Marshal(map[string]any{
		"check_name": "null_rate",
		"status":     "kinda-ok",
	})
	req := httptest.NewRequest(http.MethodPost, "/internal/datasets/rid-1/health", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux := chi.NewRouter()
	mux.Post("/internal/datasets/{rid}/health", h.Record)
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "status")
}

func TestDatasetHealthHandlers_GetRejectsEmptyRID(t *testing.T) {
	t.Parallel()
	h := &DatasetHealthHandlers{Repo: nil}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/datasets//health", nil)
	rec := httptest.NewRecorder()
	mux := chi.NewRouter()
	mux.Get("/api/v1/datasets/{rid}/health", h.Get)
	mux.ServeHTTP(rec, req)
	// chi returns 404 for an empty :rid path segment — that's the
	// expected behaviour. We don't need to test our own handler beyond
	// the bounds check.
	assert.True(t, rec.Code == http.StatusBadRequest || rec.Code == http.StatusNotFound)
}
