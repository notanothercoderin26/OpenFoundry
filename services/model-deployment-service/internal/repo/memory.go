package repo

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/models"
)

// MemoryDeploymentRepository is an in-process DeploymentRepository used
// by handler tests. Safe for concurrent use.
type MemoryDeploymentRepository struct {
	mu    sync.Mutex
	items map[uuid.UUID]models.Deployment
	now   func() time.Time
}

// NewMemoryDeploymentRepository builds an empty in-memory repo. now is
// used for created_at / updated_at; nil falls back to time.Now().UTC().
func NewMemoryDeploymentRepository(now func() time.Time) *MemoryDeploymentRepository {
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &MemoryDeploymentRepository{
		items: make(map[uuid.UUID]models.Deployment),
		now:   now,
	}
}

func (r *MemoryDeploymentRepository) Create(_ context.Context, d models.Deployment) (models.Deployment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	if _, exists := r.items[d.ID]; exists {
		return models.Deployment{}, ErrConflict
	}
	if d.Status == "" {
		d.Status = models.DeploymentStatusPending
	}
	now := r.now()
	d.CreatedAt = now
	d.UpdatedAt = now
	r.items[d.ID] = d
	return d, nil
}

func (r *MemoryDeploymentRepository) GetByID(_ context.Context, id uuid.UUID) (models.Deployment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	d, ok := r.items[id]
	if !ok {
		return models.Deployment{}, ErrNotFound
	}
	return d, nil
}

func (r *MemoryDeploymentRepository) List(_ context.Context, filter models.ListFilter) ([]models.Deployment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]models.Deployment, 0, len(r.items))
	for _, d := range r.items {
		if filter.Status != "" && d.Status != filter.Status {
			continue
		}
		if filter.OwnerUserID != nil && d.OwnerUserID != *filter.OwnerUserID {
			continue
		}
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].ID.String() < out[j].ID.String()
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out, nil
}

func (r *MemoryDeploymentRepository) UpdateStatus(_ context.Context, id uuid.UUID, status models.DeploymentStatus) (models.Deployment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	d, ok := r.items[id]
	if !ok {
		return models.Deployment{}, ErrNotFound
	}
	d.Status = status
	d.UpdatedAt = r.now()
	r.items[id] = d
	return d, nil
}

func (r *MemoryDeploymentRepository) Delete(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.items[id]; !ok {
		return ErrNotFound
	}
	delete(r.items, id)
	return nil
}
