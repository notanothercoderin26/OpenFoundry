package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/application-composition-service/internal/models"
)

type Repo struct {
	Pool *pgxpool.Pool
}

// appColumns is the canonical SELECT projection for the `apps` table.
const appColumns = `id, name, slug, description, status, pages, theme, settings,
	template_key, created_by, published_version_id, created_at, updated_at`

func (r *Repo) ListPrimary(ctx context.Context) ([]models.PrimaryItem, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT id, payload, created_at FROM composition_views ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.PrimaryItem, 0)
	for rows.Next() {
		var p models.PrimaryItem
		if err := rows.Scan(&p.ID, &p.Payload, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *Repo) CreatePrimary(ctx context.Context, payload []byte) (models.PrimaryItem, error) {
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO composition_views (id, payload) VALUES ($1, $2) RETURNING id, payload, created_at`,
		uuid.New(), payload)
	var p models.PrimaryItem
	err := row.Scan(&p.ID, &p.Payload, &p.CreatedAt)
	return p, err
}

func (r *Repo) GetPrimary(ctx context.Context, id uuid.UUID) (*models.PrimaryItem, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT id, payload, created_at FROM composition_views WHERE id = $1`, id)
	var p models.PrimaryItem
	err := row.Scan(&p.ID, &p.Payload, &p.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repo) ListSecondary(ctx context.Context, parentID uuid.UUID) ([]models.SecondaryItem, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT id, parent_id, payload, created_at
           FROM composition_bindings
          WHERE parent_id = $1
          ORDER BY created_at DESC LIMIT 200`, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.SecondaryItem, 0)
	for rows.Next() {
		var s models.SecondaryItem
		if err := rows.Scan(&s.ID, &s.ParentID, &s.Payload, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *Repo) CreateSecondary(ctx context.Context, parentID uuid.UUID, payload []byte) (models.SecondaryItem, error) {
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO composition_bindings (id, parent_id, payload)
           VALUES ($1, $2, $3) RETURNING id, parent_id, payload, created_at`,
		uuid.New(), parentID, payload)
	var s models.SecondaryItem
	err := row.Scan(&s.ID, &s.ParentID, &s.Payload, &s.CreatedAt)
	return s, err
}

// scanApp consumes a row matching `appColumns` (in order) and produces models.App.
func scanApp(row pgx.Row) (*models.App, error) {
	var a models.App
	err := row.Scan(
		&a.ID, &a.Name, &a.Slug, &a.Description, &a.Status,
		&a.Pages, &a.Theme, &a.Settings,
		&a.TemplateKey, &a.CreatedBy, &a.PublishedVersionID,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// ListAppsFilter is the wire-level filter coming from the SPA's listApps().
type ListAppsFilter struct {
	Search  string
	Status  string
	Page    int
	PerPage int
}

// ListApps returns AppSummary rows + total count. Pagination is best-effort:
// the SPA only uses page/per_page as hints (default 25 per page).
func (r *Repo) ListApps(ctx context.Context, f ListAppsFilter) ([]models.AppSummary, int, error) {
	conds := []string{}
	args := []any{}
	if strings.TrimSpace(f.Search) != "" {
		args = append(args, "%"+strings.ToLower(f.Search)+"%")
		conds = append(conds, fmt.Sprintf("(LOWER(name) LIKE $%d OR LOWER(slug) LIKE $%d OR LOWER(description) LIKE $%d)", len(args), len(args), len(args)))
	}
	if strings.TrimSpace(f.Status) != "" {
		args = append(args, f.Status)
		conds = append(conds, fmt.Sprintf("status = $%d", len(args)))
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}

	var total int
	if err := r.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM apps"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	perPage := f.PerPage
	if perPage <= 0 || perPage > 200 {
		perPage = 25
	}
	page := f.Page
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * perPage

	args = append(args, perPage, offset)
	q := fmt.Sprintf(`
        SELECT id, name, slug, description, status,
               COALESCE(jsonb_array_length(pages), 0) AS page_count,
               COALESCE((
                   SELECT SUM(COALESCE(jsonb_array_length(p->'widgets'), 0))
                   FROM jsonb_array_elements(pages) AS p
               ), 0) AS widget_count,
               template_key, published_version_id, created_at, updated_at
          FROM apps%s
         ORDER BY updated_at DESC
         LIMIT $%d OFFSET $%d`, where, len(args)-1, len(args))

	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]models.AppSummary, 0)
	for rows.Next() {
		var s models.AppSummary
		if err := rows.Scan(
			&s.ID, &s.Name, &s.Slug, &s.Description, &s.Status,
			&s.PageCount, &s.WidgetCount,
			&s.TemplateKey, &s.PublishedVersionID, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, s)
	}
	return out, total, rows.Err()
}

func (r *Repo) GetApp(ctx context.Context, id uuid.UUID) (*models.App, error) {
	row := r.Pool.QueryRow(ctx, `SELECT `+appColumns+` FROM apps WHERE id = $1`, id)
	a, err := scanApp(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return a, err
}

func (r *Repo) GetAppBySlug(ctx context.Context, slug string) (*models.App, error) {
	row := r.Pool.QueryRow(ctx, `SELECT `+appColumns+` FROM apps WHERE slug = $1`, slug)
	a, err := scanApp(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return a, err
}

func slugify(name string) string {
	out := strings.Builder{}
	prevDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			out.WriteRune(r)
			prevDash = false
		case r == ' ' || r == '-' || r == '_':
			if !prevDash && out.Len() > 0 {
				out.WriteByte('-')
				prevDash = true
			}
		}
	}
	s := strings.TrimRight(out.String(), "-")
	if s == "" {
		s = "app-" + uuid.NewString()[:8]
	}
	return s
}

