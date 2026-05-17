package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/repo"
)

func newTestRouter(t *testing.T) (*chi.Mux, *repo.MemoryDeploymentRepository) {
	t.Helper()
	r := chi.NewRouter()
	repository := repo.NewMemoryDeploymentRepository(nil)
	h := New(repository)
	h.Mount(r, "/api/v1/deployments")
	return r, repository
}

func authedRequest(method, target string, body io.Reader, sub uuid.UUID) *http.Request {
	req := httptest.NewRequest(method, target, body)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	ctx := authmw.ContextWithClaims(context.Background(), &authmw.Claims{Sub: sub})
	return req.WithContext(ctx)
}

func decode[T any](t *testing.T, body io.Reader) T {
	t.Helper()
	var out T
	require.NoError(t, json.NewDecoder(body).Decode(&out))
	return out
}

func TestCreateDeploymentRejectsAnonymous(t *testing.T) {
	t.Parallel()
	r, _ := newTestRouter(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/deployments/",
		strings.NewReader(`{"model_id":"00000000-0000-0000-0000-000000000001","version":"v1"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestCreateDeploymentRoundTripsAndIsOwnedByCaller(t *testing.T) {
	t.Parallel()
	r, _ := newTestRouter(t)
	owner := uuid.New()
	body := map[string]any{
		"model_id":     uuid.New().String(),
		"version":      "v1.0.0",
		"endpoint_url": "https://serve/predict",
	}
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	req := authedRequest(http.MethodPost, "/api/v1/deployments/", bytes.NewReader(raw), owner)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	created := decode[models.Deployment](t, rec.Body)
	assert.NotEqual(t, uuid.Nil, created.ID)
	assert.Equal(t, owner, created.OwnerUserID)
	assert.Equal(t, models.DeploymentStatusPending, created.Status)
	assert.Equal(t, "v1.0.0", created.Version)
}

func TestCreateDeploymentValidatesBody(t *testing.T) {
	t.Parallel()
	r, _ := newTestRouter(t)
	owner := uuid.New()
	cases := []struct {
		name string
		body string
	}{
		{"missing model_id", `{"version":"v1"}`},
		{"missing version", `{"model_id":"` + uuid.New().String() + `"}`},
		{"blank version", `{"model_id":"` + uuid.New().String() + `","version":"  "}`},
		{"malformed json", `{`},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			req := authedRequest(http.MethodPost, "/api/v1/deployments/", strings.NewReader(tc.body), owner)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			assert.Equal(t, http.StatusBadRequest, rec.Code)
		})
	}
}

func TestListDeploymentsFiltersByStatusAndOwner(t *testing.T) {
	t.Parallel()
	r, repository := newTestRouter(t)
	owner := uuid.New()
	other := uuid.New()

	ctx := context.Background()
	_, err := repository.Create(ctx, models.Deployment{
		ModelID: uuid.New(), Version: "v1", OwnerUserID: owner, Status: models.DeploymentStatusPending,
	})
	require.NoError(t, err)
	_, err = repository.Create(ctx, models.Deployment{
		ModelID: uuid.New(), Version: "v2", OwnerUserID: owner, Status: models.DeploymentStatusRunning,
	})
	require.NoError(t, err)
	_, err = repository.Create(ctx, models.Deployment{
		ModelID: uuid.New(), Version: "v3", OwnerUserID: other, Status: models.DeploymentStatusRunning,
	})
	require.NoError(t, err)

	req := authedRequest(http.MethodGet, "/api/v1/deployments/?status=running&owner="+owner.String(), nil, owner)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	out := decode[listResponse](t, rec.Body)
	require.Len(t, out.Items, 1)
	assert.Equal(t, owner, out.Items[0].OwnerUserID)
	assert.Equal(t, models.DeploymentStatusRunning, out.Items[0].Status)
}

func TestListDeploymentsRejectsBadFilter(t *testing.T) {
	t.Parallel()
	r, _ := newTestRouter(t)
	owner := uuid.New()
	for _, qs := range []string{"status=invalid", "owner=not-a-uuid"} {
		req := authedRequest(http.MethodGet, "/api/v1/deployments/?"+qs, nil, owner)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusBadRequest, rec.Code, qs)
	}
}

func TestGetDeploymentNotFound(t *testing.T) {
	t.Parallel()
	r, _ := newTestRouter(t)
	owner := uuid.New()
	req := authedRequest(http.MethodGet, "/api/v1/deployments/"+uuid.New().String(), nil, owner)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestUpdateStatusValidTransition(t *testing.T) {
	t.Parallel()
	r, repository := newTestRouter(t)
	owner := uuid.New()
	created, err := repository.Create(context.Background(), models.Deployment{
		ModelID: uuid.New(), Version: "v1", OwnerUserID: owner, Status: models.DeploymentStatusPending,
	})
	require.NoError(t, err)

	req := authedRequest(http.MethodPatch, "/api/v1/deployments/"+created.ID.String()+"/status",
		strings.NewReader(`{"status":"running"}`), owner)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	updated := decode[models.Deployment](t, rec.Body)
	assert.Equal(t, models.DeploymentStatusRunning, updated.Status)
}

func TestUpdateStatusInvalidTransitionReturns409(t *testing.T) {
	t.Parallel()
	r, repository := newTestRouter(t)
	owner := uuid.New()
	created, err := repository.Create(context.Background(), models.Deployment{
		ModelID: uuid.New(), Version: "v1", OwnerUserID: owner, Status: models.DeploymentStatusPending,
	})
	require.NoError(t, err)

	req := authedRequest(http.MethodPatch, "/api/v1/deployments/"+created.ID.String()+"/status",
		strings.NewReader(`{"status":"degraded"}`), owner)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusConflict, rec.Code)
}

func TestUpdateStatusForbidsNonOwner(t *testing.T) {
	t.Parallel()
	r, repository := newTestRouter(t)
	owner := uuid.New()
	intruder := uuid.New()
	created, err := repository.Create(context.Background(), models.Deployment{
		ModelID: uuid.New(), Version: "v1", OwnerUserID: owner, Status: models.DeploymentStatusPending,
	})
	require.NoError(t, err)

	req := authedRequest(http.MethodPatch, "/api/v1/deployments/"+created.ID.String()+"/status",
		strings.NewReader(`{"status":"running"}`), intruder)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestUpdateStatusRejectsUnknownStatus(t *testing.T) {
	t.Parallel()
	r, repository := newTestRouter(t)
	owner := uuid.New()
	created, err := repository.Create(context.Background(), models.Deployment{
		ModelID: uuid.New(), Version: "v1", OwnerUserID: owner, Status: models.DeploymentStatusPending,
	})
	require.NoError(t, err)

	req := authedRequest(http.MethodPatch, "/api/v1/deployments/"+created.ID.String()+"/status",
		strings.NewReader(`{"status":"nonsense"}`), owner)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestDeleteDeploymentByOwner(t *testing.T) {
	t.Parallel()
	r, repository := newTestRouter(t)
	owner := uuid.New()
	created, err := repository.Create(context.Background(), models.Deployment{
		ModelID: uuid.New(), Version: "v1", OwnerUserID: owner, Status: models.DeploymentStatusPending,
	})
	require.NoError(t, err)

	req := authedRequest(http.MethodDelete, "/api/v1/deployments/"+created.ID.String(), nil, owner)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNoContent, rec.Code)

	_, err = repository.GetByID(context.Background(), created.ID)
	assert.ErrorIs(t, err, repo.ErrNotFound)
}

func TestDeleteDeploymentForbidsNonOwner(t *testing.T) {
	t.Parallel()
	r, repository := newTestRouter(t)
	owner := uuid.New()
	intruder := uuid.New()
	created, err := repository.Create(context.Background(), models.Deployment{
		ModelID: uuid.New(), Version: "v1", OwnerUserID: owner, Status: models.DeploymentStatusPending,
	})
	require.NoError(t, err)

	req := authedRequest(http.MethodDelete, "/api/v1/deployments/"+created.ID.String(), nil, intruder)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusForbidden, rec.Code)
}
