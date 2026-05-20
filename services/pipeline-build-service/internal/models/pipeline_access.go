package models

import (
	"time"

	"github.com/google/uuid"
)

// PipelineRole is the role granted to a non-owner principal (user or group).
// "owner" is implicit via pipelines.owner_id and is rejected when applied
// through a grant or link-share — those endpoints only encode non-owner roles.
type PipelineRole string

const (
	PipelineRoleNone       PipelineRole = ""
	PipelineRoleOwner      PipelineRole = "owner"
	PipelineRoleEditor     PipelineRole = "editor"
	PipelineRoleViewer     PipelineRole = "viewer"
	PipelineRoleDiscoverer PipelineRole = "discoverer"
)

func (r PipelineRole) Valid() bool {
	switch r {
	case PipelineRoleOwner, PipelineRoleEditor, PipelineRoleViewer, PipelineRoleDiscoverer:
		return true
	}
	return false
}

// IsLinkShareable mirrors the constraint enforced by the DB:
// link-share roles must be non-owner (discoverer | viewer | editor).
func (r PipelineRole) IsLinkShareable() bool {
	switch r {
	case PipelineRoleEditor, PipelineRoleViewer, PipelineRoleDiscoverer:
		return true
	}
	return false
}

// PipelinePrincipalKind identifies whether a grant principal is a user or a
// group. Mirrors vertex graph_grant.
type PipelinePrincipalKind string

const (
	PipelinePrincipalKindUser  PipelinePrincipalKind = "user"
	PipelinePrincipalKindGroup PipelinePrincipalKind = "group"
)

func (k PipelinePrincipalKind) Valid() bool {
	switch k {
	case PipelinePrincipalKindUser, PipelinePrincipalKindGroup:
		return true
	}
	return false
}

// PipelineLinkShare is the wire response for GET /pipelines/{id}/link-share.
// The token is only included in responses to principals who already hold the
// owner role on the pipeline.
type PipelineLinkShare struct {
	Enabled bool         `json:"enabled"`
	Token   string       `json:"token,omitempty"`
	Role    PipelineRole `json:"role,omitempty"`
}

// UpdatePipelineLinkShareRequest toggles link sharing on the pipeline.
// Setting Enabled=false clears the token; Enabled=true rotates the token on
// every call where RotateToken=true or when the share was previously off.
type UpdatePipelineLinkShareRequest struct {
	Enabled     bool         `json:"enabled"`
	Role        PipelineRole `json:"role,omitempty"`
	RotateToken bool         `json:"rotate_token,omitempty"`
}

// PipelineGrant is the wire shape of a resource-level role assignment.
type PipelineGrant struct {
	ID            uuid.UUID             `json:"id"`
	PipelineID    uuid.UUID             `json:"pipeline_id"`
	PrincipalKind PipelinePrincipalKind `json:"principal_kind"`
	PrincipalID   uuid.UUID             `json:"principal_id"`
	Role          PipelineRole          `json:"role"`
	GrantedBy     uuid.UUID             `json:"granted_by"`
	CreatedAt     time.Time             `json:"created_at"`
	UpdatedAt     time.Time             `json:"updated_at"`
}

// PutPipelineGrantRequest upserts (or, when Role is empty/PipelineRoleNone,
// deletes) the grant for a principal.
type PutPipelineGrantRequest struct {
	PrincipalKind PipelinePrincipalKind `json:"principal_kind,omitempty"`
	PrincipalID   uuid.UUID             `json:"principal_id"`
	Role          PipelineRole          `json:"role"`
}

// PipelineFollowerSummary is returned by GET /pipelines/{id}/followers/summary
// so the UI can render the follower count + the caller's follow state in one
// roundtrip.
type PipelineFollowerSummary struct {
	Following     bool `json:"following"`
	FollowerCount int  `json:"follower_count"`
}

// PipelineViewSummary aggregates views over the trailing 30 days, mirroring
// Foundry's "Views: total views in the last 30 days" stat.
type PipelineViewSummary struct {
	ViewCount30Days int64 `json:"view_count_30d"`
}

// PipelineComment is a flat comment on a pipeline. No threading in v1.
type PipelineComment struct {
	ID         uuid.UUID `json:"id"`
	PipelineID uuid.UUID `json:"pipeline_id"`
	AuthorID   uuid.UUID `json:"author_id"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// CreatePipelineCommentRequest is the body posted to
// POST /pipelines/{id}/comments.
type CreatePipelineCommentRequest struct {
	Body string `json:"body"`
}
