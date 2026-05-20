package postgres

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

// ErrPipelineNotFound is returned by access methods when the target pipeline
// row does not exist. Handlers map it to HTTP 404.
var ErrPipelineNotFound = errors.New("pipeline not found")

// ErrPipelineGrantInvalidRole is returned when a caller tries to grant
// PipelineRoleOwner (owner is implicit) or an unknown role string.
var ErrPipelineGrantInvalidRole = errors.New("invalid pipeline grant role")

// ErrPipelineLinkShareInvalidRole is returned when a caller tries to enable
// link sharing with a role that is not link-shareable (owner is forbidden).
var ErrPipelineLinkShareInvalidRole = errors.New("invalid link-share role")

func generatePipelineShareToken() (string, error) {
	var buf [32]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", fmt.Errorf("crypto/rand: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf[:]), nil
}

// GetPipelineOwner returns the owner_id of the pipeline. Used by handlers to
// gate access to owner-only endpoints (link-share, grants).
func (r *Repository) GetPipelineOwner(ctx context.Context, pipelineID uuid.UUID) (uuid.UUID, error) {
	var owner uuid.UUID
	err := r.db.QueryRow(ctx, `SELECT owner_id FROM pipelines WHERE id = $1`, pipelineID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrPipelineNotFound
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("get pipeline owner: %w", err)
	}
	return owner, nil
}

// GetPipelineLinkShare returns the current link-share state. Token is only
// returned when sharing is enabled.
func (r *Repository) GetPipelineLinkShare(ctx context.Context, pipelineID uuid.UUID) (models.PipelineLinkShare, error) {
	var enabled bool
	var token, role *string
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE(link_sharing_enabled, FALSE), link_share_token, link_share_role
		FROM pipelines WHERE id = $1`, pipelineID).Scan(&enabled, &token, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.PipelineLinkShare{}, ErrPipelineNotFound
	}
	if err != nil {
		return models.PipelineLinkShare{}, fmt.Errorf("get pipeline link-share: %w", err)
	}
	out := models.PipelineLinkShare{Enabled: enabled}
	if enabled && token != nil {
		out.Token = *token
	}
	if role != nil {
		out.Role = models.PipelineRole(*role)
	}
	return out, nil
}

// PutPipelineLinkShare upserts the link-share triple. Setting Enabled=false
// clears the token; otherwise the token is rotated on first-enable or when
// RotateToken is true.
func (r *Repository) PutPipelineLinkShare(ctx context.Context, pipelineID uuid.UUID, req models.UpdatePipelineLinkShareRequest) (models.PipelineLinkShare, error) {
	if req.Enabled {
		if req.Role == "" {
			req.Role = models.PipelineRoleViewer
		}
		if !req.Role.IsLinkShareable() {
			return models.PipelineLinkShare{}, ErrPipelineLinkShareInvalidRole
		}
	}

	current, err := r.GetPipelineLinkShare(ctx, pipelineID)
	if err != nil {
		return models.PipelineLinkShare{}, err
	}

	if !req.Enabled {
		_, err := r.db.Exec(ctx, `
			UPDATE pipelines
			SET link_sharing_enabled = FALSE,
			    link_share_token = NULL,
			    link_share_role = NULL,
			    updated_at = NOW()
			WHERE id = $1`, pipelineID)
		if err != nil {
			return models.PipelineLinkShare{}, fmt.Errorf("disable pipeline link-share: %w", err)
		}
		return models.PipelineLinkShare{Enabled: false}, nil
	}

	token := current.Token
	if token == "" || req.RotateToken || !current.Enabled {
		fresh, err := generatePipelineShareToken()
		if err != nil {
			return models.PipelineLinkShare{}, err
		}
		token = fresh
	}

	role := string(req.Role)
	if _, err := r.db.Exec(ctx, `
		UPDATE pipelines
		SET link_sharing_enabled = TRUE,
		    link_share_token = $2,
		    link_share_role = $3,
		    updated_at = NOW()
		WHERE id = $1`, pipelineID, token, role); err != nil {
		return models.PipelineLinkShare{}, fmt.Errorf("enable pipeline link-share: %w", err)
	}

	return models.PipelineLinkShare{Enabled: true, Token: token, Role: req.Role}, nil
}

// ResolvePipelineLinkShareToken returns (pipeline_id, role) for an enabled
// share token. Returns (uuid.Nil, "", false) when no enabled share matches.
func (r *Repository) ResolvePipelineLinkShareToken(ctx context.Context, token string) (uuid.UUID, models.PipelineRole, bool, error) {
	if token == "" {
		return uuid.Nil, "", false, nil
	}
	var pipelineID uuid.UUID
	var role string
	err := r.db.QueryRow(ctx, `
		SELECT id, link_share_role
		FROM pipelines
		WHERE link_share_token = $1 AND link_sharing_enabled = TRUE`, token).Scan(&pipelineID, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, "", false, nil
	}
	if err != nil {
		return uuid.Nil, "", false, fmt.Errorf("resolve link-share token: %w", err)
	}
	return pipelineID, models.PipelineRole(role), true, nil
}

// ListPipelineGrants returns every grant on the pipeline ordered by creation
// time (oldest first, mirroring vertex_grants).
func (r *Repository) ListPipelineGrants(ctx context.Context, pipelineID uuid.UUID) ([]models.PipelineGrant, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, pipeline_id, principal_kind, principal_id, role, granted_by, created_at, updated_at
		FROM pipeline_grants
		WHERE pipeline_id = $1
		ORDER BY created_at ASC, id ASC`, pipelineID)
	if err != nil {
		return nil, fmt.Errorf("list pipeline grants: %w", err)
	}
	defer rows.Close()
	out := make([]models.PipelineGrant, 0)
	for rows.Next() {
		var g models.PipelineGrant
		var kind, role string
		if err := rows.Scan(&g.ID, &g.PipelineID, &kind, &g.PrincipalID, &role, &g.GrantedBy, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan pipeline grant: %w", err)
		}
		g.PrincipalKind = models.PipelinePrincipalKind(kind)
		g.Role = models.PipelineRole(role)
		out = append(out, g)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pipeline grants: %w", err)
	}
	return out, nil
}

