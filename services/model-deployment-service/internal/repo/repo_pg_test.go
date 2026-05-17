//go:build integration

package repo_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	testingx "github.com/openfoundry/openfoundry-go/libs/testing"
	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/repo"
)

func TestPGDeploymentRepositoryRoundTrip(t *testing.T) {
	ctx := context.Background()
	h := testingx.BootPostgres(ctx, t)
	require.NoError(t, repo.Migrate(ctx, h.Pool))

	r := &repo.PGDeploymentRepository{Pool: h.Pool}
	owner := uuid.New()

	created, err := r.Create(ctx, models.Deployment{
		ModelID:     uuid.New(),
		Version:     "v1",
		Status:      models.DeploymentStatusPending,
		EndpointURL: "https://serve.local/predict",
		OwnerUserID: owner,
	})
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, created.ID)
	require.Equal(t, models.DeploymentStatusPending, created.Status)

	got, err := r.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, got.ID)
	assert.Equal(t, owner, got.OwnerUserID)

	running, err := r.UpdateStatus(ctx, created.ID, models.DeploymentStatusRunning)
	require.NoError(t, err)
	assert.Equal(t, models.DeploymentStatusRunning, running.Status)
	assert.True(t, running.UpdatedAt.After(created.UpdatedAt) || running.UpdatedAt.Equal(created.UpdatedAt))

	// Second deployment under a different owner to validate filters.
	otherOwner := uuid.New()
	_, err = r.Create(ctx, models.Deployment{
		ModelID:     uuid.New(),
		Version:     "v2",
		Status:      models.DeploymentStatusRunning,
		OwnerUserID: otherOwner,
	})
	require.NoError(t, err)

	byStatus, err := r.List(ctx, models.ListFilter{Status: models.DeploymentStatusRunning})
	require.NoError(t, err)
	assert.Len(t, byStatus, 2)

	byOwner, err := r.List(ctx, models.ListFilter{OwnerUserID: &owner})
	require.NoError(t, err)
	require.Len(t, byOwner, 1)
	assert.Equal(t, created.ID, byOwner[0].ID)

	byBoth, err := r.List(ctx, models.ListFilter{
		Status:      models.DeploymentStatusRunning,
		OwnerUserID: &otherOwner,
	})
	require.NoError(t, err)
	require.Len(t, byBoth, 1)
	assert.Equal(t, otherOwner, byBoth[0].OwnerUserID)

	require.NoError(t, r.Delete(ctx, created.ID))
	_, err = r.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, repo.ErrNotFound)
}

func TestPGDeploymentRepositoryRejectsInvalidStatusViaCheck(t *testing.T) {
	ctx := context.Background()
	h := testingx.BootPostgres(ctx, t)
	require.NoError(t, repo.Migrate(ctx, h.Pool))

	// Bypass the repo so the DB CHECK constraint fires directly.
	_, err := h.Pool.Exec(ctx,
		`INSERT INTO model_lifecycle_deployments (id, model_id, version, status, owner_user_id) VALUES ($1,$2,$3,$4,$5)`,
		uuid.New(), uuid.New(), "v1", "bogus", uuid.New(),
	)
	require.Error(t, err, "CHECK constraint must reject unknown status")
}
