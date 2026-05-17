package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/repo"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/server"
)

// signedAccessToken builds a JWT bearer for the given claims so the
// test exercises the same auth path production traffic does.
func signedAccessToken(t *testing.T, jwt *authmw.JWTConfig, roles []string) string {
	t.Helper()
	c := authmw.BuildAccessClaims(jwt, authmw.AccessClaimsInput{
		UserID: uuid.New(), Email: "u@local", Name: "u",
		Roles: roles,
	})
	tok, err := authmw.EncodeToken(jwt, &c)
	require.NoError(t, err)
	return tok
}

func buildRouterWithStore(t *testing.T) (http.Handler, *authmw.JWTConfig, *repo.MemoryStore) {
	t.Helper()
	store := repo.NewMemoryStore()
	jwt := authmw.NewJWTConfig("test-secret-test-secret-test")
	// give the test a generous TTL so the token never expires mid-run
	jwt.AccessTTL = time.Hour
	cfg := &config.Config{}
	cfg.Service.Name = "llm-catalog-service"
	cfg.Service.Version = "test"
	deps := server.Deps{
		Catalog: &handlers.Catalog{Store: store},
		JWT:     jwt,
	}
	r := server.BuildRouter(cfg, deps, observability.NewMetrics())
	return r, jwt, store
}

func TestCatalog_NonAdmin_Returns403(t *testing.T) {
	t.Parallel()
	router, jwt, _ := buildRouterWithStore(t)
	srv := httptest.NewServer(router)
	t.Cleanup(srv.Close)

	body, _ := json.Marshal(models.RegisterModelRequest{
		Provider: models.ProviderAnthropic, ModelID: "claude-sonnet-4-6", DisplayName: "Claude",
	})
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/llm/models", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+signedAccessToken(t, jwt, []string{"viewer"}))
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestCatalog_Admin_RegisterListGetEnableDisable(t *testing.T) {
	t.Parallel()
	router, jwt, _ := buildRouterWithStore(t)
	srv := httptest.NewServer(router)
	t.Cleanup(srv.Close)
	admin := signedAccessToken(t, jwt, []string{"admin"})

	register := func(provider models.Provider, modelID string) models.Model {
		body, _ := json.Marshal(models.RegisterModelRequest{
			Provider: provider, ModelID: modelID, DisplayName: modelID,
			ContextWindow: 1000, Capabilities: []models.Capability{models.CapabilityText},
		})
		req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/llm/models", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+admin)
		resp, err := srv.Client().Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()
		require.Equal(t, http.StatusCreated, resp.StatusCode)
		var m models.Model
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&m))
		return m
	}

	a := register(models.ProviderAnthropic, "claude-sonnet-4-6")
	b := register(models.ProviderOpenAI, "gpt-4o-mini")

	// List
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/llm/models", nil)
	req.Header.Set("Authorization", "Bearer "+admin)
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	var list models.ListModelsResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&list))
	resp.Body.Close()
	require.Len(t, list.Data, 2)

	// Disable
	disableReq, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/v1/llm/models/"+a.RID.String()+"/disable", nil)
	disableReq.Header.Set("Authorization", "Bearer "+admin)
	resp, err = srv.Client().Do(disableReq)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	resp.Body.Close()

	// Filter only_enabled
	req2, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/llm/models?only_enabled=true", nil)
	req2.Header.Set("Authorization", "Bearer "+admin)
	resp, err = srv.Client().Do(req2)
	require.NoError(t, err)
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&list))
	resp.Body.Close()
	require.Len(t, list.Data, 1)
	assert.Equal(t, b.RID, list.Data[0].RID)
}

func TestCatalog_RegisterModel_RejectsUnknownProvider(t *testing.T) {
	t.Parallel()
	store := repo.NewMemoryStore()
	c := &handlers.Catalog{Store: store}
	body, _ := json.Marshal(models.RegisterModelRequest{
		Provider: "PALANTIR", ModelID: "magic",
	})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	c.RegisterModel(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestRateLimiter_AllowAndRecover(t *testing.T) {
	t.Parallel()
	now := time.Unix(0, 0)
	limiter := handlers.NewRateLimiter(2, 1)
	handlers.SetClock(limiter, func() time.Time { return now })

	rid := uuid.New()
	assert.True(t, limiter.Allow("alice", rid))
	assert.True(t, limiter.Allow("alice", rid))
	assert.False(t, limiter.Allow("alice", rid), "third call should be denied")
	assert.True(t, limiter.Allow("bob", rid), "other subjects share no bucket")

	// Advance 1 second — one refill.
	now = now.Add(time.Second)
	assert.True(t, limiter.Allow("alice", rid))
	assert.False(t, limiter.Allow("alice", rid))
}

func TestRateLimiter_DisabledWhenCapacityZero(t *testing.T) {
	t.Parallel()
	limiter := handlers.NewRateLimiter(0, 0)
	for i := 0; i < 100; i++ {
		assert.True(t, limiter.Allow("x", uuid.Nil))
	}
}

// Ensure imports stay used even if a test branch is skipped.
var _ = context.Background
