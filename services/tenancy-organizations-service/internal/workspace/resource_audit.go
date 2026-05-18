package workspace

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	audittrail "github.com/openfoundry/openfoundry-go/libs/audit-trail"
)

type resourceAuditSnapshot struct {
	Kind           ResourceKind
	ResourceID     uuid.UUID
	ResourceRID    string
	ResourceType   string
	DisplayName    string
	ProjectID      *uuid.UUID
	ProjectRID     string
	ParentFolderID *uuid.UUID
	ParentRID      string
	Markings       []string
}

func (s *resourceAuditSnapshot) createdEvent() audittrail.AuditEvent {
	return audittrail.NewCompassResourceCreated(
		s.ResourceRID,
		s.ProjectRID,
		s.Markings,
		s.ResourceType,
		s.DisplayName,
	)
}

func (s *resourceAuditSnapshot) movedEvent(before *resourceAuditSnapshot) audittrail.AuditEvent {
	return audittrail.NewCompassResourceMoved(
		s.ResourceRID,
		s.ProjectRID,
		s.Markings,
		s.ResourceType,
		s.DisplayName,
		before.ProjectRID,
		s.ProjectRID,
		before.ParentRID,
		s.ParentRID,
	)
}

func (s *resourceAuditSnapshot) renamedEvent(before *resourceAuditSnapshot) audittrail.AuditEvent {
	return audittrail.NewCompassResourceRenamed(
		s.ResourceRID,
		s.ProjectRID,
		s.Markings,
		s.ResourceType,
		before.DisplayName,
		s.DisplayName,
	)
}

func (s *resourceAuditSnapshot) markingsChangedEvent(previous, next []string) audittrail.AuditEvent {
	return audittrail.NewCompassResourceMarkingsChanged(
		s.ResourceRID,
		s.ProjectRID,
		next,
		previous,
		s.ResourceType,
		s.DisplayName,
	)
}

func (r *Repo) EmitResourceCreatedTx(ctx context.Context, tx pgx.Tx, kind ResourceKind, resourceID uuid.UUID, auditCtx audittrail.AuditContext) error {
	snapshot, err := r.loadResourceAuditSnapshotTx(ctx, tx, kind, resourceID, true)
	if err != nil || snapshot == nil {
		return err
	}
	return audittrail.EmitToOutbox(ctx, tx, snapshot.createdEvent(), auditCtx)
}

func (r *Repo) EmitResourceMarkingsChangedTx(ctx context.Context, tx pgx.Tx, kind ResourceKind, resourceID uuid.UUID, previous, next []string, auditCtx audittrail.AuditContext) error {
	previous = normalizeStringSlice(previous)
	next = normalizeStringSlice(next)
	if sameAuditStringSet(previous, next) {
		return nil
	}
	snapshot, err := r.loadResourceAuditSnapshotTx(ctx, tx, kind, resourceID, true)
	if err != nil || snapshot == nil {
		return err
	}
	return audittrail.EmitToOutbox(ctx, tx, snapshot.markingsChangedEvent(previous, next), auditCtx)
}

func (r *Repo) EmitResourceTrashedTx(ctx context.Context, tx pgx.Tx, kind ResourceKind, resourceID uuid.UUID, deletedBy string, fallbackRetentionDays int, auditCtx audittrail.AuditContext) error {
	snapshot, err := r.loadResourceAuditSnapshotTx(ctx, tx, kind, resourceID, true)
	if err != nil || snapshot == nil {
		return err
	}
	deletedAt, deletedByFromDB, retentionDays, purgeAfter, err := r.loadResourceTrashTimingTx(ctx, tx, kind, resourceID, fallbackRetentionDays)
	if err != nil {
		return err
	}
	if strings.TrimSpace(deletedByFromDB) != "" {
		deletedBy = deletedByFromDB
	}
	event := audittrail.NewCompassResourceTrashed(
		snapshot.ResourceRID,
		snapshot.ProjectRID,
		snapshot.Markings,
		snapshot.ResourceType,
		snapshot.DisplayName,
		formatAuditTime(deletedAt),
		deletedBy,
		retentionDays,
		formatAuditTimePtr(purgeAfter),
	)
	return audittrail.EmitToOutbox(ctx, tx, event, auditCtx)
}