// PutPipelineGrant upserts the grant for a principal. Passing
// PipelineRoleNone (empty role) deletes the grant if one exists. Returns the
// stored grant, or nil when the call resulted in a delete.
func (r *Repository) PutPipelineGrant(ctx context.Context, pipelineID uuid.UUID, req models.PutPipelineGrantRequest, grantedBy uuid.UUID) (*models.PipelineGrant, error) {
	if req.PrincipalID == uuid.Nil {
		return nil, errors.New("principal_id required")
	}
	kind := req.PrincipalKind
	if kind == "" {
		kind = models.PipelinePrincipalKindUser
	}
	if !kind.Valid() {
		return nil, fmt.Errorf("%w: principal_kind=%s", ErrPipelineGrantInvalidRole, kind)
	}

	if req.Role == models.PipelineRoleNone {
		if _, err := r.db.Exec(ctx, `
			DELETE FROM pipeline_grants
			WHERE pipeline_id = $1 AND principal_kind = $2 AND principal_id = $3`,
			pipelineID, string(kind), req.PrincipalID); err != nil {
			return nil, fmt.Errorf("delete pipeline grant: %w", err)
		}
		return nil, nil
	}
	if req.Role == models.PipelineRoleOwner {
		return nil, fmt.Errorf("%w: owner is implicit", ErrPipelineGrantInvalidRole)
	}
	if !req.Role.Valid() {
		return nil, fmt.Errorf("%w: role=%s", ErrPipelineGrantInvalidRole, req.Role)
	}

	id := uuid.New()
	var grant models.PipelineGrant
	var kindOut, roleOut string
	err := r.db.QueryRow(ctx, `
		INSERT INTO pipeline_grants (id, pipeline_id, principal_kind, principal_id, role, granted_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (pipeline_id, principal_kind, principal_id)
		DO UPDATE SET role = EXCLUDED.role,
		              granted_by = EXCLUDED.granted_by,
		              updated_at = NOW()
		RETURNING id, pipeline_id, principal_kind, principal_id, role, granted_by, created_at, updated_at`,
		id, pipelineID, string(kind), req.PrincipalID, string(req.Role), grantedBy).
		Scan(&grant.ID, &grant.PipelineID, &kindOut, &grant.PrincipalID, &roleOut, &grant.GrantedBy, &grant.CreatedAt, &grant.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("upsert pipeline grant: %w", err)
	}
	grant.PrincipalKind = models.PipelinePrincipalKind(kindOut)
	grant.Role = models.PipelineRole(roleOut)
	return &grant, nil
}

