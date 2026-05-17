package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

const (
	MarkingCategoryVisibilityVisible = "visible"
	MarkingCategoryVisibilityHidden  = "hidden"

	MarkingCategoryPrincipalUser  = "user"
	MarkingCategoryPrincipalGroup = "group"

	MarkingCategoryPermissionAdministrator = "administrator"
	MarkingCategoryPermissionViewer        = "viewer"

	MarkingCategoryAuditCreated           = "category.created"
	MarkingCategoryAuditUpdated           = "category.updated"
	MarkingCategoryAuditPermissionGranted = "category.permission_granted"
	MarkingCategoryAuditPermissionRevoked = "category.permission_revoked"
	MarkingCategoryAuditDeleteBlocked     = "category.delete_blocked"

	MarkingPermissionAdministrator = "administrator"
	MarkingPermissionRemover       = "remover"
	MarkingPermissionApplier       = "applier"
	MarkingPermissionMember        = "member"

	MarkingAuditCreated             = "marking.created"
	MarkingAuditUpdated             = "marking.updated"
	MarkingAuditPermissionGranted   = "marking.permission_granted"
	MarkingAuditPermissionRevoked   = "marking.permission_revoked"
	MarkingAuditDeleteBlocked       = "marking.delete_blocked"
	MarkingAuditCategoryMoveBlocked = "marking.category_move_blocked"

	ResourceMarkingAuditApplied      = "resource_marking.applied"
	ResourceMarkingAuditApplyDenied  = "resource_marking.apply_denied"
	ResourceMarkingAuditRemoved      = "resource_marking.removed"
	ResourceMarkingAuditRemoveDenied = "resource_marking.remove_denied"
)