func (r *Repo) EmitResourceRestoredTx(ctx context.Context, tx pgx.Tx, kind ResourceKind, resourceID uuid.UUID, restoredBy string, restoredToOriginalPath bool, restoreTargetStatus string, auditCtx audittrail.AuditContext) error {
	snapshot, err := r.loadResourceAuditSnapshotTx(ctx, tx, kind, resourceID, true)
	if err != nil || snapshot == nil {
		return err
	}
	event := audittrail.NewCompassResourceRestored(
		snapshot.ResourceRID,
		snapshot.ProjectRID,
		snapshot.Markings,
		snapshot.ResourceType,
		snapshot.DisplayName,
		restoredBy,
		restoreTargetStatus,
		restoredToOriginalPath,
	)
	return audittrail.EmitToOutbox(ctx, tx, event, auditCtx)
}

func (r *Repo) EmitResourceShareChangedTx(ctx context.Context, tx pgx.Tx, share ResourceShare, changeType string, auditCtx audittrail.AuditContext) error {
	snapshot, err := r.loadResourceAuditSnapshotTx(ctx, tx, share.ResourceKind, share.ResourceID, true)
	if err != nil || snapshot == nil {
		return err
	}
	principalKind := "user"
	principalID := uuidPtrString(share.SharedWithUserID)
	if share.SharedWithGroupID != nil {
		principalKind = "group"
		principalID = share.SharedWithGroupID.String()
	}
	event := audittrail.NewCompassResourceShareChanged(
		snapshot.ResourceRID,
		snapshot.ProjectRID,
		snapshot.Markings,
		snapshot.ResourceType,
		snapshot.DisplayName,
		share.ID.String(),
		changeType,
		principalKind,
		principalID,
		string(share.AccessLevel),
	)
	return audittrail.EmitToOutbox(ctx, tx, event, auditCtx)
}

