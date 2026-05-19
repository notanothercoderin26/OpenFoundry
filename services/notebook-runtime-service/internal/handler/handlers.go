// Package handler hosts the HTTP handlers for notebook-runtime-service.
//
// Status:
//
//   - Notebook + Cell + Session CRUD: 1:1 ported against pgx (matches
//     Rust sqlx). When the DB pool is nil, explicit smoke mode uses an
//     in-memory repository; otherwise handlers return a database-required 503.
//   - Workspace file CRUD: filesystem-backed via `domain/environment`.
//   - Notepad export: HTML rendering via `domain/notepad`.
//   - Cell execute (`ExecuteCell` / `ExecuteAllCells`): Python cells run
//     through the python-sidecar gRPC boundary. SQL mirrors Rust by POSTing
//     to query-service, R shells out to Rscript, and LLM mirrors Rust by
//     POSTing to ai-service chat completions while tracking conversations.
//
// Notepad documents + presence are repository-backed. The no-DB test/smoke
// path uses the in-memory repository; production uses Postgres.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/domain/environment"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/domain/notepad"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/kernelgw"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
	nbrepo "github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/repo"
)

// State carries the deps every handler needs.
type State struct {
	Cfg          *config.Config
	Pool         *pgxpool.Pool
	PythonKernel NotebookPythonKernel
	SQLKernel    NotebookSQLKernel
	RKernel      NotebookRKernel
	LLMKernel    NotebookLLMKernel
	NotepadRepo  nbrepo.NotepadRepository
	RevisionRepo nbrepo.NotepadRevisionRepository
	TemplateRepo nbrepo.NotepadTemplateRepository
	WidgetResolver notepad.WidgetResolver
	AIPTransformer notepad.AIPTransformer
	ListRepo     NotebookListRepository
	MemoryRepo   *MemoryNotebookRepo
	// Now is the clock used by autosave / revert. Defaults to
	// time.Now when nil; tests override it for determinism.
	Now func() time.Time

	// jupyter/kernel-gateway proxy deps. All optional — when nil the
	// gateway-backed routes return 503.
	KernelGW       *kernelgw.Client
	KernelMappings kernelgw.MappingRepo
	ExecuteGuard   kernelgw.ExecuteGuard

	// Gotenberg is the HTML→PDF converter. nil disables PDF export and
	// the endpoint returns 503 with the documented error message.
	Gotenberg *notepad.GotenbergClient
}

func (s *State) smokeMode() bool {
	return s.Cfg != nil && s.Cfg.SmokeMode
}

func (s *State) memoryRepo() *MemoryNotebookRepo {
	if s.MemoryRepo == nil {
		s.MemoryRepo = NewMemoryNotebookRepo()
	}
	return s.MemoryRepo
}

func (s *State) notebookListRepo() NotebookListRepository {
	if s.ListRepo != nil {
		return s.ListRepo
	}
	if s.Pool != nil {
		return PostgresNotebookListRepository{Pool: s.Pool}
	}
	if s.smokeMode() {
		return s.memoryRepo()
	}
	return nil
}

func (s *State) databaseRequired(w http.ResponseWriter) {
	writeJSON(w, http.StatusServiceUnavailable, errBody("DATABASE_URL is required unless NOTEBOOK_RUNTIME_SMOKE_MODE=true"))
}

// ── Workspace files (1:1 ported domain/environment) ──────────────────

func (s *State) ListWorkspaceFiles(w http.ResponseWriter, r *http.Request) {
	nb, err := pathUUID(r, "notebook_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid notebook id"))
		return
	}
	files, err := environment.ListWorkspaceFiles(s.Cfg.DataDir, nb)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": files})
}

func (s *State) UpsertWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	nb, err := pathUUID(r, "notebook_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid notebook id"))
		return
	}
	var body models.UpsertNotebookWorkspaceFileRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
		return
	}
	file, err := environment.UpsertWorkspaceFile(s.Cfg.DataDir, nb, body.Path, body.Content)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, file)
}

func (s *State) DeleteWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	nb, err := pathUUID(r, "notebook_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid notebook id"))
		return
	}
	path := r.URL.Query().Get("path")
	ok, err := environment.DeleteWorkspaceFile(s.Cfg.DataDir, nb, path)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody(err.Error()))
		return
	}
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Notepad documents + presence ───────────────────────────────────