// MarkingCategory is the SG.11 administrative container. Actual marking
// rows and membership enforcement arrive in SG.12-SG.15.
type MarkingCategory struct {
	ID             uuid.UUID       `json:"id"`
	TenantID       *uuid.UUID      `json:"tenant_id,omitempty"`
	Slug           string          `json:"slug"`
	DisplayName    string          `json:"display_name"`
	Description    string          `json:"description"`
	Visibility     string          `json:"visibility"`
	OrganizationID *uuid.UUID      `json:"organization_id,omitempty"`
	Metadata       json.RawMessage `json:"metadata"`
	CreatedBy      uuid.UUID       `json:"created_by"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type MarkingCategoryPermission struct {
	CategoryID    uuid.UUID `json:"category_id"`
	PrincipalKind string    `json:"principal_kind"`
	PrincipalID   uuid.UUID `json:"principal_id"`
	Permission    string    `json:"permission"`
	GrantedBy     uuid.UUID `json:"granted_by"`
	CreatedAt     time.Time `json:"created_at"`
}

type MarkingCategoryResponse struct {
	MarkingCategory
	Permissions []MarkingCategoryPermission `json:"permissions"`
}

type MarkingCategoryPrincipal struct {
	PrincipalKind string    `json:"principal_kind"`
	PrincipalID   uuid.UUID `json:"principal_id"`
}

type CreateMarkingCategoryRequest struct {
	Slug           string                     `json:"slug"`
	DisplayName    string                     `json:"display_name"`
	Description    string                     `json:"description,omitempty"`
	Visibility     string                     `json:"visibility,omitempty"`
	OrganizationID *uuid.UUID                 `json:"organization_id,omitempty"`
	Metadata       json.RawMessage            `json:"metadata,omitempty"`
	Administrators []MarkingCategoryPrincipal `json:"administrators,omitempty"`
	Viewers        []MarkingCategoryPrincipal `json:"viewers,omitempty"`
}

type UpdateMarkingCategoryRequest struct {
	DisplayName    *string         `json:"display_name,omitempty"`
	Description    *string         `json:"description,omitempty"`
	Visibility     *string         `json:"visibility,omitempty"`
	OrganizationID *uuid.UUID      `json:"organization_id,omitempty"`
	Metadata       json.RawMessage `json:"metadata,omitempty"`
}

type UpsertMarkingCategoryPermissionRequest struct {
	PrincipalKind string    `json:"principal_kind"`
	PrincipalID   uuid.UUID `json:"principal_id"`
	Permission    string    `json:"permission"`
}

type MarkingCategoryAuditEvent struct {
	ID            uuid.UUID       `json:"id"`
	TenantID      *uuid.UUID      `json:"tenant_id,omitempty"`
	CategoryID    *uuid.UUID      `json:"category_id,omitempty"`
	ActorID       uuid.UUID       `json:"actor_id"`
	Action        string          `json:"action"`
	PrincipalKind *string         `json:"principal_kind,omitempty"`
	PrincipalID   *uuid.UUID      `json:"principal_id,omitempty"`
	Permission    *string         `json:"permission,omitempty"`
	BeforeState   json.RawMessage `json:"before_state"`
	AfterState    json.RawMessage `json:"after_state"`
	Metadata      json.RawMessage `json:"metadata"`
	CreatedAt     time.Time       `json:"created_at"`
}

// Marking is the stable, category-scoped mandatory access-control
// primitive. CategoryID is immutable after creation.
type Marking struct {
	ID          uuid.UUID       `json:"id"`
	TenantID    *uuid.UUID      `json:"tenant_id,omitempty"`
	CategoryID  uuid.UUID       `json:"category_id"`
	Slug        string          `json:"slug"`
	DisplayName string          `json:"display_name"`
	Description string          `json:"description"`
	Metadata    json.RawMessage `json:"metadata"`
	CreatedBy   uuid.UUID       `json:"created_by"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type MarkingPermission struct {
	MarkingID     uuid.UUID `json:"marking_id"`
	PrincipalKind string    `json:"principal_kind"`
	PrincipalID   uuid.UUID `json:"principal_id"`
	Permission    string    `json:"permission"`
	GrantedBy     uuid.UUID `json:"granted_by"`
	CreatedAt     time.Time `json:"created_at"`
}

type MarkingResponse struct {
	Marking
	Permissions      []MarkingPermission `json:"permissions"`
	MetadataRedacted bool                `json:"metadata_redacted,omitempty"`
}

type MarkingPrincipal struct {
	PrincipalKind string    `json:"principal_kind"`
	PrincipalID   uuid.UUID `json:"principal_id"`
}

type CreateMarkingRequest struct {
	ID             *uuid.UUID         `json:"id,omitempty"`
	Slug           string             `json:"slug"`
	DisplayName    string             `json:"display_name"`
	Description    string             `json:"description,omitempty"`
	Metadata       json.RawMessage    `json:"metadata,omitempty"`
	Administrators []MarkingPrincipal `json:"administrators,omitempty"`
	Removers       []MarkingPrincipal `json:"removers,omitempty"`
	Appliers       []MarkingPrincipal `json:"appliers,omitempty"`
	Members        []MarkingPrincipal `json:"members,omitempty"`
}

type UpdateMarkingRequest struct {
	DisplayName *string         `json:"display_name,omitempty"`
	Description *string         `json:"description,omitempty"`
	Metadata    json.RawMessage `json:"metadata,omitempty"`
}

type UpsertMarkingPermissionRequest struct {
	PrincipalKind string    `json:"principal_kind"`
	PrincipalID   uuid.UUID `json:"principal_id"`
	Permission    string    `json:"permission"`
}

type MoveMarkingCategoryRequest struct {
	TargetCategoryID uuid.UUID `json:"target_category_id"`
}

type MarkingAuditEvent struct {
	ID            uuid.UUID       `json:"id"`
	TenantID      *uuid.UUID      `json:"tenant_id,omitempty"`
	CategoryID    *uuid.UUID      `json:"category_id,omitempty"`
	MarkingID     *uuid.UUID      `json:"marking_id,omitempty"`
	ActorID       uuid.UUID       `json:"actor_id"`
	Action        string          `json:"action"`
	PrincipalKind *string         `json:"principal_kind,omitempty"`
	PrincipalID   *uuid.UUID      `json:"principal_id,omitempty"`
	Permission    *string         `json:"permission,omitempty"`
	BeforeState   json.RawMessage `json:"before_state"`
	AfterState    json.RawMessage `json:"after_state"`
	Metadata      json.RawMessage `json:"metadata"`
	CreatedAt     time.Time       `json:"created_at"`
}

type MarkingPermissionCheckRequest struct {
	PrincipalID                   *uuid.UUID  `json:"principal_id,omitempty"`
	GroupIDs                      []uuid.UUID `json:"group_ids,omitempty"`
	ResourceUpdateMarkingsAllowed bool        `json:"resource_update_markings_allowed,omitempty"`
	ExpandAccessAllowed           bool        `json:"expand_access_allowed,omitempty"`
}

type MarkingPermissionCheckResponse struct {
	MarkingID                     uuid.UUID `json:"marking_id"`
	PrincipalID                   uuid.UUID `json:"principal_id"`
	CanManage                     bool      `json:"can_manage"`
	CanApply                      bool      `json:"can_apply"`
	CanRemove                     bool      `json:"can_remove"`
	IsMember                      bool      `json:"is_member"`
	CanAccessMarkedData           bool      `json:"can_access_marked_data"`
	ResourceUpdateMarkingsAllowed bool      `json:"resource_update_markings_allowed"`
	ExpandAccessAllowed           bool      `json:"expand_access_allowed"`
	CanApplyToResource            bool      `json:"can_apply_to_resource"`
	CanRemoveFromResource         bool      `json:"can_remove_from_resource"`
	Reasons                       []string  `json:"reasons"`
}

type ResourceMarking struct {
	ID           uuid.UUID       `json:"id"`
	TenantID     *uuid.UUID      `json:"tenant_id,omitempty"`
	ResourceKind string          `json:"resource_kind"`
	ResourceID   string          `json:"resource_id"`
	MarkingID    uuid.UUID       `json:"marking_id"`
	SourceKind   string          `json:"source_kind"`
	Metadata     json.RawMessage `json:"metadata"`
	AppliedBy    uuid.UUID       `json:"applied_by"`
	AppliedAt    time.Time       `json:"applied_at"`
}

type ApplyResourceMarkingRequest struct {
	ResourceKind                  string          `json:"resource_kind"`
	ResourceID                    string          `json:"resource_id"`
	MarkingID                     uuid.UUID       `json:"marking_id"`
	ResourceUpdateMarkingsAllowed bool            `json:"resource_update_markings_allowed"`
	Metadata                      json.RawMessage `json:"metadata,omitempty"`
}

type RemoveResourceMarkingRequest struct {
	ResourceKind                  string    `json:"resource_kind"`
	ResourceID                    string    `json:"resource_id"`
	MarkingID                     uuid.UUID `json:"marking_id"`
	ResourceUpdateMarkingsAllowed bool      `json:"resource_update_markings_allowed"`
	ExpandAccessAllowed           bool      `json:"expand_access_allowed,omitempty"`
	Reason                        string    `json:"reason,omitempty"`
}

type ResourceMarkingMutationResponse struct {
	Allowed         bool                           `json:"allowed"`
	ResourceMarking *ResourceMarking               `json:"resource_marking,omitempty"`
	PermissionCheck MarkingPermissionCheckResponse `json:"permission_check"`
}
