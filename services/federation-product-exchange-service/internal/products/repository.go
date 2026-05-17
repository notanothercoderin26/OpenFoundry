package products

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/models"
)

var (
	// ErrProductNotFound is returned when no marketplace_products row
	// matches the requested rid.
	ErrProductNotFound = errors.New("marketplace product not found")
	// ErrProductVersionNotFound is returned when no
	// marketplace_product_versions row matches.
	ErrProductVersionNotFound = errors.New("marketplace product version not found")
	// ErrInstallationConflict is returned when an installation for the
	// (product_rid, version, target_workspace_rid) triple already
	// exists in a non-failed terminal status. The publish/install path
	// translates this into a 409.
	ErrInstallationConflict = errors.New("marketplace product installation already exists")
	// ErrInstallationNotFound is returned when no installation row
	// matches the requested rid.
	ErrInstallationNotFound = errors.New("marketplace product installation not found")
)

// Repository is the persistence seam for the Products domain. The Pgx
// implementation is in this file; in-memory implementations live next
// to the tests.
type Repository interface {
	CreateProduct(ctx context.Context, p models.Product) (*models.Product, error)
	GetProduct(ctx context.Context, rid string) (*models.Product, error)
	ListProducts(ctx context.Context, limit, offset int, status string) ([]models.Product, int, error)
	UpdateProductPublishedSnapshot(ctx context.Context, rid, version, manifestURL, signature string) (*models.Product, error)

	CreateVersion(ctx context.Context, v models.ProductVersion) (*models.ProductVersion, error)
	GetVersion(ctx context.Context, productRID, version string) (*models.ProductVersion, error)

	UpsertInstallationStart(ctx context.Context, ins models.Installation) (*models.Installation, bool, error)
	CompleteInstallation(ctx context.Context, rid string, status models.InstallationStatus, mappings []models.ResourceMapping, failureReason string) (*models.Installation, error)
	GetInstallation(ctx context.Context, rid string) (*models.Installation, error)
	GetInstallationByKey(ctx context.Context, productRID, version, targetWorkspaceRID string) (*models.Installation, error)
	ListInstallations(ctx context.Context, limit, offset int, targetWorkspaceRID, productRID string) ([]models.Installation, int, error)
}

// PGXRepository persists products + versions + installations in
// Postgres using the existing pgx pool.
type PGXRepository struct{ Pool *pgxpool.Pool }

// NewPGXRepository builds a repository bound to pool.
func NewPGXRepository(pool *pgxpool.Pool) *PGXRepository { return &PGXRepository{Pool: pool} }

// CreateProduct inserts a DRAFT product row.
func (r *PGXRepository) CreateProduct(ctx context.Context, p models.Product) (*models.Product, error) {
	resources, err := json.Marshal(p.Resources)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if p.Status == "" {
		p.Status = models.ProductStatusDraft
	}
	row := r.Pool.QueryRow(ctx, `
INSERT INTO marketplace_products (rid, name, description, author, status, resources, latest_version, manifest_url, signature, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, '', '', '', $7, $7)
RETURNING rid, name, description, author, status, resources, latest_version, manifest_url, signature, created_at, updated_at`,
		p.RID, p.Name, p.Description, p.Author, string(p.Status), resources, now,
	)
	return scanProduct(row)
}

// GetProduct loads a product row by rid.
func (r *PGXRepository) GetProduct(ctx context.Context, rid string) (*models.Product, error) {
	row := r.Pool.QueryRow(ctx, `
SELECT rid, name, description, author, status, resources, latest_version, manifest_url, signature, created_at, updated_at
FROM marketplace_products
WHERE rid = $1`, rid)
	p, err := scanProduct(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProductNotFound
		}
		return nil, err
	}
	return p, nil
}

