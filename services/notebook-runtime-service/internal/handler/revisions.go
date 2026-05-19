// Slice F (version history) handlers. Mounted by server.go alongside
// the existing notepad routes:
//
//	GET    /api/v1/notepad/documents/{document_id}/revisions[?include=all]
//	GET    /api/v1/notepad/documents/{document_id}/revisions/{rev}
//	POST   /api/v1/notepad/documents/{document_id}/revisions
//	POST   /api/v1/notepad/documents/{document_id}/revisions/{rev}/revert
package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
	nbrepo "github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/repo"
)

// ListRevisions returns the history for a document. `?include=all`
// includes autosaves; otherwise only manual / initial entries are
// returned, matching the Foundry default UI filter.
func (s *State) ListRevisions(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	documentID, err := pathUUID(r, "document_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid document id"))
		return
	}
	// Owner check up front so we 404 the document before exposing
	// "no revisions" for a doc the caller does not own.
	if _, ok, err := s.notepadRepo().GetDocument(r.Context(), documentID, claims.Sub); err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	} else if !ok {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	includeAutosaves := strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("include")), "all")
	revisions, err := s.revisionRepo().ListRevisions(r.Context(), documentID, claims.Sub, includeAutosaves)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if revisions == nil {
		revisions = []models.NotepadRevision{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": revisions})
}

// GetRevision returns one snapshot in full so the UI can preview it.
func (s *State) GetRevision(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	documentID, err := pathUUID(r, "document_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid document id"))
		return
	}
	rev, err := pathInt64(r, "rev")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid rev"))
		return
	}
	revision, ok, err := s.revisionRepo().GetRevision(r.Context(), documentID, rev, claims.Sub)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	writeJSON(w, http.StatusOK, revision)
}

// CreateRevision snapshots the current document as a manual revision.
// Optional `name` is shown next to the version label in the panel;
// `endorsed` marks the revision with the blue check badge.
func (s *State) CreateRevision(w http.ResponseWriter, r *http.Request) {
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
	var body models.CreateNotepadRevisionRequest
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
			return
		}
	}
	revision, err := s.revisionRepo().CreateRevision(r.Context(), nbrepo.CreateRevisionParams{
		DocumentID:  doc.ID,
		AuthorID:    claims.Sub,
		Kind:        models.NotepadRevisionKindManual,
		Name:        strings.TrimSpace(body.Name),
		Endorsed:    body.Endorsed,
		Title:       doc.Title,
		Description: doc.Description,
		Content:     doc.Content,
		ContentDoc:  doc.ContentDoc,
		Widgets:     doc.Widgets,
		TemplateKey: doc.TemplateKey,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusCreated, revision)
}

// RevertRevision rewinds the live document to a past snapshot. To
// keep the action reversible, the *current* document state is
// snapshotted as an autosave before the rewind, so the user can
// always revert their revert.
func (s *State) RevertRevision(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	documentID, err := pathUUID(r, "document_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid document id"))
		return
	}
	targetRev, err := pathInt64(r, "rev")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid rev"))
		return
	}
	current, ok, err := s.notepadRepo().GetDocument(r.Context(), documentID, claims.Sub)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	target, ok, err := s.revisionRepo().GetRevision(r.Context(), documentID, targetRev, claims.Sub)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, errBody("revision not found"))
		return
	}
	// Snapshot the current state so the rewind is undoable.
	if _, err := s.revisionRepo().CreateRevision(r.Context(), nbrepo.CreateRevisionParams{
		DocumentID:  current.ID,
		AuthorID:    claims.Sub,
		Kind:        models.NotepadRevisionKindAutosave,
		Title:       current.Title,
		Description: current.Description,
		Content:     current.Content,
		ContentDoc:  current.ContentDoc,
		Widgets:     current.Widgets,
		TemplateKey: current.TemplateKey,
	}); err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody("pre-revert snapshot failed: "+err.Error()))
		return
	}
	updated, ok, err := s.notepadRepo().UpdateDocument(r.Context(), nbrepo.UpdateDocumentParams{
		ID:          current.ID,
		OwnerID:     claims.Sub,
		Title:       stringPtr(target.Title),
		Description: stringPtr(target.Description),
		Content:     stringPtr(target.Content),
		ContentDoc:  target.ContentDoc,
		TemplateKey: target.TemplateKey,
		Widgets:     target.Widgets,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func pathInt64(r *http.Request, key string) (int64, error) {
	raw := chi.URLParam(r, key)
	if raw == "" {
		return 0, errInvalid("missing path parameter " + key)
	}
	return strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
}

func stringPtr(v string) *string { return &v }

// silence unused-import warning when uuid is only referenced via the
// signatures above (the symbol is still required so the linker keeps
// the package).
var _ = uuid.Nil