// DeletePipelineGrant removes a grant by id. Returns false when the grant
// does not exist.
func (r *Repository) DeletePipelineGrant(ctx context.Context, pipelineID, grantID uuid.UUID) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM pipeline_grants
		WHERE pipeline_id = $1 AND id = $2`, pipelineID, grantID)
	if err != nil {
		return false, fmt.Errorf("delete pipeline grant: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// FollowPipeline adds the user to the follower set. Returns true when newly
// added, false when already following.
func (r *Repository) FollowPipeline(ctx context.Context, pipelineID, followerID uuid.UUID) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		INSERT INTO pipeline_followers (pipeline_id, follower_id)
		VALUES ($1, $2)
		ON CONFLICT (pipeline_id, follower_id) DO NOTHING`, pipelineID, followerID)
	if err != nil {
		return false, fmt.Errorf("follow pipeline: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// UnfollowPipeline removes the user from the follower set. Returns true when
// a row was actually removed.
func (r *Repository) UnfollowPipeline(ctx context.Context, pipelineID, followerID uuid.UUID) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM pipeline_followers
		WHERE pipeline_id = $1 AND follower_id = $2`, pipelineID, followerID)
	if err != nil {
		return false, fmt.Errorf("unfollow pipeline: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// GetPipelineFollowerSummary returns the follower count and whether the
// caller is currently following.
func (r *Repository) GetPipelineFollowerSummary(ctx context.Context, pipelineID, callerID uuid.UUID) (models.PipelineFollowerSummary, error) {
	var summary models.PipelineFollowerSummary
	err := r.db.QueryRow(ctx, `
		SELECT
			COALESCE((SELECT COUNT(*) FROM pipeline_followers WHERE pipeline_id = $1), 0),
			EXISTS (SELECT 1 FROM pipeline_followers WHERE pipeline_id = $1 AND follower_id = $2)`,
		pipelineID, callerID).Scan(&summary.FollowerCount, &summary.Following)
	if err != nil {
		return models.PipelineFollowerSummary{}, fmt.Errorf("follower summary: %w", err)
	}
	return summary, nil
}

// RecordPipelineView increments the daily view counter for the pipeline.
// Bucketing by day bounds storage to (pipelines × 30 days) once older rows
// are pruned by a separate retention job.
func (r *Repository) RecordPipelineView(ctx context.Context, pipelineID uuid.UUID) error {
	if _, err := r.db.Exec(ctx, `
		INSERT INTO pipeline_views (pipeline_id, viewed_on, total_views)
		VALUES ($1, CURRENT_DATE, 1)
		ON CONFLICT (pipeline_id, viewed_on)
		DO UPDATE SET total_views = pipeline_views.total_views + 1`, pipelineID); err != nil {
		return fmt.Errorf("record pipeline view: %w", err)
	}
	return nil
}

// GetPipelineViewSummary returns the total view count for the trailing 30
// days (inclusive of today).
func (r *Repository) GetPipelineViewSummary(ctx context.Context, pipelineID uuid.UUID) (models.PipelineViewSummary, error) {
	var summary models.PipelineViewSummary
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(total_views), 0)
		FROM pipeline_views
		WHERE pipeline_id = $1
		  AND viewed_on >= CURRENT_DATE - INTERVAL '29 days'`, pipelineID).Scan(&summary.ViewCount30Days)
	if err != nil {
		return models.PipelineViewSummary{}, fmt.Errorf("view summary: %w", err)
	}
	return summary, nil
}

// ListPipelineComments returns the most-recent comments first, capped at the
// supplied limit (default 100).
func (r *Repository) ListPipelineComments(ctx context.Context, pipelineID uuid.UUID, limit int) ([]models.PipelineComment, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := r.db.Query(ctx, `
		SELECT id, pipeline_id, author_id, body, created_at, updated_at
		FROM pipeline_comments
		WHERE pipeline_id = $1
		ORDER BY created_at DESC, id DESC
		LIMIT $2`, pipelineID, limit)
	if err != nil {
		return nil, fmt.Errorf("list pipeline comments: %w", err)
	}
	defer rows.Close()
	out := make([]models.PipelineComment, 0)
	for rows.Next() {
		var c models.PipelineComment
		if err := rows.Scan(&c.ID, &c.PipelineID, &c.AuthorID, &c.Body, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan pipeline comment: %w", err)
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pipeline comments: %w", err)
	}
	return out, nil
}

// CreatePipelineComment inserts a new comment authored by the caller.
func (r *Repository) CreatePipelineComment(ctx context.Context, pipelineID, authorID uuid.UUID, body string) (*models.PipelineComment, error) {
	id := uuid.New()
	var c models.PipelineComment
	err := r.db.QueryRow(ctx, `
		INSERT INTO pipeline_comments (id, pipeline_id, author_id, body)
		VALUES ($1, $2, $3, $4)
		RETURNING id, pipeline_id, author_id, body, created_at, updated_at`,
		id, pipelineID, authorID, body).
		Scan(&c.ID, &c.PipelineID, &c.AuthorID, &c.Body, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create pipeline comment: %w", err)
	}
	return &c, nil
}

// DeletePipelineComment removes the comment if the caller is the author or
// is the owner of the pipeline (passed in by the caller). Returns whether a
// row was removed.
func (r *Repository) DeletePipelineComment(ctx context.Context, pipelineID, commentID, callerID uuid.UUID, isOwner bool) (bool, error) {
	var query string
	var args []any
	if isOwner {
		query = `DELETE FROM pipeline_comments WHERE id = $1 AND pipeline_id = $2`
		args = []any{commentID, pipelineID}
	} else {
		query = `DELETE FROM pipeline_comments WHERE id = $1 AND pipeline_id = $2 AND author_id = $3`
		args = []any{commentID, pipelineID, callerID}
	}
	tag, err := r.db.Exec(ctx, query, args...)
	if err != nil {
		return false, fmt.Errorf("delete pipeline comment: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}
