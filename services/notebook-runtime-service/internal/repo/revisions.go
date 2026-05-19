package repo

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

// AutosaveInterval is the minimum gap between automatic snapshots.
// Matches the Foundry-documented "every 5 minutes if there's activity"
// behaviour.
const AutosaveInterval = 5 * time.Minute

// CreateRevisionParams is the snapshot payload. All document-state
// fields are copied verbatim from the live document so a revert can
// rehydrate the document without touching anything else.
type CreateRevisionParams struct {
	DocumentID  uuid.UUID
	AuthorID    uuid.UUID
	Kind        models.NotepadRevisionKind
	Name        string
	Endorsed    bool
	Title       string
	Description string
	Content     string
	ContentDoc  json.RawMessage
	Widgets     json.RawMessage
	TemplateKey *string
}

// NotepadRevisionRepository is the storage port for version history.
type NotepadRevisionRepository interface {
	ListRevisions(ctx context.Context, documentID, ownerID uuid.UUID, includeAutosaves bool) ([]models.NotepadRevision, error)
	GetRevision(ctx context.Context, documentID uuid.UUID, rev int64, ownerID uuid.UUID) (models.NotepadRevision, bool, error)
	CreateRevision(ctx context.Context, params CreateRevisionParams) (models.NotepadRevision, error)
	LastRevisionAt(ctx context.Context, documentID uuid.UUID) (time.Time, bool, error)
}

// ── Postgres backend ─────────────────────────────────────────────────

type PostgresNotepadRevisionRepository struct{ Pool *pgxpool.Pool }

func NewPostgresNotepadRevisionRepository(pool *pgxpool.Pool) *PostgresNotepadRevisionRepository {
	return &PostgresNotepadRevisionRepository{Pool: pool}
}

