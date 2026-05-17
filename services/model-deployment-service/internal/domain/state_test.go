package domain

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	statemachine "github.com/openfoundry/openfoundry-go/libs/state-machine"
	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/models"
)

func TestCanTransitionAllowedEdges(t *testing.T) {
	t.Parallel()
	cases := []struct {
		from models.DeploymentStatus
		to   models.DeploymentStatus
	}{
		{models.DeploymentStatusPending, models.DeploymentStatusRunning},
		{models.DeploymentStatusRunning, models.DeploymentStatusDegraded},
		{models.DeploymentStatusDegraded, models.DeploymentStatusRunning},
		{models.DeploymentStatusPending, models.DeploymentStatusTerminated},
		{models.DeploymentStatusRunning, models.DeploymentStatusTerminated},
		{models.DeploymentStatusDegraded, models.DeploymentStatusTerminated},
	}
	for _, c := range cases {
		assert.Truef(t, CanTransition(c.from, c.to), "%s → %s must be allowed", c.from, c.to)
	}
}

func TestCanTransitionRejectsTerminalEgress(t *testing.T) {
	t.Parallel()
	for _, target := range []models.DeploymentStatus{
		models.DeploymentStatusPending,
		models.DeploymentStatusRunning,
		models.DeploymentStatusDegraded,
		models.DeploymentStatusTerminated,
	} {
		assert.Falsef(t, CanTransition(models.DeploymentStatusTerminated, target),
			"terminated → %s must be rejected", target)
	}
}

func TestCanTransitionRejectsIllegalEdges(t *testing.T) {
	t.Parallel()
	cases := []struct {
		from models.DeploymentStatus
		to   models.DeploymentStatus
	}{
		{models.DeploymentStatusPending, models.DeploymentStatusDegraded},
		{models.DeploymentStatusPending, models.DeploymentStatusPending},
		{models.DeploymentStatusRunning, models.DeploymentStatusPending},
		{models.DeploymentStatusRunning, models.DeploymentStatusRunning},
		{models.DeploymentStatusDegraded, models.DeploymentStatusPending},
		{models.DeploymentStatusDegraded, models.DeploymentStatusDegraded},
	}
	for _, c := range cases {
		assert.Falsef(t, CanTransition(c.from, c.to), "%s → %s must be rejected", c.from, c.to)
	}
}

func TestDeploymentMachineApplyDrivesValidPath(t *testing.T) {
	t.Parallel()
	id := uuid.New()
	m := &DeploymentMachine{ID: id, State: models.DeploymentStatusPending}

	require.NoError(t, m.Apply(StatusEvent{Target: models.DeploymentStatusRunning}))
	assert.Equal(t, models.DeploymentStatusRunning, m.State)

	require.NoError(t, m.Apply(StatusEvent{Target: models.DeploymentStatusDegraded}))
	assert.Equal(t, models.DeploymentStatusDegraded, m.State)

	require.NoError(t, m.Apply(StatusEvent{Target: models.DeploymentStatusRunning}))
	assert.Equal(t, models.DeploymentStatusRunning, m.State)

	require.NoError(t, m.Apply(StatusEvent{Target: models.DeploymentStatusTerminated}))
	assert.Equal(t, models.DeploymentStatusTerminated, m.State)
}

func TestDeploymentMachineApplyRejectsIllegalTransition(t *testing.T) {
	t.Parallel()
	m := &DeploymentMachine{ID: uuid.New(), State: models.DeploymentStatusPending}
	err := m.Apply(StatusEvent{Target: models.DeploymentStatusDegraded})
	require.Error(t, err)
	assert.True(t, statemachine.IsTransitionError(err))
	assert.Equal(t, models.DeploymentStatusPending, m.State, "state must not advance on error")
}

func TestDeploymentMachineApplyRejectsUnknownStatus(t *testing.T) {
	t.Parallel()
	m := &DeploymentMachine{ID: uuid.New(), State: models.DeploymentStatusRunning}
	err := m.Apply(StatusEvent{Target: "nonsense"})
	require.Error(t, err)
	assert.True(t, statemachine.IsTransitionError(err))
}

func TestDeploymentMachineApplyRejectsExitFromTerminated(t *testing.T) {
	t.Parallel()
	m := &DeploymentMachine{ID: uuid.New(), State: models.DeploymentStatusTerminated}
	err := m.Apply(StatusEvent{Target: models.DeploymentStatusRunning})
	require.Error(t, err)
	assert.True(t, statemachine.IsTransitionError(err))
}

func TestDeploymentMachineSatisfiesAggregateContract(t *testing.T) {
	t.Parallel()
	id := uuid.New()
	m := &DeploymentMachine{ID: id, State: models.DeploymentStatusRunning}
	assert.Equal(t, id, m.AggregateID())
	assert.Equal(t, "running", m.CurrentState())
	assert.Nil(t, m.ExpiresAt())
}
