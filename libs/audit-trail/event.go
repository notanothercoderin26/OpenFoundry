package audittrail

import "time"

// EventKind is the wire token in the `kind` field of every audit
// event. Stable so SIEM filters key off it; never rename.
type EventKind string

const (
	KindMediaSetCreated                EventKind = "media_set.created"
	KindMediaSetDeleted                EventKind = "media_set.deleted"
	KindMediaSetMarkingsChanged        EventKind = "media_set.markings_changed"
	KindMediaSetRetentionChanged       EventKind = "media_set.retention_changed"
	KindMediaSetTransactionOpened      EventKind = "media_set.transaction_opened"
	KindMediaSetTransactionCommitted   EventKind = "media_set.transaction_committed"
	KindMediaSetTransactionAborted     EventKind = "media_set.transaction_aborted"
	KindMediaSetAccessPatternInvoked   EventKind = "media_set.access_pattern_invoked"
	KindMediaItemUploaded              EventKind = "media_item.uploaded"
	KindMediaItemDownloaded            EventKind = "media_item.downloaded"
	KindMediaItemDeleted               EventKind = "media_item.deleted"
	KindMediaItemMarkingOverridden     EventKind = "media_item.marking_overridden"
	KindVirtualMediaItemRegistered     EventKind = "virtual_media_item.registered"
	KindCompassResourceCreated         EventKind = "compass.resource.created"
	KindCompassResourceMoved           EventKind = "compass.resource.moved"
	KindCompassResourceRenamed         EventKind = "compass.resource.renamed"
	KindCompassResourceTrashed         EventKind = "compass.resource.trashed"
	KindCompassResourceRestored        EventKind = "compass.resource.restored"
	KindCompassResourcePurged          EventKind = "compass.resource.purged"
	KindCompassResourceShareChanged    EventKind = "compass.resource.share_changed"
	KindCompassResourceMarkingsChanged EventKind = "compass.resource.markings_changed"
	KindCompassResourceBulkOperation   EventKind = "compass.resource.bulk_operation"
	KindCompassViewReqPropagated       EventKind = "compass.view_requirements.propagated"

	// Identity-federation variants (T8 compliance closure).
	KindAuthLogin      EventKind = "auth.login"
	KindIdentityLinked EventKind = "auth.identity_linked"
	KindTokenIssued    EventKind = "auth.token_issued"
)

// CategoriesFor returns the audit categories assigned to `kind`. Media
// event mappings mirror Rust; Compass extensions use the same category
// taxonomy.
func CategoriesFor(kind EventKind) []AuditCategory {
	switch kind {
	case KindMediaSetCreated:
		return []AuditCategory{CategoryDataCreate}
	case KindCompassResourceCreated:
		return []AuditCategory{CategoryDataCreate}
	case KindMediaSetDeleted, KindMediaItemDeleted, KindCompassResourceTrashed, KindCompassResourcePurged:
		return []AuditCategory{CategoryDataDelete}
	case KindMediaSetMarkingsChanged, KindMediaItemMarkingOverridden, KindCompassResourceMarkingsChanged, KindCompassViewReqPropagated:
		return []AuditCategory{CategoryManagementMarkings}
	case KindCompassResourceBulkOperation:
		return []AuditCategory{CategoryDataUpdate, CategoryDataDelete}
	case KindMediaSetRetentionChanged,
		KindMediaSetTransactionOpened,
		KindMediaSetTransactionCommitted,
		KindMediaSetTransactionAborted,
		KindCompassResourceMoved,
		KindCompassResourceRenamed,
		KindCompassResourceRestored,
		KindCompassResourceShareChanged:
		return []AuditCategory{CategoryDataUpdate}
	case KindMediaSetAccessPatternInvoked:
		return []AuditCategory{CategoryDataLoad}
	case KindMediaItemUploaded:
		return []AuditCategory{CategoryDataImport}
	case KindMediaItemDownloaded:
		return []AuditCategory{CategoryDataExport}
	case KindVirtualMediaItemRegistered:
		return []AuditCategory{CategoryDataCreate}
	case KindAuthLogin, KindIdentityLinked, KindTokenIssued:
		return []AuditCategory{CategoryAuthentication}
	default:
		return nil
	}
}

