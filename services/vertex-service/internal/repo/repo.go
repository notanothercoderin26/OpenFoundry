// Package repo holds SQL queries + embedded migrations for
// vertex-service.
//
// All queries are schema-qualified to vertex.
package repo

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate applies every embedded migration in lexical order. Each
// migration is expected to be idempotent (uses IF NOT EXISTS etc.).
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

// Repo is the concrete pgx-backed implementation. The interface that
// handlers depend on (handlers.Store) is defined in the handlers
// package — keeping the consumer-side interface narrow.
type Repo struct{ Pool *pgxpool.Pool }

// ----- Graph -----

const graphSelect = `SELECT id, rid, title, description, seed_object_refs,
	branch_context, model_rid, layout_state_json, layer_configuration_json,
	timeline_state_json, project_id, organizations, markings,
	owner_id, versioning_enabled, created_at, updated_at FROM vertex.graph`

func (r *Repo) ListGraphs(ctx context.Context, ownerID uuid.UUID, projectID *uuid.UUID, search string, page, perPage int) ([]models.Graph, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 200 {
		perPage = 50
	}
	args := []any{ownerID}
	where := `WHERE owner_id = $1`
	if projectID != nil {
		args = append(args, *projectID)
		where += fmt.Sprintf(" AND project_id = $%d", len(args))
	}
	if s := strings.TrimSpace(search); s != "" {
		args = append(args, "%"+strings.ToLower(s)+"%")
		where += fmt.Sprintf(" AND lower(title) LIKE $%d", len(args))
	}
	countRow := r.Pool.QueryRow(ctx, `SELECT count(*) FROM vertex.graph `+where, args...)
	var total int
	if err := countRow.Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, perPage, (page-1)*perPage)
	rows, err := r.Pool.Query(ctx, graphSelect+` `+where+` ORDER BY updated_at DESC LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]models.Graph, 0)
	for rows.Next() {
		g, err := scanGraph(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *g)
	}
	return out, total, rows.Err()
}

func (r *Repo) GetGraph(ctx context.Context, id uuid.UUID) (*models.Graph, error) {
	row := r.Pool.QueryRow(ctx, graphSelect+` WHERE id = $1`, id)
	g, err := scanGraph(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return g, nil
}

func (r *Repo) CreateGraph(ctx context.Context, body *models.CreateGraphRequest, ownerID uuid.UUID) (*models.Graph, error) {
	id := uuid.New()
	rid := models.MakeGraphRID(id)
	seed := body.SeedObjectRefs
	if seed == nil {
		seed = []string{}
	}
	orgs := body.Organizations
	if orgs == nil {
		orgs = []string{}
	}
	markings := body.Markings
	if markings == nil {
		markings = []string{}
	}
	row := r.Pool.QueryRow(ctx, `INSERT INTO vertex.graph (
		id, rid, title, description, seed_object_refs, branch_context, model_rid,
		layout_state_json, layer_configuration_json, timeline_state_json,
		project_id, organizations, markings, owner_id
	) VALUES ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,$8,$9,$10,$11)
	RETURNING `+graphReturning, id, rid, body.Title, body.Description, seed,
		body.BranchContext, body.ModelRID, body.ProjectID, orgs, markings, ownerID)
	return scanGraph(row)
}

func (r *Repo) UpdateGraph(ctx context.Context, id uuid.UUID, body *models.UpdateGraphRequest) (*models.Graph, error) {
	sets := make([]string, 0, 9)
	args := make([]any, 0, 10)
	args = append(args, id)
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	if body.Title != nil {
		add("title", *body.Title)
	}
	if body.Description != nil {
		add("description", *body.Description)
	}
	if body.SeedObjectRefs != nil {
		add("seed_object_refs", *body.SeedObjectRefs)
	}
	if body.BranchContext != nil {
		add("branch_context", *body.BranchContext)
	}
	if body.ModelRID != nil {
		add("model_rid", *body.ModelRID)
	}
	if body.LayoutStateJSON != nil {
		add("layout_state_json", []byte(*body.LayoutStateJSON))
	}
	if body.LayerConfigurationJSON != nil {
		add("layer_configuration_json", []byte(*body.LayerConfigurationJSON))
	}
	if body.TimelineStateJSON != nil {
		add("timeline_state_json", []byte(*body.TimelineStateJSON))
	}
	if body.Organizations != nil {
		add("organizations", *body.Organizations)
	}
	if body.Markings != nil {
		add("markings", *body.Markings)
	}
	if len(sets) == 0 {
		return r.GetGraph(ctx, id)
	}
	sets = append(sets, "updated_at = NOW()")
	q := fmt.Sprintf(`UPDATE vertex.graph SET %s WHERE id = $1 RETURNING %s`, strings.Join(sets, ", "), graphReturning)
	row := r.Pool.QueryRow(ctx, q, args...)
	g, err := scanGraph(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return g, err
}

func (r *Repo) DeleteGraph(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := r.Pool.Exec(ctx, `DELETE FROM vertex.graph WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (r *Repo) ForkGraph(ctx context.Context, id uuid.UUID, newTitle string, ownerID uuid.UUID) (*models.Graph, error) {
	src, err := r.GetGraph(ctx, id)
	if err != nil || src == nil {
		return nil, err
	}
	title := strings.TrimSpace(newTitle)
	if title == "" {
		title = src.Title + " (fork)"
	}
	newID := uuid.New()
	rid := models.MakeGraphRID(newID)
	row := r.Pool.QueryRow(ctx, `INSERT INTO vertex.graph (
		id, rid, title, description, seed_object_refs, branch_context, model_rid,
		layout_state_json, layer_configuration_json, timeline_state_json,
		project_id, organizations, markings, owner_id
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
	RETURNING `+graphReturning, newID, rid, title, src.Description, src.SeedObjectRefs,
		src.BranchContext, src.ModelRID, []byte(src.LayoutStateJSON),
		[]byte(src.LayerConfigurationJSON), []byte(src.TimelineStateJSON),
		src.ProjectID, src.Organizations, src.Markings, ownerID)
	return scanGraph(row)
}

