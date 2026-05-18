package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/openfoundry/openfoundry-go/services/identity-federation-service/internal/models"
)

type thirdPartyServiceUserAuditExec interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

func (r *Repo) EnsureThirdPartyApplicationServiceUser(ctx context.Context, app *models.ThirdPartyApplication, serviceUser *models.ThirdPartyAppServiceUserSeed, actor uuid.UUID, at time.Time) (*models.ThirdPartyApplication, error) {
	if app == nil || serviceUser == nil || app.ServiceUserID == nil {
		return nil, fmt.Errorf("service user seed is required")
	}
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin service user ensure: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx,
		`INSERT INTO users
		   (id, email, username, name, password_hash, is_active, auth_source, realm,
		    organization_id, attributes, preregistered, invited_by)
		 VALUES ($1, $2, $3, $4, '', TRUE, 'oauth_client', 'service_user',
		         $5, $6::jsonb, FALSE, $7)
		 ON CONFLICT (id) DO NOTHING`,
		serviceUser.ID, serviceUser.Email, serviceUser.Username, serviceUser.Name,
		serviceUser.OrganizationID, serviceUser.Attributes, serviceUser.CreatedBy,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert third-party application service user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		if _, err := tx.Exec(ctx,
			`UPDATE users SET
			   email = $2,
			   username = $3,
			   name = $4,
			   organization_id = $5,
			   attributes = $6::jsonb,
			   updated_at = NOW()
			 WHERE id = $1`,
			serviceUser.ID, serviceUser.Email, serviceUser.Username, serviceUser.Name,
			serviceUser.OrganizationID, serviceUser.Attributes,
		); err != nil {
			return nil, fmt.Errorf("update third-party application service user: %w", err)
		}
	} else {
		if err := insertThirdPartyServiceUserAuditEvent(ctx, tx, app.ID, app.ServiceUserID, &actor, models.ThirdPartyServiceUserAuditCreated, map[string]any{
			"client_id": app.ClientID,
			"username":  serviceUser.Username,
		}); err != nil {
			return nil, err
		}
	}

	tag, err = tx.Exec(ctx,
		`UPDATE third_party_applications
		 SET enabled_grant_types = $2,
		     service_user_id = $3,
		     updated_by = $4,
		     updated_at = $5
		 WHERE id = $1
		   AND revoked_at IS NULL
		   AND client_type = 'confidential'`,
		app.ID, app.EnabledGrantTypes, app.ServiceUserID, actor, at,
	)
	if err != nil {
		return nil, fmt.Errorf("attach third-party application service user: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return nil, pgx.ErrNoRows
	}
	if err := insertThirdPartyServiceUserAuditEvent(ctx, tx, app.ID, app.ServiceUserID, &actor, models.ThirdPartyServiceUserAuditClientGrantEnabled, map[string]any{
		"client_id":           app.ClientID,
		"enabled_grant_types": app.EnabledGrantTypes,
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetThirdPartyApplication(ctx, app.ID)
}

func (r *Repo) CreateThirdPartyServiceUserGrant(ctx context.Context, grant *models.ThirdPartyServiceUserGrant) (*models.ThirdPartyServiceUserGrant, error) {
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO third_party_service_user_grants
		   (id, application_id, service_user_id, scope_type, scope_id, role_key, granted_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (application_id, service_user_id, scope_type, scope_id, role_key) DO UPDATE SET
		   granted_by = EXCLUDED.granted_by,
		   created_at = NOW(),
		   revoked_at = NULL
		 RETURNING id, application_id, service_user_id, scope_type, scope_id, role_key,
		           granted_by, created_at, revoked_at`,
		grant.ID, grant.ApplicationID, grant.ServiceUserID, grant.ScopeType, grant.ScopeID,
		grant.RoleKey, grant.GrantedBy,
	)
	saved := &models.ThirdPartyServiceUserGrant{}
	if err := scanThirdPartyServiceUserGrant(saved, row); err != nil {
		return nil, err
	}
	return saved, nil
}

func (r *Repo) ListThirdPartyServiceUserGrants(ctx context.Context, applicationID uuid.UUID, includeRevoked bool) ([]models.ThirdPartyServiceUserGrant, error) {
	query := `SELECT id, application_id, service_user_id, scope_type, scope_id, role_key,
	                 granted_by, created_at, revoked_at
	          FROM third_party_service_user_grants
	          WHERE application_id = $1`
	if !includeRevoked {
		query += ` AND revoked_at IS NULL`
	}
	query += ` ORDER BY scope_type, scope_id, role_key`
	rows, err := r.Pool.Query(ctx, query, applicationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.ThirdPartyServiceUserGrant, 0)
	for rows.Next() {
		var grant models.ThirdPartyServiceUserGrant
		if err := scanThirdPartyServiceUserGrant(&grant, rows); err != nil {
			return nil, err
		}
		out = append(out, grant)
	}
	return out, rows.Err()
}

func (r *Repo) RevokeThirdPartyServiceUserGrant(ctx context.Context, applicationID, grantID uuid.UUID, actor uuid.UUID, at time.Time) (*models.ThirdPartyServiceUserGrant, error) {
	row := r.Pool.QueryRow(ctx,
		`UPDATE third_party_service_user_grants
		 SET revoked_at = COALESCE(revoked_at, $3)
		 WHERE id = $1 AND application_id = $2
		 RETURNING id, application_id, service_user_id, scope_type, scope_id, role_key,
		           granted_by, created_at, revoked_at`,
		grantID, applicationID, at,
	)
	grant := &models.ThirdPartyServiceUserGrant{}
	if err := scanThirdPartyServiceUserGrant(grant, row); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if err := r.RecordThirdPartyServiceUserAuditEvent(ctx, applicationID, &grant.ServiceUserID, &actor, models.ThirdPartyServiceUserAuditGrantRevoked, map[string]any{
		"grant_id":   grant.ID.String(),
		"scope_type": grant.ScopeType,
		"scope_id":   grant.ScopeID,
		"role_key":   grant.RoleKey,
	}); err != nil {
		return nil, err
	}
	return grant, nil
}

func (r *Repo) RecordThirdPartyServiceUserAuditEvent(ctx context.Context, applicationID uuid.UUID, serviceUserID *uuid.UUID, actorID *uuid.UUID, action string, metadata map[string]any) error {
	return insertThirdPartyServiceUserAuditEvent(ctx, r.Pool, applicationID, serviceUserID, actorID, action, metadata)
}

func (r *Repo) ListThirdPartyServiceUserAuditEvents(ctx context.Context, applicationID uuid.UUID, limit int) ([]models.ThirdPartyServiceUserAuditEvent, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT id, application_id, service_user_id, actor_id, action, metadata, created_at
		 FROM third_party_service_user_audit_events
		 WHERE application_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2`,
		applicationID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.ThirdPartyServiceUserAuditEvent, 0)
	for rows.Next() {
		var event models.ThirdPartyServiceUserAuditEvent
		if err := rows.Scan(
			&event.ID, &event.ApplicationID, &event.ServiceUserID, &event.ActorID,
			&event.Action, &event.Metadata, &event.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, event)
	}
	return out, rows.Err()
}

func insertThirdPartyServiceUserAuditEvent(ctx context.Context, exec thirdPartyServiceUserAuditExec, applicationID uuid.UUID, serviceUserID *uuid.UUID, actorID *uuid.UUID, action string, metadata map[string]any) error {
	if metadata == nil {
		metadata = map[string]any{}
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("marshal service user audit metadata: %w", err)
	}
	_, err = exec.Exec(ctx,
		`INSERT INTO third_party_service_user_audit_events
		   (application_id, service_user_id, actor_id, action, metadata)
		 VALUES ($1, $2, $3, $4, $5::jsonb)`,
		applicationID, serviceUserID, actorID, action, raw,
	)
	return err
}

type thirdPartyServiceUserGrantScanner interface {
	Scan(dest ...any) error
}

func scanThirdPartyServiceUserGrant(grant *models.ThirdPartyServiceUserGrant, row thirdPartyServiceUserGrantScanner) error {
	return row.Scan(
		&grant.ID, &grant.ApplicationID, &grant.ServiceUserID, &grant.ScopeType,
		&grant.ScopeID, &grant.RoleKey, &grant.GrantedBy, &grant.CreatedAt, &grant.RevokedAt,
	)
}