// AuditEvent is the discriminated union of every recordable mutation.
//
// One struct with all variant fields is the closest Go gets to
// Rust's sealed enum without resorting to interface boxing for every
// emit call. The trade-off is mild type laxity in code; the
// invariant — only the fields relevant to Kind are populated — is
// enforced by the per-variant constructors below
// (NewMediaSetCreated, NewMediaItemUploaded, …).
//
// JSON wire format keeps the Rust shape for media events: `kind` is the
// discriminator (e.g. "media_set.created"), payload-specific fields
// land at the same level, and unset fields are omitted entirely.
type AuditEvent struct {
	Kind            EventKind `json:"kind"`
	ResourceRID     string    `json:"resource_rid"`
	ProjectRID      string    `json:"project_rid"`
	MarkingsAtEvent []string  `json:"markings_at_event"`

	// MediaSetCreated.
	Name              string `json:"name,omitempty"`
	Schema            string `json:"schema,omitempty"`
	TransactionPolicy string `json:"transaction_policy,omitempty"`
	Virtual           *bool  `json:"virtual,omitempty"`

	// Markings + retention changes.
	PreviousMarkings         []string `json:"previous_markings,omitempty"`
	PreviousRetentionSeconds *int64   `json:"previous_retention_seconds,omitempty"`
	NewRetentionSeconds      *int64   `json:"new_retention_seconds,omitempty"`

	// Transaction events.
	TransactionRID string `json:"transaction_rid,omitempty"`
	Branch         string `json:"branch,omitempty"`

	// Access patterns.
	AccessPattern string `json:"access_pattern,omitempty"`
	Persistence   string `json:"persistence,omitempty"`

	// Media item.
	MediaSetRID string  `json:"media_set_rid,omitempty"`
	Path        string  `json:"path,omitempty"`
	MimeType    string  `json:"mime_type,omitempty"`
	SizeBytes   *int64  `json:"size_bytes,omitempty"`
	SHA256      string  `json:"sha256,omitempty"`
	TTLSeconds  *uint64 `json:"ttl_seconds,omitempty"`

	// Virtual media item.
	PhysicalPath string `json:"physical_path,omitempty"`
	ItemPath     string `json:"item_path,omitempty"`

	// Compass resource lifecycle.
	ResourceType           string               `json:"resource_type,omitempty"`
	DisplayName            string               `json:"display_name,omitempty"`
	PreviousDisplayName    string               `json:"previous_display_name,omitempty"`
	NewDisplayName         string               `json:"new_display_name,omitempty"`
	PreviousProjectRID     string               `json:"previous_project_rid,omitempty"`
	NewProjectRID          string               `json:"new_project_rid,omitempty"`
	PreviousParentRID      string               `json:"previous_parent_rid,omitempty"`
	NewParentRID           string               `json:"new_parent_rid,omitempty"`
	DeletedAt              string               `json:"deleted_at,omitempty"`
	DeletedBy              string               `json:"deleted_by,omitempty"`
	RestoredBy             string               `json:"restored_by,omitempty"`
	RestoredToOriginalPath *bool                `json:"restored_to_original_path,omitempty"`
	RestoreTargetStatus    string               `json:"restore_target_status,omitempty"`
	PurgedBy               string               `json:"purged_by,omitempty"`
	RetentionDays          *int                 `json:"retention_days,omitempty"`
	PurgeAfter             string               `json:"purge_after,omitempty"`
	PurgeMode              string               `json:"purge_mode,omitempty"`
	AffectedDependents     []AffectedDependent  `json:"affected_dependents,omitempty"`
	DependentListTruncated *bool                `json:"dependent_list_truncated,omitempty"`
	ShareID                string               `json:"share_id,omitempty"`
	ShareChangeType        string               `json:"share_change_type,omitempty"`
	SharePrincipalKind     string               `json:"share_principal_kind,omitempty"`
	SharePrincipalID       string               `json:"share_principal_id,omitempty"`
	ShareAccessLevel       string               `json:"share_access_level,omitempty"`
	BatchID                string               `json:"batch_id,omitempty"`
	BatchOperation         string               `json:"batch_operation,omitempty"`
	BatchTotal             *int                 `json:"batch_total,omitempty"`
	BatchSucceeded         *int                 `json:"batch_succeeded,omitempty"`
	BatchFailed            *int                 `json:"batch_failed,omitempty"`
	BatchPreflightFailed   *bool                `json:"batch_preflight_failed,omitempty"`
	BatchActions           []BulkResourceAction `json:"batch_actions,omitempty"`

	// Compass view-requirement propagation.
	PropagationJobID   string `json:"propagation_job_id,omitempty"`
	ParentResourceRID  string `json:"parent_resource_rid,omitempty"`
	ParentResourceKind string `json:"parent_resource_kind,omitempty"`
	TotalFolders       *int   `json:"total_folders,omitempty"`
	ChangedFolders     *int   `json:"changed_folders,omitempty"`
	TotalResources     *int   `json:"total_resources,omitempty"`
	ChangedResources   *int   `json:"changed_resources,omitempty"`

	// Auth variants (auth.login / auth.identity_linked / auth.token_issued).
	// Each field is omitempty so the wire shape only carries the slots the
	// variant actually populates. The compliance/audit-sink consumer keys
	// off `kind` to know which slots to read.
	UserID       string    `json:"user_id,omitempty"`
	TenantID     string    `json:"tenant_id,omitempty"`
	Provider     string    `json:"provider,omitempty"`
	Subject      string    `json:"subject,omitempty"`
	LoginEmail   string    `json:"login_email,omitempty"`
	MFASatisfied *bool     `json:"mfa_satisfied,omitempty"`
	AuthMethods  []string  `json:"auth_methods,omitempty"`
	TokenID      string    `json:"token_id,omitempty"`
	ExpiresAt    time.Time `json:"expires_at,omitempty"`
	Scopes       []string  `json:"scopes,omitempty"`
}

