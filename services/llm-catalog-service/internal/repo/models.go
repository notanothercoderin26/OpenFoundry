package repo

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/models"
)

// ErrModelNotFound is returned by Store.Get / SetEnabled when the rid
// does not match any row. Handlers map this to 404.
var ErrModelNotFound = errors.New("model not found")

// Store is the persistence interface the handlers consume. It is
// satisfied by *PgStore (pgx-backed, used in production) and by
// MemoryStore (in-process, used by unit tests).
type Store interface {
	Register(ctx context.Context, body models.RegisterModelRequest) (models.Model, error)
	List(ctx context.Context, providerFilter models.Provider, onlyEnabled bool) ([]models.Model, error)
	Get(ctx context.Context, rid uuid.UUID) (models.Model, error)
	SetEnabled(ctx context.Context, rid uuid.UUID, enabled bool) (models.Model, error)
}

// ---------------------------------------------------------------------------
// Postgres
// ---------------------------------------------------------------------------

// PgStore is the production pgx-backed Store.
type PgStore struct {
	Pool *pgxpool.Pool
}

const llmModelCols = `rid, provider, model_id, display_name, context_window,
                      input_cost_per_1k, output_cost_per_1k, capabilities,
                      enabled, created_at, updated_at`

type scanner interface{ Scan(...any) error }

func scanModel(s scanner) (models.Model, error) {
	var m models.Model
	var caps []string
	err := s.Scan(
		&m.RID, &m.Provider, &m.ModelID, &m.DisplayName, &m.ContextWindow,
		&m.InputCostPer1K, &m.OutputCostPer1K, &caps,
		&m.Enabled, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return models.Model{}, err
	}
	m.Capabilities = make([]models.Capability, len(caps))
	for i, c := range caps {
		m.Capabilities[i] = models.Capability(c)
	}
	return m, nil
}

func (r *PgStore) Register(ctx context.Context, body models.RegisterModelRequest) (models.Model, error) {
	caps := make([]string, len(body.Capabilities))
	for i, c := range body.Capabilities {
		caps[i] = string(c)
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO llm_models
            (rid, provider, model_id, display_name, context_window,
             input_cost_per_1k, output_cost_per_1k, capabilities, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING `+llmModelCols,
		uuid.New(), string(body.Provider), body.ModelID, body.DisplayName,
		body.ContextWindow, body.InputCostPer1K, body.OutputCostPer1K,
		caps, enabled,
	)
	return scanModel(row)
}

func (r *PgStore) List(ctx context.Context, providerFilter models.Provider, onlyEnabled bool) ([]models.Model, error) {
	var (
		args []any
		conds []string
	)
	if providerFilter != "" {
		args = append(args, string(providerFilter))
		conds = append(conds, fmt.Sprintf("provider = $%d", len(args)))
	}
	if onlyEnabled {
		conds = append(conds, "enabled = TRUE")
	}
	q := "SELECT " + llmModelCols + " FROM llm_models"
	if len(conds) > 0 {
		q += " WHERE " + strings.Join(conds, " AND ")
	}
	q += " ORDER BY created_at DESC"

	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.Model, 0)
	for rows.Next() {
		m, err := scanModel(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *PgStore) Get(ctx context.Context, rid uuid.UUID) (models.Model, error) {
	row := r.Pool.QueryRow(ctx,
		"SELECT "+llmModelCols+" FROM llm_models WHERE rid = $1", rid)
	m, err := scanModel(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Model{}, ErrModelNotFound
	}
	return m, err
}

func (r *PgStore) SetEnabled(ctx context.Context, rid uuid.UUID, enabled bool) (models.Model, error) {
	row := r.Pool.QueryRow(ctx,
		`UPDATE llm_models
            SET enabled = $2, updated_at = now()
          WHERE rid = $1
          RETURNING `+llmModelCols,
		rid, enabled,
	)
	m, err := scanModel(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Model{}, ErrModelNotFound
	}
	return m, err
}

// ---------------------------------------------------------------------------
// In-memory store (tests + local dev without a database)
// ---------------------------------------------------------------------------

// MemoryStore satisfies Store using an in-process map. Safe for
// concurrent use. Intended for unit tests; main.go uses PgStore.
type MemoryStore struct {
	mu     sync.RWMutex
	models map[uuid.UUID]models.Model
}

// NewMemoryStore returns an empty MemoryStore ready for use.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{models: map[uuid.UUID]models.Model{}}
}

func (s *MemoryStore) Register(_ context.Context, body models.RegisterModelRequest) (models.Model, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, m := range s.models {
		if m.Provider == body.Provider && m.ModelID == body.ModelID {
			return models.Model{}, fmt.Errorf("model %s/%s already registered", body.Provider, body.ModelID)
		}
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	now := time.Now().UTC()
	m := models.Model{
		RID:             uuid.New(),
		Provider:        body.Provider,
		ModelID:         body.ModelID,
		DisplayName:     body.DisplayName,
		ContextWindow:   body.ContextWindow,
		InputCostPer1K:  body.InputCostPer1K,
		OutputCostPer1K: body.OutputCostPer1K,
		Capabilities:    append([]models.Capability(nil), body.Capabilities...),
		Enabled:         enabled,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	s.models[m.RID] = m
	return m, nil
}

func (s *MemoryStore) List(_ context.Context, providerFilter models.Provider, onlyEnabled bool) ([]models.Model, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.Model, 0, len(s.models))
	for _, m := range s.models {
		if providerFilter != "" && m.Provider != providerFilter {
			continue
		}
		if onlyEnabled && !m.Enabled {
			continue
		}
		out = append(out, m)
	}
	return out, nil
}

func (s *MemoryStore) Get(_ context.Context, rid uuid.UUID) (models.Model, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m, ok := s.models[rid]
	if !ok {
		return models.Model{}, ErrModelNotFound
	}
	return m, nil
}

func (s *MemoryStore) SetEnabled(_ context.Context, rid uuid.UUID, enabled bool) (models.Model, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, ok := s.models[rid]
	if !ok {
		return models.Model{}, ErrModelNotFound
	}
	m.Enabled = enabled
	m.UpdatedAt = time.Now().UTC()
	s.models[rid] = m
	return m, nil
}

var _ Store = (*PgStore)(nil)
var _ Store = (*MemoryStore)(nil)