func (r *PostgresNotepadRevisionRepository) ListRevisions(ctx context.Context, documentID, ownerID uuid.UUID, includeAutosaves bool) ([]models.NotepadRevision, error) {
	// Ownership check by join: a document the caller does not own
	// yields zero rows rather than a separate error path. The handler
	// distinguishes "no document" from "no revisions" by also calling
	// GetDocument first.
	clauses := `r.document_id = $1 AND d.id = r.document_id AND d.owner_id = $2`
	args := []any{documentID, ownerID}
	if !includeAutosaves {
		clauses += ` AND r.kind <> 'autosave'`
	}
	rows, err := r.Pool.Query(ctx, `SELECT r.id, r.document_id, r.rev, r.kind, r.name, r.endorsed, r.author_id, r.title, r.description, r.content, r.content_doc, r.widgets, r.template_key, r.created_at
		FROM notepad_revisions r, notepad_documents d
		WHERE `+clauses+`
		ORDER BY r.rev DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.NotepadRevision{}
	for rows.Next() {
		rev, err := scanRevision(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rev)
	}
	return out, rows.Err()
}

func (r *PostgresNotepadRevisionRepository) GetRevision(ctx context.Context, documentID uuid.UUID, rev int64, ownerID uuid.UUID) (models.NotepadRevision, bool, error) {
	row := r.Pool.QueryRow(ctx, `SELECT r.id, r.document_id, r.rev, r.kind, r.name, r.endorsed, r.author_id, r.title, r.description, r.content, r.content_doc, r.widgets, r.template_key, r.created_at
		FROM notepad_revisions r, notepad_documents d
		WHERE r.document_id = $1 AND r.rev = $2 AND d.id = r.document_id AND d.owner_id = $3`, documentID, rev, ownerID)
	revision, err := scanRevision(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.NotepadRevision{}, false, nil
	}
	return revision, err == nil, err
}

func (r *PostgresNotepadRevisionRepository) CreateRevision(ctx context.Context, params CreateRevisionParams) (models.NotepadRevision, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return models.NotepadRevision{}, err
	}
	widgets := params.Widgets
	if len(widgets) == 0 || string(widgets) == "null" {
		widgets = json.RawMessage(`[]`)
	}
	contentDoc := params.ContentDoc
	if len(contentDoc) == 0 || string(contentDoc) == "null" {
		contentDoc = json.RawMessage(`{}`)
	}
	// rev is COALESCE(MAX(rev), -1)+1 so the first row is v0. A
	// UNIQUE(document_id, rev) constraint catches the rare concurrent
	// insert race; callers are expected to retry on 23505.
	row := r.Pool.QueryRow(ctx, `INSERT INTO notepad_revisions (id, document_id, rev, kind, name, endorsed, author_id, title, description, content, content_doc, widgets, template_key)
		VALUES ($1, $2, (SELECT COALESCE(MAX(rev), -1) + 1 FROM notepad_revisions WHERE document_id = $2), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, document_id, rev, kind, name, endorsed, author_id, title, description, content, content_doc, widgets, template_key, created_at`,
		id, params.DocumentID, string(params.Kind), params.Name, params.Endorsed, params.AuthorID, params.Title, params.Description, params.Content, string(contentDoc), string(widgets), params.TemplateKey)
	return scanRevision(row)
}

func (r *PostgresNotepadRevisionRepository) LastRevisionAt(ctx context.Context, documentID uuid.UUID) (time.Time, bool, error) {
	var t time.Time
	err := r.Pool.QueryRow(ctx, `SELECT MAX(created_at) FROM notepad_revisions WHERE document_id = $1`, documentID).Scan(&t)
	if errors.Is(err, pgx.ErrNoRows) {
		return time.Time{}, false, nil
	}
	if err != nil {
		return time.Time{}, false, err
	}
	if t.IsZero() {
		return time.Time{}, false, nil
	}
	return t, true, nil
}

func scanRevision(row scanner) (models.NotepadRevision, error) {
	var r models.NotepadRevision
	var kind string
	if err := row.Scan(&r.ID, &r.DocumentID, &r.Rev, &kind, &r.Name, &r.Endorsed, &r.AuthorID, &r.Title, &r.Description, &r.Content, &r.ContentDoc, &r.Widgets, &r.TemplateKey, &r.CreatedAt); err != nil {
		return models.NotepadRevision{}, err
	}
	r.Kind = models.NotepadRevisionKind(kind)
	return r, nil
}

// ── In-memory backend (used by unit tests and smoke mode) ────────────

type InMemoryNotepadRevisionRepository struct {
	mu        sync.Mutex
	revisions map[uuid.UUID][]models.NotepadRevision
	// docs is the doc-ownership oracle. Tests/callers must inject the
	// same InMemoryNotepadRepository instance so revisions inherit the
	// same ownership rules as documents.
	docs *InMemoryNotepadRepository
	// Now is the clock used to stamp CreatedAt. Override from tests
	// to make autosave threshold logic deterministic.
	Now func() time.Time
}

func NewInMemoryNotepadRevisionRepository(docs *InMemoryNotepadRepository) *InMemoryNotepadRevisionRepository {
	return &InMemoryNotepadRevisionRepository{
		revisions: map[uuid.UUID][]models.NotepadRevision{},
		docs:      docs,
		Now:       func() time.Time { return time.Now().UTC() },
	}
}

func (r *InMemoryNotepadRevisionRepository) now() time.Time {
	if r.Now != nil {
		return r.Now()
	}
	return time.Now().UTC()
}

func (r *InMemoryNotepadRevisionRepository) ListRevisions(_ context.Context, documentID, ownerID uuid.UUID, includeAutosaves bool) ([]models.NotepadRevision, error) {
	if !r.ownsDocument(documentID, ownerID) {
		return nil, nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	all := r.revisions[documentID]
	out := make([]models.NotepadRevision, 0, len(all))
	for _, rev := range all {
		if !includeAutosaves && rev.Kind == models.NotepadRevisionKindAutosave {
			continue
		}
		out = append(out, rev)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Rev > out[j].Rev })
	return out, nil
}

func (r *InMemoryNotepadRevisionRepository) GetRevision(_ context.Context, documentID uuid.UUID, rev int64, ownerID uuid.UUID) (models.NotepadRevision, bool, error) {
	if !r.ownsDocument(documentID, ownerID) {
		return models.NotepadRevision{}, false, nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, candidate := range r.revisions[documentID] {
		if candidate.Rev == rev {
			return candidate, true, nil
		}
	}
	return models.NotepadRevision{}, false, nil
}

func (r *InMemoryNotepadRevisionRepository) CreateRevision(_ context.Context, params CreateRevisionParams) (models.NotepadRevision, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return models.NotepadRevision{}, err
	}
	widgets := params.Widgets
	if len(widgets) == 0 || string(widgets) == "null" {
		widgets = json.RawMessage(`[]`)
	}
	contentDoc := params.ContentDoc
	if len(contentDoc) == 0 || string(contentDoc) == "null" {
		contentDoc = json.RawMessage(`{}`)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	all := r.revisions[params.DocumentID]
	next := int64(0)
	for _, existing := range all {
		if existing.Rev >= next {
			next = existing.Rev + 1
		}
	}
	revision := models.NotepadRevision{
		ID:          id,
		DocumentID:  params.DocumentID,
		Rev:         next,
		Kind:        params.Kind,
		Name:        params.Name,
		Endorsed:    params.Endorsed,
		AuthorID:    params.AuthorID,
		Title:       params.Title,
		Description: params.Description,
		Content:     params.Content,
		ContentDoc:  append(json.RawMessage(nil), contentDoc...),
		Widgets:     append(json.RawMessage(nil), widgets...),
		TemplateKey: params.TemplateKey,
		CreatedAt:   r.now(),
	}
	r.revisions[params.DocumentID] = append(all, revision)
	return revision, nil
}

func (r *InMemoryNotepadRevisionRepository) LastRevisionAt(_ context.Context, documentID uuid.UUID) (time.Time, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	all := r.revisions[documentID]
	if len(all) == 0 {
		return time.Time{}, false, nil
	}
	last := all[0].CreatedAt
	for _, rev := range all[1:] {
		if rev.CreatedAt.After(last) {
			last = rev.CreatedAt
		}
	}
	return last, true, nil
}

func (r *InMemoryNotepadRevisionRepository) ownsDocument(documentID, ownerID uuid.UUID) bool {
	if r.docs == nil {
		return true
	}
	r.docs.mu.Lock()
	defer r.docs.mu.Unlock()
	doc, ok := r.docs.documents[documentID]
	return ok && doc.OwnerID == ownerID
}
