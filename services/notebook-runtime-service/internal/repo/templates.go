package repo

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

type CreateTemplateParams struct {
	OwnerID      uuid.UUID
	Name         string
	Description  string
	Title        string
	Content      string
	ContentDoc   json.RawMessage
	Widgets      json.RawMessage
	InputsSchema []models.NotepadTemplateInput
	Visibility   string
	TemplateKey  *string
}

type UpdateTemplateParams struct {
	ID           uuid.UUID
	OwnerID      uuid.UUID
	Name         *string
	Description  *string
	Title        *string
	Content      *string
	ContentDoc   json.RawMessage
	Widgets      json.RawMessage
	InputsSchema []models.NotepadTemplateInput
	Visibility   *string
	TemplateKey  *string
}

type NotepadTemplateRepository interface {
	ListTemplates(ctx context.Context, ownerID uuid.UUID) ([]models.NotepadTemplate, error)
	GetTemplate(ctx context.Context, id uuid.UUID, ownerID uuid.UUID) (models.NotepadTemplate, bool, error)
	CreateTemplate(ctx context.Context, params CreateTemplateParams) (models.NotepadTemplate, error)
	UpdateTemplate(ctx context.Context, params UpdateTemplateParams) (models.NotepadTemplate, bool, error)
	DeleteTemplate(ctx context.Context, id uuid.UUID, ownerID uuid.UUID) (bool, error)
}

// ── Postgres backend ─────────────────────────────────────────────────

type PostgresNotepadTemplateRepository struct{ Pool *pgxpool.Pool }

func NewPostgresNotepadTemplateRepository(pool *pgxpool.Pool) *PostgresNotepadTemplateRepository {
	return &PostgresNotepadTemplateRepository{Pool: pool}
}

