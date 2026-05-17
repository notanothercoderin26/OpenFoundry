// markings.go: SG.12 — markings inside immutable categories, with
// distinct administrator/remover/applier/member permissions.

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

var (
	ErrMarkingDeletionUnsupported     = errors.New("marking deletion is unsupported")
	ErrMarkingCategoryMoveUnsupported = errors.New("markings cannot be moved to another category")
)

func (r *Repo) ListMarkingsForCategory(ctx context.Context, tenantID *uuid.UUID, callerID, categoryID uuid.UUID, includeHidden, canSeeAllHidden, canSeeAllMetadata bool) ([]models.MarkingResponse, error) {
	visible, err := r.markingCategoryVisibleToCaller(ctx, tenantID, callerID, categoryID, includeHidden, canSeeAllHidden)
	if err != nil {
		return nil, err
	}
	if !visible {
		return nil, nil
	}
	pred, args := tenantPredicate("m", tenantID, 1)
	args = append(args, categoryID)
	query := markingSelect + ` INNER JOIN marking_categories mc ON mc.id = m.category_id
		WHERE ` + pred + fmt.Sprintf(" AND m.category_id = $%d", len(args))
	if !includeHidden {
		query += " AND mc.visibility = 'visible'"
	} else if !canSeeAllHidden {
		args = append(args, callerID)
		query += " AND " + categoryVisibleToCallerSQL(len(args))
	}
	query += " ORDER BY m.display_name, m.slug"
	return r.listMarkingsFromQuery(ctx, query, args, callerID, canSeeAllMetadata)
}

