// Persistence for the Data Lineage "Add description" Properties
// helper. The frontend used to wrap this in a `window.prompt` no-op
// notification because the lineage service didn't store node-level
// descriptions; this layer makes the description survive sessions
// and become queryable.

package lineage

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/models"
)

// ErrNodeDescriptionNotFound signals a missing description for the
// requested node id. Handlers translate this to HTTP 404.
var ErrNodeDescriptionNotFound = errors.New("node description not found")

// MaxNodeDescriptionLen caps the body length so the table stays
// bounded. Generous (5 KiB) but well under TOAST thresholds, which
// keeps reads fast even for noisy editors.
const MaxNodeDescriptionLen = 5_000

// SanitizeDescription trims surrounding whitespace and enforces the
// upper bound. Returns "" (and no error) for empty bodies so the
// handler can interpret that as a delete request.
func SanitizeDescription(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}
	if len(trimmed) > MaxNodeDescriptionLen {
		return "", fmt.Errorf("description longer than %d characters", MaxNodeDescriptionLen)
	}
	return trimmed, nil
}

// NodeDescriptionRepo wraps the pgx pool with typed get/upsert/delete
// helpers for `lineage_node_descriptions`.
type NodeDescriptionRepo struct {
	pool *pgxpool.Pool
}

// NewNodeDescriptionRepo constructs a repo around an existing pool.
func NewNodeDescriptionRepo(pool *pgxpool.Pool) *NodeDescriptionRepo {
	return &NodeDescriptionRepo{pool: pool}
}

// Get returns the persisted description for the node or
// ErrNodeDescriptionNotFound when no row exists.
func (r *NodeDescriptionRepo) Get(ctx context.Context, nodeID uuid.UUID) (*models.NodeDescription, error) {
	const q = `
		SELECT node_id, description, updated_by, updated_at
		  FROM lineage_node_descriptions
		 WHERE node_id = $1
	`
	row := r.pool.QueryRow(ctx, q, nodeID)
	out := &models.NodeDescription{}
	if err := row.Scan(&out.NodeID, &out.Description, &out.UpdatedBy, &out.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNodeDescriptionNotFound
		}
		return nil, fmt.Errorf("get node description: %w", err)
	}
	return out, nil
}

// Upsert overwrites the description row for the node. The most recent
// writer wins; we record the editor in `updated_by`.
func (r *NodeDescriptionRepo) Upsert(ctx context.Context, nodeID, ownerID uuid.UUID, description string) (*models.NodeDescription, error) {
	cleaned, err := SanitizeDescription(description)
	if err != nil {
		return nil, err
	}
	if cleaned == "" {
		// Empty body → delete. Surface the same error if the row is
		// missing so the handler can decide between 204 and 404.
		if err := r.Delete(ctx, nodeID); err != nil {
			return nil, err
		}
		return nil, ErrNodeDescriptionNotFound
	}
	const q = `
		INSERT INTO lineage_node_descriptions (node_id, description, updated_by)
		VALUES ($1, $2, $3)
		ON CONFLICT (node_id)
		    DO UPDATE SET description = EXCLUDED.description,
		                  updated_by  = EXCLUDED.updated_by,
		                  updated_at  = NOW()
		RETURNING node_id, description, updated_by, updated_at
	`
	row := r.pool.QueryRow(ctx, q, nodeID, cleaned, ownerID)
	out := &models.NodeDescription{}
	if err := row.Scan(&out.NodeID, &out.Description, &out.UpdatedBy, &out.UpdatedAt); err != nil {
		return nil, fmt.Errorf("upsert node description: %w", err)
	}
	return out, nil
}

// Delete removes the description row for the node. Returns
// ErrNodeDescriptionNotFound when no row was deleted so the handler
// can decide between 204 (already-clear) and 404 (explicit miss).
func (r *NodeDescriptionRepo) Delete(ctx context.Context, nodeID uuid.UUID) error {
	const q = `
		DELETE FROM lineage_node_descriptions
		 WHERE node_id = $1
	`
	cmd, err := r.pool.Exec(ctx, q, nodeID)
	if err != nil {
		return fmt.Errorf("delete node description: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return ErrNodeDescriptionNotFound
	}
	return nil
}