func (r *PostgresNotepadTemplateRepository) ListTemplates(ctx context.Context, ownerID uuid.UUID) ([]models.NotepadTemplate, error) {
	rows, err := r.Pool.Query(ctx, `SELECT id, owner_id, name, description, title, content, content_doc, widgets, inputs_schema, visibility, template_key, created_at, updated_at
		FROM notepad_templates
		WHERE owner_id = $1
		ORDER BY updated_at DESC, created_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.NotepadTemplate{}
	for rows.Next() {
		tpl, err := scanTemplate(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, tpl)
	}
	return out, rows.Err()
}

func (r *PostgresNotepadTemplateRepository) GetTemplate(ctx context.Context, id uuid.UUID, ownerID uuid.UUID) (models.NotepadTemplate, bool, error) {
	row := r.Pool.QueryRow(ctx, `SELECT id, owner_id, name, description, title, content, content_doc, widgets, inputs_schema, visibility, template_key, created_at, updated_at
		FROM notepad_templates WHERE id = $1 AND owner_id = $2`, id, ownerID)
	tpl, err := scanTemplate(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.NotepadTemplate{}, false, nil
	}
	return tpl, err == nil, err
}

func (r *PostgresNotepadTemplateRepository) CreateTemplate(ctx context.Context, params CreateTemplateParams) (models.NotepadTemplate, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return models.NotepadTemplate{}, err
	}
	widgets := params.Widgets
	if len(widgets) == 0 || string(widgets) == "null" {
		widgets = json.RawMessage(`[]`)
	}
	contentDoc := params.ContentDoc
	if len(contentDoc) == 0 || string(contentDoc) == "null" {
		contentDoc = json.RawMessage(`{}`)
	}
	inputs, err := json.Marshal(params.InputsSchema)
	if err != nil {
		return models.NotepadTemplate{}, err
	}
	visibility := strings.TrimSpace(params.Visibility)
	if visibility == "" {
		visibility = "private"
	}
	row := r.Pool.QueryRow(ctx, `INSERT INTO notepad_templates
		(id, owner_id, name, description, title, content, content_doc, widgets, inputs_schema, visibility, template_key)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, owner_id, name, description, title, content, content_doc, widgets, inputs_schema, visibility, template_key, created_at, updated_at`,
		id, params.OwnerID, params.Name, params.Description, params.Title, params.Content, string(contentDoc), string(widgets), string(inputs), visibility, params.TemplateKey)
	return scanTemplate(row)
}

func (r *PostgresNotepadTemplateRepository) UpdateTemplate(ctx context.Context, params UpdateTemplateParams) (models.NotepadTemplate, bool, error) {
	var inputs any
	if params.InputsSchema != nil {
		raw, err := json.Marshal(params.InputsSchema)
		if err != nil {
			return models.NotepadTemplate{}, false, err
		}
		inputs = string(raw)
	}
	row := r.Pool.QueryRow(ctx, `UPDATE notepad_templates
		SET name = COALESCE($3, name),
		    description = COALESCE($4, description),
		    title = COALESCE($5, title),
		    content = COALESCE($6, content),
		    content_doc = COALESCE($7, content_doc),
		    widgets = COALESCE($8, widgets),
		    inputs_schema = COALESCE($9, inputs_schema),
		    visibility = COALESCE($10, visibility),
		    template_key = COALESCE($11, template_key),
		    updated_at = NOW()
		WHERE id = $1 AND owner_id = $2
		RETURNING id, owner_id, name, description, title, content, content_doc, widgets, inputs_schema, visibility, template_key, created_at, updated_at`,
		params.ID, params.OwnerID, params.Name, params.Description, params.Title, params.Content,
		nullableJSON(params.ContentDoc), nullableJSON(params.Widgets), inputs, params.Visibility, params.TemplateKey)
	tpl, err := scanTemplate(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.NotepadTemplate{}, false, nil
	}
	return tpl, err == nil, err
}

func (r *PostgresNotepadTemplateRepository) DeleteTemplate(ctx context.Context, id uuid.UUID, ownerID uuid.UUID) (bool, error) {
	ct, err := r.Pool.Exec(ctx, `DELETE FROM notepad_templates WHERE id = $1 AND owner_id = $2`, id, ownerID)
	return ct.RowsAffected() > 0, err
}

func scanTemplate(row scanner) (models.NotepadTemplate, error) {
	var tpl models.NotepadTemplate
	var inputsRaw json.RawMessage
	if err := row.Scan(&tpl.ID, &tpl.OwnerID, &tpl.Name, &tpl.Description, &tpl.Title,
		&tpl.Content, &tpl.ContentDoc, &tpl.Widgets, &inputsRaw, &tpl.Visibility,
		&tpl.TemplateKey, &tpl.CreatedAt, &tpl.UpdatedAt); err != nil {
		return models.NotepadTemplate{}, err
	}
	if len(inputsRaw) == 0 || string(inputsRaw) == "null" {
		tpl.InputsSchema = []models.NotepadTemplateInput{}
		return tpl, nil
	}
	if err := json.Unmarshal(inputsRaw, &tpl.InputsSchema); err != nil {
		return models.NotepadTemplate{}, err
	}
	return tpl, nil
}

// ── In-memory backend ────────────────────────────────────────────────

type InMemoryNotepadTemplateRepository struct {
	mu        sync.Mutex
	templates map[uuid.UUID]models.NotepadTemplate
	now       func() time.Time
}

func NewInMemoryNotepadTemplateRepository() *InMemoryNotepadTemplateRepository {
	return &InMemoryNotepadTemplateRepository{
		templates: map[uuid.UUID]models.NotepadTemplate{},
		now:       func() time.Time { return time.Now().UTC() },
	}
}

func (r *InMemoryNotepadTemplateRepository) ListTemplates(_ context.Context, ownerID uuid.UUID) ([]models.NotepadTemplate, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []models.NotepadTemplate{}
	for _, tpl := range r.templates {
		if tpl.OwnerID == ownerID {
			out = append(out, tpl)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if !out[i].UpdatedAt.Equal(out[j].UpdatedAt) {
			return out[i].UpdatedAt.After(out[j].UpdatedAt)
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out, nil
}

func (r *InMemoryNotepadTemplateRepository) GetTemplate(_ context.Context, id uuid.UUID, ownerID uuid.UUID) (models.NotepadTemplate, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	tpl, ok := r.templates[id]
	if !ok || tpl.OwnerID != ownerID {
		return models.NotepadTemplate{}, false, nil
	}
	return tpl, true, nil
}

func (r *InMemoryNotepadTemplateRepository) CreateTemplate(_ context.Context, params CreateTemplateParams) (models.NotepadTemplate, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	id, err := uuid.NewV7()
	if err != nil {
		return models.NotepadTemplate{}, err
	}
	widgets := params.Widgets
	if len(widgets) == 0 || string(widgets) == "null" {
		widgets = json.RawMessage(`[]`)
	}
	contentDoc := params.ContentDoc
	if len(contentDoc) == 0 || string(contentDoc) == "null" {
		contentDoc = json.RawMessage(`{}`)
	}
	visibility := strings.TrimSpace(params.Visibility)
	if visibility == "" {
		visibility = "private"
	}
	now := r.now()
	tpl := models.NotepadTemplate{
		ID:           id,
		OwnerID:      params.OwnerID,
		Name:         params.Name,
		Description:  params.Description,
		Title:        params.Title,
		Content:      params.Content,
		ContentDoc:   append(json.RawMessage(nil), contentDoc...),
		Widgets:      append(json.RawMessage(nil), widgets...),
		InputsSchema: append([]models.NotepadTemplateInput(nil), params.InputsSchema...),
		Visibility:   visibility,
		TemplateKey:  params.TemplateKey,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	r.templates[id] = tpl
	return tpl, nil
}

func (r *InMemoryNotepadTemplateRepository) UpdateTemplate(_ context.Context, params UpdateTemplateParams) (models.NotepadTemplate, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	tpl, ok := r.templates[params.ID]
	if !ok || tpl.OwnerID != params.OwnerID {
		return models.NotepadTemplate{}, false, nil
	}
	if params.Name != nil {
		tpl.Name = *params.Name
	}
	if params.Description != nil {
		tpl.Description = *params.Description
	}
	if params.Title != nil {
		tpl.Title = *params.Title
	}
	if params.Content != nil {
		tpl.Content = *params.Content
	}
	if len(params.ContentDoc) > 0 && string(params.ContentDoc) != "null" {
		tpl.ContentDoc = append(json.RawMessage(nil), params.ContentDoc...)
	}
	if len(params.Widgets) > 0 && string(params.Widgets) != "null" {
		tpl.Widgets = append(json.RawMessage(nil), params.Widgets...)
	}
	if params.InputsSchema != nil {
		tpl.InputsSchema = append([]models.NotepadTemplateInput(nil), params.InputsSchema...)
	}
	if params.Visibility != nil {
		tpl.Visibility = *params.Visibility
	}
	if params.TemplateKey != nil {
		tpl.TemplateKey = params.TemplateKey
	}
	tpl.UpdatedAt = r.now()
	r.templates[params.ID] = tpl
	return tpl, true, nil
}

func (r *InMemoryNotepadTemplateRepository) DeleteTemplate(_ context.Context, id uuid.UUID, ownerID uuid.UUID) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	tpl, ok := r.templates[id]
	if !ok || tpl.OwnerID != ownerID {
		return false, nil
	}
	delete(r.templates, id)
	return true, nil
}