func (s *State) notepadRepo() nbrepo.NotepadRepository {
	if s.NotepadRepo != nil {
		return s.NotepadRepo
	}
	if s.Pool != nil {
		s.NotepadRepo = nbrepo.NewPostgresNotepadRepository(s.Pool)
		return s.NotepadRepo
	}
	s.NotepadRepo = nbrepo.NewInMemoryNotepadRepository()
	return s.NotepadRepo
}

func (s *State) revisionRepo() nbrepo.NotepadRevisionRepository {
	if s.RevisionRepo != nil {
		return s.RevisionRepo
	}
	if s.Pool != nil {
		s.RevisionRepo = nbrepo.NewPostgresNotepadRevisionRepository(s.Pool)
		return s.RevisionRepo
	}
	// In-memory revision repo needs the same docs oracle as the
	// in-memory notepad repo so ownership checks line up. Falls back
	// to an unowned repo (every ownerID succeeds) if the notepad repo
	// is some other implementation under test.
	if in, ok := s.notepadRepo().(*nbrepo.InMemoryNotepadRepository); ok {
		s.RevisionRepo = nbrepo.NewInMemoryNotepadRevisionRepository(in)
	} else {
		s.RevisionRepo = nbrepo.NewInMemoryNotepadRevisionRepository(nil)
	}
	return s.RevisionRepo
}

func (s *State) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now().UTC()
}

func (s *State) ListDocuments(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	page := parseInt64Query(r, "page", 1)
	perPage := parseInt64Query(r, "per_page", 20)
	result, err := s.notepadRepo().ListDocuments(r.Context(), nbrepo.ListDocumentsParams{
		OwnerID: claims.Sub,
		Page:    page,
		PerPage: perPage,
		Search:  r.URL.Query().Get("search"),
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *State) CreateDocument(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	var body models.CreateNotepadDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		writeJSON(w, http.StatusBadRequest, errBody("title is required"))
		return
	}
	doc, err := s.notepadRepo().CreateDocument(r.Context(), nbrepo.CreateDocumentParams{
		Title:       title,
		Description: strPtrValue(body.Description),
		OwnerID:     claims.Sub,
		Content:     strPtrValue(body.Content),
		ContentDoc:  body.ContentDoc,
		TemplateKey: nonEmptyPtr(body.TemplateKey),
		Widgets:     body.Widgets,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	// Seed v0 ("Initial empty document") so the version-history panel
	// always has an anchor row to revert to.
	if _, err := s.revisionRepo().CreateRevision(r.Context(), nbrepo.CreateRevisionParams{
		DocumentID:  doc.ID,
		AuthorID:    claims.Sub,
		Kind:        models.NotepadRevisionKindInitial,
		Title:       doc.Title,
		Description: doc.Description,
		Content:     doc.Content,
		ContentDoc:  doc.ContentDoc,
		Widgets:     doc.Widgets,
		TemplateKey: doc.TemplateKey,
	}); err != nil {
		// Revision seed is best-effort: the document is already
		// committed, so we surface the error in logs (none wired
		// here) but do not 500 the create. The UI will just show
		// "no history yet" until the next autosave.
		_ = err
	}
	writeJSON(w, http.StatusCreated, doc)
}

func (s *State) GetDocument(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	documentID, err := pathUUID(r, "document_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid document id"))
		return
	}
	doc, ok, err := s.notepadRepo().GetDocument(r.Context(), documentID, claims.Sub)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

func (s *State) UpdateDocument(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	documentID, err := pathUUID(r, "document_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid document id"))
		return
	}
	var body models.UpdateNotepadDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
		return
	}
	doc, ok, err := s.notepadRepo().UpdateDocument(r.Context(), nbrepo.UpdateDocumentParams{
		ID:            documentID,
		OwnerID:       claims.Sub,
		Title:         nonEmptyPtr(body.Title),
		Description:   body.Description,
		Content:       body.Content,
		ContentDoc:    body.ContentDoc,
		TemplateKey:   nonEmptyPtr(body.TemplateKey),
		Widgets:       body.Widgets,
		LastIndexedAt: body.LastIndexedAt,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	// Skip the autosave check on metadata-only updates (e.g. AIP
	// indexing setting `last_indexed_at`) — those should not produce
	// a "v17 Manually saved version" entry in the panel.
	if isContentEditingUpdate(&body) {
		s.maybeAutosave(r.Context(), &doc, claims.Sub)
	}
	writeJSON(w, http.StatusOK, doc)
}

func isContentEditingUpdate(body *models.UpdateNotepadDocumentRequest) bool {
	if body.Title != nil || body.Description != nil {
		return true
	}
	if body.Content != nil {
		return true
	}
	if len(body.ContentDoc) > 0 && string(body.ContentDoc) != "null" {
		return true
	}
	if len(body.Widgets) > 0 && string(body.Widgets) != "null" {
		return true
	}
	return false
}

// maybeAutosave snapshots the document into notepad_revisions when
// the gap since the last revision is at least nbrepo.AutosaveInterval.
// The snapshot reflects the *post-update* state so reverting to it
// rehydrates the document to "what it looked like at this moment".
// Best-effort — never fails the parent request.
func (s *State) maybeAutosave(ctx context.Context, doc *models.NotepadDocument, authorID uuid.UUID) {
	last, ok, err := s.revisionRepo().LastRevisionAt(ctx, doc.ID)
	if err != nil {
		return
	}
	if ok && s.now().Sub(last) < nbrepo.AutosaveInterval {
		return
	}
	_, _ = s.revisionRepo().CreateRevision(ctx, nbrepo.CreateRevisionParams{
		DocumentID:  doc.ID,
		AuthorID:    authorID,
		Kind:        models.NotepadRevisionKindAutosave,
		Title:       doc.Title,
		Description: doc.Description,
		Content:     doc.Content,
		ContentDoc:  doc.ContentDoc,
		Widgets:     doc.Widgets,
		TemplateKey: doc.TemplateKey,
	})
}

func (s *State) DeleteDocument(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	documentID, err := pathUUID(r, "document_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid document id"))
		return
	}
	ok, err := s.notepadRepo().DeleteDocument(r.Context(), documentID, claims.Sub)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *State) ListPresence(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	documentID, err := pathUUID(r, "document_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid document id"))
		return
	}
	presence, err := s.notepadRepo().ListPresence(r.Context(), documentID, claims.Sub)
	if errors.Is(err, nbrepo.ErrNotFound) {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": presence})
}

