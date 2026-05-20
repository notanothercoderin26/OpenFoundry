package postgres

import (
	"context"
	"fmt"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

// ListComputeProfiles returns the seeded compute profile catalog ordered
// from cheapest to largest. The default profile is bubbled to the top.
func (r *Repository) ListComputeProfiles(ctx context.Context) ([]models.ComputeProfile, error) {
	rows, err := r.db.Query(ctx, `
		SELECT slug, display_name, description, executor_cores, executor_memory_gb, is_default, created_at
		FROM compute_profiles
		ORDER BY is_default DESC, executor_cores ASC, executor_memory_gb ASC, slug ASC`)
	if err != nil {
		return nil, fmt.Errorf("list compute profiles: %w", err)
	}
	defer rows.Close()
	out := make([]models.ComputeProfile, 0)
	for rows.Next() {
		var p models.ComputeProfile
		if err := rows.Scan(&p.Slug, &p.DisplayName, &p.Description, &p.ExecutorCores, &p.ExecutorMemoryGB, &p.IsDefault, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan compute profile: %w", err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate compute profiles: %w", err)
	}
	return out, nil
}

// ComputeProfileExists returns true when the slug references a known
// compute profile row. Used to validate UpdatePipeline payloads before
// writing pipelines.compute_profile_id.
func (r *Repository) ComputeProfileExists(ctx context.Context, slug string) (bool, error) {
	if slug == "" {
		return false, nil
	}
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM compute_profiles WHERE slug = $1)`, slug).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("compute profile exists: %w", err)
	}
	return exists, nil
}
