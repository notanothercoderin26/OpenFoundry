package repo

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
)

// ----- Graph grants -----

func (r *Repo) ListGrants(ctx context.Context, graphID uuid.UUID) ([]models.GraphGrant, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT id, graph_id, principal_kind, principal_id, role, granted_by,
		 created_at, updated_at
		 FROM vertex.graph_grant WHERE graph_id = $1
		 ORDER BY created_at ASC`, graphID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.GraphGrant, 0)
	for rows.Next() {
		g, err := scanGrant(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *g)
	}
	return out, rows.Err()
}

// PutGrant inserts or updates a grant for (graph_id, principal_kind,
// principal_id). Passing role = models.RoleNone deletes the grant.
func (r *Repo) PutGrant(ctx context.Context, graphID uuid.UUID, body *models.PutGraphGrantRequest, grantedBy uuid.UUID) (*models.GraphGrant, error) {
	if body.PrincipalID == uuid.Nil {
		return nil, errors.New("principal_id required")
	}
	kind := body.PrincipalKind
	if kind == "" {
		kind = models.PrincipalKindUser
	}
	if kind != models.PrincipalKindUser && kind != models.PrincipalKindGroup {
		return nil, errors.New("principal_kind must be user|group")
	}
	role := models.ParseRole(string(body.Role))
	if role == models.RoleNone {
		// Treat 'none' as a delete — the explicit grant goes away.
		if _, err := r.Pool.Exec(ctx,
			`DELETE FROM vertex.graph_grant
			 WHERE graph_id = $1 AND principal_kind = $2 AND principal_id = $3`,
			graphID, string(kind), body.PrincipalID); err != nil {
			return nil, err
		}
		return nil, nil
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO vertex.graph_grant
			(id, graph_id, principal_kind, principal_id, role, granted_by)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (graph_id, principal_kind, principal_id) DO UPDATE
		 SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by,
		     updated_at = NOW()
		 RETURNING id, graph_id, principal_kind, principal_id, role, granted_by,
		           created_at, updated_at`,
		uuid.New(), graphID, string(kind), body.PrincipalID, string(role), grantedBy)
	return scanGrant(row)
}

func (r *Repo) DeleteGrant(ctx context.Context, graphID, grantID uuid.UUID) (bool, error) {
	tag, err := r.Pool.Exec(ctx,
		`DELETE FROM vertex.graph_grant WHERE graph_id = $1 AND id = $2`,
		graphID, grantID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// ResolveRole computes the role of `caller` against `graphID` using
// the rules documented in 0002_vertex_acl.sql:
//   1. Graph owner          → owner
//   2. Best explicit grant  → that role
//   3. Otherwise            → none
//
// `groupIDs` is the caller's group membership set, supplied by the
// auth middleware via Claims. When empty, only user-kind grants
// apply.
func (r *Repo) ResolveRole(ctx context.Context, graphID, caller uuid.UUID, groupIDs []uuid.UUID) (models.Role, error) {
	// Owner short-circuit.
	var ownerID uuid.UUID
	err := r.Pool.QueryRow(ctx,
		`SELECT owner_id FROM vertex.graph WHERE id = $1`, graphID).Scan(&ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.RoleNone, nil
	}
	if err != nil {
		return models.RoleNone, err
	}
	if ownerID == caller {
		return models.RoleOwner, nil
	}

	// Collect candidate principals: the caller + every group the
	// caller belongs to.
	args := []any{graphID, caller}
	placeholders := []string{"($2, 'user')"}
	for i, g := range groupIDs {
		args = append(args, g)
		placeholders = append(placeholders, "($"+itoa(i+3)+", 'group')")
	}
	in := strings.Join(placeholders, ",")
	q := `SELECT role FROM vertex.graph_grant
	      WHERE graph_id = $1
	        AND (principal_id, principal_kind) IN (` + in + `)`
	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return models.RoleNone, err
	}
	defer rows.Close()
	best := models.RoleNone
	for rows.Next() {
		var r string
		if err := rows.Scan(&r); err != nil {
			return models.RoleNone, err
		}
		candidate := models.ParseRole(r)
		if models.RoleAtLeast(candidate, best) {
			best = candidate
		}
	}
	return best, rows.Err()
}

func scanGrant(r rowLikeT) (*models.GraphGrant, error) {
	g := &models.GraphGrant{}
	var kind, role string
	if err := r.Scan(&g.ID, &g.GraphID, &kind, &g.PrincipalID, &role,
		&g.GrantedBy, &g.CreatedAt, &g.UpdatedAt); err != nil {
		return nil, err
	}
	g.PrincipalKind = models.PrincipalKind(kind)
	g.Role = models.Role(role)
	return g, nil
}

// itoa is a hand-rolled int → string helper that keeps the file
// dependency-free of strconv just for placeholder generation. Equivalent
// to strconv.Itoa for the small ints this code uses.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
