// marking_categories.go: SG.11 — category metadata, visibility,
// category permissions, immutable deletion semantics, and local audit
// evidence for every category/permission mutation.

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

var ErrMarkingCategoryDeletionUnsupported = errors.New("marking category deletion is unsupported; hide the category instead")

func (r *Repo) ListMarkingCategories(ctx context.Context, tenantID *uuid.UUID, callerID uuid.UUID, includeHidden, canSeeAllHidden bool) ([]models.MarkingCategoryResponse, error) {
	pred, args := tenantPredicate("mc", tenantID, 1)
	query := markingCategorySelect + ` WHERE ` + pred
	if !includeHidden {
		query += " AND mc.visibility = 'visible'"
	} else if !canSeeAllHidden {
		args = append(args, callerID)
		query += " AND " + categoryVisibleToCallerSQL(len(args))
	}
	query += " ORDER BY mc.visibility, mc.display_name, mc.slug"

	rows, err := r.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cats := make([]models.MarkingCategory, 0)
	for rows.Next() {
		cat, err := scanMarkingCategory(rows)
		if err != nil {
			return nil, err
		}
		cats = append(cats, *cat)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]models.MarkingCategoryResponse, 0, len(cats))
	for _, cat := range cats {
		perms, err := r.ListMarkingCategoryPermissions(ctx, cat.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, models.MarkingCategoryResponse{MarkingCategory: cat, Permissions: perms})
	}
	return out, nil
}

