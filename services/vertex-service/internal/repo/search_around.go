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

	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
)

// ----- Search Around -----

func (r *Repo) ListSearchArounds(ctx context.Context, ownerID uuid.UUID, projectID *uuid.UUID, startingTypeID *uuid.UUID, search string, page, perPage int) ([]models.SearchAround, int, error) {
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
	if startingTypeID != nil {
		args = append(args, *startingTypeID)
		where += fmt.Sprintf(" AND starting_object_type_id = $%d", len(args))
	}
	if s := strings.TrimSpace(search); s != "" {
		args = append(args, "%"+strings.ToLower(s)+"%")
		where += fmt.Sprintf(" AND lower(title) LIKE $%d", len(args))
	}
	var total int
	if err := r.Pool.QueryRow(ctx, `SELECT count(*) FROM vertex.search_around `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, perPage, (page-1)*perPage)
	rows, err := r.Pool.Query(ctx,
		`SELECT id, rid, title, description, starting_object_type_id, project_id, owner_id, created_at, updated_at
		 FROM vertex.search_around `+where+
			` ORDER BY updated_at DESC LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]models.SearchAround, 0)
	for rows.Next() {
		sa, err := scanSearchAroundHeader(rows)
		if err != nil {
			return nil, 0, err
		}
		if err := r.loadSearchAroundChildren(ctx, sa); err != nil {
			return nil, 0, err
		}
		out = append(out, *sa)
	}
	return out, total, rows.Err()
}

func (r *Repo) GetSearchAround(ctx context.Context, id uuid.UUID) (*models.SearchAround, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT id, rid, title, description, starting_object_type_id, project_id, owner_id, created_at, updated_at
		 FROM vertex.search_around WHERE id = $1`, id)
	sa, err := scanSearchAroundHeader(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := r.loadSearchAroundChildren(ctx, sa); err != nil {
		return nil, err
	}
	return sa, nil
}

func (r *Repo) CreateSearchAround(ctx context.Context, body *models.CreateSearchAroundRequest, ownerID uuid.UUID) (*models.SearchAround, error) {
	if body.Title == "" {
		return nil, errors.New("title required")
	}
	if body.StartingObjectTypeID == uuid.Nil {
		return nil, errors.New("starting_object_type_id required")
	}
	id := uuid.New()
	rid := models.MakeSearchAroundRID(id)
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx,
		`INSERT INTO vertex.search_around
		 (id, rid, title, description, starting_object_type_id, project_id, owner_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		id, rid, body.Title, body.Description, body.StartingObjectTypeID, body.ProjectID, ownerID); err != nil {
		return nil, err
	}
	if err := insertSteps(ctx, tx, id, body.Steps); err != nil {
		return nil, err
	}
	if err := insertParameters(ctx, tx, id, body.Parameters); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetSearchAround(ctx, id)
}

func (r *Repo) UpdateSearchAround(ctx context.Context, id uuid.UUID, body *models.UpdateSearchAroundRequest) (*models.SearchAround, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	sets := make([]string, 0, 2)
	args := make([]any, 0, 3)
	args = append(args, id)
	if body.Title != nil {
		args = append(args, *body.Title)
		sets = append(sets, fmt.Sprintf("title = $%d", len(args)))
	}
	if body.Description != nil {
		args = append(args, *body.Description)
		sets = append(sets, fmt.Sprintf("description = $%d", len(args)))
	}
	if len(sets) > 0 {
		sets = append(sets, "updated_at = NOW()")
		if _, err := tx.Exec(ctx,
			fmt.Sprintf(`UPDATE vertex.search_around SET %s WHERE id = $1`, strings.Join(sets, ", ")),
			args...); err != nil {
			return nil, err
		}
	}
	if body.Steps != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM vertex.search_around_step WHERE search_around_id = $1`, id); err != nil {
			return nil, err
		}
		if err := insertSteps(ctx, tx, id, *body.Steps); err != nil {
			return nil, err
		}
	}
	if body.Parameters != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM vertex.search_around_parameter WHERE search_around_id = $1`, id); err != nil {
			return nil, err
		}
		if err := insertParameters(ctx, tx, id, *body.Parameters); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetSearchAround(ctx, id)
}

func (r *Repo) DeleteSearchAround(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := r.Pool.Exec(ctx, `DELETE FROM vertex.search_around WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func insertSteps(ctx context.Context, tx pgx.Tx, parentID uuid.UUID, steps []models.SearchAroundStep) error {
	for i, s := range steps {
		filters, err := json.Marshal(s.Filters)
		if err != nil {
			return err
		}
		dir := s.Direction
		if dir == "" {
			dir = "outgoing"
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO vertex.search_around_step
			 (id, search_around_id, ordinal, relation_id, direction, filters_json)
			 VALUES ($1,$2,$3,$4,$5,$6)`,
			uuid.New(), parentID, i, s.RelationID, dir, filters); err != nil {
			return err
		}
	}
	return nil
}

func insertParameters(ctx context.Context, tx pgx.Tx, parentID uuid.UUID, params []models.SearchAroundParameter) error {
	for _, p := range params {
		if p.Name == "" {
			return errors.New("parameter name required")
		}
		typ := p.Type
		if typ == "" {
			typ = "string"
		}
		var defv any
		if len(p.DefaultValueJSON) > 0 {
			defv = []byte(p.DefaultValueJSON)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO vertex.search_around_parameter
			 (id, search_around_id, name, type, description, default_value_json, required)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			uuid.New(), parentID, p.Name, typ, p.Description, defv, p.Required); err != nil {
			return err
		}
	}
	return nil
}

func scanSearchAroundHeader(r rowLikeT) (*models.SearchAround, error) {
	sa := &models.SearchAround{}
	var project *uuid.UUID
	if err := r.Scan(&sa.ID, &sa.RID, &sa.Title, &sa.Description, &sa.StartingObjectTypeID,
		&project, &sa.OwnerID, &sa.CreatedAt, &sa.UpdatedAt); err != nil {
		return nil, err
	}
	sa.ProjectID = project
	sa.Steps = []models.SearchAroundStep{}
	sa.Parameters = []models.SearchAroundParameter{}
	return sa, nil
}

func (r *Repo) loadSearchAroundChildren(ctx context.Context, sa *models.SearchAround) error {
	stepRows, err := r.Pool.Query(ctx,
		`SELECT ordinal, relation_id, direction, filters_json
		 FROM vertex.search_around_step WHERE search_around_id = $1 ORDER BY ordinal`,
		sa.ID)
	if err != nil {
		return err
	}
	defer stepRows.Close()
	for stepRows.Next() {
		s := models.SearchAroundStep{}
		var filters []byte
		if err := stepRows.Scan(&s.Ordinal, &s.RelationID, &s.Direction, &filters); err != nil {
			return err
		}
		if len(filters) > 0 {
			if err := json.Unmarshal(filters, &s.Filters); err != nil {
				return err
			}
		}
		if s.Filters == nil {
			s.Filters = []models.SearchAroundFilter{}
		}
		sa.Steps = append(sa.Steps, s)
	}
	if err := stepRows.Err(); err != nil {
		return err
	}
	paramRows, err := r.Pool.Query(ctx,
		`SELECT name, type, description, default_value_json, required
		 FROM vertex.search_around_parameter WHERE search_around_id = $1 ORDER BY name`,
		sa.ID)
	if err != nil {
		return err
	}
	defer paramRows.Close()
	for paramRows.Next() {
		p := models.SearchAroundParameter{}
		var defv []byte
		if err := paramRows.Scan(&p.Name, &p.Type, &p.Description, &defv, &p.Required); err != nil {
			return err
		}
		p.DefaultValueJSON = defv
		sa.Parameters = append(sa.Parameters, p)
	}
	return paramRows.Err()
}

// ----- Scenario -----

func (r *Repo) ListScenarios(ctx context.Context, graphID uuid.UUID, page, perPage int) ([]models.Scenario, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 200 {
		perPage = 50
	}
	var total int
	if err := r.Pool.QueryRow(ctx, `SELECT count(*) FROM vertex.scenario WHERE graph_id = $1`, graphID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT id, graph_id, name, description, branch_context, author_id, created_at, updated_at
		 FROM vertex.scenario WHERE graph_id = $1
		 ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
		graphID, perPage, (page-1)*perPage)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]models.Scenario, 0)
	for rows.Next() {
		s, err := scanScenarioHeader(rows)
		if err != nil {
			return nil, 0, err
		}
		if err := r.loadScenarioEdits(ctx, s); err != nil {
			return nil, 0, err
		}
		out = append(out, *s)
	}
	return out, total, rows.Err()
}

func (r *Repo) GetScenario(ctx context.Context, id uuid.UUID) (*models.Scenario, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT id, graph_id, name, description, branch_context, author_id, created_at, updated_at
		 FROM vertex.scenario WHERE id = $1`, id)
	s, err := scanScenarioHeader(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := r.loadScenarioEdits(ctx, s); err != nil {
		return nil, err
	}
	return s, nil
}

func (r *Repo) CreateScenario(ctx context.Context, graphID uuid.UUID, body *models.CreateScenarioRequest, authorID uuid.UUID) (*models.Scenario, error) {
	if body.Name == "" {
		return nil, errors.New("name required")
	}
	id := uuid.New()
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `INSERT INTO vertex.scenario
		(id, graph_id, name, description, branch_context, author_id)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		id, graphID, body.Name, body.Description, body.BranchContext, authorID); err != nil {
		return nil, err
	}
	if err := insertScenarioEdits(ctx, tx, id, body.Edits); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetScenario(ctx, id)
}

func (r *Repo) UpdateScenario(ctx context.Context, id uuid.UUID, body *models.UpdateScenarioRequest) (*models.Scenario, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	sets := make([]string, 0, 2)
	args := make([]any, 0, 3)
	args = append(args, id)
	if body.Name != nil {
		args = append(args, *body.Name)
		sets = append(sets, fmt.Sprintf("name = $%d", len(args)))
	}
	if body.Description != nil {
		args = append(args, *body.Description)
		sets = append(sets, fmt.Sprintf("description = $%d", len(args)))
	}
	if len(sets) > 0 {
		sets = append(sets, "updated_at = NOW()")
		if _, err := tx.Exec(ctx,
			fmt.Sprintf(`UPDATE vertex.scenario SET %s WHERE id = $1`, strings.Join(sets, ", ")),
			args...); err != nil {
			return nil, err
		}
	}
	if body.Edits != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM vertex.scenario_edit WHERE scenario_id = $1`, id); err != nil {
			return nil, err
		}
		if err := insertScenarioEdits(ctx, tx, id, *body.Edits); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetScenario(ctx, id)
}

func (r *Repo) DeleteScenario(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := r.Pool.Exec(ctx, `DELETE FROM vertex.scenario WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func insertScenarioEdits(ctx context.Context, tx pgx.Tx, parentID uuid.UUID, edits []models.StagedEdit) error {
	for i, e := range edits {
		kind := e.Kind
		if kind == "" {
			return errors.New("scenario edit kind required")
		}
		var oldV, newV any
		if len(e.OldValueJSON) > 0 {
			oldV = []byte(e.OldValueJSON)
		}
		if len(e.NewValueJSON) > 0 {
			newV = []byte(e.NewValueJSON)
		}
		var actionID any
		if e.ActionID != nil {
			actionID = *e.ActionID
		}
		if _, err := tx.Exec(ctx, `INSERT INTO vertex.scenario_edit
			(id, scenario_id, kind, target_ref, property_name, old_value_json, new_value_json, action_id, ordinal)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			uuid.New(), parentID, kind, e.TargetRef, e.PropertyName, oldV, newV, actionID, i); err != nil {
			return err
		}
	}
	return nil
}

