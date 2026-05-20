package domain

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/entity-resolution-service/internal/models"
)

func TestHTTPHealthCheckPublisherPostsEnvelope(t *testing.T) {
	var capturedPath, capturedAuth string
	var captured healthCheckEnvelope
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		capturedAuth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		require.NoError(t, json.Unmarshal(body, &captured))
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"00000000-0000-0000-0000-000000000001"}`))
	}))
	defer srv.Close()

	pub := NewHTTPHealthCheckPublisher(srv.URL)
	pub.AuthHeader = "Bearer t"
	jobID := uuid.New()
	job := &models.FusionJob{
		ID:         jobID,
		Name:       "Geo Actor Resolution",
		Status:     "completed",
		EntityType: "person",
		Config: models.ResolutionJobConfig{
			Sources: []models.DatasetSourceBinding{
				{SourceLabel: "ofac", ObjectTypeID: "Person"},
				{SourceLabel: "eu", ObjectTypeID: "Person"},
				{SourceLabel: "opencorp", ObjectTypeID: "Organization"},
			},
		},
	}
	metrics := models.FusionJobMetrics{
		CandidatePairs:    20,
		MatchedPairs:      8,
		ReviewPairs:       3,
		ClusterCount:      6,
		GoldenRecordCount: 6,
		PrecisionEstimate: 0.91,
		RecallEstimate:    0.78,
	}

	require.NoError(t, pub.PublishJobMetrics(context.Background(), job, metrics))
	require.Equal(t, "/api/v1/health-checks", capturedPath)
	require.Equal(t, "Bearer t", capturedAuth)
	require.Equal(t, "entity_resolution_metrics", captured.Payload.Kind)
	require.Equal(t, jobID.String(), captured.Payload.JobID)
	require.Equal(t, "Geo Actor Resolution", captured.Payload.JobName)
	require.Equal(t, "person", captured.Payload.EntityType)
	require.Equal(t, "completed", captured.Payload.Status)
	require.Equal(t, []string{"ofac", "eu", "opencorp"}, captured.Payload.Sources)
	require.Equal(t, []string{"Person", "Organization"}, captured.Payload.BoundObjectTypes)
	require.InDelta(t, 0.91, captured.Payload.Metrics.PrecisionEstimate, 0.0001)
	require.InDelta(t, 0.78, captured.Payload.Metrics.RecallEstimate, 0.0001)
}

func TestHTTPHealthCheckPublisherFallsBackToLegacySourceLabels(t *testing.T) {
	var captured healthCheckEnvelope
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		require.NoError(t, json.Unmarshal(body, &captured))
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()
	pub := NewHTTPHealthCheckPublisher(srv.URL)
	job := &models.FusionJob{
		ID:     uuid.New(),
		Status: "completed",
		Config: models.ResolutionJobConfig{SourceLabels: []string{"crm", "erp"}},
	}
	require.NoError(t, pub.PublishJobMetrics(context.Background(), job, models.FusionJobMetrics{}))
	require.Equal(t, []string{"crm", "erp"}, captured.Payload.Sources)
	require.Empty(t, captured.Payload.BoundObjectTypes)
}

func TestHTTPHealthCheckPublisherErrorsOn5xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("upstream down"))
	}))
	defer srv.Close()
	pub := NewHTTPHealthCheckPublisher(srv.URL)
	err := pub.PublishJobMetrics(context.Background(), &models.FusionJob{ID: uuid.New()}, models.FusionJobMetrics{})
	require.Error(t, err)
	require.Contains(t, err.Error(), "502")
}

func TestHTTPHealthCheckPublisherRejectsEmptyBaseURL(t *testing.T) {
	pub := &HTTPHealthCheckPublisher{}
	require.Error(t, pub.PublishJobMetrics(context.Background(), &models.FusionJob{ID: uuid.New()}, models.FusionJobMetrics{}))
}

func TestNoopHealthCheckPublisherIsAlwaysOK(t *testing.T) {
	require.NoError(t, (NoopHealthCheckPublisher{}).PublishJobMetrics(context.Background(), nil, models.FusionJobMetrics{}))
}