// Categories is shorthand for CategoriesFor(e.Kind).
func (e *AuditEvent) Categories() []AuditCategory { return CategoriesFor(e.Kind) }

// ─── Variant constructors ───────────────────────────────────────────────

func boolPtr(b bool) *bool    { return &b }
func i64Ptr(v int64) *int64   { return &v }
func intPtr(v int) *int       { return &v }
func u64Ptr(v uint64) *uint64 { return &v }

func uniqueStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

// AffectedDependent identifies a row/resource whose state changes because
// another Compass resource is permanently purged.
type AffectedDependent struct {
	Kind         string `json:"kind"`
	RID          string `json:"rid,omitempty"`
	ID           string `json:"id,omitempty"`
	Relationship string `json:"relationship,omitempty"`
	Action       string `json:"action,omitempty"`
}

// BulkResourceAction captures one row inside a Compass bulk operation
// audit event. The enclosing event is the single auditable batch record.
type BulkResourceAction struct {
	Op                 string   `json:"op"`
	ResourceKind       string   `json:"resource_kind"`
	ResourceID         string   `json:"resource_id"`
	ResourceRID        string   `json:"resource_rid,omitempty"`
	ProjectRID         string   `json:"project_rid,omitempty"`
	MarkingsAtEvent    []string `json:"markings_at_event,omitempty"`
	Status             string   `json:"status"`
	Error              string   `json:"error,omitempty"`
	TargetProjectRID   string   `json:"target_project_rid,omitempty"`
	TargetFolderRID    string   `json:"target_folder_rid,omitempty"`
	RetentionDays      *int     `json:"retention_days,omitempty"`
	ShareID            string   `json:"share_id,omitempty"`
	ShareChangeType    string   `json:"share_change_type,omitempty"`
	SharePrincipalKind string   `json:"share_principal_kind,omitempty"`
	SharePrincipalID   string   `json:"share_principal_id,omitempty"`
	ShareAccessLevel   string   `json:"share_access_level,omitempty"`
}

// NewMediaSetCreated builds an event for a freshly created media set.
func NewMediaSetCreated(rid, projectRID string, markings []string, name, schema, txPolicy string, virtual bool) AuditEvent {
	return AuditEvent{
		Kind:              KindMediaSetCreated,
		ResourceRID:       rid,
		ProjectRID:        projectRID,
		MarkingsAtEvent:   markings,
		Name:              name,
		Schema:            schema,
		TransactionPolicy: txPolicy,
		Virtual:           boolPtr(virtual),
	}
}