func scanScenarioHeader(r rowLikeT) (*models.Scenario, error) {
	s := &models.Scenario{}
	if err := r.Scan(&s.ID, &s.GraphID, &s.Name, &s.Description, &s.BranchContext, &s.AuthorID, &s.CreatedAt, &s.UpdatedAt); err != nil {
		return nil, err
	}
	s.Edits = []models.StagedEdit{}
	return s, nil
}

func (r *Repo) loadScenarioEdits(ctx context.Context, s *models.Scenario) error {
	rows, err := r.Pool.Query(ctx,
		`SELECT kind, target_ref, property_name, old_value_json, new_value_json, action_id
		 FROM vertex.scenario_edit WHERE scenario_id = $1 ORDER BY ordinal`,
		s.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		e := models.StagedEdit{}
		var oldV, newV []byte
		var actionID *uuid.UUID
		if err := rows.Scan(&e.Kind, &e.TargetRef, &e.PropertyName, &oldV, &newV, &actionID); err != nil {
			return err
		}
		e.OldValueJSON = oldV
		e.NewValueJSON = newV
		e.ActionID = actionID
		s.Edits = append(s.Edits, e)
	}
	return rows.Err()
}

// DiffScenario produces a deterministic-ish diff summary computed
// directly from the staged edits. It does NOT execute the edits
// against the live ontology — the live impact is computed by the
// frontend overlay or by ontology-query-service when explicitly
// requested. Cheap, useful for the "what changes if" sidebar.
func (r *Repo) DiffScenario(ctx context.Context, id uuid.UUID) (*models.ScenarioDiff, error) {
	s, err := r.GetScenario(ctx, id)
	if err != nil || s == nil {
		return nil, err
	}
	diff := &models.ScenarioDiff{
		ScenarioID:         id,
		ImpactedObjectRefs: []string{},
	}
	seen := make(map[string]struct{})
	for _, e := range s.Edits {
		if e.TargetRef != "" {
			if _, ok := seen[e.TargetRef]; !ok {
				seen[e.TargetRef] = struct{}{}
				diff.ImpactedObjectRefs = append(diff.ImpactedObjectRefs, e.TargetRef)
			}
		}
		switch e.Kind {
		case "property_change":
			diff.ChangedNodeCount++
		case "link_add":
			diff.AddedCount++
			diff.ChangedEdgeCount++
		case "link_remove":
			diff.RemovedCount++
			diff.ChangedEdgeCount++
		case "action_dryrun":
			diff.ChangedNodeCount++
		}
	}
	metrics, _ := json.Marshal(map[string]any{
		"edit_count":  len(s.Edits),
		"distinct_targets": len(seen),
		"computed_at": time.Now().UTC(),
	})
	diff.MetricsJSON = metrics
	return diff, nil
}