func (r *Repo) CreateApp(ctx context.Context, body *models.CreateAppRequest, creator *uuid.UUID) (*models.App, error) {
	id := uuid.New()
	slug := strings.TrimSpace(body.Slug)
	if slug == "" {
		slug = slugify(body.Name)
	}
	status := body.Status
	if status == "" {
		status = "draft"
	}
	pages := json.RawMessage(body.Pages)
	if len(pages) == 0 {
		pages = json.RawMessage(`[]`)
	}
	theme := json.RawMessage(body.Theme)
	if len(theme) == 0 {
		theme = json.RawMessage(`{}`)
	}
	settings := json.RawMessage(body.Settings)
	if len(settings) == 0 {
		settings = json.RawMessage(`{}`)
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO apps (id, name, slug, description, status, pages, theme, settings, template_key, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING `+appColumns,
		id, body.Name, slug, body.Description, status, []byte(pages), []byte(theme), []byte(settings),
		body.TemplateKey, creator,
	)
	return scanApp(row)
}

func (r *Repo) UpdateApp(ctx context.Context, id uuid.UUID, body *models.UpdateAppRequest) (*models.App, error) {
	sets := []string{}
	args := []any{}
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	if body.Name != nil {
		add("name", *body.Name)
	}
	if body.Slug != nil {
		add("slug", *body.Slug)
	}
	if body.Description != nil {
		add("description", *body.Description)
	}
	if body.Status != nil {
		add("status", *body.Status)
	}
	if len(body.Pages) > 0 {
		add("pages", []byte(body.Pages))
	}
	if len(body.Theme) > 0 {
		add("theme", []byte(body.Theme))
	}
	if len(body.Settings) > 0 {
		add("settings", []byte(body.Settings))
	}
	if body.TemplateKey != nil {
		add("template_key", *body.TemplateKey)
	}
	if len(sets) == 0 {
		return r.GetApp(ctx, id)
	}
	sets = append(sets, "updated_at = NOW()")
	args = append(args, id)
	q := fmt.Sprintf(`UPDATE apps SET %s WHERE id = $%d RETURNING %s`,
		strings.Join(sets, ", "), len(args), appColumns)
	row := r.Pool.QueryRow(ctx, q, args...)
	a, err := scanApp(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return a, err
}

func (r *Repo) DeleteApp(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := r.Pool.Exec(ctx, `DELETE FROM apps WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// PublishApp creates a new app_versions row that snapshots the current app state,
// marks it as published, and points apps.published_version_id at it. Returns
// the new version row.
func (r *Repo) PublishApp(ctx context.Context, appID uuid.UUID, notes string, publisher *uuid.UUID) (*models.AppVersion, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	a, err := scanApp(tx.QueryRow(ctx, `SELECT `+appColumns+` FROM apps WHERE id = $1 FOR UPDATE`, appID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	snapshot := map[string]any{
		"name":         a.Name,
		"slug":         a.Slug,
		"description":  a.Description,
		"status":       a.Status,
		"pages":        a.Pages,
		"theme":        a.Theme,
		"settings":     a.Settings,
		"template_key": a.TemplateKey,
	}
	snapBytes, err := json.Marshal(snapshot)
	if err != nil {
		return nil, err
	}

	var nextVersion int
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(MAX(version_number), 0) + 1 FROM app_versions WHERE app_id = $1`, appID,
	).Scan(&nextVersion); err != nil {
		return nil, err
	}

	versionID := uuid.New()
	now := time.Now().UTC()
	if _, err := tx.Exec(ctx,
		`INSERT INTO app_versions (id, app_id, version_number, status, app_snapshot, notes, created_by, created_at, published_at)
         VALUES ($1, $2, $3, 'published', $4, $5, $6, $7, $7)`,
		versionID, appID, nextVersion, snapBytes, notes, publisher, now,
	); err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx,
		`UPDATE apps SET published_version_id = $1, status = 'published', updated_at = $2 WHERE id = $3`,
		versionID, now, appID,
	); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &models.AppVersion{
		ID:            versionID,
		AppID:         appID,
		VersionNumber: nextVersion,
		Status:        "published",
		AppSnapshot:   snapBytes,
		Notes:         notes,
		CreatedBy:     publisher,
		CreatedAt:     now,
		PublishedAt:   &now,
	}, nil
}

func (r *Repo) ListAppVersions(ctx context.Context, appID uuid.UUID) ([]models.AppVersion, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT id, app_id, version_number, status, app_snapshot, notes, created_by, created_at, published_at
		   FROM app_versions WHERE app_id = $1 ORDER BY version_number DESC`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.AppVersion, 0)
	for rows.Next() {
		var v models.AppVersion
		if err := rows.Scan(
			&v.ID, &v.AppID, &v.VersionNumber, &v.Status, &v.AppSnapshot,
			&v.Notes, &v.CreatedBy, &v.CreatedAt, &v.PublishedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// GetPublishedVersion returns the version row pointed to by apps.published_version_id.
func (r *Repo) GetPublishedVersion(ctx context.Context, appID uuid.UUID) (*models.AppVersion, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT v.id, v.app_id, v.version_number, v.status, v.app_snapshot, v.notes,
		        v.created_by, v.created_at, v.published_at
		   FROM apps a
		   JOIN app_versions v ON v.id = a.published_version_id
		  WHERE a.id = $1`, appID)
	var v models.AppVersion
	err := row.Scan(
		&v.ID, &v.AppID, &v.VersionNumber, &v.Status, &v.AppSnapshot,
		&v.Notes, &v.CreatedBy, &v.CreatedAt, &v.PublishedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &v, nil
}
