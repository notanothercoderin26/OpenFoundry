package repo

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
)

// generateShareToken returns a 32-byte cryptographically random
// token, base64-url-encoded without padding (43 characters). The
// token is the secret half of link sharing — it is opaque, unguessable
// and stored at rest as-is so the `/shared/{token}` lookup is a
// single indexed query.
func generateShareToken() (string, error) {
	var buf [32]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", fmt.Errorf("crypto/rand: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf[:]), nil
}

// GetLinkShare returns the current configuration. The token is
// returned in the clear and the caller is expected to only show it to
// graph owners.
func (r *Repo) GetLinkShare(ctx context.Context, graphID uuid.UUID) (*models.LinkShare, error) {
	var enabled bool
	var token, role *string
	err := r.Pool.QueryRow(ctx,
		`SELECT link_sharing_enabled, link_share_token, link_share_role
		 FROM vertex.graph WHERE id = $1`, graphID).
		Scan(&enabled, &token, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	out := &models.LinkShare{Enabled: enabled}
	if enabled {
		if token != nil {
			out.Token = *token
		}
		if role != nil {
			out.Role = models.Role(*role)
		}
	}
	return out, nil
}

// PutLinkShare toggles link sharing and optionally rotates the token.
//
// Semantics:
//   * `body.Enabled = false` → token + role nulled, link sharing off.
//   * Toggling from disabled to enabled                → fresh token.
//   * `body.RotateToken = true` while enabled         → fresh token.
//   * Updating only the role while enabled (no rotate) → existing token preserved.
//
// Returns (nil, nil) when the graph does not exist.
func (r *Repo) PutLinkShare(ctx context.Context, graphID uuid.UUID, body *models.UpdateLinkShareRequest) (*models.LinkShare, error) {
	current, err := r.GetLinkShare(ctx, graphID)
	if err != nil || current == nil {
		return nil, err
	}
	if !body.Enabled {
		if _, err := r.Pool.Exec(ctx,
			`UPDATE vertex.graph SET
				link_sharing_enabled = FALSE,
				link_share_token     = NULL,
				link_share_role      = NULL,
				updated_at           = NOW()
			 WHERE id = $1`, graphID); err != nil {
			return nil, err
		}
		return &models.LinkShare{Enabled: false}, nil
	}

	role := models.ParseRole(string(body.Role))
	if role == models.RoleNone || role == models.RoleOwner {
		// Owner role via link share would let any visitor escalate
		// indefinitely, and a missing role makes the link
		// meaningless. Default to Viewer.
		role = models.RoleViewer
	}

	token := current.Token
	switchedOn := !current.Enabled
	if switchedOn || body.RotateToken || token == "" {
		t, err := generateShareToken()
		if err != nil {
			return nil, err
		}
		token = t
	}

	if _, err := r.Pool.Exec(ctx,
		`UPDATE vertex.graph SET
			link_sharing_enabled = TRUE,
			link_share_token     = $2,
			link_share_role      = $3,
			updated_at           = NOW()
		 WHERE id = $1`, graphID, token, string(role)); err != nil {
		return nil, err
	}
	return &models.LinkShare{Enabled: true, Token: token, Role: role}, nil
}

// ResolveLinkShareToken returns (graph_id, role) when `token` matches
// an enabled link share. Returns ("", RoleNone, nil) for unknown or
// disabled tokens — the caller is responsible for mapping the empty
// graph_id to a 404.
func (r *Repo) ResolveLinkShareToken(ctx context.Context, token string) (uuid.UUID, models.Role, error) {
	if token == "" {
		return uuid.Nil, models.RoleNone, nil
	}
	var graphID uuid.UUID
	var role string
	err := r.Pool.QueryRow(ctx,
		`SELECT id, link_share_role FROM vertex.graph
		 WHERE link_share_token = $1 AND link_sharing_enabled = TRUE`,
		token).Scan(&graphID, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, models.RoleNone, nil
	}
	if err != nil {
		return uuid.Nil, models.RoleNone, err
	}
	return graphID, models.Role(role), nil
}

// LinkShareRoleFor looks up the link-share role currently configured
// for `graphID` IF and only IF link sharing is enabled. Returns
// RoleNone when sharing is disabled, the graph is missing, or the
// role column is null. Used by the role middleware to combine an
// inbound share token with the caller's explicit grant.
func (r *Repo) LinkShareRoleFor(ctx context.Context, graphID uuid.UUID, presentedToken string) (models.Role, error) {
	if presentedToken == "" {
		return models.RoleNone, nil
	}
	var role string
	err := r.Pool.QueryRow(ctx,
		`SELECT link_share_role FROM vertex.graph
		 WHERE id = $1 AND link_sharing_enabled = TRUE
		   AND link_share_token = $2`, graphID, presentedToken).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.RoleNone, nil
	}
	if err != nil {
		return models.RoleNone, err
	}
	return models.Role(role), nil
}
