// Package repo holds the deployment lifecycle storage surface for
// model-deployment-service: the DeploymentRepository contract, the
// pgx-backed implementation, and embedded SQL migrations.
package repo

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/models"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Sentinel errors mapped to HTTP status codes in the handler layer.
var (
	ErrNotFound  = errors.New("deployment not found")
	ErrConflict  = errors.New("deployment conflict")
	ErrValidation = errors.New("deployment validation failed")
)

// DeploymentRepository is the storage contract for the lifecycle CRUD
// surface. Implementations: PGDeploymentRepository (pgx) and
// MemoryDeploymentRepository (tests).
type DeploymentRepository interface {
	Create(ctx context.Context, d models.Deployment) (models.Deployment, error)
	GetByID(ctx context.Context, id uuid.UUID) (models.Deployment, error)
	List(ctx context.Context, filter models.ListFilter) ([]models.Deployment, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status models.DeploymentStatus) (models.Deployment, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

// Migrate applies every embedded SQL migration in lex order. Idempotent.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		body, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := pool.Exec(ctx, string(body)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
	}
	return nil
}

// DB is the pgx subset used by PGDeploymentRepository so tests can swap
// in a mock pool.
type DB interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// PGDeploymentRepository is the Postgres-backed DeploymentRepository.
type PGDeploymentRepository struct {
	Pool DB
}

const deploymentColumns = `id, model_id, version, status, endpoint_url, owner_user_id, created_at, updated_at`

func (r *PGDeploymentRepository) Create(ctx context.Context, d models.Deployment) (models.Deployment, error) {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	if d.Status == "" {
		d.Status = models.DeploymentStatusPending
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO model_lifecycle_deployments
		    (id, model_id, version, status, endpoint_url, owner_user_id)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING `+deploymentColumns,
		d.ID, d.ModelID, d.Version, string(d.Status), d.EndpointURL, d.OwnerUserID,
	)
	out, err := scanDeployment(row)
	if isUniqueViolation(err) {
		return models.Deployment{}, ErrConflict
	}
	if err != nil {
		return models.Deployment{}, err
	}
	return out, nil
}

func (r *PGDeploymentRepository) GetByID(ctx context.Context, id uuid.UUID) (models.Deployment, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT `+deploymentColumns+` FROM model_lifecycle_deployments WHERE id = $1`,
		id,
	)
	d, err := scanDeployment(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Deployment{}, ErrNotFound
	}
	return d, err
}

func (r *PGDeploymentRepository) List(ctx context.Context, filter models.ListFilter) ([]models.Deployment, error) {
	clauses := make([]string, 0, 2)
	args := make([]any, 0, 2)
	if filter.Status != "" {
		args = append(args, string(filter.Status))
		clauses = append(clauses, fmt.Sprintf("status = $%d", len(args)))
	}
	if filter.OwnerUserID != nil {
		args = append(args, *filter.OwnerUserID)
		clauses = append(clauses, fmt.Sprintf("owner_user_id = $%d", len(args)))
	}
	query := `SELECT ` + deploymentColumns + ` FROM model_lifecycle_deployments`
	if len(clauses) > 0 {
		query += " WHERE " + strings.Join(clauses, " AND ")
	}
	query += " ORDER BY created_at DESC, id"
	rows, err := r.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.Deployment, 0)
	for rows.Next() {
		d, err := scanDeployment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *PGDeploymentRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status models.DeploymentStatus) (models.Deployment, error) {
	row := r.Pool.QueryRow(ctx,
		`UPDATE model_lifecycle_deployments
		    SET status = $2, updated_at = NOW()
		  WHERE id = $1
		  RETURNING `+deploymentColumns,
		id, string(status),
	)
	d, err := scanDeployment(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Deployment{}, ErrNotFound
	}
	return d, err
}

func (r *PGDeploymentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.Pool.Exec(ctx, `DELETE FROM model_lifecycle_deployments WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

type rowLike interface{ Scan(...any) error }

func scanDeployment(r rowLike) (models.Deployment, error) {
	var (
		d         models.Deployment
		statusStr string
		createdAt time.Time
		updatedAt time.Time
	)
	if err := r.Scan(
		&d.ID, &d.ModelID, &d.Version, &statusStr, &d.EndpointURL,
		&d.OwnerUserID, &createdAt, &updatedAt,
	); err != nil {
		return models.Deployment{}, err
	}
	d.Status = models.DeploymentStatus(statusStr)
	d.CreatedAt = createdAt.UTC()
	d.UpdatedAt = updatedAt.UTC()
	return d, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