func (s *State) UpsertPresence(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	documentID, err := pathUUID(r, "document_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid document id"))
		return
	}
	var body models.UpsertNotepadPresenceRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
		return
	}
	sessionID := strings.TrimSpace(body.SessionID)
	displayName := strings.TrimSpace(body.DisplayName)
	if sessionID == "" || displayName == "" {
		writeJSON(w, http.StatusBadRequest, errBody("session_id and display_name are required"))
		return
	}
	presence, err := s.notepadRepo().UpsertPresence(r.Context(), nbrepo.UpsertPresenceParams{
		DocumentID:  documentID,
		OwnerID:     claims.Sub,
		UserID:      claims.Sub,
		SessionID:   sessionID,
		DisplayName: displayName,
		CursorLabel: strPtrValue(body.CursorLabel),
		Color:       defaultStr(strPtrValue(body.Color), "#0f766e"),
	})
	if errors.Is(err, nbrepo.ErrNotFound) {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, presence)
}

// ExportDocument renders the notepad document in the requested format.
// Behaviour:
//
//   - format=html (default, or `?format=html`) returns the legacy JSON
//     envelope `NotepadExportPayload` so existing frontend code keeps
//     working.
//   - format=pdf streams a PDF body (Content-Type application/pdf)
//     produced by the Gotenberg sidecar from the TipTap-rendered HTML.
//     Returns 503 when Gotenberg is not configured.
//   - format=docx streams a DOCX body (Content-Type
//     application/vnd.openxmlformats-officedocument.wordprocessingml.document)
//     produced by the pure-Go writer.
//
// The request body MAY include a `NotepadExportRequest` so unsaved
// edits can be exported without round-tripping through Postgres. When
// the body is missing or empty the persisted document is used.
func (s *State) ExportDocument(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}

	format := exportFormatFromRequest(r)

	exportReq := models.NotepadExportRequest{}
	if r.Body != nil && r.ContentLength != 0 {
		_ = json.NewDecoder(r.Body).Decode(&exportReq)
	}

	doc, ok, err := s.resolveExportDocument(r, claims.Sub, &exportReq)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}

	if exportReq.Format != "" {
		format = exportReq.Format
	}

	switch format {
	case models.NotepadExportFormatPDF:
		s.exportPDF(w, r, &doc, exportReq.HTMLBody)
	case models.NotepadExportFormatDOCX:
		exportDOCX(w, &doc, exportReq.HTMLBody)
	case models.NotepadExportFormatHTML, "":
		writeJSON(w, http.StatusOK, notepad.RenderExportPayloadHTML(&doc, exportReq.HTMLBody))
	default:
		writeJSON(w, http.StatusBadRequest, errBody("unsupported export format: "+string(format)))
	}
}

