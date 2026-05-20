// Saved-graph persistence for the Data Lineage UI's "Save / Open
// graph" + "Get quick share link" features. Frontend snapshots used
// to live in the browser's localStorage only — this layer moves them
// server-side so they survive sessions, sync across devices, and can
// be shared via a read-only link.

package lineage

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/models"
)

// ErrSavedGraphNotFound is returned by SavedGraphRepo lookups when no
// row matches. Handlers map this to HTTP 404.
var ErrSavedGraphNotFound = errors.New("saved graph not found")

// MaxSavedGraphNameLen is the cap enforced by the handler before
// touching the DB. Foundry surfaces ~120 chars before truncation; we
// keep some headroom for emoji.
const MaxSavedGraphNameLen = 200

// MaxSavedGraphPayloadBytes is the upper bound on the opaque payload
// blob the frontend uploads. 1 MiB easily fits the largest snapshots
// we have observed in the React app (~80 KiB typical) while still
// guarding against accidental megablobs.
const MaxSavedGraphPayloadBytes = 1 << 20

// SavedGraphRepo wraps the pgx pool with typed CRUD helpers.
type SavedGraphRepo struct {
	pool *pgxpool.Pool
}

// NewSavedGraphRepo constructs a repo around an existing pool. Tests
// pass a pgxmock pool that satisfies the same interface subset.
func NewSavedGraphRepo(pool *pgxpool.Pool) *SavedGraphRepo {
	return &SavedGraphRepo{pool: pool}
}

// MintShareToken returns a base32-encoded 160-bit value. Base32 keeps
// the URL ergonomic (no slashes or padding) and 160 bits leaves the
// collision probability negligible across the lifetime of the table.
func MintShareToken() (string, error) {
	buf := make([]byte, 20)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("share token: read random: %w", err)
	}
	encoded := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf)
	return strings.ToLower(encoded), nil
}

// SanitizeName trims surrounding whitespace and rejects empties or
// over-length names. It is a pure helper so handler tests can pin
// the exact validation surface.
func SanitizeName(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", errors.New("name is required")
	}
	if len(trimmed) > MaxSavedGraphNameLen {
		return "", fmt.Errorf("name longer than %d characters", MaxSavedGraphNameLen)
	}
	return trimmed, nil
}

// SanitizePayload guards against missing / oversized blobs. An empty
// payload is normalised to `{}` so downstream JSONB scans never see
// NULL.
func SanitizePayload(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		return json.RawMessage(`{}`), nil
	}
	if len(raw) > MaxSavedGraphPayloadBytes {
		return nil, fmt.Errorf("payload larger than %d bytes", MaxSavedGraphPayloadBytes)
	}
	if !json.Valid(raw) {
		return nil, errors.New("payload is not valid JSON")
	}
	return raw, nil
}

// Create inserts a new saved graph row and returns the persisted
// record with its server-generated id / timestamps.
func (r *SavedGraphRepo) Create(ctx context.Context, ownerID uuid.UUID, in models.CreateSavedGraphRequest) (*models.SavedGraph, error) {
	name, err := SanitizeName(in.Name)
	if err != nil {
		return nil, err
	}
	payload, err := SanitizePayload(in.Payload)
	if err != nil {
		return nil, err
	}
	branch := strings.TrimSpace(in.Branch)
	if branch == "" {
		branch = "master"
	}
	coloring := strings.TrimSpace(in.ColoringMode)
	if coloring == "" {
		coloring = "resource_type"
	}

	const q = `
		INSERT INTO lineage_saved_graphs (owner_id, name, branch, coloring_mode, payload)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, owner_id, name, branch, coloring_mode, payload,
		          share_token, share_read_only, shared_at, created_at, updated_at
	`
	row := r.pool.QueryRow(ctx, q, ownerID, name, branch, coloring, payload)
	out := &models.SavedGraph{}
	if err := row.Scan(
		&out.ID, &out.OwnerID, &out.Name, &out.Branch, &out.ColoringMode, &out.Payload,
		&out.ShareToken, &out.ShareReadOnly, &out.SharedAt, &out.CreatedAt, &out.UpdatedAt,
	); err != nil {
		return nil, fmt.Errorf("insert saved graph: %w", err)
	}
	return out, nil
}