// NewMediaSetDeleted builds an event for a media-set deletion.
func NewMediaSetDeleted(rid, projectRID string, markings []string) AuditEvent {
	return AuditEvent{
		Kind:            KindMediaSetDeleted,
		ResourceRID:     rid,
		ProjectRID:      projectRID,
		MarkingsAtEvent: markings,
	}
}

// NewMediaSetMarkingsChanged builds the markings-changed audit event.
func NewMediaSetMarkingsChanged(rid, projectRID string, markings, previous []string) AuditEvent {
	return AuditEvent{
		Kind:             KindMediaSetMarkingsChanged,
		ResourceRID:      rid,
		ProjectRID:       projectRID,
		MarkingsAtEvent:  markings,
		PreviousMarkings: previous,
	}
}

// NewMediaSetRetentionChanged builds the retention-change audit event.
func NewMediaSetRetentionChanged(rid, projectRID string, markings []string, previousSecs, newSecs int64) AuditEvent {
	return AuditEvent{
		Kind:                     KindMediaSetRetentionChanged,
		ResourceRID:              rid,
		ProjectRID:               projectRID,
		MarkingsAtEvent:          markings,
		PreviousRetentionSeconds: i64Ptr(previousSecs),
		NewRetentionSeconds:      i64Ptr(newSecs),
	}
}

// NewMediaSetTransactionOpened/Committed/Aborted build the three
// dataset-transaction audit events.
func NewMediaSetTransactionOpened(rid, projectRID string, markings []string, txRID, branch string) AuditEvent {
	return AuditEvent{Kind: KindMediaSetTransactionOpened, ResourceRID: rid, ProjectRID: projectRID, MarkingsAtEvent: markings, TransactionRID: txRID, Branch: branch}
}
func NewMediaSetTransactionCommitted(rid, projectRID string, markings []string, txRID, branch string) AuditEvent {
	return AuditEvent{Kind: KindMediaSetTransactionCommitted, ResourceRID: rid, ProjectRID: projectRID, MarkingsAtEvent: markings, TransactionRID: txRID, Branch: branch}
}
func NewMediaSetTransactionAborted(rid, projectRID string, markings []string, txRID, branch string) AuditEvent {
	return AuditEvent{Kind: KindMediaSetTransactionAborted, ResourceRID: rid, ProjectRID: projectRID, MarkingsAtEvent: markings, TransactionRID: txRID, Branch: branch}
}

// NewMediaSetAccessPatternInvoked records server-side materialisation
// (image transform, OCR, transcription, …).
func NewMediaSetAccessPatternInvoked(rid, projectRID string, markings []string, pattern, persistence string) AuditEvent {
	return AuditEvent{
		Kind:            KindMediaSetAccessPatternInvoked,
		ResourceRID:     rid,
		ProjectRID:      projectRID,
		MarkingsAtEvent: markings,
		AccessPattern:   pattern,
		Persistence:     persistence,
	}
}

// NewMediaItemUploaded records a fresh media-item upload.
//
// `transactionRID` is optional — pass "" outside transactional contexts.
func NewMediaItemUploaded(itemRID, mediaSetRID, projectRID string, markings []string,
	path, mime string, size int64, sha256, transactionRID string) AuditEvent {
	return AuditEvent{
		Kind:            KindMediaItemUploaded,
		ResourceRID:     itemRID,
		MediaSetRID:     mediaSetRID,
		ProjectRID:      projectRID,
		MarkingsAtEvent: markings,
		Path:            path,
		MimeType:        mime,
		SizeBytes:       i64Ptr(size),
		SHA256:          sha256,
		TransactionRID:  transactionRID,
	}
}

// NewMediaItemDownloaded records a media-item download.
func NewMediaItemDownloaded(itemRID, mediaSetRID, projectRID string, markings []string, size int64, ttl uint64) AuditEvent {
	return AuditEvent{
		Kind:            KindMediaItemDownloaded,
		ResourceRID:     itemRID,
		MediaSetRID:     mediaSetRID,
		ProjectRID:      projectRID,
		MarkingsAtEvent: markings,
		SizeBytes:       i64Ptr(size),
		TTLSeconds:      u64Ptr(ttl),
	}
}

