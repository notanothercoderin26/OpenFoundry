package providers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/models"
)

func TestProberMarksReachableProvidersAsOK(t *testing.T) {
	t.Parallel()
	var ollamaCalls, azureCalls int32
	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&ollamaCalls, 1)
		_, _ = w.Write([]byte(`{"models":[]}`))
	}))
	defer ollama.Close()
	azure := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&azureCalls, 1)
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer azure.Close()

	p := NewProber([]ProbeTarget{
		{Provider: models.ProviderOllama, BaseURL: ollama.URL},
		{Provider: models.ProviderAzure, BaseURL: azure.URL, Header: "key", HeaderName: "api-key"},
	})
	p.ProbeOnce(context.Background())

	snap := p.CurrentSnapshot()
	require.Len(t, snap.Providers, 2)
	byProvider := map[models.Provider]ProviderState{}
	for _, s := range snap.Providers {
		byProvider[s.Provider] = s
	}
	assert.Equal(t, StatusOK, byProvider[models.ProviderOllama].Status)
	assert.Equal(t, StatusOK, byProvider[models.ProviderAzure].Status)
	assert.Equal(t, int32(1), atomic.LoadInt32(&ollamaCalls))
	assert.Equal(t, int32(1), atomic.LoadInt32(&azureCalls))
}

func TestProberMarksUnreachableEndpointAsDown(t *testing.T) {
	t.Parallel()
	p := NewProber([]ProbeTarget{
		{Provider: models.ProviderOllama, BaseURL: "http://127.0.0.1:1"}, // closed port
	})
	p.Client.Timeout = 250 * time.Millisecond
	p.ProbeOnce(context.Background())
	snap := p.CurrentSnapshot()
	require.Len(t, snap.Providers, 1)
	assert.Equal(t, StatusDown, snap.Providers[0].Status)
	assert.NotEmpty(t, snap.Providers[0].Error)
}

func TestProberSurfacesAuthFailuresAsDegraded(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()
	p := NewProber([]ProbeTarget{
		{Provider: models.ProviderAzure, BaseURL: srv.URL, Header: "stale-key", HeaderName: "api-key"},
	})
	p.ProbeOnce(context.Background())
	snap := p.CurrentSnapshot()
	require.Len(t, snap.Providers, 1)
	assert.Equal(t, StatusDegraded, snap.Providers[0].Status)
	assert.Contains(t, snap.Providers[0].Error, "auth failed")
}

func TestProberMarksHighLatencyAsDegraded(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(150 * time.Millisecond)
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()
	p := NewProber([]ProbeTarget{
		{Provider: models.ProviderOllama, BaseURL: srv.URL},
	})
	p.DegradeAfter = 50 * time.Millisecond
	p.ProbeOnce(context.Background())
	snap := p.CurrentSnapshot()
	require.Len(t, snap.Providers, 1)
	assert.Equal(t, StatusDegraded, snap.Providers[0].Status)
}

func TestProberReportsUnknownWhenBaseURLEmpty(t *testing.T) {
	t.Parallel()
	p := NewProber([]ProbeTarget{
		{Provider: models.ProviderBedrock, BaseURL: ""},
	})
	p.ProbeOnce(context.Background())
	snap := p.CurrentSnapshot()
	require.Len(t, snap.Providers, 1)
	assert.Equal(t, StatusUnknown, snap.Providers[0].Status)
	assert.Contains(t, snap.Providers[0].Error, "base URL not configured")
}

func TestProberSnapshotIsSortedByProvider(t *testing.T) {
	t.Parallel()
	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{}`))
	}))
	defer ollama.Close()
	azure := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{}`))
	}))
	defer azure.Close()
	p := NewProber([]ProbeTarget{
		{Provider: models.ProviderOllama, BaseURL: ollama.URL},
		{Provider: models.ProviderAzure, BaseURL: azure.URL},
	})
	p.ProbeOnce(context.Background())
	snap := p.CurrentSnapshot()
	require.Len(t, snap.Providers, 2)
	// A < O alphabetically; snapshot order is stable for golden tests.
	assert.Equal(t, models.ProviderAzure, snap.Providers[0].Provider)
	assert.Equal(t, models.ProviderOllama, snap.Providers[1].Provider)
}