const graphReturning = `id, rid, title, description, seed_object_refs,
	branch_context, model_rid, layout_state_json, layer_configuration_json,
	timeline_state_json, project_id, organizations, markings,
	owner_id, versioning_enabled, created_at, updated_at`

type rowLikeT interface{ Scan(...any) error }

func scanGraph(r rowLikeT) (*models.Graph, error) {
	g := &models.Graph{}
	var layout, layers, timeline []byte
	var project *uuid.UUID
	if err := r.Scan(&g.ID, &g.RID, &g.Title, &g.Description, &g.SeedObjectRefs,
		&g.BranchContext, &g.ModelRID, &layout, &layers, &timeline,
		&project, &g.Organizations, &g.Markings,
		&g.OwnerID, &g.VersioningEnabled, &g.CreatedAt, &g.UpdatedAt); err != nil {
		return nil, err
	}
	g.LayoutStateJSON = layout
	g.LayerConfigurationJSON = layers
	g.TimelineStateJSON = timeline
	g.ProjectID = project
	if g.SeedObjectRefs == nil {
		g.SeedObjectRefs = []string{}
	}
	if g.Organizations == nil {
		g.Organizations = []string{}
	}
	if g.Markings == nil {
		g.Markings = []string{}
	}
	return g, nil
}

// ----- Graph version -----

// ErrVersioningDisabled is returned by CreateGraphVersion when the
// caller tries to save a version on a graph that has not opted into
// versioning via the Enable Versioning toggle.
var ErrVersioningDisabled = errors.New("versioning is disabled for this graph")

func (r *Repo) CreateGraphVersion(ctx context.Context, graphID uuid.UUID, changelog string, authorID uuid.UUID) (*models.GraphVersion, error) {
	g, err := r.GetGraph(ctx, graphID)
	if err != nil || g == nil {
		return nil, err
	}
	if !g.VersioningEnabled {
		return nil, ErrVersioningDisabled
	}
	snapshot, err := json.Marshal(map[string]any{
		"title":                    g.Title,
		"description":              g.Description,
		"seed_object_refs":         g.SeedObjectRefs,
		"branch_context":           g.BranchContext,
		"model_rid":                g.ModelRID,
		"layout_state_json":        g.LayoutStateJSON,
		"layer_configuration_json": g.LayerConfigurationJSON,
		"timeline_state_json":      g.TimelineStateJSON,
	})
	if err != nil {
		return nil, err
	}
	var nextVersion int
	if err := r.Pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(version), 0) + 1 FROM vertex.graph_version WHERE graph_id = $1`,
		graphID).Scan(&nextVersion); err != nil {
		return nil, err
	}
	v := &models.GraphVersion{
		ID:           uuid.New(),
		GraphID:      graphID,
		Version:      nextVersion,
		Changelog:    changelog,
		SnapshotJSON: snapshot,
		AuthorID:     authorID,
		CreatedAt:    time.Now().UTC(),
	}
	if _, err := r.Pool.Exec(ctx, `INSERT INTO vertex.graph_version
		(id, graph_id, version, changelog, snapshot_json, author_id, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		v.ID, v.GraphID, v.Version, v.Changelog, []byte(v.SnapshotJSON), v.AuthorID, v.CreatedAt); err != nil {
		return nil, err
	}
	return v, nil
}