// NewMediaItemDeleted records a media-item deletion.
func NewMediaItemDeleted(itemRID, mediaSetRID, projectRID string, markings []string, size int64) AuditEvent {
	return AuditEvent{
		Kind:            KindMediaItemDeleted,
		ResourceRID:     itemRID,
		MediaSetRID:     mediaSetRID,
		ProjectRID:      projectRID,
		MarkingsAtEvent: markings,
		SizeBytes:       i64Ptr(size),
	}
}

// NewMediaItemMarkingOverridden records a per-item marking override.
func NewMediaItemMarkingOverridden(itemRID, mediaSetRID, projectRID string, markings, previous []string) AuditEvent {
	return AuditEvent{
		Kind:             KindMediaItemMarkingOverridden,
		ResourceRID:      itemRID,
		MediaSetRID:      mediaSetRID,
		ProjectRID:       projectRID,
		MarkingsAtEvent:  markings,
		PreviousMarkings: previous,
	}
}

// NewVirtualMediaItemRegistered records the registration of a virtual
// (pointer-only) media item in a media set.
func NewVirtualMediaItemRegistered(itemRID, mediaSetRID, projectRID string, markings []string, physicalPath, itemPath string) AuditEvent {
	return AuditEvent{
		Kind:            KindVirtualMediaItemRegistered,
		ResourceRID:     itemRID,
		MediaSetRID:     mediaSetRID,
		ProjectRID:      projectRID,
		MarkingsAtEvent: markings,
		PhysicalPath:    physicalPath,
		ItemPath:        itemPath,
	}
}

// NewCompassResourceCreated records a Compass resource creation.
func NewCompassResourceCreated(rid, projectRID string, markings []string, resourceType, displayName string) AuditEvent {
	return AuditEvent{
		Kind:            KindCompassResourceCreated,
		ResourceRID:     rid,
		ProjectRID:      projectRID,
		MarkingsAtEvent: markings,
		ResourceType:    resourceType,
		DisplayName:     displayName,
	}
}

// NewCompassResourceMoved records a Compass resource re-parent or
// cross-project move. RIDs remain stable; previous/new project and
// parent RIDs describe the breadcrumb change.
func NewCompassResourceMoved(rid, projectRID string, markings []string, resourceType, displayName, previousProjectRID, newProjectRID, previousParentRID, newParentRID string) AuditEvent {
	return AuditEvent{
		Kind:               KindCompassResourceMoved,
		ResourceRID:        rid,
		ProjectRID:         projectRID,
		MarkingsAtEvent:    markings,
		ResourceType:       resourceType,
		DisplayName:        displayName,
		PreviousProjectRID: previousProjectRID,
		NewProjectRID:      newProjectRID,
		PreviousParentRID:  previousParentRID,
		NewParentRID:       newParentRID,
	}
}

// NewCompassResourceRenamed records a Compass display-name change.
func NewCompassResourceRenamed(rid, projectRID string, markings []string, resourceType, previousName, newName string) AuditEvent {
	return AuditEvent{
		Kind:                KindCompassResourceRenamed,
		ResourceRID:         rid,
		ProjectRID:          projectRID,
		MarkingsAtEvent:     markings,
		ResourceType:        resourceType,
		DisplayName:         newName,
		PreviousDisplayName: previousName,
		NewDisplayName:      newName,
	}
}

// NewCompassResourceTrashed records a soft delete into Trash.
func NewCompassResourceTrashed(rid, projectRID string, markings []string, resourceType, displayName, deletedAt, deletedBy string, retentionDays int, purgeAfter string) AuditEvent {
	return AuditEvent{
		Kind:            KindCompassResourceTrashed,
		ResourceRID:     rid,
		ProjectRID:      projectRID,
		MarkingsAtEvent: markings,
		ResourceType:    resourceType,
		DisplayName:     displayName,
		DeletedAt:       deletedAt,
		DeletedBy:       deletedBy,
		RetentionDays:   intPtr(retentionDays),
		PurgeAfter:      purgeAfter,
	}
}