// List returns the caller's saved graphs newest-first. We never page
// — the realistic upper bound is dozens per user.
func (r *SavedGraphRepo) List(ctx context.Context, ownerID uuid.UUID) ([]models.SavedGraph, error) {
	const q = `
		SELECT id, owner_id, name, branch, coloring_mode, payload,
		       share_token, share_read_only, shared_at, created_at, updated_at
		  FROM lineage_saved_graphs
		 WHERE owner_id = $1
		 ORDER BY updated_at DESC
	`
	rows, err := r.pool.Query(ctx, q, ownerID)
	if err != nil {
		return nil, fmt.Errorf("list saved graphs: %w", err)
	}
	defer rows.Close()
	out := make([]models.SavedGraph, 0)
	for rows.Next() {
		var row models.SavedGraph
		if err := rows.Scan(
			&row.ID, &row.OwnerID, &row.Name, &row.Branch, &row.ColoringMode, &row.Payload,
			&row.ShareToken, &row.ShareReadOnly, &row.SharedAt, &row.CreatedAt, &row.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan saved graph: %w", err)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// Get returns one saved graph; only the owner can fetch their rows.
func (r *SavedGraphRepo) Get(ctx context.Context, ownerID, id uuid.UUID) (*models.SavedGraph, error) {
	const q = `
		SELECT id, owner_id, name, branch, coloring_mode, payload,
		       share_token, share_read_only, shared_at, created_at, updated_at
		  FROM lineage_saved_graphs
		 WHERE id = $1 AND owner_id = $2
	`
	row := r.pool.QueryRow(ctx, q, id, ownerID)
	out := &models.SavedGraph{}
	if err := row.Scan(
		&out.ID, &out.OwnerID, &out.Name, &out.Branch, &out.ColoringMode, &out.Payload,
		&out.ShareToken, &out.ShareReadOnly, &out.SharedAt, &out.CreatedAt, &out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSavedGraphNotFound
		}
		return nil, fmt.Errorf("get saved graph: %w", err)
	}
	return out, nil
}

// Update patches one or more fields of a saved graph. Fields left
// nil on the request body remain unchanged.
func (r *SavedGraphRepo) Update(ctx context.Context, ownerID, id uuid.UUID, in models.UpdateSavedGraphRequest) (*models.SavedGraph, error) {
	const q = `
		UPDATE lineage_saved_graphs
		   SET name          = COALESCE($3, name),
		       branch        = COALESCE($4, branch),
		       coloring_mode = COALESCE($5, coloring_mode),
		       payload       = COALESCE($6, payload),
		       updated_at    = NOW()
		 WHERE id = $1 AND owner_id = $2
		RETURNING id, owner_id, name, branch, coloring_mode, payload,
		          share_token, share_read_only, shared_at, created_at, updated_at
	`
	var (
		namePtr, branchPtr, coloringPtr *string
		payloadParam                    interface{}
	)
	if in.Name != nil {
		cleaned, err := SanitizeName(*in.Name)
		if err != nil {
			return nil, err
		}
		namePtr = &cleaned
	}
	if in.Branch != nil {
		cleaned := strings.TrimSpace(*in.Branch)
		if cleaned == "" {
			return nil, errors.New("branch cannot be empty")
		}
		branchPtr = &cleaned
	}
	if in.ColoringMode != nil {
		cleaned := strings.TrimSpace(*in.ColoringMode)
		if cleaned == "" {
			return nil, errors.New("coloring_mode cannot be empty")
		}
		coloringPtr = &cleaned
	}
	if in.Payload != nil {
		cleaned, err := SanitizePayload(*in.Payload)
		if err != nil {
			return nil, err
		}
		payloadParam = cleaned
	}

	row := r.pool.QueryRow(ctx, q, id, ownerID, namePtr, branchPtr, coloringPtr, payloadParam)
	out := &models.SavedGraph{}
	if err := row.Scan(
		&out.ID, &out.OwnerID, &out.Name, &out.Branch, &out.ColoringMode, &out.Payload,
		&out.ShareToken, &out.ShareReadOnly, &out.SharedAt, &out.CreatedAt, &out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSavedGraphNotFound
		}
		return nil, fmt.Errorf("update saved graph: %w", err)
	}
	return out, nil
}

// Delete removes a saved graph. Idempotent on the wire — missing
// rows surface as ErrSavedGraphNotFound so the handler can decide
// between 204 (delete-then-confirm) and 404 (explicit).
func (r *SavedGraphRepo) Delete(ctx context.Context, ownerID, id uuid.UUID) error {
	const q = `
		DELETE FROM lineage_saved_graphs
		 WHERE id = $1 AND owner_id = $2
	`
	cmd, err := r.pool.Exec(ctx, q, id, ownerID)
	if err != nil {
		return fmt.Errorf("delete saved graph: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return ErrSavedGraphNotFound
	}
	return nil
}

// Share mints (or refreshes) a share token. The 16-byte token is
// generated by MintShareToken; collisions are practically zero but
// the SQL still re-tries up to 3 times if the unique index rejects.
func (r *SavedGraphRepo) Share(ctx context.Context, ownerID, id uuid.UUID, readOnly bool) (*models.SavedGraph, error) {
	const q = `
		UPDATE lineage_saved_graphs
		   SET share_token     = $3,
		       share_read_only = $4,
		       shared_at       = NOW(),
		       updated_at      = NOW()
		 WHERE id = $1 AND owner_id = $2
		RETURNING id, owner_id, name, branch, coloring_mode, payload,
		          share_token, share_read_only, shared_at, created_at, updated_at
	`
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		token, err := MintShareToken()
		if err != nil {
			return nil, err
		}
		row := r.pool.QueryRow(ctx, q, id, ownerID, token, readOnly)
		out := &models.SavedGraph{}
		if err := row.Scan(
			&out.ID, &out.OwnerID, &out.Name, &out.Branch, &out.ColoringMode, &out.Payload,
			&out.ShareToken, &out.ShareReadOnly, &out.SharedAt, &out.CreatedAt, &out.UpdatedAt,
		); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrSavedGraphNotFound
			}
			lastErr = err
			continue
		}
		return out, nil
	}
	return nil, fmt.Errorf("share saved graph: %w", lastErr)
}