// ListProducts pages through products ordered by updated_at DESC.
func (r *PGXRepository) ListProducts(ctx context.Context, limit, offset int, status string) ([]models.Product, int, error) {
	args := []any{limit, offset}
	statusClause := ""
	if status != "" {
		statusClause = "WHERE status = $3"
		args = append(args, status)
	}
	rows, err := r.Pool.Query(ctx, fmt.Sprintf(`
SELECT rid, name, description, author, status, resources, latest_version, manifest_url, signature, created_at, updated_at, COUNT(*) OVER() AS total
FROM marketplace_products
%s
ORDER BY updated_at DESC
LIMIT $1 OFFSET $2`, statusClause), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := []models.Product{}
	total := 0
	for rows.Next() {
		p, rowTotal, err := scanProductWithTotal(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, *p)
		total = rowTotal
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if total == 0 && offset > 0 {
		query := `SELECT COUNT(*) FROM marketplace_products`
		countArgs := []any{}
		if status != "" {
			query += " WHERE status = $1"
			countArgs = append(countArgs, status)
		}
		if err := r.Pool.QueryRow(ctx, query, countArgs...).Scan(&total); err != nil {
			return nil, 0, err
		}
	}
	return items, total, nil
}

// UpdateProductPublishedSnapshot stamps the product row with the
// latest published version's manifest URL + signature.
func (r *PGXRepository) UpdateProductPublishedSnapshot(ctx context.Context, rid, version, manifestURL, signature string) (*models.Product, error) {
	row := r.Pool.QueryRow(ctx, `
UPDATE marketplace_products
SET status = 'PUBLISHED', latest_version = $2, manifest_url = $3, signature = $4, updated_at = NOW()
WHERE rid = $1
RETURNING rid, name, description, author, status, resources, latest_version, manifest_url, signature, created_at, updated_at`,
		rid, version, manifestURL, signature)
	p, err := scanProduct(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProductNotFound
		}
		return nil, err
	}
	return p, nil
}

// CreateVersion inserts a version row. Unique violations on
// (product_rid, version) bubble back as ErrProductVersionNotFound's
// negative — we surface them as a typed validation error.
func (r *PGXRepository) CreateVersion(ctx context.Context, v models.ProductVersion) (*models.ProductVersion, error) {
	if v.PublishedAt.IsZero() {
		v.PublishedAt = time.Now().UTC()
	}
	manifest := v.Manifest
	if len(manifest) == 0 {
		manifest = json.RawMessage(`{}`)
	}
	row := r.Pool.QueryRow(ctx, `
INSERT INTO marketplace_product_versions (rid, product_rid, version, manifest, bundle_path, signature, published_at)
VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
RETURNING rid, product_rid, version, manifest, bundle_path, signature, published_at`,
		v.RID, v.ProductRID, v.Version, manifest, v.BundlePath, v.Signature, v.PublishedAt,
	)
	created, err := scanVersion(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, fmt.Errorf("version %q already exists for product %q", v.Version, v.ProductRID)
		}
		return nil, err
	}
	return created, nil
}

// GetVersion loads one version row.
func (r *PGXRepository) GetVersion(ctx context.Context, productRID, version string) (*models.ProductVersion, error) {
	row := r.Pool.QueryRow(ctx, `
SELECT rid, product_rid, version, manifest, bundle_path, signature, published_at
FROM marketplace_product_versions
WHERE product_rid = $1 AND version = $2`, productRID, version)
	v, err := scanVersion(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProductVersionNotFound
		}
		return nil, err
	}
	return v, nil
}

// UpsertInstallationStart inserts a fresh installation row in
// PENDING/INSTALLING state. When a row for the (product_rid, version,
// target_workspace_rid) triple already exists, the second return value
// is true and the existing row is returned — letting the handler short
// circuit to a no-op when the prior status was INSTALLED.
func (r *PGXRepository) UpsertInstallationStart(ctx context.Context, ins models.Installation) (*models.Installation, bool, error) {
	existing, err := r.GetInstallationByKey(ctx, ins.ProductRID, ins.Version, ins.TargetWorkspaceRID)
	if err != nil && !errors.Is(err, ErrInstallationNotFound) {
		return nil, false, err
	}
	if existing != nil {
		return existing, true, nil
	}
	mappings, err := json.Marshal(ins.ResourceMappings)
	if err != nil {
		return nil, false, err
	}
	if len(mappings) == 0 {
		mappings = []byte(`[]`)
	}
	now := time.Now().UTC()
	row := r.Pool.QueryRow(ctx, `
INSERT INTO marketplace_product_installations (rid, product_rid, version, target_workspace_rid, status, resource_mappings, failure_reason, installed_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, '', $7, $7)
RETURNING rid, product_rid, version, target_workspace_rid, status, resource_mappings, failure_reason, installed_at, updated_at`,
		ins.RID, ins.ProductRID, ins.Version, ins.TargetWorkspaceRID, string(ins.Status), mappings, now,
	)
	created, err := scanInstallation(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			// Lost a race with another caller — re-fetch.
			existing, lookupErr := r.GetInstallationByKey(ctx, ins.ProductRID, ins.Version, ins.TargetWorkspaceRID)
			if lookupErr != nil {
				return nil, false, lookupErr
			}
			return existing, true, nil
		}
		return nil, false, err
	}
	return created, false, nil
}