// NewCompassResourceRestored records a restore from Trash.
func NewCompassResourceRestored(rid, projectRID string, markings []string, resourceType, displayName, restoredBy, restoreTargetStatus string, restoredToOriginalPath bool) AuditEvent {
	return AuditEvent{
		Kind:                   KindCompassResourceRestored,
		ResourceRID:            rid,
		ProjectRID:             projectRID,
		MarkingsAtEvent:        markings,
		ResourceType:           resourceType,
		DisplayName:            displayName,
		RestoredBy:             restoredBy,
		RestoreTargetStatus:    restoreTargetStatus,
		RestoredToOriginalPath: boolPtr(restoredToOriginalPath),
	}
}

// NewCompassResourcePurged records a permanent Compass resource delete.
func NewCompassResourcePurged(rid, projectRID string, markings []string, resourceType, displayName, deletedAt, deletedBy, purgedBy string, retentionDays int, purgeAfter, purgeMode string, dependents []AffectedDependent, truncated bool) AuditEvent {
	return AuditEvent{
		Kind:                   KindCompassResourcePurged,
		ResourceRID:            rid,
		ProjectRID:             projectRID,
		MarkingsAtEvent:        markings,
		ResourceType:           resourceType,
		DisplayName:            displayName,
		DeletedAt:              deletedAt,
		DeletedBy:              deletedBy,
		PurgedBy:               purgedBy,
		RetentionDays:          intPtr(retentionDays),
		PurgeAfter:             purgeAfter,
		PurgeMode:              purgeMode,
		AffectedDependents:     dependents,
		DependentListTruncated: boolPtr(truncated),
	}
}

// NewCompassResourceShareChanged records create/update/revoke of a
// direct resource share grant.
func NewCompassResourceShareChanged(rid, projectRID string, markings []string, resourceType, displayName, shareID, changeType, principalKind, principalID, accessLevel string) AuditEvent {
	return AuditEvent{
		Kind:               KindCompassResourceShareChanged,
		ResourceRID:        rid,
		ProjectRID:         projectRID,
		MarkingsAtEvent:    markings,
		ResourceType:       resourceType,
		DisplayName:        displayName,
		ShareID:            shareID,
		ShareChangeType:    changeType,
		SharePrincipalKind: principalKind,
		SharePrincipalID:   principalID,
		ShareAccessLevel:   accessLevel,
	}
}

// NewCompassResourceBulkOperation records one Compass batch operation. The
// event carries per-row outcomes so move/trash/share batches can remain
// searchable in the central audit surface without emitting one audit event per
// selected resource.
func NewCompassResourceBulkOperation(batchID string, actions []BulkResourceAction, preflightFailed bool) AuditEvent {
	total := len(actions)
	succeeded := 0
	failed := 0
	op := ""
	mixed := false
	projectRID := ""
	commonProject := true
	markings := make([]string, 0)
	for _, action := range actions {
		switch action.Status {
		case "succeeded":
			succeeded++
		default:
			failed++
		}
		if op == "" {
			op = action.Op
		} else if op != action.Op {
			mixed = true
		}
		if action.ProjectRID != "" {
			if projectRID == "" {
				projectRID = action.ProjectRID
			} else if projectRID != action.ProjectRID {
				commonProject = false
			}
		}
		markings = append(markings, action.MarkingsAtEvent...)
	}
	if mixed || op == "" {
		op = "mixed"
	}
	if !commonProject {
		projectRID = ""
	}
	if batchID == "" {
		batchID = "unknown"
	}
	return AuditEvent{
		Kind:                 KindCompassResourceBulkOperation,
		ResourceRID:          "ri.compass.main.bulk-operation." + batchID,
		ProjectRID:           projectRID,
		MarkingsAtEvent:      uniqueStrings(markings),
		ResourceType:         "bulk-operation",
		DisplayName:          "Bulk resource operation",
		BatchID:              batchID,
		BatchOperation:       op,
		BatchTotal:           intPtr(total),
		BatchSucceeded:       intPtr(succeeded),
		BatchFailed:          intPtr(failed),
		BatchPreflightFailed: boolPtr(preflightFailed),
		BatchActions:         actions,
	}
}

