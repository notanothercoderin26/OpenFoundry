// Package models holds wire types for model-deployment-service's
// lifecycle CRUD surface (POST/GET/PATCH/DELETE /api/v1/deployments).
//
// This is distinct from libs/ml-kernel-go/models.ModelDeployment, which
// describes the richer model-serving payload (traffic split, drift
// reports, etc.) consumed by the legacy /api/v1/model-deployment/*
// surface and backed by the ml_deployments table.
package models

import (
	"time"

	"github.com/google/uuid"
)

// DeploymentStatus enumerates the lifecycle states a deployment can occupy.
type DeploymentStatus string

const (
	DeploymentStatusPending    DeploymentStatus = "pending"
	DeploymentStatusRunning    DeploymentStatus = "running"
	DeploymentStatusDegraded   DeploymentStatus = "degraded"
	DeploymentStatusTerminated DeploymentStatus = "terminated"
)

// Valid reports whether s is one of the four wire-stable states.
func (s DeploymentStatus) Valid() bool {
	switch s {
	case DeploymentStatusPending, DeploymentStatusRunning,
		DeploymentStatusDegraded, DeploymentStatusTerminated:
		return true
	}
	return false
}

// Deployment is the lifecycle row stored in `model_lifecycle_deployments`.
type Deployment struct {
	ID          uuid.UUID        `json:"id"`
	ModelID     uuid.UUID        `json:"model_id"`
	Version     string           `json:"version"`
	Status      DeploymentStatus `json:"status"`
	EndpointURL string           `json:"endpoint_url"`
	OwnerUserID uuid.UUID        `json:"owner_user_id"`
	CreatedAt   time.Time        `json:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at"`
}

// CreateDeploymentRequest is the JSON body of POST /api/v1/deployments.
// `status` is not accepted — new deployments always start in `pending`.
type CreateDeploymentRequest struct {
	ModelID     uuid.UUID `json:"model_id"`
	Version     string    `json:"version"`
	EndpointURL string    `json:"endpoint_url"`
}

// UpdateStatusRequest is the JSON body of PATCH /api/v1/deployments/{id}/status.
type UpdateStatusRequest struct {
	Status DeploymentStatus `json:"status"`
}

// ListFilter narrows GET /api/v1/deployments. Both fields are optional;
// zero values disable that filter dimension.
type ListFilter struct {
	Status      DeploymentStatus
	OwnerUserID *uuid.UUID
}
