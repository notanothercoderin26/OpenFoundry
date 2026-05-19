// Package repo: pgx-backed CRUD for graph templates.
package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
)

// ErrGraphTemplateNotFound is returned by GetGraphTemplate /
// UpdateGraphTemplate / DeleteGraphTemplate when no row matches.
var ErrGraphTemplateNotFound = errors.New("graph template not found")

const graphTemplateSelect = `
SELECT id, rid, title, description, source_graph_id,
       object_parameters_json, non_object_parameters_json,
       search_arounds_json, layer_config_json, graph_config_json,
       defaults_json, owner_id, project_id, organizations, markings,
       created_at, updated_at
FROM   graph_template`

type graphTemplateRowScanner interface{ Scan(...any) error }

func scanGraphTemplate(r graphTemplateRowScanner) (*models.GraphTemplate, error) {
	t := &models.GraphTemplate{}
	var (
		objectParametersJSON    []byte
		nonObjectParametersJSON []byte
		searchAroundsJSON       []byte
		layerConfigJSON         []byte
		graphConfigJSON         []byte
		defaultsJSON            []byte
	)
	if err := r.Scan(
		&t.ID, &t.RID, &t.Title, &t.Description, &t.SourceGraphID,
		&objectParametersJSON, &nonObjectParametersJSON,
		&searchAroundsJSON, &layerConfigJSON, &graphConfigJSON,
		&defaultsJSON, &t.OwnerID, &t.ProjectID, &t.Organizations, &t.Markings,
		&t.CreatedAt, &t.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(objectParametersJSON, &t.ObjectParameters); err != nil {
		return nil, fmt.Errorf("decode object_parameters: %w", err)
	}
	if err := json.Unmarshal(nonObjectParametersJSON, &t.NonObjectParameters); err != nil {
		return nil, fmt.Errorf("decode non_object_parameters: %w", err)
	}
	if err := json.Unmarshal(searchAroundsJSON, &t.SearchArounds); err != nil {
		return nil, fmt.Errorf("decode search_arounds: %w", err)
	}
	if err := json.Unmarshal(layerConfigJSON, &t.LayerConfig); err != nil {
		return nil, fmt.Errorf("decode layer_config: %w", err)
	}
	if err := json.Unmarshal(graphConfigJSON, &t.GraphConfig); err != nil {
		return nil, fmt.Errorf("decode graph_config: %w", err)
	}
	if err := json.Unmarshal(defaultsJSON, &t.Defaults); err != nil {
		return nil, fmt.Errorf("decode defaults: %w", err)
	}
	if t.ObjectParameters == nil {
		t.ObjectParameters = []models.GraphTemplateObjectParameter{}
	}
	if t.NonObjectParameters == nil {
		t.NonObjectParameters = []models.GraphTemplateNonObjectParameter{}
	}
	if t.SearchArounds == nil {
		t.SearchArounds = []models.GraphTemplateSearchAround{}
	}
	if t.LayerConfig == nil {
		t.LayerConfig = []models.GraphTemplateLayerConfig{}
	}
	if t.Organizations == nil {
		t.Organizations = []string{}
	}
	if t.Markings == nil {
		t.Markings = []string{}
	}
	return t, nil
}

func marshalOrEmpty(v any, empty string) ([]byte, error) {
	if v == nil {
		return []byte(empty), nil
	}
	return json.Marshal(v)
}

// ListGraphTemplates returns templates visible to the caller, filtered
// optionally by project. Pagination is offset-based to match the rest
// of the repo.
func (r *Repo) ListGraphTemplates(ctx context.Context, ownerID uuid.UUID, projectID *uuid.UUID, search string, page, perPage int) ([]models.GraphTemplate, int, error) {
	if perPage <= 0 {
		perPage = 50
	}
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * perPage

	where := []string{"owner_id = $1"}
	args := []any{ownerID}
	if projectID != nil {
		args = append(args, *projectID)
		where = append(where, fmt.Sprintf("project_id = $%d", len(args)))
	}
	if search != "" {
		args = append(args, "%"+search+"%")
		where = append(where, fmt.Sprintf("(title ILIKE $%d OR description ILIKE $%d)", len(args), len(args)))
	}
	whereClause := joinClauses(where, " AND ")

	args = append(args, perPage, offset)
	query := graphTemplateSelect + " WHERE " + whereClause +
		" ORDER BY updated_at DESC " +
		fmt.Sprintf("LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := r.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]models.GraphTemplate, 0, perPage)
	for rows.Next() {
		t, err := scanGraphTemplate(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *t)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	var total int
	countArgs := args[:len(args)-2]
	if err := r.Pool.QueryRow(ctx, "SELECT count(*) FROM graph_template WHERE "+whereClause, countArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

// GetGraphTemplate returns a template by id.
func (r *Repo) GetGraphTemplate(ctx context.Context, id uuid.UUID) (*models.GraphTemplate, error) {
	row := r.Pool.QueryRow(ctx, graphTemplateSelect+" WHERE id = $1", id)
	t, err := scanGraphTemplate(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrGraphTemplateNotFound
	}
	return t, err
}

// CreateGraphTemplate inserts a new row and returns the populated
// template.
func (r *Repo) CreateGraphTemplate(ctx context.Context, body *models.CreateGraphTemplateRequest, ownerID uuid.UUID) (*models.GraphTemplate, error) {
	id := uuid.New()
	now := time.Now().UTC()
	objJSON, err := marshalOrEmpty(body.ObjectParameters, "[]")
	if err != nil {
		return nil, err
	}
	nonObjJSON, err := marshalOrEmpty(body.NonObjectParameters, "[]")
	if err != nil {
		return nil, err
	}
	saJSON, err := marshalOrEmpty(body.SearchArounds, "[]")
	if err != nil {
		return nil, err
	}
	lcJSON, err := marshalOrEmpty(body.LayerConfig, "[]")
	if err != nil {
		return nil, err
	}
	gcJSON, err := marshalOrEmpty(body.GraphConfig, "{}")
	if err != nil {
		return nil, err
	}
	defJSON, err := marshalOrEmpty(body.Defaults, "{}")
	if err != nil {
		return nil, err
	}
	rid := models.MakeGraphTemplateRID(id)

	_, err = r.Pool.Exec(ctx, `
INSERT INTO graph_template (
    id, rid, title, description, source_graph_id,
    object_parameters_json, non_object_parameters_json,
    search_arounds_json, layer_config_json, graph_config_json,
    defaults_json, owner_id, project_id, organizations, markings,
    created_at, updated_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)`,
		id, rid, body.Title, body.Description, body.SourceGraphID,
		objJSON, nonObjJSON, saJSON, lcJSON, gcJSON, defJSON,
		ownerID, body.ProjectID, body.Organizations, body.Markings, now,
	)
	if err != nil {
		return nil, err
	}
	return r.GetGraphTemplate(ctx, id)
}

// UpdateGraphTemplate applies a partial update.
func (r *Repo) UpdateGraphTemplate(ctx context.Context, id uuid.UUID, body *models.UpdateGraphTemplateRequest) (*models.GraphTemplate, error) {
	sets := []string{}
	args := []any{}
	add := func(expr string, val any) {
		args = append(args, val)
		sets = append(sets, fmt.Sprintf("%s = $%d", expr, len(args)))
	}
	if body.Title != nil {
		add("title", *body.Title)
	}
	if body.Description != nil {
		add("description", *body.Description)
	}
	if body.ObjectParameters != nil {
		b, err := json.Marshal(*body.ObjectParameters)
		if err != nil {
			return nil, err
		}
		add("object_parameters_json", b)
	}
	if body.NonObjectParameters != nil {
		b, err := json.Marshal(*body.NonObjectParameters)
		if err != nil {
			return nil, err
		}
		add("non_object_parameters_json", b)
	}
	if body.SearchArounds != nil {
		b, err := json.Marshal(*body.SearchArounds)
		if err != nil {
			return nil, err
		}
		add("search_arounds_json", b)
	}
	if body.LayerConfig != nil {
		b, err := json.Marshal(*body.LayerConfig)
		if err != nil {
			return nil, err
		}
		add("layer_config_json", b)
	}
	if body.GraphConfig != nil {
		b, err := json.Marshal(*body.GraphConfig)
		if err != nil {
			return nil, err
		}
		add("graph_config_json", b)
	}
	if body.Defaults != nil {
		b, err := json.Marshal(*body.Defaults)
		if err != nil {
			return nil, err
		}
		add("defaults_json", b)
	}
	if body.ProjectID != nil {
		add("project_id", *body.ProjectID)
	}
	if body.Organizations != nil {
		add("organizations", *body.Organizations)
	}
	if body.Markings != nil {
		add("markings", *body.Markings)
	}
	if len(sets) == 0 {
		return r.GetGraphTemplate(ctx, id)
	}
	now := time.Now().UTC()
	args = append(args, now)
	sets = append(sets, fmt.Sprintf("updated_at = $%d", len(args)))
	args = append(args, id)
	query := "UPDATE graph_template SET " + joinClauses(sets, ", ") +
		fmt.Sprintf(" WHERE id = $%d", len(args))
	tag, err := r.Pool.Exec(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrGraphTemplateNotFound
	}
	return r.GetGraphTemplate(ctx, id)
}

// DeleteGraphTemplate returns true if a row was removed.
func (r *Repo) DeleteGraphTemplate(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := r.Pool.Exec(ctx, "DELETE FROM graph_template WHERE id = $1", id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// InstantiateGraphTemplate creates a new draft graph seeded from the
// supplied parameter values. Actual traversal (running the bound
// search-arounds, fetching the neighbour sub-graph) is the job of
// ontology-query-service; the template adds the seed object refs and
// the parameter bindings to the graph metadata so the canvas can
// expand from there.
func (r *Repo) InstantiateGraphTemplate(ctx context.Context, tpl *models.GraphTemplate, body *models.InstantiateGraphTemplateRequest, callerID uuid.UUID) (*models.InstantiateGraphTemplateResponse, error) {
	title := body.Title
	if title == "" {
		title = "From template · " + tpl.Title
	}
	seedRefs := []string{}
	for _, refs := range body.ObjectParameterValues {
		seedRefs = append(seedRefs, refs...)
	}
	createReq := &models.CreateGraphRequest{
		Title:          title,
		Description:    tpl.Description,
		SeedObjectRefs: seedRefs,
		ProjectID:      tpl.ProjectID,
		Organizations:  tpl.Organizations,
		Markings:       tpl.Markings,
	}
	g, err := r.CreateGraph(ctx, createReq, callerID)
	if err != nil {
		return nil, err
	}
	// Persist the parameter bindings on the new graph's layer config
	// so the canvas can replay them. We keep this conservative — no
	// schema change required on the existing graph table.
	bindings, _ := json.Marshal(map[string]any{
		"from_template_id":            tpl.ID,
		"object_parameter_values":     body.ObjectParameterValues,
		"non_object_parameter_values": body.NonObjectParameterValues,
		"layout":                      tpl.GraphConfig.Layout,
	})
	update := &models.UpdateGraphRequest{}
	raw := json.RawMessage(bindings)
	update.LayoutStateJSON = &raw
	if _, err := r.UpdateGraph(ctx, g.ID, update); err != nil {
		return nil, err
	}
	g2, err := r.GetGraph(ctx, g.ID)
	if err != nil {
		return nil, err
	}
	return &models.InstantiateGraphTemplateResponse{
		Graph:                    g2,
		ObjectParameterValues:    body.ObjectParameterValues,
		NonObjectParameterValues: body.NonObjectParameterValues,
	}, nil
}

func joinClauses(parts []string, sep string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += sep
		}
		out += p
	}
	return out
}
