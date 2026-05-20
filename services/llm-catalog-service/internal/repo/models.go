package repo

import (
	"context"
	"encoding/json"
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

// ListFilter narrows GET /models. Zero-valued fields are "don't care".
type ListFilter struct {
	Provider    models.Provider
	Capability  models.Capability
	Feature     string
	OnlyEnabled bool
}

// Store is the persistence interface the handlers consume. It is
// satisfied by *PgStore (pgx-backed, used in production) and by
// MemoryStore (in-process, used by unit tests).
type Store interface {
	Register(ctx context.Context, body models.RegisterModelRequest) (models.Model, error)
	List(ctx context.Context, filter ListFilter) ([]models.Model, error)
	Get(ctx context.Context, rid uuid.UUID) (models.Model, error)
	Update(ctx context.Context, rid uuid.UUID, body models.UpdateModelRequest) (models.Model, error)
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
                      quotas, enabled_for_features,
                      enabled, created_at, updated_at`

type scanner interface{ Scan(...any) error }

func scanModel(s scanner) (models.Model, error) {
	var m models.Model
	var caps []string
	var quotasRaw []byte
	var features []string
	err := s.Scan(
		&m.RID, &m.Provider, &m.ModelID, &m.DisplayName, &m.ContextWindow,
		&m.InputCostPer1K, &m.OutputCostPer1K, &caps,
		&quotasRaw, &features,
		&m.Enabled, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return models.Model{}, err
	}
	m.Capabilities = make([]models.Capability, len(caps))
	for i, c := range caps {
		m.Capabilities[i] = models.Capability(c)
	}
	if len(quotasRaw) > 0 {
		// Empty JSONB ('{}') round-trips to a zero-valued Quotas — no
		// special-casing needed; json.Unmarshal handles it.
		if err := json.Unmarshal(quotasRaw, &m.Quotas); err != nil {
			return models.Model{}, fmt.Errorf("decode quotas: %w", err)
		}
	}
	m.EnabledForFeatures = append([]string(nil), features...)
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
	quotas := models.Quotas{}
	if body.Quotas != nil {
		quotas = *body.Quotas
	}
	quotasJSON, err := json.Marshal(quotas)
	if err != nil {
		return models.Model{}, fmt.Errorf("encode quotas: %w", err)
	}
	features := append([]string(nil), body.EnabledForFeatures...)
	if features == nil {
		features = []string{}
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO llm_models
            (rid, provider, model_id, display_name, context_window,
             input_cost_per_1k, output_cost_per_1k, capabilities,
             quotas, enabled_for_features, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING `+llmModelCols,
		uuid.New(), string(body.Provider), body.ModelID, body.DisplayName,
		body.ContextWindow, body.InputCostPer1K, body.OutputCostPer1K,
		caps, quotasJSON, features, enabled,
	)
	return scanModel(row)
}

