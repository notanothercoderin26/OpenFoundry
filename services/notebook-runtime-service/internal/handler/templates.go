// Slice G — Notepad templates. Standalone artifacts that can spawn
// many documents via /templates/{id}/instantiate.
//
//	GET    /api/v1/notepad/templates
//	POST   /api/v1/notepad/templates
//	GET    /api/v1/notepad/templates/{template_id}
//	PATCH  /api/v1/notepad/templates/{template_id}
//	DELETE /api/v1/notepad/templates/{template_id}
//	POST   /api/v1/notepad/templates/{template_id}/instantiate
//
// Token substitution lives in domain/notepad/templates.go — the
// handler only validates auth + ownership and translates errors.
package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/domain/notepad"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
	nbrepo "github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/repo"
)

func (s *State) templateRepo() nbrepo.NotepadTemplateRepository {
	if s.TemplateRepo != nil {
		return s.TemplateRepo
	}
	if s.Pool != nil {
		s.TemplateRepo = nbrepo.NewPostgresNotepadTemplateRepository(s.Pool)
		return s.TemplateRepo
	}
	s.TemplateRepo = nbrepo.NewInMemoryNotepadTemplateRepository()
	return s.TemplateRepo
}

func (s *State) ListTemplates(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	templates, err := s.templateRepo().ListTemplates(r.Context(), claims.Sub)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if templates == nil {
		templates = []models.NotepadTemplate{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": templates})
}

func (s *State) GetTemplate(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	tplID, err := pathUUID(r, "template_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid template id"))
		return
	}
	tpl, ok, err := s.templateRepo().GetTemplate(r.Context(), tplID, claims.Sub)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	writeJSON(w, http.StatusOK, tpl)
}

func (s *State) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	var body models.CreateNotepadTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, errBody("template name is required"))
		return
	}
	tpl, err := s.templateRepo().CreateTemplate(r.Context(), nbrepo.CreateTemplateParams{
		OwnerID:      claims.Sub,
		Name:         name,
		Description:  strings.TrimSpace(body.Description),
		Title:        body.Title,
		Content:      body.Content,
		ContentDoc:   body.ContentDoc,
		Widgets:      body.Widgets,
		InputsSchema: body.InputsSchema,
		Visibility:   body.Visibility,
		TemplateKey:  body.TemplateKey,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	writeJSON(w, http.StatusCreated, tpl)
}

func (s *State) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	tplID, err := pathUUID(r, "template_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid template id"))
		return
	}
	var body models.UpdateNotepadTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
		return
	}
	tpl, ok, err := s.templateRepo().UpdateTemplate(r.Context(), nbrepo.UpdateTemplateParams{
		ID:           tplID,
		OwnerID:      claims.Sub,
		Name:         body.Name,
		Description:  body.Description,
		Title:        body.Title,
		Content:      body.Content,
		ContentDoc:   body.ContentDoc,
		Widgets:      body.Widgets,
		InputsSchema: body.InputsSchema,
		Visibility:   body.Visibility,
		TemplateKey:  body.TemplateKey,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	writeJSON(w, http.StatusOK, tpl)
}

func (s *State) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	tplID, err := pathUUID(r, "template_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid template id"))
		return
	}
	ok, err := s.templateRepo().DeleteTemplate(r.Context(), tplID, claims.Sub)
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

// InstantiateTemplate substitutes the user-provided inputs into the
// template body and writes a fresh NotepadDocument owned by the
// caller. The new document is seeded with an `initial` revision so
// the version-history panel works from rev 0 onward, matching the
// CreateDocument behaviour.
func (s *State) InstantiateTemplate(w http.ResponseWriter, r *http.Request) {
	claims := requireClaims(w, r)
	if claims == nil {
		return
	}
	tplID, err := pathUUID(r, "template_id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid template id"))
		return
	}
	tpl, ok, err := s.templateRepo().GetTemplate(r.Context(), tplID, claims.Sub)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	if !ok {
		writeJSON(w, http.StatusNotFound, nil)
		return
	}
	var body models.InstantiateNotepadTemplateRequest
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, errBody("invalid body"))
			return
		}
	}
	if body.Inputs == nil {
		body.Inputs = map[string]string{}
	}
	content, contentDoc, widgets, err := notepad.Instantiate(&tpl, body.Inputs)
	switch {
	case errors.Is(err, notepad.ErrTemplateMissingRequiredInput):
		writeJSON(w, http.StatusBadRequest, errBody(err.Error()))
		return
	case err != nil:
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = strings.TrimSpace(notepad.SubstituteTokens(tpl.Title, body.Inputs))
	}
	if title == "" {
		title = tpl.Name
	}
	description := strings.TrimSpace(body.Description)
	if description == "" {
		description = notepad.SubstituteTokens(tpl.Description, body.Inputs)
	}
	tplKey := tpl.Name
	if tpl.TemplateKey != nil && strings.TrimSpace(*tpl.TemplateKey) != "" {
		tplKey = *tpl.TemplateKey
	}
	doc, err := s.notepadRepo().CreateDocument(r.Context(), nbrepo.CreateDocumentParams{
		Title:       title,
		Description: description,
		OwnerID:     claims.Sub,
		Content:     content,
		ContentDoc:  contentDoc,
		TemplateKey: &tplKey,
		Widgets:     widgets,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody(err.Error()))
		return
	}
	// Seed the v0 "Initial" revision the same way CreateDocument
	// does, so version-history works from rev 0.
	_, _ = s.revisionRepo().CreateRevision(r.Context(), nbrepo.CreateRevisionParams{
		DocumentID:  doc.ID,
		AuthorID:    claims.Sub,
		Kind:        models.NotepadRevisionKindInitial,
		Title:       doc.Title,
		Description: doc.Description,
		Content:     doc.Content,
		ContentDoc:  doc.ContentDoc,
		Widgets:     doc.Widgets,
		TemplateKey: doc.TemplateKey,
	})
	writeJSON(w, http.StatusCreated, doc)
}
