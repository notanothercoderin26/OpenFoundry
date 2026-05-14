package repo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/domain/markings"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/domain/token"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/handlers/auth"
)

// IssueAPIToken inserts a freshly minted `ofty_*` token row and
// returns both the persisted record and the raw secret. The hash is
// the SHA-256 of the raw token (lower-case hex, no separators).
//
// Mirrors `domain::token::issue` in Rust.
func (r *Repo) IssueAPIToken(ctx context.Context, userID uuid.UUID, name string, scopes []string, expiresAt *time.Time) (*token.APIToken, string, error) {
	raw, hash, hint, err := token.Mint()
	if err != nil {
		return nil, "", err
	}
	id := uuid.New()
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO iceberg_api_tokens (id, user_id, name, token_hash, token_hint, scopes, expires_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)
		 RETURNING id, user_id, name, token_hint, scopes, expires_at, created_at, last_used_at, revoked_at`,
		id, userID, name, hash, hint, scopes, expiresAt,
	)
	rec := &token.APIToken{}
	if err := row.Scan(&rec.ID, &rec.UserID, &rec.Name, &rec.TokenHint, &rec.Scopes, &rec.ExpiresAt, &rec.CreatedAt, &rec.LastUsedAt, &rec.RevokedAt); err != nil {
		return nil, "", err
	}
	return rec, raw, nil
}

// ValidateAPIToken looks up a stored `ofty_*` token by its SHA-256
// hash. Returns nil on miss; bumps `last_used_at` on hit.
//
// The bearer extractor lives in the auth package, so this method
// returns the lighter `auth.StoredAPIToken` shape rather than the
// full `token.APIToken` to avoid an import cycle.
func (r *Repo) ValidateAPIToken(ctx context.Context, raw string) (*auth.StoredAPIToken, error) {
	hash := token.Hash(raw)
	var (
		id     uuid.UUID
		userID uuid.UUID
		scopes []string
	)
	err := r.Pool.QueryRow(ctx,
		`SELECT id, user_id, scopes FROM iceberg_api_tokens
		 WHERE token_hash = $1
		   AND revoked_at IS NULL
		   AND (expires_at IS NULL OR expires_at > NOW())`,
		hash,
	).Scan(&id, &userID, &scopes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if _, err := r.Pool.Exec(ctx, `UPDATE iceberg_api_tokens SET last_used_at = NOW() WHERE id = $1`, id); err != nil {
		return nil, err
	}
	return &auth.StoredAPIToken{ID: id, UserID: userID, Scopes: scopes}, nil
}

// ResolveMarkingName converts a marking name (case-insensitive) to
// its UUID via the `iceberg_marking_names` projection. Returns an
// error message identical to the Rust handler so handlers can map it
// to 400 with no client-visible drift.
func (r *Repo) ResolveMarkingName(ctx context.Context, name string) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.Pool.QueryRow(ctx,
		`SELECT marking_id FROM iceberg_marking_names WHERE name = LOWER($1)`,
		name,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, fmt.Errorf("unknown marking name `%s`", name)
	}
	if err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

// ProjectMarkings hydrates id+name+description for the given marking
// ids, ordered by name. Unknown ids are silently dropped.
func (r *Repo) ProjectMarkings(ctx context.Context, ids []uuid.UUID) ([]markings.MarkingProjection, error) {
	if len(ids) == 0 {
		return []markings.MarkingProjection{}, nil
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT marking_id, name, description
		   FROM iceberg_marking_names
		  WHERE marking_id = ANY($1)
		  ORDER BY name`,
		ids,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]markings.MarkingProjection, 0, len(ids))
	for rows.Next() {
		var p markings.MarkingProjection
		if err := rows.Scan(&p.MarkingID, &p.Name, &p.Description); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// LoadNamespaceMarkings reads the explicit markings on a namespace
// and projects them. `effective` and `explicit` are equal — namespace
// inheritance is reserved for D1.1.8 P5.
func (r *Repo) LoadNamespaceMarkings(ctx context.Context, namespaceID uuid.UUID) (*markings.NamespaceMarkings, error) {
	ids, err := r.namespaceMarkingIDs(ctx, namespaceID)
	if err != nil {
		return nil, err
	}
	proj, err := r.ProjectMarkings(ctx, ids)
	if err != nil {
		return nil, err
	}
	return &markings.NamespaceMarkings{Effective: proj, Explicit: proj}, nil
}

// LoadTableMarkings returns the (effective, explicit, inherited)
// triple for an iceberg table.
func (r *Repo) LoadTableMarkings(ctx context.Context, tableID uuid.UUID) (*markings.TableMarkings, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT marking_id, source FROM iceberg_table_markings WHERE table_id = $1`,
		tableID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var explicit, inherited []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		var source string
		if err := rows.Scan(&id, &source); err != nil {
			return nil, err
		}
		if source == "inherited" {
			inherited = append(inherited, id)
		} else {
			explicit = append(explicit, id)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	effectiveSet := make(map[uuid.UUID]struct{}, len(explicit)+len(inherited))
	for _, id := range explicit {
		effectiveSet[id] = struct{}{}
	}
	for _, id := range inherited {
		effectiveSet[id] = struct{}{}
	}
	effective := make([]uuid.UUID, 0, len(effectiveSet))
	for id := range effectiveSet {
		effective = append(effective, id)
	}

	effProj, err := r.ProjectMarkings(ctx, effective)
	if err != nil {
		return nil, err
	}
	expProj, err := r.ProjectMarkings(ctx, explicit)
	if err != nil {
		return nil, err
	}
	inhProj, err := r.ProjectMarkings(ctx, inherited)
	if err != nil {
		return nil, err
	}
	return &markings.TableMarkings{
		Effective:              effProj,
		Explicit:               expProj,
		InheritedFromNamespace: inhProj,
	}, nil
}

// SetNamespaceMarkings replaces the explicit markings on a namespace.
// Implemented as DELETE + INSERTs; Postgres serialises the writes per
// row, which is sufficient for the catalog's correctness model.
func (r *Repo) SetNamespaceMarkings(ctx context.Context, namespaceID uuid.UUID, ids []uuid.UUID, actor uuid.UUID) error {
	if _, err := r.Pool.Exec(ctx, `DELETE FROM iceberg_namespace_markings WHERE namespace_id = $1`, namespaceID); err != nil {
		return err
	}
	for _, id := range ids {
		_, err := r.Pool.Exec(ctx,
			`INSERT INTO iceberg_namespace_markings (namespace_id, marking_id, created_by)
			 VALUES ($1,$2,$3)
			 ON CONFLICT (namespace_id, marking_id) DO NOTHING`,
			namespaceID, id, actor,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

// SetTableExplicitMarkings replaces the explicit (non-inherited)
// markings on a table and refreshes the cached `iceberg_tables.markings`
// projection.
func (r *Repo) SetTableExplicitMarkings(ctx context.Context, tableID uuid.UUID, ids []uuid.UUID, actor uuid.UUID) error {
	if _, err := r.Pool.Exec(ctx,
		`DELETE FROM iceberg_table_markings WHERE table_id = $1 AND source = 'explicit'`,
		tableID,
	); err != nil {
		return err
	}
	for _, id := range ids {
		if _, err := r.Pool.Exec(ctx,
			`INSERT INTO iceberg_table_markings (table_id, marking_id, source, created_by)
			 VALUES ($1,$2,'explicit',$3)
			 ON CONFLICT (table_id, marking_id, source) DO NOTHING`,
			tableID, id, actor,
		); err != nil {
			return err
		}
	}
	return r.refreshTableMarkingsCache(ctx, tableID)
}

func (r *Repo) refreshTableMarkingsCache(ctx context.Context, tableID uuid.UUID) error {
	_, err := r.Pool.Exec(ctx,
		`UPDATE iceberg_tables t
		    SET markings = COALESCE((
		        SELECT array_agg(DISTINCT mn.name ORDER BY mn.name)
		          FROM iceberg_table_markings tm
		          JOIN iceberg_marking_names mn ON mn.marking_id = tm.marking_id
		         WHERE tm.table_id = t.id
		    ), '{}'::TEXT[])
		  WHERE t.id = $1`,
		tableID,
	)
	return err
}

func (r *Repo) namespaceMarkingIDs(ctx context.Context, namespaceID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT marking_id FROM iceberg_namespace_markings WHERE namespace_id = $1`,
		namespaceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
