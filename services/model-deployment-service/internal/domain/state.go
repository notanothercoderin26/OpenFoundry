// Package domain holds pure logic for the deployment lifecycle.
//
// The status transition graph is encoded as an Aggregate satisfying
// libs/state-machine's contract so any caller (handler, worker,
// migration tool) shares one canonical rule set.
package domain

import (
	"time"

	"github.com/google/uuid"

	statemachine "github.com/openfoundry/openfoundry-go/libs/state-machine"
	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/models"
)

// StatusEvent represents an attempt to move a deployment to the given
// target status. It's a one-field struct rather than a string alias so
// future evolution (actor, reason) can extend the wire without
// renaming.
type StatusEvent struct {
	Target models.DeploymentStatus
}

// DeploymentMachine is the in-memory aggregate that enforces the
// status transition graph:
//
//	pending → running
//	running → degraded
//	degraded → running
//	{pending, running, degraded} → terminated   (terminal)
//
// Re-applying the same status is rejected as an invalid transition —
// the handler short-circuits no-op PATCHes before constructing the
// machine.
type DeploymentMachine struct {
	ID     uuid.UUID              `json:"id"`
	State  models.DeploymentStatus `json:"state"`
}

// Compile-time check that *DeploymentMachine satisfies the contract.
var _ statemachine.Aggregate[StatusEvent] = (*DeploymentMachine)(nil)

// Apply mutates the machine in place when target is reachable from
// the current state. Returns a statemachine.TransitionError otherwise.
func (m *DeploymentMachine) Apply(event StatusEvent) error {
	if !event.Target.Valid() {
		return statemachine.InvalidTransition("unknown target status: " + string(event.Target))
	}
	if !canTransition(m.State, event.Target) {
		return statemachine.InvalidTransition(string(m.State) + " → " + string(event.Target))
	}
	m.State = event.Target
	return nil
}

// CurrentState renders the discriminator for the state column.
func (m *DeploymentMachine) CurrentState() string { return string(m.State) }

// AggregateID is the deployment's primary key.
func (m *DeploymentMachine) AggregateID() uuid.UUID { return m.ID }

// ExpiresAt — deployments don't carry a timeout deadline at this layer.
func (m *DeploymentMachine) ExpiresAt() *time.Time { return nil }

// CanTransition reports whether moving from `from` to `to` is allowed by
// the deployment lifecycle graph. Exported so handlers can validate
// without constructing a machine.
func CanTransition(from, to models.DeploymentStatus) bool {
	return canTransition(from, to)
}

func canTransition(from, to models.DeploymentStatus) bool {
	if from == models.DeploymentStatusTerminated {
		return false
	}
	if to == models.DeploymentStatusTerminated {
		return true
	}
	switch from {
	case models.DeploymentStatusPending:
		return to == models.DeploymentStatusRunning
	case models.DeploymentStatusRunning:
		return to == models.DeploymentStatusDegraded
	case models.DeploymentStatusDegraded:
		return to == models.DeploymentStatusRunning
	}
	return false
}
