// marking_permissions.go: SG.13 permission evaluation and direct
// resource marking mutations.

package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/openfoundry/openfoundry-go/services/authorization-policy-service/internal/models"
)

var ErrMarkingPermissionDenied = errors.New("marking permission denied")

func (r *Repo) CheckMarkingPermission(ctx context.Context, tenantID *uuid.UUID, markingID, principalID uuid.UUID, groupIDs []uuid.UUID, resourceUpdateAllowed, expandAccessAllowed bool) (*models.MarkingPermissionCheckResponse, error) {
	if _, err := r.getMarkingInTenant(ctx, tenantID, markingID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	set, err := r.markingPermissionSet(ctx, markingID, principalID, groupIDs)
	if err != nil {
		return nil, err
	}
	resp := &models.MarkingPermissionCheckResponse{
		MarkingID:                     markingID,
		PrincipalID:                   principalID,
		CanManage:                     set[models.MarkingPermissionAdministrator],
		CanApply:                      set[models.MarkingPermissionApplier],
		CanRemove:                     set[models.MarkingPermissionRemover],
		IsMember:                      set[models.MarkingPermissionMember],
		ResourceUpdateMarkingsAllowed: resourceUpdateAllowed,
		ExpandAccessAllowed:           expandAccessAllowed,
	}
	resp.CanAccessMarkedData = resp.IsMember
	resp.CanApplyToResource = resp.ResourceUpdateMarkingsAllowed && resp.CanApply
	resp.CanRemoveFromResource = resp.ResourceUpdateMarkingsAllowed && resp.CanRemove && (resp.CanApply || resp.ExpandAccessAllowed)
	resp.Reasons = markingPermissionReasons(resp)
	return resp, nil
}

func (r *Repo) ListResourceMarkings(ctx context.Context, tenantID *uuid.UUID, resourceKind, resourceID string) ([]models.ResourceMarking, error) {
	pred, args := tenantPredicate("rm", tenantID, 1)
	args = append(args, resourceKind, resourceID)
	query := `SELECT rm.id, rm.tenant_id, rm.resource_kind, rm.resource_id,
	                 rm.marking_id, rm.source_kind, rm.metadata, rm.applied_by, rm.applied_at
	          FROM resource_markings rm
	          WHERE ` + pred + fmt.Sprintf(" AND rm.resource_kind = $%d AND rm.resource_id = $%d", len(args)-1, len(args)) +
		" ORDER BY rm.applied_at DESC"
	rows, err := r.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.ResourceMarking, 0)
	for rows.Next() {
		item, err := scanResourceMarking(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}

func (r *Repo) ApplyResourceMarking(ctx context.Context, tenantID *uuid.UUID, actorID uuid.UUID, groupIDs []uuid.UUID, body *models.ApplyResourceMarkingRequest) (*models.ResourceMarkingMutationResponse, error) {
	check, err := r.CheckMarkingPermission(ctx, tenantID, body.MarkingID, actorID, groupIDs, body.ResourceUpdateMarkingsAllowed, false)
	if err != nil {
		return nil, err
	}
	if check == nil {
		return nil, nil
	}

	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if !check.CanApplyToResource {
		if err := insertResourceMarkingAuditTx(ctx, tx, tenantID, body.ResourceKind, body.ResourceID, body.MarkingID, actorID, models.ResourceMarkingAuditApplyDenied, emptyJSONObject(), emptyJSONObject(), mustJSONObject(map[string]any{"permission_check": check})); err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return &models.ResourceMarkingMutationResponse{Allowed: false, PermissionCheck: *check}, ErrMarkingPermissionDenied
	}

	item, err := getResourceMarkingForUpdateTx(ctx, tx, tenantID, body.ResourceKind, body.ResourceID, body.MarkingID)
	if errors.Is(err, pgx.ErrNoRows) {
		row := tx.QueryRow(ctx,
			`INSERT INTO resource_markings
			    (id, tenant_id, resource_kind, resource_id, marking_id, source_kind, metadata, applied_by, applied_at)
			 VALUES ($1,$2,$3,$4,$5,'direct',$6,$7,NOW())
			 RETURNING id, tenant_id, resource_kind, resource_id, marking_id, source_kind, metadata, applied_by, applied_at`,
			uuid.New(), tenantID, body.ResourceKind, body.ResourceID, body.MarkingID,
			normalizeJSONObject(body.Metadata), actorID,
		)
		item, err = scanResourceMarking(row)
	} else if err == nil {
		row := tx.QueryRow(ctx,
			`UPDATE resource_markings
			    SET metadata = $2, applied_by = $3, applied_at = NOW()
			  WHERE id = $1
			  RETURNING id, tenant_id, resource_kind, resource_id, marking_id, source_kind, metadata, applied_by, applied_at`,
			item.ID, normalizeJSONObject(body.Metadata), actorID,
		)
		item, err = scanResourceMarking(row)
	}
	if err != nil {
		return nil, err
	}
	if err := insertResourceMarkingAuditTx(ctx, tx, tenantID, body.ResourceKind, body.ResourceID, body.MarkingID, actorID, models.ResourceMarkingAuditApplied, emptyJSONObject(), mustJSONObject(map[string]any{"resource_marking": item}), mustJSONObject(map[string]any{"permission_check": check})); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &models.ResourceMarkingMutationResponse{Allowed: true, ResourceMarking: item, PermissionCheck: *check}, nil
}

func (r *Repo) RemoveResourceMarking(ctx context.Context, tenantID *uuid.UUID, actorID uuid.UUID, groupIDs []uuid.UUID, body *models.RemoveResourceMarkingRequest) (*models.ResourceMarkingMutationResponse, error) {
	check, err := r.CheckMarkingPermission(ctx, tenantID, body.MarkingID, actorID, groupIDs, body.ResourceUpdateMarkingsAllowed, body.ExpandAccessAllowed)
	if err != nil {
		return nil, err
	}
	if check == nil {
		return nil, nil
	}

	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	current, err := getResourceMarkingForUpdateTx(ctx, tx, tenantID, body.ResourceKind, body.ResourceID, body.MarkingID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	before := mustJSONObject(map[string]any{"resource_marking": current})
	if !check.CanRemoveFromResource {
		if err := insertResourceMarkingAuditTx(ctx, tx, tenantID, body.ResourceKind, body.ResourceID, body.MarkingID, actorID, models.ResourceMarkingAuditRemoveDenied, before, before, mustJSONObject(map[string]any{"permission_check": check, "reason": body.Reason})); err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return &models.ResourceMarkingMutationResponse{Allowed: false, ResourceMarking: current, PermissionCheck: *check}, ErrMarkingPermissionDenied
	}
	pred, args := tenantPredicate("resource_markings", tenantID, 1)
	args = append(args, body.ResourceKind, body.ResourceID, body.MarkingID)
	_, err = tx.Exec(ctx,
		`DELETE FROM resource_markings WHERE `+pred+fmt.Sprintf(" AND resource_kind = $%d AND resource_id = $%d AND marking_id = $%d", len(args)-2, len(args)-1, len(args)),
		args...,
	)
	if err != nil {
		return nil, err
	}
	if err := insertResourceMarkingAuditTx(ctx, tx, tenantID, body.ResourceKind, body.ResourceID, body.MarkingID, actorID, models.ResourceMarkingAuditRemoved, before, emptyJSONObject(), mustJSONObject(map[string]any{"permission_check": check, "reason": body.Reason})); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &models.ResourceMarkingMutationResponse{Allowed: true, PermissionCheck: *check}, nil
}

func (r *Repo) markingPermissionSet(ctx context.Context, markingID, principalID uuid.UUID, groupIDs []uuid.UUID) (map[string]bool, error) {
	args := []any{markingID, principalID}
	query := `SELECT permission
		FROM marking_permissions
		WHERE marking_id = $1
		  AND (
			(principal_kind = 'user' AND principal_id = $2)
			OR (
				principal_kind = 'group'
				AND principal_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = $2)
			)`
	for _, groupID := range dedupeUUIDs(groupIDs) {
		args = append(args, groupID)
		query += fmt.Sprintf(" OR (principal_kind = 'group' AND principal_id = $%d)", len(args))
	}
	query += ")"

	rows, err := r.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var permission string
		if err := rows.Scan(&permission); err != nil {
			return nil, err
		}
		out[permission] = true
	}
	return out, rows.Err()
}

func markingPermissionReasons(resp *models.MarkingPermissionCheckResponse) []string {
	reasons := []string{}
	if resp.CanManage && !resp.IsMember {
		reasons = append(reasons, "manage permission does not imply marking membership")
	}
	if resp.CanApply && !resp.IsMember {
		reasons = append(reasons, "apply permission does not imply marking membership")
	}
	if !resp.IsMember {
		reasons = append(reasons, "principal is not a member of the marking and cannot access marked data")
	}
	if !resp.ResourceUpdateMarkingsAllowed {
		reasons = append(reasons, "resource role did not allow updating markings")
	}
	if !resp.CanApply {
		reasons = append(reasons, "principal lacks apply marking permission")
	}
	if !resp.CanRemove {
		reasons = append(reasons, "principal lacks remove marking permission")
	}
	if resp.CanRemove && !resp.CanApply && !resp.ExpandAccessAllowed {
		reasons = append(reasons, "removing a marking requires apply marking or equivalent expand-access permission")
	}
	if len(reasons) == 0 {
		reasons = append(reasons, "principal satisfies the requested marking permission checks")
	}
	return reasons
}

func dedupeUUIDs(in []uuid.UUID) []uuid.UUID {
	seen := map[uuid.UUID]bool{}
	out := make([]uuid.UUID, 0, len(in))
	for _, id := range in {
		if id == uuid.Nil || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

func scanResourceMarking(row rowLikeT) (*models.ResourceMarking, error) {
	item := &models.ResourceMarking{}
	if err := row.Scan(&item.ID, &item.TenantID, &item.ResourceKind, &item.ResourceID,
		&item.MarkingID, &item.SourceKind, &item.Metadata, &item.AppliedBy,
		&item.AppliedAt); err != nil {
		return nil, err
	}
	item.Metadata = normalizeJSONObject(item.Metadata)
	return item, nil
}

func getResourceMarkingForUpdateTx(ctx context.Context, tx pgx.Tx, tenantID *uuid.UUID, resourceKind, resourceID string, markingID uuid.UUID) (*models.ResourceMarking, error) {
	pred, args := tenantPredicate("rm", tenantID, 1)
	args = append(args, resourceKind, resourceID, markingID)
	row := tx.QueryRow(ctx,
		`SELECT rm.id, rm.tenant_id, rm.resource_kind, rm.resource_id,
		        rm.marking_id, rm.source_kind, rm.metadata, rm.applied_by, rm.applied_at
		 FROM resource_markings rm
		 WHERE `+pred+fmt.Sprintf(" AND rm.resource_kind = $%d AND rm.resource_id = $%d AND rm.marking_id = $%d FOR UPDATE", len(args)-2, len(args)-1, len(args)),
		args...,
	)
	return scanResourceMarking(row)
}

func insertResourceMarkingAuditTx(ctx context.Context, tx pgx.Tx, tenantID *uuid.UUID, resourceKind, resourceID string, markingID, actorID uuid.UUID, action string, beforeState, afterState, metadata any) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO resource_marking_audit_events
		    (id, tenant_id, resource_kind, resource_id, marking_id, actor_id,
		     action, before_state, after_state, metadata)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		uuid.New(), tenantID, resourceKind, resourceID, markingID, actorID,
		action, normalizeJSONObject(asRawJSON(beforeState)),
		normalizeJSONObject(asRawJSON(afterState)),
		normalizeJSONObject(asRawJSON(metadata)),
	)
	return err
}

func asRawJSON(value any) json.RawMessage {
	switch typed := value.(type) {
	case nil:
		return json.RawMessage(`{}`)
	case json.RawMessage:
		return typed
	case []byte:
		return json.RawMessage(typed)
	default:
		return mustJSONObject(typed)
	}
}

func normalizeResourceMarkingInput(resourceKind, resourceID string) (string, string) {
	return strings.ToLower(strings.TrimSpace(resourceKind)), strings.TrimSpace(resourceID)
}