// CompleteInstallation transitions an installation to its terminal
// state and persists the resource_mappings array (or failure_reason
// when status is FAILED).
func (r *PGXRepository) CompleteInstallation(ctx context.Context, rid string, status models.InstallationStatus, mappings []models.ResourceMapping, failureReason string) (*models.Installation, error) {
	if mappings == nil {
		mappings = []models.ResourceMapping{}
	}
	mappingsJSON, err := json.Marshal(mappings)
	if err != nil {
		return nil, err
	}
	row := r.Pool.QueryRow(ctx, `
UPDATE marketplace_product_installations
SET status = $2, resource_mappings = $3::jsonb, failure_reason = $4, updated_at = NOW()
WHERE rid = $1
RETURNING rid, product_rid, version, target_workspace_rid, status, resource_mappings, failure_reason, installed_at, updated_at`,
		rid, string(status), mappingsJSON, failureReason,
	)
	ins, err := scanInstallation(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInstallationNotFound
		}
		return nil, err
	}
	return ins, nil
}

// GetInstallation loads one installation row by rid.
func (r *PGXRepository) GetInstallation(ctx context.Context, rid string) (*models.Installation, error) {
	row := r.Pool.QueryRow(ctx, `
SELECT rid, product_rid, version, target_workspace_rid, status, resource_mappings, failure_reason, installed_at, updated_at
FROM marketplace_product_installations
WHERE rid = $1`, rid)
	ins, err := scanInstallation(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInstallationNotFound
		}
		return nil, err
	}
	return ins, nil
}

// GetInstallationByKey looks up the unique
// (product_rid, version, target_workspace_rid) triple.
func (r *PGXRepository) GetInstallationByKey(ctx context.Context, productRID, version, targetWorkspaceRID string) (*models.Installation, error) {
	row := r.Pool.QueryRow(ctx, `
SELECT rid, product_rid, version, target_workspace_rid, status, resource_mappings, failure_reason, installed_at, updated_at
FROM marketplace_product_installations
WHERE product_rid = $1 AND version = $2 AND target_workspace_rid = $3`,
		productRID, version, targetWorkspaceRID)
	ins, err := scanInstallation(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInstallationNotFound
		}
		return nil, err
	}
	return ins, nil
}