func exportFormatFromRequest(r *http.Request) models.NotepadExportFormat {
	raw := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	return models.NotepadExportFormat(raw)
}

// resolveExportDocument picks the document the export will render
// from. Priority: explicit body (with non-empty Title), then the
// persisted document keyed by path param. The lookup never falls
// through silently — a missing document_id triggers a 400 via
// pathUUID.
func (s *State) resolveExportDocument(r *http.Request, ownerID uuid.UUID, req *models.NotepadExportRequest) (models.NotepadDocument, bool, error) {
	if req != nil && (req.ID != uuid.Nil || strings.TrimSpace(req.Title) != "") {
		return req.NotepadDocument, true, nil
	}
	documentID, err := pathUUID(r, "document_id")
	if err != nil {
		return models.NotepadDocument{}, false, errInvalid("invalid document id")
	}
	return s.notepadRepo().GetDocument(r.Context(), documentID, ownerID)
}

func (s *State) exportPDF(w http.ResponseWriter, r *http.Request, doc *models.NotepadDocument, htmlBody string) {
	if s.Gotenberg == nil {
		writeJSON(w, http.StatusServiceUnavailable, errBody(notepad.ErrGotenbergDisabled.Error()))
		return
	}
	htmlEnvelope := notepad.WrapHTMLBody(doc, htmlBody)
	pdf, err := s.Gotenberg.ConvertHTMLToPDF(r.Context(), htmlEnvelope)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errBody("pdf conversion failed: "+err.Error()))
		return
	}
	fileName := exportFileName(doc.Title, "pdf")
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="`+fileName+`"; filename*=UTF-8''`+url.PathEscape(fileName))
	w.Header().Set("Content-Length", strconv.Itoa(len(pdf)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdf)
}

func exportDOCX(w http.ResponseWriter, doc *models.NotepadDocument, htmlBody string) {
	body := htmlBody
	if strings.TrimSpace(body) == "" {
		// Fall back to the legacy markdown renderer so older documents
		// still produce a DOCX.
		body = notepad.RenderMarkdown(doc.Content)
	} else {
		body = notepad.Sanitize(body)
	}
	docx, err := notepad.RenderDOCX(doc.Title, doc.Description, body)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody("docx conversion failed: "+err.Error()))
		return
	}
	fileName := exportFileName(doc.Title, "docx")
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	w.Header().Set("Content-Disposition", `attachment; filename="`+fileName+`"; filename*=UTF-8''`+url.PathEscape(fileName))
	w.Header().Set("Content-Length", strconv.Itoa(len(docx)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(docx)
}

func exportFileName(title, ext string) string {
	slug := notepad.Slugify(strings.TrimSpace(title))
	if slug == "" {
		slug = "notepad-export"
	}
	return slug + "." + ext
}


func parseInt64Query(r *http.Request, key string, fallback int64) int64 {
	if raw := r.URL.Query().Get(key); raw != "" {
		if v, err := strconv.ParseInt(raw, 10, 64); err == nil {
			return v
		}
	}
	return fallback
}

func strPtrValue(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func nonEmptyPtr(v *string) *string {
	if v == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*v)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func defaultStr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

// ── Auth helper ──────────────────────────────────────────────────────

// requireClaims pulls the JWT claims attached by authmw. Returns nil
// + writes 401 when the upstream middleware has not been wired (or
// the JWT was absent / invalid).
func requireClaims(w http.ResponseWriter, r *http.Request) *authmw.Claims {
	c, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("missing claims"))
		return nil
	}
	return c
}

// ── Shared utilities ─────────────────────────────────────────────────

func pathUUID(r *http.Request, key string) (uuid.UUID, error) {
	raw := chi.URLParam(r, key)
	if raw == "" {
		return uuid.Nil, errInvalid("missing path parameter " + key)
	}
	return uuid.Parse(strings.TrimSpace(raw))
}

func errBody(msg string) map[string]string { return map[string]string{"error": msg} }

func errInvalid(msg string) error { return errors.New(msg) }

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}