func (r *Repo) ListGraphVersions(ctx context.Context, graphID uuid.UUID, page, perPage int) ([]models.GraphVersion, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 200 {
		perPage = 50
	}
	var total int
	if err := r.Pool.QueryRow(ctx, `SELECT count(*) FROM vertex.graph_version WHERE graph_id = $1`, graphID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT id, graph_id, version, changelog, snapshot_json, author_id, created_at
		 FROM vertex.graph_version WHERE graph_id = $1
		 ORDER BY version DESC LIMIT $2 OFFSET $3`,
		graphID, perPage, (page-1)*perPage)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]models.GraphVersion, 0)
	for rows.Next() {
		v := models.GraphVersion{}
		var snap []byte
		if err := rows.Scan(&v.ID, &v.GraphID, &v.Version, &v.Changelog, &snap, &v.AuthorID, &v.CreatedAt); err != nil {
			return nil, 0, err
		}
		v.SnapshotJSON = snap
		out = append(out, v)
	}
	return out, total, rows.Err()
}

// SetVersioningEnabled flips the toggle. Returns (nil, nil) when the
// graph does not exist.
func (r *Repo) SetVersioningEnabled(ctx context.Context, id uuid.UUID, enabled bool) (*models.Graph, error) {
	row := r.Pool.QueryRow(ctx,
		`UPDATE vertex.graph SET versioning_enabled = $2, updated_at = NOW()
		 WHERE id = $1 RETURNING `+graphReturning, id, enabled)
	g, err := scanGraph(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return g, err
}

// RevertToVersion hydrates the graph's mutable fields from a previously
// saved snapshot and writes a fresh version with a "Revert to v{N}"
// changelog. Returns (nil, nil) when the graph or the requested
// version does not exist.
func (r *Repo) RevertToVersion(ctx context.Context, graphID uuid.UUID, version int, authorID uuid.UUID) (*models.Graph, error) {
	snap, err := r.GetGraphVersion(ctx, graphID, version)
	if err != nil || snap == nil {
		return nil, err
	}
	var fields struct {
		Title                  string          `json:"title"`
		Description            string          `json:"description"`
		SeedObjectRefs         []string        `json:"seed_object_refs"`
		BranchContext          string          `json:"branch_context"`
		ModelRID               string          `json:"model_rid"`
		LayoutStateJSON        json.RawMessage `json:"layout_state_json"`
		LayerConfigurationJSON json.RawMessage `json:"layer_configuration_json"`
		TimelineStateJSON      json.RawMessage `json:"timeline_state_json"`
	}
	if err := json.Unmarshal(snap.SnapshotJSON, &fields); err != nil {
		return nil, fmt.Errorf("decode snapshot: %w", err)
	}
	seed := fields.SeedObjectRefs
	if seed == nil {
		seed = []string{}
	}
	row := r.Pool.QueryRow(ctx,
		`UPDATE vertex.graph SET
			title = $2, description = $3, seed_object_refs = $4,
			branch_context = $5, model_rid = $6,
			layout_state_json = $7, layer_configuration_json = $8,
			timeline_state_json = $9, updated_at = NOW()
		 WHERE id = $1 RETURNING `+graphReturning,
		graphID, fields.Title, fields.Description, seed,
		fields.BranchContext, fields.ModelRID,
		ifNullJSON(fields.LayoutStateJSON),
		ifNullJSON(fields.LayerConfigurationJSON),
		ifNullJSON(fields.TimelineStateJSON),
	)
	g, err := scanGraph(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	// Capture the new state as a fresh version so the history shows
	// the revert as a distinct entry rather than an in-place edit.
	if g.VersioningEnabled {
		if _, err := r.CreateGraphVersion(ctx, graphID,
			fmt.Sprintf("Revert to v%d", version), authorID); err != nil {
			return nil, err
		}
	}
	return g, nil
}

func ifNullJSON(b json.RawMessage) []byte {
	if len(b) == 0 {
		return []byte("{}")
	}
	return []byte(b)
}

func (r *Repo) GetGraphVersion(ctx context.Context, graphID uuid.UUID, version int) (*models.GraphVersion, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT id, graph_id, version, changelog, snapshot_json, author_id, created_at
		 FROM vertex.graph_version WHERE graph_id = $1 AND version = $2`,
		graphID, version)
	v := &models.GraphVersion{}
	var snap []byte
	err := row.Scan(&v.ID, &v.GraphID, &v.Version, &v.Changelog, &snap, &v.AuthorID, &v.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	v.SnapshotJSON = snap
	return v, nil
}

// ----- Annotation -----

func (r *Repo) ListAnnotations(ctx context.Context, graphID uuid.UUID) ([]models.Annotation, error) {
	rows, err := r.Pool.Query(ctx, `SELECT id, graph_id, kind, text, geometry_json, author_id, created_at, updated_at
		FROM vertex.graph_annotation WHERE graph_id = $1 ORDER BY created_at ASC`, graphID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.Annotation, 0)
	for rows.Next() {
		a := models.Annotation{}
		var geom []byte
		if err := rows.Scan(&a.ID, &a.GraphID, &a.Kind, &a.Text, &geom, &a.AuthorID, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		a.GeometryJSON = geom
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *Repo) CreateAnnotation(ctx context.Context, graphID uuid.UUID, body *models.CreateAnnotationRequest, authorID uuid.UUID) (*models.Annotation, error) {
	kind := strings.TrimSpace(body.Kind)
	if kind == "" {
		kind = "text"
	}
	geom := body.GeometryJSON
	if len(geom) == 0 {
		geom = json.RawMessage(`{}`)
	}
	a := &models.Annotation{
		ID:           uuid.New(),
		GraphID:      graphID,
		Kind:         kind,
		Text:         body.Text,
		GeometryJSON: geom,
		AuthorID:     authorID,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if _, err := r.Pool.Exec(ctx, `INSERT INTO vertex.graph_annotation
		(id, graph_id, kind, text, geometry_json, author_id, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		a.ID, a.GraphID, a.Kind, a.Text, []byte(a.GeometryJSON), a.AuthorID, a.CreatedAt, a.UpdatedAt); err != nil {
		return nil, err
	}
	return a, nil
}

func (r *Repo) UpdateAnnotation(ctx context.Context, id uuid.UUID, body *models.UpdateAnnotationRequest) (*models.Annotation, error) {
	sets := make([]string, 0, 3)
	args := make([]any, 0, 4)
	args = append(args, id)
	if body.Text != nil {
		args = append(args, *body.Text)
		sets = append(sets, fmt.Sprintf("text = $%d", len(args)))
	}
	if body.GeometryJSON != nil {
		args = append(args, []byte(*body.GeometryJSON))
		sets = append(sets, fmt.Sprintf("geometry_json = $%d", len(args)))
	}
	if len(sets) == 0 {
		row := r.Pool.QueryRow(ctx, `SELECT id, graph_id, kind, text, geometry_json, author_id, created_at, updated_at
			FROM vertex.graph_annotation WHERE id = $1`, id)
		a := &models.Annotation{}
		var geom []byte
		err := row.Scan(&a.ID, &a.GraphID, &a.Kind, &a.Text, &geom, &a.AuthorID, &a.CreatedAt, &a.UpdatedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		a.GeometryJSON = geom
		return a, nil
	}
	sets = append(sets, "updated_at = NOW()")
	q := fmt.Sprintf(`UPDATE vertex.graph_annotation SET %s WHERE id = $1
		RETURNING id, graph_id, kind, text, geometry_json, author_id, created_at, updated_at`,
		strings.Join(sets, ", "))
	row := r.Pool.QueryRow(ctx, q, args...)
	a := &models.Annotation{}
	var geom []byte
	err := row.Scan(&a.ID, &a.GraphID, &a.Kind, &a.Text, &geom, &a.AuthorID, &a.CreatedAt, &a.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	a.GeometryJSON = geom
	return a, nil
}

func (r *Repo) DeleteAnnotation(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := r.Pool.Exec(ctx, `DELETE FROM vertex.graph_annotation WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