// ----- Derived property bindings -----

func (r *Repo) ListDerivedPropertyBindings(ctx context.Context, objectTypeID *uuid.UUID) ([]models.DerivedPropertyBinding, error) {
	var rows pgx.Rows
	var err error
	if objectTypeID != nil {
		rows, err = r.Pool.Query(ctx, `SELECT id, object_type_id, property_name, display_name, description,
			function_rid, return_type, owner_id, created_at, updated_at
			FROM vertex.derived_property_binding WHERE object_type_id = $1 ORDER BY property_name`, *objectTypeID)
	} else {
		rows, err = r.Pool.Query(ctx, `SELECT id, object_type_id, property_name, display_name, description,
			function_rid, return_type, owner_id, created_at, updated_at
			FROM vertex.derived_property_binding ORDER BY property_name`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.DerivedPropertyBinding, 0)
	for rows.Next() {
		b := models.DerivedPropertyBinding{}
		if err := rows.Scan(&b.ID, &b.ObjectTypeID, &b.PropertyName, &b.DisplayName, &b.Description,
			&b.FunctionRID, &b.ReturnType, &b.OwnerID, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (r *Repo) CreateDerivedPropertyBinding(ctx context.Context, body *models.CreateDerivedPropertyBindingRequest, ownerID uuid.UUID) (*models.DerivedPropertyBinding, error) {
	if body.ObjectTypeID == uuid.Nil || body.PropertyName == "" || body.FunctionRID == "" {
		return nil, errors.New("object_type_id, property_name and function_rid are required")
	}
	rt := body.ReturnType
	if rt == "" {
		rt = "string"
	}
	id := uuid.New()
	row := r.Pool.QueryRow(ctx, `INSERT INTO vertex.derived_property_binding
		(id, object_type_id, property_name, display_name, description, function_rid, return_type, owner_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, object_type_id, property_name, display_name, description,
			function_rid, return_type, owner_id, created_at, updated_at`,
		id, body.ObjectTypeID, body.PropertyName, body.DisplayName, body.Description,
		body.FunctionRID, rt, ownerID)
	b := &models.DerivedPropertyBinding{}
	if err := row.Scan(&b.ID, &b.ObjectTypeID, &b.PropertyName, &b.DisplayName, &b.Description,
		&b.FunctionRID, &b.ReturnType, &b.OwnerID, &b.CreatedAt, &b.UpdatedAt); err != nil {
		return nil, err
	}
	return b, nil
}

func (r *Repo) DeleteDerivedPropertyBinding(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := r.Pool.Exec(ctx, `DELETE FROM vertex.derived_property_binding WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
