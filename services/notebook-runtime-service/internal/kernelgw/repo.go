package kernelgw

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Mapping is one row of `notebook_kernels`.
type Mapping struct {
	SessionID       uuid.UUID
	NotebookID      uuid.UUID
	GatewayKernelID string
	KernelSpec      string
	StartedBy       uuid.UUID
	CreatedAt       time.Time
	LastActivity    time.Time
}

// MappingRepo persists session ↔ upstream-kernel mappings.
type MappingRepo interface {
	Insert(ctx context.Context, m Mapping) error
	GetBySession(ctx context.Context, sessionID uuid.UUID) (Mapping, error)
	Touch(ctx context.Context, sessionID uuid.UUID, at time.Time) error
	DeleteBySession(ctx context.Context, sessionID uuid.UUID) error
	ListIdleBefore(ctx context.Context, cutoff time.Time) ([]Mapping, error)
}

// ErrMappingNotFound is returned when GetBySession finds no row.
var ErrMappingNotFound = errors.New("kernelgw: mapping not found")

// PostgresMappingRepo is the production MappingRepo.
type PostgresMappingRepo struct{ Pool *pgxpool.Pool }

func (r PostgresMappingRepo) Insert(ctx context.Context, m Mapping) error {
	_, err := r.Pool.Exec(ctx,
		`INSERT INTO notebook_kernels
		   (session_id, notebook_id, gateway_kernel_id, kernel_spec, started_by, created_at, last_activity)
		 VALUES ($1, $2, $3, $4, $5, $6, $6)`,
		m.SessionID, m.NotebookID, m.GatewayKernelID, m.KernelSpec, m.StartedBy, m.CreatedAt.UTC())
	return err
}

func (r PostgresMappingRepo) GetBySession(ctx context.Context, sessionID uuid.UUID) (Mapping, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT session_id, notebook_id, gateway_kernel_id, kernel_spec,
		        started_by, created_at, last_activity
		   FROM notebook_kernels WHERE session_id = $1`, sessionID)
	var m Mapping
	if err := row.Scan(&m.SessionID, &m.NotebookID, &m.GatewayKernelID, &m.KernelSpec,
		&m.StartedBy, &m.CreatedAt, &m.LastActivity); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Mapping{}, ErrMappingNotFound
		}
		return Mapping{}, err
	}
	return m, nil
}

func (r PostgresMappingRepo) Touch(ctx context.Context, sessionID uuid.UUID, at time.Time) error {
	_, err := r.Pool.Exec(ctx,
		`UPDATE notebook_kernels SET last_activity = $2 WHERE session_id = $1`,
		sessionID, at.UTC())
	return err
}

func (r PostgresMappingRepo) DeleteBySession(ctx context.Context, sessionID uuid.UUID) error {
	_, err := r.Pool.Exec(ctx,
		`DELETE FROM notebook_kernels WHERE session_id = $1`, sessionID)
	return err
}

func (r PostgresMappingRepo) ListIdleBefore(ctx context.Context, cutoff time.Time) ([]Mapping, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT session_id, notebook_id, gateway_kernel_id, kernel_spec,
		        started_by, created_at, last_activity
		   FROM notebook_kernels WHERE last_activity < $1`, cutoff.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Mapping
	for rows.Next() {
		var m Mapping
		if err := rows.Scan(&m.SessionID, &m.NotebookID, &m.GatewayKernelID, &m.KernelSpec,
			&m.StartedBy, &m.CreatedAt, &m.LastActivity); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