// RevokeShare nulls the share token and resets shared_at. Returns
// the updated row so the handler can confirm the new state.
func (r *SavedGraphRepo) RevokeShare(ctx context.Context, ownerID, id uuid.UUID) (*models.SavedGraph, error) {
	const q = `
		UPDATE lineage_saved_graphs
		   SET share_token = NULL,
		       shared_at   = NULL,
		       updated_at  = NOW()
		 WHERE id = $1 AND owner_id = $2
		RETURNING id, owner_id, name, branch, coloring_mode, payload,
		          share_token, share_read_only, shared_at, created_at, updated_at
	`
	row := r.pool.QueryRow(ctx, q, id, ownerID)
	out := &models.SavedGraph{}
	if err := row.Scan(
		&out.ID, &out.OwnerID, &out.Name, &out.Branch, &out.ColoringMode, &out.Payload,
		&out.ShareToken, &out.ShareReadOnly, &out.SharedAt, &out.CreatedAt, &out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSavedGraphNotFound
		}
		return nil, fmt.Errorf("revoke share: %w", err)
	}
	return out, nil
}

// GetByShareToken returns the saved graph reachable by an
// unauthenticated client holding the share token. Missing tokens
// surface as ErrSavedGraphNotFound to avoid leaking the difference
// between "no such token" and "no such graph".
func (r *SavedGraphRepo) GetByShareToken(ctx context.Context, token string) (*models.SavedGraph, error) {
	cleaned := strings.TrimSpace(token)
	if cleaned == "" {
		return nil, ErrSavedGraphNotFound
	}
	const q = `
		SELECT id, owner_id, name, branch, coloring_mode, payload,
		       share_token, share_read_only, shared_at, created_at, updated_at
		  FROM lineage_saved_graphs
		 WHERE share_token = $1
	`
	row := r.pool.QueryRow(ctx, q, cleaned)
	out := &models.SavedGraph{}
	if err := row.Scan(
		&out.ID, &out.OwnerID, &out.Name, &out.Branch, &out.ColoringMode, &out.Payload,
		&out.ShareToken, &out.ShareReadOnly, &out.SharedAt, &out.CreatedAt, &out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSavedGraphNotFound
		}
		return nil, fmt.Errorf("get saved graph by token: %w", err)
	}
	return out, nil
}

// SharedResponseFrom strips the OwnerID off a saved graph when we
// serve it to anyone holding the share token. We don't want to leak
// account identifiers to read-only viewers.
func SharedResponseFrom(g *models.SavedGraph) *models.SharedGraphResponse {
	if g == nil {
		return nil
	}
	shared := time.Time{}
	if g.SharedAt != nil {
		shared = *g.SharedAt
	}
	return &models.SharedGraphResponse{
		ID:           g.ID,
		Name:         g.Name,
		Branch:       g.Branch,
		ColoringMode: g.ColoringMode,
		Payload:      g.Payload,
		ReadOnly:     g.ShareReadOnly,
		SharedAt:     shared,
		UpdatedAt:    g.UpdatedAt,
	}
}
