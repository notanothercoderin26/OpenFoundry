package repo

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/models"
)

func newSampleDeployment(owner uuid.UUID) models.Deployment {
	return models.Deployment{
		ModelID:     uuid.New(),
		Version:     "v1",
		Status:      models.DeploymentStatusPending,
		EndpointURL: "https://serve.local/predict",
		OwnerUserID: owner,
	}
}

func TestMemoryRepoCreateAssignsIDAndTimestamps(t *testing.T) {
	t.Parallel()
	fixed := time.Date(2026, 5, 17, 10, 0, 0, 0, time.UTC)
	r := NewMemoryDeploymentRepository(func() time.Time { return fixed })
	owner := uuid.New()

	created, err := r.Create(context.Background(), newSampleDeployment(owner))
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, created.ID)
	assert.Equal(t, fixed, created.CreatedAt)
	assert.Equal(t, fixed, created.UpdatedAt)
	assert.Equal(t, models.DeploymentStatusPending, created.Status)
}

func TestMemoryRepoCreateRejectsDuplicateID(t *testing.T) {
	t.Parallel()
	r := NewMemoryDeploymentRepository(nil)
	owner := uuid.New()
	d := newSampleDeployment(owner)
	d.ID = uuid.New()

	_, err := r.Create(context.Background(), d)
	require.NoError(t, err)
	_, err = r.Create(context.Background(), d)
	assert.ErrorIs(t, err, ErrConflict)
}

func TestMemoryRepoGetByIDReturnsNotFound(t *testing.T) {
	t.Parallel()
	r := NewMemoryDeploymentRepository(nil)
	_, err := r.GetByID(context.Background(), uuid.New())
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestMemoryRepoListAppliesStatusAndOwnerFilters(t *testing.T) {
	t.Parallel()
	r := NewMemoryDeploymentRepository(nil)
	owner := uuid.New()
	other := uuid.New()

	pending, err := r.Create(context.Background(), newSampleDeployment(owner))
	require.NoError(t, err)
	running := newSampleDeployment(owner)
	running.Status = models.DeploymentStatusRunning
	running, err = r.Create(context.Background(), running)
	require.NoError(t, err)
	foreign := newSampleDeployment(other)
	foreign.Status = models.DeploymentStatusRunning
	_, err = r.Create(context.Background(), foreign)
	require.NoError(t, err)

	all, err := r.List(context.Background(), models.ListFilter{})
	require.NoError(t, err)
	assert.Len(t, all, 3)

	byStatus, err := r.List(context.Background(), models.ListFilter{Status: models.DeploymentStatusRunning})
	require.NoError(t, err)
	assert.Len(t, byStatus, 2)

	byOwner, err := r.List(context.Background(), models.ListFilter{OwnerUserID: &owner})
	require.NoError(t, err)
	assert.Len(t, byOwner, 2)

	byBoth, err := r.List(context.Background(), models.ListFilter{Status: models.DeploymentStatusPending, OwnerUserID: &owner})
	require.NoError(t, err)
	require.Len(t, byBoth, 1)
	assert.Equal(t, pending.ID, byBoth[0].ID)

	// Sanity: running deployment belongs to owner too.
	assert.Equal(t, owner, running.OwnerUserID)
}

func TestMemoryRepoUpdateStatusReplacesAndTimestamps(t *testing.T) {
	t.Parallel()
	tick := time.Date(2026, 5, 17, 10, 0, 0, 0, time.UTC)
	r := NewMemoryDeploymentRepository(func() time.Time {
		tick = tick.Add(1 * time.Second)
		return tick
	})
	owner := uuid.New()
	created, err := r.Create(context.Background(), newSampleDeployment(owner))
	require.NoError(t, err)
	originalUpdate := created.UpdatedAt

	updated, err := r.UpdateStatus(context.Background(), created.ID, models.DeploymentStatusRunning)
	require.NoError(t, err)
	assert.Equal(t, models.DeploymentStatusRunning, updated.Status)
	assert.True(t, updated.UpdatedAt.After(originalUpdate), "updated_at must advance")
}

func TestMemoryRepoUpdateStatusOnMissingReturnsNotFound(t *testing.T) {
	t.Parallel()
	r := NewMemoryDeploymentRepository(nil)
	_, err := r.UpdateStatus(context.Background(), uuid.New(), models.DeploymentStatusRunning)
	assert.True(t, errors.Is(err, ErrNotFound))
}

func TestMemoryRepoDeleteRemoves(t *testing.T) {
	t.Parallel()
	r := NewMemoryDeploymentRepository(nil)
	owner := uuid.New()
	created, err := r.Create(context.Background(), newSampleDeployment(owner))
	require.NoError(t, err)

	require.NoError(t, r.Delete(context.Background(), created.ID))
	_, err = r.GetByID(context.Background(), created.ID)
	assert.ErrorIs(t, err, ErrNotFound)

	err = r.Delete(context.Background(), created.ID)
	assert.ErrorIs(t, err, ErrNotFound)
}