func (r *Repo) GetMarking(ctx context.Context, tenantID *uuid.UUID, callerID, id uuid.UUID, includeHidden, canSeeAllHidden, canSeeAllMetadata bool) (*models.MarkingResponse, error) {
	pred, args := tenantPredicate("m", tenantID, 1)
	args = append(args, id)
	query := markingSelect + ` INNER JOIN marking_categories mc ON mc.id = m.category_id
		WHERE ` + pred + fmt.Sprintf(" AND m.id = $%d", len(args))
	if !includeHidden {
		query += " AND mc.visibility = 'visible'"
	} else if !canSeeAllHidden {
		args = append(args, callerID)
		query += " AND " + categoryVisibleToCallerSQL(len(args))
	}
	rows, err := r.listMarkingsFromQuery(ctx, query, args, callerID, canSeeAllMetadata)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

func (r *Repo) markingCategoryVisibleToCaller(ctx context.Context, tenantID *uuid.UUID, callerID, categoryID uuid.UUID, includeHidden, canSeeAllHidden bool) (bool, error) {
	pred, args := tenantPredicate("mc", tenantID, 1)
	args = append(args, categoryID)
	query := `SELECT EXISTS (
		SELECT 1
		FROM marking_categories mc
		WHERE ` + pred + fmt.Sprintf(" AND mc.id = $%d", len(args))
	if !includeHidden {
		query += " AND mc.visibility = 'visible'"
	} else if !canSeeAllHidden {
		args = append(args, callerID)
		query += " AND " + categoryVisibleToCallerSQL(len(args))
	}
	query += ")"
	var visible bool
	if err := r.Pool.QueryRow(ctx, query, args...).Scan(&visible); err != nil {
		return false, err
	}
	return visible, nil
}

func (r *Repo) CreateMarking(ctx context.Context, tenantID *uuid.UUID, actorID, categoryID uuid.UUID, body *models.CreateMarkingRequest) (*models.MarkingResponse, error) {
	body.Slug = strings.TrimSpace(body.Slug)
	body.DisplayName = strings.TrimSpace(body.DisplayName)
	body.Metadata = normalizeJSONObject(body.Metadata)

	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := getMarkingCategoryForUpdateTx(ctx, tx, tenantID, categoryID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	id := uuid.New()
	if body.ID != nil {
		id = *body.ID
	}
	row := tx.QueryRow(ctx,
		`INSERT INTO markings
		    (id, tenant_id, category_id, slug, display_name, description, metadata, created_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 RETURNING id, tenant_id, category_id, slug, display_name, description,
		           metadata, created_by, created_at, updated_at`,
		id, tenantID, categoryID, body.Slug, body.DisplayName, body.Description,
		body.Metadata, actorID,
	)
	marking, err := scanMarking(row)
	if err != nil {
		return nil, err
	}
	grants := initialMarkingPermissions(actorID, body)
	for _, grant := range grants {
		if _, err := upsertMarkingPermissionTx(ctx, tx, marking.ID, actorID, grant.PrincipalKind, grant.PrincipalID, grant.Permission); err != nil {
			return nil, err
		}
	}
	perms, err := listMarkingPermissionsTx(ctx, tx, marking.ID)
	if err != nil {
		return nil, err
	}
	after := markingAuditState(*marking, perms)
	if err := insertMarkingAuditTx(ctx, tx, tenantID, categoryID, marking.ID, actorID, models.MarkingAuditCreated, nil, nil, nil, emptyJSONObject(), after, emptyJSONObject()); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &models.MarkingResponse{Marking: *marking, Permissions: perms}, nil
}

func (r *Repo) UpdateMarking(ctx context.Context, tenantID *uuid.UUID, actorID, id uuid.UUID, body *models.UpdateMarkingRequest) (*models.MarkingResponse, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	current, err := getMarkingForUpdateTx(ctx, tx, tenantID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	currentPerms, err := listMarkingPermissionsTx(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	before := markingAuditState(*current, currentPerms)

	displayName := current.DisplayName
	if body.DisplayName != nil {
		displayName = strings.TrimSpace(*body.DisplayName)
	}
	description := current.Description
	if body.Description != nil {
		description = *body.Description
	}
	metadata := current.Metadata
	if len(body.Metadata) > 0 {
		metadata = normalizeJSONObject(body.Metadata)
	}

	row := tx.QueryRow(ctx,
		`UPDATE markings
		    SET display_name = $2,
		        description = $3,
		        metadata = $4,
		        updated_at = NOW()
		  WHERE id = $1
		  RETURNING id, tenant_id, category_id, slug, display_name, description,
		            metadata, created_by, created_at, updated_at`,
		id, displayName, description, metadata,
	)
	updated, err := scanMarking(row)
	if err != nil {
		return nil, err
	}
	afterPerms, err := listMarkingPermissionsTx(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	after := markingAuditState(*updated, afterPerms)
	if err := insertMarkingAuditTx(ctx, tx, tenantID, updated.CategoryID, id, actorID, models.MarkingAuditUpdated, nil, nil, nil, before, after, emptyJSONObject()); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &models.MarkingResponse{Marking: *updated, Permissions: afterPerms}, nil
}

func (r *Repo) UpsertMarkingPermission(ctx context.Context, tenantID *uuid.UUID, actorID, markingID uuid.UUID, body *models.UpsertMarkingPermissionRequest) (*models.MarkingPermission, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	marking, err := getMarkingForUpdateTx(ctx, tx, tenantID, markingID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	perm, err := upsertMarkingPermissionTx(ctx, tx, markingID, actorID, body.PrincipalKind, body.PrincipalID, body.Permission)
	if err != nil {
		return nil, err
	}
	after := mustJSONObject(map[string]any{"permission": perm})
	if err := insertMarkingAuditTx(ctx, tx, tenantID, marking.CategoryID, markingID, actorID, models.MarkingAuditPermissionGranted, &body.PrincipalKind, &body.PrincipalID, &body.Permission, emptyJSONObject(), after, emptyJSONObject()); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return perm, nil
}

func (r *Repo) DeleteMarkingPermission(ctx context.Context, tenantID *uuid.UUID, actorID, markingID uuid.UUID, principalKind string, principalID uuid.UUID, permission string) (bool, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	marking, err := getMarkingForUpdateTx(ctx, tx, tenantID, markingID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	cmd, err := tx.Exec(ctx,
		`DELETE FROM marking_permissions
		 WHERE marking_id = $1 AND principal_kind = $2 AND principal_id = $3 AND permission = $4`,
		markingID, principalKind, principalID, permission,
	)
	if err != nil {
		return false, err
	}
	if cmd.RowsAffected() == 0 {
		return false, nil
	}
	before := mustJSONObject(map[string]any{
		"marking_id":     markingID,
		"principal_kind": principalKind,
		"principal_id":   principalID,
		"permission":     permission,
	})
	if err := insertMarkingAuditTx(ctx, tx, tenantID, marking.CategoryID, markingID, actorID, models.MarkingAuditPermissionRevoked, &principalKind, &principalID, &permission, before, emptyJSONObject(), emptyJSONObject()); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (r *Repo) BlockDeleteMarking(ctx context.Context, tenantID *uuid.UUID, actorID, markingID uuid.UUID) (bool, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	marking, err := getMarkingForUpdateTx(ctx, tx, tenantID, markingID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	perms, err := listMarkingPermissionsTx(ctx, tx, markingID)
	if err != nil {
		return false, err
	}
	before := markingAuditState(*marking, perms)
	meta := mustJSONObject(map[string]any{"reason": ErrMarkingDeletionUnsupported.Error()})
	if err := insertMarkingAuditTx(ctx, tx, tenantID, marking.CategoryID, markingID, actorID, models.MarkingAuditDeleteBlocked, nil, nil, nil, before, before, meta); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, ErrMarkingDeletionUnsupported
}

func (r *Repo) BlockMoveMarkingCategory(ctx context.Context, tenantID *uuid.UUID, actorID, markingID, targetCategoryID uuid.UUID) (bool, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	marking, err := getMarkingForUpdateTx(ctx, tx, tenantID, markingID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	perms, err := listMarkingPermissionsTx(ctx, tx, markingID)
	if err != nil {
		return false, err
	}
	before := markingAuditState(*marking, perms)
	meta := mustJSONObject(map[string]any{
		"reason":             ErrMarkingCategoryMoveUnsupported.Error(),
		"target_category_id": targetCategoryID,
	})
	if err := insertMarkingAuditTx(ctx, tx, tenantID, marking.CategoryID, markingID, actorID, models.MarkingAuditCategoryMoveBlocked, nil, nil, nil, before, before, meta); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, ErrMarkingCategoryMoveUnsupported
}

func (r *Repo) ListMarkingAuditEvents(ctx context.Context, tenantID *uuid.UUID, markingID uuid.UUID) ([]models.MarkingAuditEvent, error) {
	if _, err := r.getMarkingInTenant(ctx, tenantID, markingID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT id, tenant_id, category_id, marking_id, actor_id, action,
		        principal_kind, principal_id, permission, before_state,
		        after_state, metadata, created_at
		 FROM marking_audit_events
		 WHERE marking_id = $1
		 ORDER BY created_at DESC, id DESC
		 LIMIT 500`,
		markingID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.MarkingAuditEvent, 0)
	for rows.Next() {
		e := models.MarkingAuditEvent{}
		if err := rows.Scan(&e.ID, &e.TenantID, &e.CategoryID, &e.MarkingID,
			&e.ActorID, &e.Action, &e.PrincipalKind, &e.PrincipalID,
			&e.Permission, &e.BeforeState, &e.AfterState, &e.Metadata,
			&e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *Repo) listMarkingsFromQuery(ctx context.Context, query string, args []any, callerID uuid.UUID, canSeeAllMetadata bool) ([]models.MarkingResponse, error) {
	rows, err := r.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	markings := make([]models.Marking, 0)
	for rows.Next() {
		marking, err := scanMarking(rows)
		if err != nil {
			return nil, err
		}
		markings = append(markings, *marking)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]models.MarkingResponse, 0, len(markings))
	for _, marking := range markings {
		perms, err := r.ListMarkingPermissions(ctx, marking.ID)
		if err != nil {
			return nil, err
		}
		resp := models.MarkingResponse{Marking: marking, Permissions: perms}
		if !canSeeAllMetadata {
			allowed, err := r.callerCanManageMarkingMetadata(ctx, marking.ID, marking.CategoryID, callerID)
			if err != nil {
				return nil, err
			}
			if !allowed {
				resp.Metadata = emptyJSONObject()
				resp.MetadataRedacted = true
			}
		}
		out = append(out, resp)
	}
	return out, nil
}

func (r *Repo) ListMarkingPermissions(ctx context.Context, markingID uuid.UUID) ([]models.MarkingPermission, error) {
	return listMarkingPermissionsQuery(ctx, r.Pool, markingID)
}

func (r *Repo) getMarkingInTenant(ctx context.Context, tenantID *uuid.UUID, id uuid.UUID) (*models.Marking, error) {
	pred, args := tenantPredicate("m", tenantID, 1)
	args = append(args, id)
	row := r.Pool.QueryRow(ctx, markingSelect+` WHERE `+pred+fmt.Sprintf(" AND m.id = $%d", len(args)), args...)
	return scanMarking(row)
}

func getMarkingForUpdateTx(ctx context.Context, tx pgx.Tx, tenantID *uuid.UUID, id uuid.UUID) (*models.Marking, error) {
	pred, args := tenantPredicate("m", tenantID, 1)
	args = append(args, id)
	row := tx.QueryRow(ctx, markingSelect+` WHERE `+pred+fmt.Sprintf(" AND m.id = $%d FOR UPDATE", len(args)), args...)
	return scanMarking(row)
}

const markingSelect = `SELECT m.id, m.tenant_id, m.category_id, m.slug,
	m.display_name, m.description, m.metadata, m.created_by,
	m.created_at, m.updated_at
	FROM markings m`

func scanMarking(row rowLikeT) (*models.Marking, error) {
	marking := &models.Marking{}
	if err := row.Scan(&marking.ID, &marking.TenantID, &marking.CategoryID,
		&marking.Slug, &marking.DisplayName, &marking.Description,
		&marking.Metadata, &marking.CreatedBy, &marking.CreatedAt,
		&marking.UpdatedAt); err != nil {
		return nil, err
	}
	marking.Metadata = normalizeJSONObject(marking.Metadata)
	return marking, nil
}

func listMarkingPermissionsTx(ctx context.Context, tx pgx.Tx, markingID uuid.UUID) ([]models.MarkingPermission, error) {
	return listMarkingPermissionsQuery(ctx, tx, markingID)
}

func listMarkingPermissionsQuery(ctx context.Context, q markingCategoryQueryer, markingID uuid.UUID) ([]models.MarkingPermission, error) {
	rows, err := q.Query(ctx,
		`SELECT marking_id, principal_kind, principal_id, permission, granted_by, created_at
		 FROM marking_permissions
		 WHERE marking_id = $1
		 ORDER BY permission, principal_kind, principal_id`,
		markingID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.MarkingPermission, 0)
	for rows.Next() {
		perm := models.MarkingPermission{}
		if err := rows.Scan(&perm.MarkingID, &perm.PrincipalKind, &perm.PrincipalID,
			&perm.Permission, &perm.GrantedBy, &perm.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, perm)
	}
	return out, rows.Err()
}

func upsertMarkingPermissionTx(ctx context.Context, tx pgx.Tx, markingID, actorID uuid.UUID, principalKind string, principalID uuid.UUID, permission string) (*models.MarkingPermission, error) {
	row := tx.QueryRow(ctx,
		`INSERT INTO marking_permissions
		    (marking_id, principal_kind, principal_id, permission, granted_by)
		 VALUES ($1,$2,$3,$4,$5)
		 ON CONFLICT (marking_id, principal_kind, principal_id, permission)
		 DO UPDATE SET granted_by = EXCLUDED.granted_by, created_at = NOW()
		 RETURNING marking_id, principal_kind, principal_id, permission, granted_by, created_at`,
		markingID, principalKind, principalID, permission, actorID,
	)
	out := &models.MarkingPermission{}
	if err := row.Scan(&out.MarkingID, &out.PrincipalKind, &out.PrincipalID,
		&out.Permission, &out.GrantedBy, &out.CreatedAt); err != nil {
		return nil, err
	}
	return out, nil
}

func insertMarkingAuditTx(ctx context.Context, tx pgx.Tx, tenantID *uuid.UUID, categoryID, markingID uuid.UUID, actorID uuid.UUID, action string, principalKind *string, principalID *uuid.UUID, permission *string, beforeState, afterState, metadata json.RawMessage) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO marking_audit_events
		    (id, tenant_id, category_id, marking_id, actor_id, action,
		     principal_kind, principal_id, permission, before_state,
		     after_state, metadata)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		uuid.New(), tenantID, categoryID, markingID, actorID, action,
		principalKind, principalID, permission, normalizeJSONObject(beforeState),
		normalizeJSONObject(afterState), normalizeJSONObject(metadata),
	)
	return err
}

func initialMarkingPermissions(actorID uuid.UUID, body *models.CreateMarkingRequest) []models.UpsertMarkingPermissionRequest {
	seen := map[string]bool{}
	out := make([]models.UpsertMarkingPermissionRequest, 0, 1+len(body.Administrators)+len(body.Removers)+len(body.Appliers)+len(body.Members))
	add := func(kind string, id uuid.UUID, perm string) {
		key := kind + ":" + id.String() + ":" + perm
		if seen[key] {
			return
		}
		seen[key] = true
		out = append(out, models.UpsertMarkingPermissionRequest{
			PrincipalKind: kind,
			PrincipalID:   id,
			Permission:    perm,
		})
	}
	add(models.MarkingCategoryPrincipalUser, actorID, models.MarkingPermissionAdministrator)
	for _, principal := range body.Administrators {
		add(principal.PrincipalKind, principal.PrincipalID, models.MarkingPermissionAdministrator)
	}
	for _, principal := range body.Removers {
		add(principal.PrincipalKind, principal.PrincipalID, models.MarkingPermissionRemover)
	}
	for _, principal := range body.Appliers {
		add(principal.PrincipalKind, principal.PrincipalID, models.MarkingPermissionApplier)
	}
	for _, principal := range body.Members {
		add(principal.PrincipalKind, principal.PrincipalID, models.MarkingPermissionMember)
	}
	return out
}

func markingAuditState(marking models.Marking, perms []models.MarkingPermission) json.RawMessage {
	return mustJSONObject(map[string]any{
		"marking":     marking,
		"permissions": perms,
	})
}

func (r *Repo) callerCanManageMarkingMetadata(ctx context.Context, markingID, categoryID, callerID uuid.UUID) (bool, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT EXISTS (
			SELECT 1
			FROM marking_category_permissions mcp
			WHERE mcp.category_id = $1
			  AND mcp.permission = 'administrator'
			  AND (
				(mcp.principal_kind = 'user' AND mcp.principal_id = $3)
				OR (
					mcp.principal_kind = 'group'
					AND mcp.principal_id IN (
						SELECT gm.group_id FROM group_members gm WHERE gm.user_id = $3
					)
				)
			  )
		) OR EXISTS (
			SELECT 1
			FROM marking_permissions mp
			WHERE mp.marking_id = $2
			  AND mp.permission = 'administrator'
			  AND (
				(mp.principal_kind = 'user' AND mp.principal_id = $3)
				OR (
					mp.principal_kind = 'group'
					AND mp.principal_id IN (
						SELECT gm.group_id FROM group_members gm WHERE gm.user_id = $3
					)
				)
			  )
		)`,
		categoryID, markingID, callerID,
	)
	var allowed bool
	if err := row.Scan(&allowed); err != nil {
		return false, err
	}
	return allowed, nil
}

func categoryVisibleToCallerSQL(callerArg int) string {
	return fmt.Sprintf(`(
		mc.visibility = 'visible'
		OR EXISTS (
			SELECT 1
			FROM marking_category_permissions mcp
			WHERE mcp.category_id = mc.id
			  AND (
				(mcp.principal_kind = 'user' AND mcp.principal_id = $%d)
				OR (
					mcp.principal_kind = 'group'
					AND mcp.principal_id IN (
						SELECT gm.group_id FROM group_members gm WHERE gm.user_id = $%d
					)
				)
			  )
		)
		OR EXISTS (
			SELECT 1
			FROM markings m2
			INNER JOIN marking_permissions mp ON mp.marking_id = m2.id
			WHERE m2.category_id = mc.id
			  AND (
				(mp.principal_kind = 'user' AND mp.principal_id = $%d)
				OR (
					mp.principal_kind = 'group'
					AND mp.principal_id IN (
						SELECT gm.group_id FROM group_members gm WHERE gm.user_id = $%d
					)
				)
			  )
		)
	)`, callerArg, callerArg, callerArg, callerArg)
}