func (r *Repo) EmitResourceBulkOperation(ctx context.Context, batchID uuid.UUID, actions []audittrail.BulkResourceAction, preflightFailed bool, auditCtx audittrail.AuditContext) error {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	event := audittrail.NewCompassResourceBulkOperation(batchID.String(), actions, preflightFailed)
	if err := audittrail.EmitToOutbox(ctx, tx, event, auditCtx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *Repo) loadResourceAuditSnapshotTx(ctx context.Context, tx pgx.Tx, kind ResourceKind, resourceID uuid.UUID, includeDeleted bool) (*resourceAuditSnapshot, error) {
	switch kind {
	case ResourceOntologyProject:
		return loadProjectResourceAuditSnapshotTx(ctx, tx, resourceID, includeDeleted)
	case ResourceOntologyFolder:
		return loadFolderResourceAuditSnapshotTx(ctx, tx, resourceID, includeDeleted)
	case ResourceOntologyResourceBinding:
		return loadBindingResourceAuditSnapshotTx(ctx, tx, resourceID, includeDeleted)
	default:
		return loadExternalResourceAuditSnapshotTx(ctx, tx, kind, resourceID, includeDeleted)
	}
}

func loadProjectResourceAuditSnapshotTx(ctx context.Context, tx pgx.Tx, projectID uuid.UUID, includeDeleted bool) (*resourceAuditSnapshot, error) {
	var (
		snapshot    = &resourceAuditSnapshot{Kind: ResourceOntologyProject, ResourceID: projectID, ResourceType: ResourceSearchTypeProject}
		markingsRaw []byte
	)
	err := tx.QueryRow(ctx,
		`SELECT COALESCE(rid, 'ri.compass.main.project.' || id::text),
		        display_name,
		        COALESCE(marking_rids, '[]'::jsonb)
		   FROM ontology_projects
		  WHERE id = $1 AND ($2 OR is_deleted = FALSE)`,
		projectID, includeDeleted,
	).Scan(&snapshot.ResourceRID, &snapshot.DisplayName, &markingsRaw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	snapshot.ProjectID = &projectID
	snapshot.ProjectRID = snapshot.ResourceRID
	snapshot.Markings = decodeStringArrayJSON(markingsRaw)
	return snapshot, nil
}

func loadFolderResourceAuditSnapshotTx(ctx context.Context, tx pgx.Tx, folderID uuid.UUID, includeDeleted bool) (*resourceAuditSnapshot, error) {
	var (
		snapshot   = &resourceAuditSnapshot{Kind: ResourceOntologyFolder, ResourceID: folderID, ResourceType: ResourceSearchTypeFolder}
		projectID  uuid.UUID
		parentRID  *string
		markRaw    []byte
		viewReqRaw []byte
	)
	err := tx.QueryRow(ctx,
		`SELECT COALESCE(f.rid, 'ri.compass.main.folder.' || f.id::text),
		        f.name,
		        f.project_id,
		        COALESCE(p.rid, 'ri.compass.main.project.' || p.id::text),
		        f.parent_folder_id,
		        COALESCE(parent.rid, CASE WHEN parent.id IS NULL THEN NULL ELSE 'ri.compass.main.folder.' || parent.id::text END),
		        COALESCE(p.marking_rids, '[]'::jsonb),
		        COALESCE(f.view_requirement_marking_rids, '[]'::jsonb)
		   FROM ontology_project_folders f
		   JOIN ontology_projects p ON p.id = f.project_id
		   LEFT JOIN ontology_project_folders parent ON parent.id = f.parent_folder_id
		  WHERE f.id = $1 AND ($2 OR f.is_deleted = FALSE)`,
		folderID, includeDeleted,
	).Scan(
		&snapshot.ResourceRID,
		&snapshot.DisplayName,
		&projectID,
		&snapshot.ProjectRID,
		&snapshot.ParentFolderID,
		&parentRID,
		&markRaw,
		&viewReqRaw,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	snapshot.ProjectID = &projectID
	if parentRID != nil && strings.TrimSpace(*parentRID) != "" {
		snapshot.ParentRID = strings.TrimSpace(*parentRID)
	} else {
		snapshot.ParentRID = snapshot.ProjectRID
	}
	snapshot.Markings = normalizeStringSlice(append(
		decodeStringArrayJSON(markRaw),
		decodeStringArrayJSON(viewReqRaw)...,
	))
	return snapshot, nil
}

func loadBindingResourceAuditSnapshotTx(ctx context.Context, tx pgx.Tx, resourceID uuid.UUID, includeDeleted bool) (*resourceAuditSnapshot, error) {
	var (
		snapshot     = &resourceAuditSnapshot{Kind: ResourceOntologyResourceBinding, ResourceID: resourceID, ResourceRID: resourceRIDForKind(ResourceOntologyResourceBinding, resourceID), ResourceType: "resource_binding"}
		projectID    uuid.UUID
		resourceKind string
		markRaw      []byte
		viewReqRaw   []byte
	)
	err := tx.QueryRow(ctx,
		`SELECT r.resource_kind,
		        r.project_id,
		        COALESCE(p.rid, 'ri.compass.main.project.' || p.id::text),
		        COALESCE(p.marking_rids, '[]'::jsonb),
		        COALESCE(r.view_requirement_marking_rids, '[]'::jsonb)
		   FROM ontology_project_resources r
		   JOIN ontology_projects p ON p.id = r.project_id
		  WHERE r.resource_id = $1 AND ($2 OR r.is_deleted = FALSE)`,
		resourceID, includeDeleted,
	).Scan(&resourceKind, &projectID, &snapshot.ProjectRID, &markRaw, &viewReqRaw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	snapshot.ProjectID = &projectID
	snapshot.DisplayName = resourceKind + ":" + shortAuditID(resourceID)
	snapshot.ParentRID = snapshot.ProjectRID
	snapshot.Markings = normalizeStringSlice(append(
		decodeStringArrayJSON(markRaw),
		decodeStringArrayJSON(viewReqRaw)...,
	))
	return snapshot, nil
}

func loadExternalResourceAuditSnapshotTx(ctx context.Context, tx pgx.Tx, kind ResourceKind, resourceID uuid.UUID, includeDeleted bool) (*resourceAuditSnapshot, error) {
	snapshot := &resourceAuditSnapshot{
		Kind:         kind,
		ResourceID:   resourceID,
		ResourceRID:  resourceRIDForKind(kind, resourceID),
		ResourceType: string(kind),
		DisplayName:  string(kind) + ":" + shortAuditID(resourceID),
		Markings:     []string{},
	}
	var (
		projectID  uuid.UUID
		markRaw    []byte
		viewReqRaw []byte
	)
	err := tx.QueryRow(ctx,
		`SELECT r.project_id,
		        COALESCE(p.rid, 'ri.compass.main.project.' || p.id::text),
		        COALESCE(p.marking_rids, '[]'::jsonb),
		        COALESCE(r.view_requirement_marking_rids, '[]'::jsonb)
		   FROM ontology_project_resources r
		   JOIN ontology_projects p ON p.id = r.project_id
		  WHERE r.resource_kind = $1 AND r.resource_id = $2 AND ($3 OR r.is_deleted = FALSE)
		  ORDER BY r.created_at DESC
		  LIMIT 1`,
		string(kind), resourceID, includeDeleted,
	).Scan(&projectID, &snapshot.ProjectRID, &markRaw, &viewReqRaw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return snapshot, nil
		}
		return nil, err
	}
	snapshot.ProjectID = &projectID
	snapshot.ParentRID = snapshot.ProjectRID
	snapshot.Markings = normalizeStringSlice(append(
		decodeStringArrayJSON(markRaw),
		decodeStringArrayJSON(viewReqRaw)...,
	))
	return snapshot, nil
}

func (r *Repo) loadResourceTrashTimingTx(ctx context.Context, tx pgx.Tx, kind ResourceKind, resourceID uuid.UUID, fallbackRetentionDays int) (deletedAt time.Time, deletedBy string, retentionDays int, purgeAfter *time.Time, err error) {
	retentionDays = fallbackRetentionDays
	var deletedByID *uuid.UUID
	switch kind {
	case ResourceOntologyProject:
		err = tx.QueryRow(ctx,
			`SELECT deleted_at, deleted_by, COALESCE(trash_retention_days, $2),
			        COALESCE(purge_after, deleted_at + (COALESCE(trash_retention_days, $2)::int * INTERVAL '1 day'))
			   FROM ontology_projects
			  WHERE id = $1 AND is_deleted = TRUE`,
			resourceID, fallbackRetentionDays,
		).Scan(&deletedAt, &deletedByID, &retentionDays, &purgeAfter)
	case ResourceOntologyFolder:
		err = tx.QueryRow(ctx,
			`SELECT deleted_at, deleted_by, COALESCE(trash_retention_days, $2),
			        COALESCE(purge_after, deleted_at + (COALESCE(trash_retention_days, $2)::int * INTERVAL '1 day'))
			   FROM ontology_project_folders
			  WHERE id = $1 AND is_deleted = TRUE`,
			resourceID, fallbackRetentionDays,
		).Scan(&deletedAt, &deletedByID, &retentionDays, &purgeAfter)
	case ResourceOntologyResourceBinding:
		err = tx.QueryRow(ctx,
			`SELECT deleted_at, deleted_by, COALESCE(trash_retention_days, $2),
			        COALESCE(purge_after, deleted_at + (COALESCE(trash_retention_days, $2)::int * INTERVAL '1 day'))
			   FROM ontology_project_resources
			  WHERE resource_id = $1 AND is_deleted = TRUE`,
			resourceID, fallbackRetentionDays,
		).Scan(&deletedAt, &deletedByID, &retentionDays, &purgeAfter)
	default:
		return deletedAt, deletedBy, retentionDays, purgeAfter, nil
	}
	if err != nil {
		return deletedAt, deletedBy, retentionDays, purgeAfter, err
	}
	deletedBy = uuidPtrString(deletedByID)
	return deletedAt, deletedBy, retentionDays, purgeAfter, nil
}

func shortAuditID(id uuid.UUID) string {
	value := id.String()
	if len(value) <= 8 {
		return value
	}
	return value[:8]
}

func sameAuditStringSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	seen := make(map[string]struct{}, len(a))
	for _, value := range a {
		seen[value] = struct{}{}
	}
	for _, value := range b {
		if _, ok := seen[value]; !ok {
			return false
		}
	}
	return true
}