// ListInstallations pages through installations ordered by installed_at
// DESC. Either filter (targetWorkspaceRID, productRID) may be empty.
func (r *PGXRepository) ListInstallations(ctx context.Context, limit, offset int, targetWorkspaceRID, productRID string) ([]models.Installation, int, error) {
	args := []any{limit, offset}
	clauses := []string{}
	if targetWorkspaceRID != "" {
		args = append(args, targetWorkspaceRID)
		clauses = append(clauses, fmt.Sprintf("target_workspace_rid = $%d", len(args)))
	}
	if productRID != "" {
		args = append(args, productRID)
		clauses = append(clauses, fmt.Sprintf("product_rid = $%d", len(args)))
	}
	where := ""
	if len(clauses) > 0 {
		where = "WHERE " + clauses[0]
		for _, c := range clauses[1:] {
			where += " AND " + c
		}
	}
	rows, err := r.Pool.Query(ctx, fmt.Sprintf(`
SELECT rid, product_rid, version, target_workspace_rid, status, resource_mappings, failure_reason, installed_at, updated_at, COUNT(*) OVER() AS total
FROM marketplace_product_installations
%s
ORDER BY installed_at DESC
LIMIT $1 OFFSET $2`, where), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []models.Installation{}
	total := 0
	for rows.Next() {
		ins, rowTotal, err := scanInstallationWithTotal(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, *ins)
		total = rowTotal
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// ── Row scanners ──────────────────────────────────────────────────────

type rowScanner interface{ Scan(dest ...any) error }

func scanProduct(row rowScanner) (*models.Product, error) {
	var p models.Product
	var status string
	var resources []byte
	if err := row.Scan(&p.RID, &p.Name, &p.Description, &p.Author, &status, &resources, &p.Version, &p.ManifestURL, &p.Signature, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return nil, err
	}
	p.Status = models.ProductStatus(status)
	if len(resources) == 0 {
		resources = []byte(`[]`)
	}
	if err := json.Unmarshal(resources, &p.Resources); err != nil {
		return nil, fmt.Errorf("decode resources: %w", err)
	}
	if p.Resources == nil {
		p.Resources = []models.ProductResource{}
	}
	return &p, nil
}

func scanProductWithTotal(row rowScanner) (*models.Product, int, error) {
	var p models.Product
	var status string
	var resources []byte
	var total int
	if err := row.Scan(&p.RID, &p.Name, &p.Description, &p.Author, &status, &resources, &p.Version, &p.ManifestURL, &p.Signature, &p.CreatedAt, &p.UpdatedAt, &total); err != nil {
		return nil, 0, err
	}
	p.Status = models.ProductStatus(status)
	if len(resources) == 0 {
		resources = []byte(`[]`)
	}
	if err := json.Unmarshal(resources, &p.Resources); err != nil {
		return nil, 0, fmt.Errorf("decode resources: %w", err)
	}
	if p.Resources == nil {
		p.Resources = []models.ProductResource{}
	}
	return &p, total, nil
}

func scanVersion(row rowScanner) (*models.ProductVersion, error) {
	var v models.ProductVersion
	var manifest []byte
	if err := row.Scan(&v.RID, &v.ProductRID, &v.Version, &manifest, &v.BundlePath, &v.Signature, &v.PublishedAt); err != nil {
		return nil, err
	}
	if len(manifest) > 0 {
		v.Manifest = append(json.RawMessage(nil), manifest...)
	} else {
		v.Manifest = json.RawMessage(`{}`)
	}
	return &v, nil
}

func scanInstallation(row rowScanner) (*models.Installation, error) {
	var ins models.Installation
	var status string
	var mappings []byte
	if err := row.Scan(&ins.RID, &ins.ProductRID, &ins.Version, &ins.TargetWorkspaceRID, &status, &mappings, &ins.FailureReason, &ins.InstalledAt, &ins.UpdatedAt); err != nil {
		return nil, err
	}
	ins.Status = models.InstallationStatus(status)
	if len(mappings) == 0 {
		mappings = []byte(`[]`)
	}
	if err := json.Unmarshal(mappings, &ins.ResourceMappings); err != nil {
		return nil, fmt.Errorf("decode resource_mappings: %w", err)
	}
	if ins.ResourceMappings == nil {
		ins.ResourceMappings = []models.ResourceMapping{}
	}
	return &ins, nil
}

func scanInstallationWithTotal(row rowScanner) (*models.Installation, int, error) {
	var ins models.Installation
	var status string
	var mappings []byte
	var total int
	if err := row.Scan(&ins.RID, &ins.ProductRID, &ins.Version, &ins.TargetWorkspaceRID, &status, &mappings, &ins.FailureReason, &ins.InstalledAt, &ins.UpdatedAt, &total); err != nil {
		return nil, 0, err
	}
	ins.Status = models.InstallationStatus(status)
	if len(mappings) == 0 {
		mappings = []byte(`[]`)
	}
	if err := json.Unmarshal(mappings, &ins.ResourceMappings); err != nil {
		return nil, 0, fmt.Errorf("decode resource_mappings: %w", err)
	}
	if ins.ResourceMappings == nil {
		ins.ResourceMappings = []models.ResourceMapping{}
	}
	return &ins, total, nil
}