// NewCompassResourceMarkingsChanged records a direct marking update on
// a Compass resource.
func NewCompassResourceMarkingsChanged(rid, projectRID string, markings, previous []string, resourceType, displayName string) AuditEvent {
	return AuditEvent{
		Kind:             KindCompassResourceMarkingsChanged,
		ResourceRID:      rid,
		ProjectRID:       projectRID,
		MarkingsAtEvent:  markings,
		PreviousMarkings: previous,
		ResourceType:     resourceType,
		DisplayName:      displayName,
	}
}

// NewCompassViewRequirementsPropagated records a background copy of
// legacy "Propagate view requirements" markings to descendants.
func NewCompassViewRequirementsPropagated(parentRID, projectRID string, markings, previous []string, parentKind, jobID string, totalFolders, changedFolders, totalResources, changedResources int, dependents []AffectedDependent, truncated bool) AuditEvent {
	return AuditEvent{
		Kind:                   KindCompassViewReqPropagated,
		ResourceRID:            parentRID,
		ProjectRID:             projectRID,
		MarkingsAtEvent:        markings,
		PreviousMarkings:       previous,
		ResourceType:           parentKind,
		PropagationJobID:       jobID,
		ParentResourceRID:      parentRID,
		ParentResourceKind:     parentKind,
		TotalFolders:           intPtr(totalFolders),
		ChangedFolders:         intPtr(changedFolders),
		TotalResources:         intPtr(totalResources),
		ChangedResources:       intPtr(changedResources),
		AffectedDependents:     dependents,
		DependentListTruncated: boolPtr(truncated),
	}
}

// UserResourceRID builds the canonical RID for an identity-federation
// user. Kept in this package so audit producers and the audit-sink
// consumer derive the same string from a raw UUID.
func UserResourceRID(userID string) string {
	return "ri.identity.main.user." + userID
}

// NewAuthLogin records a successful SSO/OIDC/SAML login. `userID` is
// the platform user UUID; `tenantID` may be empty when the user is
// global. `mfaSatisfied` is the boolean MFA gate result (true also
// when MFA is not configured for the user). `subject` is the IdP-side
// identifier (email, sub claim, NameID).
func NewAuthLogin(userID, tenantID, provider, subject, loginEmail string, mfaSatisfied bool, authMethods []string) AuditEvent {
	return AuditEvent{
		Kind:            KindAuthLogin,
		ResourceRID:     UserResourceRID(userID),
		ProjectRID:      tenantID,
		MarkingsAtEvent: nil,
		UserID:          userID,
		TenantID:        tenantID,
		Provider:        provider,
		Subject:         subject,
		LoginEmail:      loginEmail,
		MFASatisfied:    boolPtr(mfaSatisfied),
		AuthMethods:     authMethods,
	}
}

// NewIdentityLinked records the first-time binding of an IdP subject
// to a platform user. Re-logins do not emit this — only the row
// insertion does, since the binding is the audit-worthy state change.
func NewIdentityLinked(userID, tenantID, provider, subject, loginEmail string) AuditEvent {
	return AuditEvent{
		Kind:            KindIdentityLinked,
		ResourceRID:     UserResourceRID(userID),
		ProjectRID:      tenantID,
		MarkingsAtEvent: nil,
		UserID:          userID,
		TenantID:        tenantID,
		Provider:        provider,
		Subject:         subject,
		LoginEmail:      loginEmail,
	}
}

// NewTokenIssued records an access-token mint. The deterministic
// event_id falls out of (tokenID || userID || expiresAt) — a retried
// callback that successfully re-mints under the same JTI collapses
// into the same outbox row.
func NewTokenIssued(tokenID, userID, tenantID string, expiresAt time.Time, scopes []string) AuditEvent {
	return AuditEvent{
		Kind:            KindTokenIssued,
		ResourceRID:     UserResourceRID(userID),
		ProjectRID:      tenantID,
		MarkingsAtEvent: nil,
		UserID:          userID,
		TenantID:        tenantID,
		TokenID:         tokenID,
		ExpiresAt:       expiresAt,
		Scopes:          scopes,
	}
}
