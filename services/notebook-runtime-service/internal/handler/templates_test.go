package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
	nbrepo "github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/repo"
)

func mountTemplateRouter(s *State) chi.Router {
	r := chi.NewRouter()
	r.Get("/api/v1/notepad/templates", s.ListTemplates)
	r.Post("/api/v1/notepad/templates", s.CreateTemplate)
	r.Get("/api/v1/notepad/templates/{template_id}", s.GetTemplate)
	r.Patch("/api/v1/notepad/templates/{template_id}", s.UpdateTemplate)
	r.Delete("/api/v1/notepad/templates/{template_id}", s.DeleteTemplate)
	r.Post("/api/v1/notepad/templates/{template_id}/instantiate", s.InstantiateTemplate)
	r.Get("/api/v1/notepad/documents/{document_id}", s.GetDocument)
	return r
}

func newTemplateTestState() *State {
	docs := nbrepo.NewInMemoryNotepadRepository()
	return &State{
		NotepadRepo:  docs,
		RevisionRepo: nbrepo.NewInMemoryNotepadRevisionRepository(docs),
		TemplateRepo: nbrepo.NewInMemoryNotepadTemplateRepository(),
	}
}

func createTemplateForTest(t *testing.T, r chi.Router, owner uuid.UUID, body map[string]any) models.NotepadTemplate {
	t.Helper()
	raw, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/templates", bytes.NewReader(raw)), owner)
	req.ContentLength = int64(len(raw))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("create template status=%d body=%s", w.Code, w.Body.String())
	}
	var tpl models.NotepadTemplate
	_ = json.Unmarshal(w.Body.Bytes(), &tpl)
	return tpl
}

func TestCreateTemplateRequiresName(t *testing.T) {
	t.Parallel()
	r := mountTemplateRouter(newTemplateTestState())
	body := []byte(`{"name":"   "}`)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/templates", bytes.NewReader(body)), uuid.New())
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty name, got %d", w.Code)
	}
}

func TestTemplateCRUDFlow(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	r := mountTemplateRouter(newTemplateTestState())

	tpl := createTemplateForTest(t, r, owner, map[string]any{
		"name":        "Airport Brief",
		"description": "Templated airport report",
		"title":       "{{input.airport_name}} brief",
		"content":     "Airport: {{input.airport_name}}",
		"inputs_schema": []map[string]any{
			{"key": "airport_name", "label": "Airport", "type": "string", "required": true},
		},
	})

	// List
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodGet, "/api/v1/notepad/templates", nil), owner)
	r.ServeHTTP(w, req)
	var list struct {
		Data []models.NotepadTemplate `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &list)
	if len(list.Data) != 1 || list.Data[0].ID != tpl.ID {
		t.Fatalf("list drift: %+v", list)
	}

	// Get
	w = httptest.NewRecorder()
	req = withClaims(httptest.NewRequest(http.MethodGet, "/api/v1/notepad/templates/"+tpl.ID.String(), nil), owner)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("get status=%d", w.Code)
	}

	// Update name
	patchBody, _ := json.Marshal(map[string]any{"name": "Updated Brief"})
	w = httptest.NewRecorder()
	req = withClaims(httptest.NewRequest(http.MethodPatch, "/api/v1/notepad/templates/"+tpl.ID.String(), bytes.NewReader(patchBody)), owner)
	req.ContentLength = int64(len(patchBody))
	r.ServeHTTP(w, req)
	var updated models.NotepadTemplate
	_ = json.Unmarshal(w.Body.Bytes(), &updated)
	if updated.Name != "Updated Brief" {
		t.Fatalf("update did not persist: %+v", updated)
	}

	// Delete
	w = httptest.NewRecorder()
	req = withClaims(httptest.NewRequest(http.MethodDelete, "/api/v1/notepad/templates/"+tpl.ID.String(), nil), owner)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete status=%d", w.Code)
	}

	// Post-delete: 404
	w = httptest.NewRecorder()
	req = withClaims(httptest.NewRequest(http.MethodGet, "/api/v1/notepad/templates/"+tpl.ID.String(), nil), owner)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("post-delete get status=%d", w.Code)
	}
}

func TestInstantiateTemplateProducesDocument(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	r := mountTemplateRouter(newTemplateTestState())

	tpl := createTemplateForTest(t, r, owner, map[string]any{
		"name":    "Airport Brief",
		"title":   "{{input.airport_name}} brief",
		"content": "Airport: {{input.airport_name}}",
		"inputs_schema": []map[string]any{
			{"key": "airport_name", "label": "Airport", "type": "string", "required": true},
		},
	})

	body, _ := json.Marshal(map[string]any{
		"inputs": map[string]string{"airport_name": "Chicago O'Hare"},
	})
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/templates/"+tpl.ID.String()+"/instantiate", bytes.NewReader(body)), owner)
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("instantiate status=%d body=%s", w.Code, w.Body.String())
	}
	var doc models.NotepadDocument
	_ = json.Unmarshal(w.Body.Bytes(), &doc)
	if doc.Title != "Chicago O'Hare brief" {
		t.Fatalf("title substitution missed: %q", doc.Title)
	}
	if doc.Content != "Airport: Chicago O'Hare" {
		t.Fatalf("content substitution missed: %q", doc.Content)
	}
	if doc.TemplateKey == nil || *doc.TemplateKey != "Airport Brief" {
		t.Fatalf("expected template_key set on derived doc; got %v", doc.TemplateKey)
	}
}

func TestInstantiateFailsForMissingRequiredInput(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	r := mountTemplateRouter(newTemplateTestState())
	tpl := createTemplateForTest(t, r, owner, map[string]any{
		"name": "Required Brief",
		"inputs_schema": []map[string]any{
			{"key": "region", "label": "Region", "type": "string", "required": true},
		},
	})

	w := httptest.NewRecorder()
	body := []byte(`{}`)
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/templates/"+tpl.ID.String()+"/instantiate", bytes.NewReader(body)), owner)
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing required input, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "region") {
		t.Fatalf("expected error to name the missing input; got %s", w.Body.String())
	}
}

func TestTemplateOwnershipBoundary(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	intruder := uuid.New()
	r := mountTemplateRouter(newTemplateTestState())
	tpl := createTemplateForTest(t, r, owner, map[string]any{"name": "Private"})

	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodGet, "/api/v1/notepad/templates/"+tpl.ID.String(), nil), intruder)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("intruder GET expected 404, got %d", w.Code)
	}

	// List for intruder returns empty
	w = httptest.NewRecorder()
	req = withClaims(httptest.NewRequest(http.MethodGet, "/api/v1/notepad/templates", nil), intruder)
	r.ServeHTTP(w, req)
	var resp struct {
		Data []models.NotepadTemplate `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Data) != 0 {
		t.Fatalf("intruder list leaked private templates: %+v", resp.Data)
	}
}