func (r *Repo) GetMarkingCategory(ctx context.Context, tenantID *uuid.UUID, callerID, id uuid.UUID, includeHidden, canSeeAllHidden bool) (*models.MarkingCategoryResponse, error) {
	pred, args := tenantPredicate("mc", tenantID, 1)
	args = append(args, id)
	query := markingCategorySelect + ` WHERE ` + pred + fmt.Sprintf(" AND mc.id = $%d", len(args))
	if !includeHidden {
		query += " AND mc.visibility = 'visible'"
	} else if !canSeeAllHidden {
		args = append(args, callerID)
		query += " AND " + categoryVisibleToCallerSQL(len(args))
	}
	row := r.Pool.QueryRow(ctx, query, args...)
	cat, err := scanMarkingCategory(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	perms, err := r.ListMarkingCategoryPermissions(ctx, cat.ID)
	if err != nil {
		return nil, err
	}
	return &models.MarkingCategoryResponse{MarkingCategory: *cat, Permissions: perms}, nil
}

func (r *Repo) CreateMarkingCategory(ctx context.Context, tenantID *uuid.UUID, actorID uuid.UUID, body *models.CreateMarkingCategoryRequest) (*models.MarkingCategoryResponse, error) {
	body.Slug = strings.TrimSpace(body.Slug)
	body.DisplayName = strings.TrimSpace(body.DisplayName)
	body.Visibility = normalizedMarkingCategoryVisibility(body.Visibility)
	body.Metadata = normalizeJSONObject(body.Metadata)

	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	id := uuid.New()
	row := tx.QueryRow(ctx,
		`INSERT INTO marking_categories
		    (id, tenant_id, slug, display_name, description, visibility, organization_id, metadata, created_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		 RETURNING id, tenant_id, slug, display_name, description, visibility,
		           organization_id, metadata, created_by, created_at, updated_at`,
		id, tenantID, body.Slug, body.DisplayName, body.Description, body.Visibility,
		body.OrganizationID, body.Metadata, actorID,
	)
	cat, err := scanMarkingCategory(row)
	if err != nil {
		return nil, err
	}

	grants := initialMarkingCategoryPermissions(actorID, body)
	for _, grant := range grants {
		if _, err := upsertMarkingCategoryPermissionTx(ctx, tx, cat.ID, actorID, grant.PrincipalKind, grant.PrincipalID, grant.Permission); err != nil {
			return nil, err
		}
	}
	perms, err := listMarkingCategoryPermissionsTx(ctx, tx, cat.ID)
	if err != nil {
		return nil, err
	}
	after := markingCategoryAuditState(*cat, perms)
	if err := insertMarkingCategoryAuditTx(ctx, tx, tenantID, cat.ID, actorID, models.MarkingCategoryAuditCreated, nil, nil, nil, emptyJSONObject(), after, emptyJSONObject()); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &models.MarkingCategoryResponse{MarkingCategory: *cat, Permissions: perms}, nil
}

func (r *Repo) UpdateMarkingCategory(ctx context.Context, tenantID *uuid.UUID, actorID, id uuid.UUID, body *models.UpdateMarkingCategoryRequest) (*models.MarkingCategoryResponse, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	current, err := getMarkingCategoryForUpdateTx(ctx, tx, tenantID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	currentPerms, err := listMarkingCategoryPermissionsTx(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	before := markingCategoryAuditState(*current, currentPerms)

	displayName := current.DisplayName
	if body.DisplayName != nil {
		displayName = strings.TrimSpace(*body.DisplayName)
	}
	description := current.Description
	if body.Description != nil {
		description = *body.Description
	}
	visibility := current.Visibility
	if body.Visibility != nil {
		visibility = normalizedMarkingCategoryVisibility(*body.Visibility)
	}
	organizationID := current.OrganizationID
	if body.OrganizationID != nil {
		organizationID = body.OrganizationID
	}
	metadata := current.Metadata
	if len(body.Metadata) > 0 {
		metadata = normalizeJSONObject(body.Metadata)
	}

	row := tx.QueryRow(ctx,
		`UPDATE marking_categories
		    SET display_name = $2,
		        description = $3,
		        visibility = $4,
		        organization_id = $5,
		        metadata = $6,
		        updated_at = NOW()
		  WHERE id = $1
		  RETURNING id, tenant_id, slug, display_name, description, visibility,
		            organization_id, metadata, created_by, created_at, updated_at`,
		id, displayName, description, visibility, organizationID, metadata,
	)
	updated, err := scanMarkingCategory(row)
	if err != nil {
		return nil, err
	}
	afterPerms, err := listMarkingCategoryPermissionsTx(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	after := markingCategoryAuditState(*updated, afterPerms)
	if err := insertMarkingCategoryAuditTx(ctx, tx, tenantID, id, actorID, models.MarkingCategoryAuditUpdated, nil, nil, nil, before, after, emptyJSONObject()); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &models.MarkingCategoryResponse{MarkingCategory: *updated, Permissions: afterPerms}, nil
}

func (r *Repo) ListMarkingCategoryPermissions(ctx context.Context, categoryID uuid.UUID) ([]models.MarkingCategoryPermission, error) {
	return listMarkingCategoryPermissionsQuery(ctx, r.Pool, categoryID)
}

func (r *Repo) UpsertMarkingCategoryPermission(ctx context.Context, tenantID *uuid.UUID, actorID, categoryID uuid.UUID, body *models.UpsertMarkingCategoryPermissionRequest) (*models.MarkingCategoryPermission, error) {
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
	perm, err := upsertMarkingCategoryPermissionTx(ctx, tx, categoryID, actorID, body.PrincipalKind, body.PrincipalID, body.Permission)
	if err != nil {
		return nil, err
	}
	after := mustJSONObject(map[string]any{"permission": perm})
	if err := insertMarkingCategoryAuditTx(ctx, tx, tenantID, categoryID, actorID, models.MarkingCategoryAuditPermissionGranted, &body.PrincipalKind, &body.PrincipalID, &body.Permission, emptyJSONObject(), after, emptyJSONObject()); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return perm, nil
}

func (r *Repo) DeleteMarkingCategoryPermission(ctx context.Context, tenantID *uuid.UUID, actorID, categoryID uuid.UUID, principalKind string, principalID uuid.UUID, permission string) (bool, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	if _, err := getMarkingCategoryForUpdateTx(ctx, tx, tenantID, categoryID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	cmd, err := tx.Exec(ctx,
		`DELETE FROM marking_category_permissions
		 WHERE category_id = $1 AND principal_kind = $2 AND principal_id = $3 AND permission = $4`,
		categoryID, principalKind, principalID, permission,
	)
	if err != nil {
		return false, err
	}
	if cmd.RowsAffected() == 0 {
		return false, nil
	}
	before := mustJSONObject(map[string]any{
		"category_id":    categoryID,
		"principal_kind": principalKind,
		"principal_id":   principalID,
		"permission":     permission,
	})
	if err := insertMarkingCategoryAuditTx(ctx, tx, tenantID, categoryID, actorID, models.MarkingCategoryAuditPermissionRevoked, &principalKind, &principalID, &permission, before, emptyJSONObject(), emptyJSONObject()); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (r *Repo) BlockDeleteMarkingCategory(ctx context.Context, tenantID *uuid.UUID, actorID, id uuid.UUID) (bool, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	cat, err := getMarkingCategoryForUpdateTx(ctx, tx, tenantID, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	perms, err := listMarkingCategoryPermissionsTx(ctx, tx, id)
	if err != nil {
		return false, err
	}
	before := markingCategoryAuditState(*cat, perms)
	meta := mustJSONObject(map[string]any{"reason": ErrMarkingCategoryDeletionUnsupported.Error()})
	if err := insertMarkingCategoryAuditTx(ctx, tx, tenantID, id, actorID, models.MarkingCategoryAuditDeleteBlocked, nil, nil, nil, before, before, meta); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, ErrMarkingCategoryDeletionUnsupported
}

func (r *Repo) ListMarkingCategoryAuditEvents(ctx context.Context, tenantID *uuid.UUID, categoryID uuid.UUID) ([]models.MarkingCategoryAuditEvent, error) {
	if _, err := r.getMarkingCategoryInTenant(ctx, tenantID, categoryID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT id, tenant_id, category_id, actor_id, action, principal_kind,
		        principal_id, permission, before_state, after_state, metadata, created_at
		 FROM marking_category_audit_events
		 WHERE category_id = $1
		 ORDER BY created_at DESC, id DESC
		 LIMIT 500`,
		categoryID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.MarkingCategoryAuditEvent, 0)
	for rows.Next() {
		e := models.MarkingCategoryAuditEvent{}
		if err := rows.Scan(&e.ID, &e.TenantID, &e.CategoryID, &e.ActorID, &e.Action,
			&e.PrincipalKind, &e.PrincipalID, &e.Permission, &e.BeforeState,
			&e.AfterState, &e.Metadata, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *Repo) getMarkingCategoryInTenant(ctx context.Context, tenantID *uuid.UUID, id uuid.UUID) (*models.MarkingCategory, error) {
	pred, args := tenantPredicate("mc", tenantID, 1)
	args = append(args, id)
	row := r.Pool.QueryRow(ctx, markingCategorySelect+` WHERE `+pred+fmt.Sprintf(" AND mc.id = $%d", len(args)), args...)
	return scanMarkingCategory(row)
}

const markingCategorySelect = `SELECT mc.id, mc.tenant_id, mc.slug, mc.display_name,
	mc.description, mc.visibility, mc.organization_id, mc.metadata,
	mc.created_by, mc.created_at, mc.updated_at
	FROM marking_categories mc`

type markingCategoryQueryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func scanMarkingCategory(row rowLikeT) (*models.MarkingCategory, error) {
	cat := &models.MarkingCategory{}
	if err := row.Scan(&cat.ID, &cat.TenantID, &cat.Slug, &cat.DisplayName,
		&cat.Description, &cat.Visibility, &cat.OrganizationID, &cat.Metadata,
		&cat.CreatedBy, &cat.CreatedAt, &cat.UpdatedAt); err != nil {
		return nil, err
	}
	cat.Metadata = normalizeJSONObject(cat.Metadata)
	return cat, nil
}

func getMarkingCategoryForUpdateTx(ctx context.Context, tx pgx.Tx, tenantID *uuid.UUID, id uuid.UUID) (*models.MarkingCategory, error) {
	pred, args := tenantPredicate("mc", tenantID, 1)
	args = append(args, id)
	row := tx.QueryRow(ctx, markingCategorySelect+` WHERE `+pred+fmt.Sprintf(" AND mc.id = $%d FOR UPDATE", len(args)), args...)
	return scanMarkingCategory(row)
}

func listMarkingCategoryPermissionsTx(ctx context.Context, tx pgx.Tx, categoryID uuid.UUID) ([]models.MarkingCategoryPermission, error) {
	return listMarkingCategoryPermissionsQuery(ctx, tx, categoryID)
}

func listMarkingCategoryPermissionsQuery(ctx context.Context, q markingCategoryQueryer, categoryID uuid.UUID) ([]models.MarkingCategoryPermission, error) {
	rows, err := q.Query(ctx,
		`SELECT category_id, principal_kind, principal_id, permission, granted_by, created_at
		 FROM marking_category_permissions
		 WHERE category_id = $1
		 ORDER BY permission, principal_kind, principal_id`,
		categoryID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.MarkingCategoryPermission, 0)
	for rows.Next() {
		perm := models.MarkingCategoryPermission{}
		if err := rows.Scan(&perm.CategoryID, &perm.PrincipalKind, &perm.PrincipalID,
			&perm.Permission, &perm.GrantedBy, &perm.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, perm)
	}
	return out, rows.Err()
}

func upsertMarkingCategoryPermissionTx(ctx context.Context, tx pgx.Tx, categoryID, actorID uuid.UUID, principalKind string, principalID uuid.UUID, permission string) (*models.MarkingCategoryPermission, error) {
	row := tx.QueryRow(ctx,
		`INSERT INTO marking_category_permissions
		    (category_id, principal_kind, principal_id, permission, granted_by)
		 VALUES ($1,$2,$3,$4,$5)
		 ON CONFLICT (category_id, principal_kind, principal_id, permission)
		 DO UPDATE SET granted_by = EXCLUDED.granted_by, created_at = NOW()
		 RETURNING category_id, principal_kind, principal_id, permission, granted_by, created_at`,
		categoryID, principalKind, principalID, permission, actorID,
	)
	out := &models.MarkingCategoryPermission{}
	if err := row.Scan(&out.CategoryID, &out.PrincipalKind, &out.PrincipalID,
		&out.Permission, &out.GrantedBy, &out.CreatedAt); err != nil {
		return nil, err
	}
	return out, nil
}

func insertMarkingCategoryAuditTx(ctx context.Context, tx pgx.Tx, tenantID *uuid.UUID, categoryID uuid.UUID, actorID uuid.UUID, action string, principalKind *string, principalID *uuid.UUID, permission *string, beforeState, afterState, metadata json.RawMessage) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO marking_category_audit_events
		    (id, tenant_id, category_id, actor_id, action, principal_kind, principal_id,
		     permission, before_state, after_state, metadata)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		uuid.New(), tenantID, categoryID, actorID, action, principalKind, principalID,
		permission, normalizeJSONObject(beforeState), normalizeJSONObject(afterState),
		normalizeJSONObject(metadata),
	)
	return err
}

func initialMarkingCategoryPermissions(actorID uuid.UUID, body *models.CreateMarkingCategoryRequest) []models.UpsertMarkingCategoryPermissionRequest {
	seen := map[string]bool{}
	out := make([]models.UpsertMarkingCategoryPermissionRequest, 0, 1+len(body.Administrators)+len(body.Viewers))
	add := func(kind string, id uuid.UUID, perm string) {
		key := kind + ":" + id.String() + ":" + perm
		if seen[key] {
			return
		}
		seen[key] = true
		out = append(out, models.UpsertMarkingCategoryPermissionRequest{
			PrincipalKind: kind,
			PrincipalID:   id,
			Permission:    perm,
		})
	}
	add(models.MarkingCategoryPrincipalUser, actorID, models.MarkingCategoryPermissionAdministrator)
	for _, principal := range body.Administrators {
		add(principal.PrincipalKind, principal.PrincipalID, models.MarkingCategoryPermissionAdministrator)
	}
	for _, principal := range body.Viewers {
		add(principal.PrincipalKind, principal.PrincipalID, models.MarkingCategoryPermissionViewer)
	}
	return out
}

func markingCategoryAuditState(cat models.MarkingCategory, perms []models.MarkingCategoryPermission) json.RawMessage {
	return mustJSONObject(map[string]any{
		"category":    cat,
		"permissions": perms,
	})
}

func normalizedMarkingCategoryVisibility(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "" {
		return models.MarkingCategoryVisibilityVisible
	}
	return v
}

func normalizeJSONObject(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "" {
		return emptyJSONObject()
	}
	return raw
}

func emptyJSONObject() json.RawMessage { return json.RawMessage(`{}`) }

func mustJSONObject(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return emptyJSONObject()
	}
	return b
}
