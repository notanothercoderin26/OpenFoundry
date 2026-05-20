package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

type fakeComputeProfileRepo struct {
	items []models.ComputeProfile
	known map[string]struct{}
}

func (f *fakeComputeProfileRepo) ListComputeProfiles(context.Context) ([]models.ComputeProfile, error) {
	if f.items == nil {
		return nil, errors.New("not configured")
	}
	return append([]models.ComputeProfile(nil), f.items...), nil
}

func (f *fakeComputeProfileRepo) ComputeProfileExists(_ context.Context, slug string) (bool, error) {
	_, ok := f.known[slug]
	return ok, nil
}

func TestListComputeProfilesReturnsCatalog(t *testing.T) {
	repo := &fakeComputeProfileRepo{
		items: []models.ComputeProfile{
			{Slug: "default", DisplayName: "Default", ExecutorCores: 1, ExecutorMemoryGB: 1.5, IsDefault: true},
			{Slug: "medium", DisplayName: "Medium", ExecutorCores: 2, ExecutorMemoryGB: 4},
			{Slug: "large", DisplayName: "Large", ExecutorCores: 4, ExecutorMemoryGB: 8},
		},
	}
	restore := SetComputeProfileRepository(repo)
	t.Cleanup(restore)

	rr := httptest.NewRecorder()
	ListComputeProfiles(rr, httptest.NewRequest(http.MethodGet, "/api/v1/compute-profiles", nil))
	require.Equal(t, http.StatusOK, rr.Code)
	var body struct {
		Items []models.ComputeProfile `json:"items"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	require.Len(t, body.Items, 3)
	require.Equal(t, "default", body.Items[0].Slug)
	require.True(t, body.Items[0].IsDefault)
}

func TestListComputeProfilesUnconfigured(t *testing.T) {
	restore := SetComputeProfileRepository(nil)
	t.Cleanup(restore)

	rr := httptest.NewRecorder()
	ListComputeProfiles(rr, httptest.NewRequest(http.MethodGet, "/api/v1/compute-profiles", nil))
	require.Equal(t, http.StatusServiceUnavailable, rr.Code)
}