func (r *PgStore) List(ctx context.Context, filter ListFilter) ([]models.Model, error) {
	var (
		args  []any
		conds []string
	)
	if filter.Provider != "" {
		args = append(args, string(filter.Provider))
		conds = append(conds, fmt.Sprintf("provider = $%d", len(args)))
	}
	if filter.Capability != "" {
		args = append(args, string(filter.Capability))
		conds = append(conds, fmt.Sprintf("$%d = ANY(capabilities)", len(args)))
	}
	if filter.Feature != "" {
		args = append(args, filter.Feature)
		conds = append(conds, fmt.Sprintf("$%d = ANY(enabled_for_features)", len(args)))
	}
	if filter.OnlyEnabled {
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

func (r *PgStore) Update(ctx context.Context, rid uuid.UUID, body models.UpdateModelRequest) (models.Model, error) {
	// Dynamic SET list — only fields the caller supplied are touched.
	var (
		sets []string
		args []any
	)
	addSet := func(col string, val any) {
		args = append(args, val)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	if body.DisplayName != nil {
		addSet("display_name", *body.DisplayName)
	}
	if body.ContextWindow != nil {
		addSet("context_window", *body.ContextWindow)
	}
	if body.InputCostPer1K != nil {
		addSet("input_cost_per_1k", *body.InputCostPer1K)
	}
	if body.OutputCostPer1K != nil {
		addSet("output_cost_per_1k", *body.OutputCostPer1K)
	}
	if body.Capabilities != nil {
		caps := make([]string, len(body.Capabilities))
		for i, c := range body.Capabilities {
			caps[i] = string(c)
		}
		addSet("capabilities", caps)
	}
	if body.Quotas != nil {
		quotasJSON, err := json.Marshal(*body.Quotas)
		if err != nil {
			return models.Model{}, fmt.Errorf("encode quotas: %w", err)
		}
		addSet("quotas", quotasJSON)
	}
	if body.EnabledForFeatures != nil {
		addSet("enabled_for_features", append([]string(nil), body.EnabledForFeatures...))
	}
	if body.Enabled != nil {
		addSet("enabled", *body.Enabled)
	}
	if len(sets) == 0 {
		// Empty PATCH — return the row as-is so callers see the
		// current state without an extra round-trip.
		return r.Get(ctx, rid)
	}
	sets = append(sets, "updated_at = now()")
	args = append(args, rid)
	row := r.Pool.QueryRow(ctx,
		`UPDATE llm_models SET `+strings.Join(sets, ", ")+
			` WHERE rid = $`+fmt.Sprintf("%d", len(args))+
			` RETURNING `+llmModelCols,
		args...)
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
	quotas := models.Quotas{}
	if body.Quotas != nil {
		quotas = *body.Quotas
	}
	features := append([]string(nil), body.EnabledForFeatures...)
	if features == nil {
		features = []string{}
	}
	m := models.Model{
		RID:                uuid.New(),
		Provider:           body.Provider,
		ModelID:            body.ModelID,
		DisplayName:        body.DisplayName,
		ContextWindow:      body.ContextWindow,
		InputCostPer1K:     body.InputCostPer1K,
		OutputCostPer1K:    body.OutputCostPer1K,
		Capabilities:       append([]models.Capability(nil), body.Capabilities...),
		Quotas:             quotas,
		EnabledForFeatures: features,
		Enabled:            enabled,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	s.models[m.RID] = m
	return m, nil
}

func (s *MemoryStore) List(_ context.Context, filter ListFilter) ([]models.Model, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.Model, 0, len(s.models))
	for _, m := range s.models {
		if filter.Provider != "" && m.Provider != filter.Provider {
			continue
		}
		if filter.Capability != "" && !containsCapability(m.Capabilities, filter.Capability) {
			continue
		}
		if filter.Feature != "" && !containsString(m.EnabledForFeatures, filter.Feature) {
			continue
		}
		if filter.OnlyEnabled && !m.Enabled {
			continue
		}
		out = append(out, m)
	}
	return out, nil
}

func containsCapability(haystack []models.Capability, needle models.Capability) bool {
	for _, c := range haystack {
		if c == needle {
			return true
		}
	}
	return false
}

func containsString(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
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

func (s *MemoryStore) Update(_ context.Context, rid uuid.UUID, body models.UpdateModelRequest) (models.Model, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, ok := s.models[rid]
	if !ok {
		return models.Model{}, ErrModelNotFound
	}
	if body.DisplayName != nil {
		m.DisplayName = *body.DisplayName
	}
	if body.ContextWindow != nil {
		m.ContextWindow = *body.ContextWindow
	}
	if body.InputCostPer1K != nil {
		m.InputCostPer1K = *body.InputCostPer1K
	}
	if body.OutputCostPer1K != nil {
		m.OutputCostPer1K = *body.OutputCostPer1K
	}
	if body.Capabilities != nil {
		m.Capabilities = append([]models.Capability(nil), body.Capabilities...)
	}
	if body.Quotas != nil {
		m.Quotas = *body.Quotas
	}
	if body.EnabledForFeatures != nil {
		m.EnabledForFeatures = append([]string(nil), body.EnabledForFeatures...)
	}
	if body.Enabled != nil {
		m.Enabled = *body.Enabled
	}
	m.UpdatedAt = time.Now().UTC()
	s.models[rid] = m
	return m, nil
}

var _ Store = (*PgStore)(nil)
var _ Store = (*MemoryStore)(nil)
