package products

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/models"
)

// memoryRepo is an in-memory Repository implementation used by the
// handler tests. It mirrors the behavioural contract of the PGX repo:
// idempotent UpsertInstallationStart, monotonic UpdateAt timestamps,
// and the (product_rid, version) unique constraint on versions.
type memoryRepo struct {
	mu            sync.Mutex
	products      map[string]models.Product
	versions      map[string][]models.ProductVersion // by product rid
	installations map[string]models.Installation
}

func newMemoryRepo() *memoryRepo {
	return &memoryRepo{
		products:      map[string]models.Product{},
		versions:      map[string][]models.ProductVersion{},
		installations: map[string]models.Installation{},
	}
}

func (m *memoryRepo) CreateProduct(_ context.Context, p models.Product) (*models.Product, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.products[p.RID]; exists {
		return nil, errors.New("product already exists")
	}
	if p.Resources == nil {
		p.Resources = []models.ProductResource{}
	}
	if p.Status == "" {
		p.Status = models.ProductStatusDraft
	}
	now := time.Now().UTC()
	p.CreatedAt = now
	p.UpdatedAt = now
	m.products[p.RID] = p
	return cloneProduct(p), nil
}

func (m *memoryRepo) GetProduct(_ context.Context, rid string) (*models.Product, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.products[rid]
	if !ok {
		return nil, ErrProductNotFound
	}
	return cloneProduct(p), nil
}

func (m *memoryRepo) ListProducts(_ context.Context, limit, offset int, status string) ([]models.Product, int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	items := []models.Product{}
	for _, p := range m.products {
		if status != "" && string(p.Status) != status {
			continue
		}
		items = append(items, *cloneProduct(p))
	}
	sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt.After(items[j].UpdatedAt) })
	total := len(items)
	if offset >= total {
		return []models.Product{}, total, nil
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return items[offset:end], total, nil
}

func (m *memoryRepo) UpdateProductPublishedSnapshot(_ context.Context, rid, version, manifestURL, signature string) (*models.Product, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.products[rid]
	if !ok {
		return nil, ErrProductNotFound
	}
	p.Status = models.ProductStatusPublished
	p.Version = version
	p.ManifestURL = manifestURL
	p.Signature = signature
	p.UpdatedAt = time.Now().UTC()
	m.products[rid] = p
	return cloneProduct(p), nil
}

func (m *memoryRepo) CreateVersion(_ context.Context, v models.ProductVersion) (*models.ProductVersion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, existing := range m.versions[v.ProductRID] {
		if existing.Version == v.Version {
			return nil, errors.New("version already exists for product")
		}
	}
	if v.PublishedAt.IsZero() {
		v.PublishedAt = time.Now().UTC()
	}
	if len(v.Manifest) == 0 {
		v.Manifest = json.RawMessage(`{}`)
	}
	m.versions[v.ProductRID] = append(m.versions[v.ProductRID], v)
	cloned := v
	return &cloned, nil
}

func (m *memoryRepo) GetVersion(_ context.Context, productRID, version string) (*models.ProductVersion, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, v := range m.versions[productRID] {
		if v.Version == version {
			cloned := v
			return &cloned, nil
		}
	}
	return nil, ErrProductVersionNotFound
}

func (m *memoryRepo) UpsertInstallationStart(_ context.Context, ins models.Installation) (*models.Installation, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, existing := range m.installations {
		if existing.ProductRID == ins.ProductRID && existing.Version == ins.Version && existing.TargetWorkspaceRID == ins.TargetWorkspaceRID {
			cloned := existing
			return &cloned, true, nil
		}
	}
	if ins.ResourceMappings == nil {
		ins.ResourceMappings = []models.ResourceMapping{}
	}
	now := time.Now().UTC()
	ins.InstalledAt = now
	ins.UpdatedAt = now
	m.installations[ins.RID] = ins
	cloned := ins
	return &cloned, false, nil
}

func (m *memoryRepo) CompleteInstallation(_ context.Context, rid string, status models.InstallationStatus, mappings []models.ResourceMapping, failureReason string) (*models.Installation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ins, ok := m.installations[rid]
	if !ok {
		return nil, ErrInstallationNotFound
	}
	ins.Status = status
	if mappings == nil {
		mappings = []models.ResourceMapping{}
	}
	ins.ResourceMappings = mappings
	ins.FailureReason = failureReason
	ins.UpdatedAt = time.Now().UTC()
	m.installations[rid] = ins
	cloned := ins
	return &cloned, nil
}

func (m *memoryRepo) GetInstallation(_ context.Context, rid string) (*models.Installation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ins, ok := m.installations[rid]
	if !ok {
		return nil, ErrInstallationNotFound
	}
	cloned := ins
	return &cloned, nil
}

func (m *memoryRepo) GetInstallationByKey(_ context.Context, productRID, version, targetWorkspaceRID string) (*models.Installation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, ins := range m.installations {
		if ins.ProductRID == productRID && ins.Version == version && ins.TargetWorkspaceRID == targetWorkspaceRID {
			cloned := ins
			return &cloned, nil
		}
	}
	return nil, ErrInstallationNotFound
}

func (m *memoryRepo) ListInstallations(_ context.Context, limit, offset int, targetWorkspaceRID, productRID string) ([]models.Installation, int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	items := []models.Installation{}
	for _, ins := range m.installations {
		if targetWorkspaceRID != "" && ins.TargetWorkspaceRID != targetWorkspaceRID {
			continue
		}
		if productRID != "" && ins.ProductRID != productRID {
			continue
		}
		items = append(items, ins)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].InstalledAt.After(items[j].InstalledAt) })
	total := len(items)
	if offset >= total {
		return []models.Installation{}, total, nil
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return items[offset:end], total, nil
}

func cloneProduct(p models.Product) *models.Product {
	resources := make([]models.ProductResource, len(p.Resources))
	copy(resources, p.Resources)
	p.Resources = resources
	return &p
}
