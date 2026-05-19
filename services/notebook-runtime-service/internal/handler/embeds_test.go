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
)

func mountEmbedRouter(s *State) chi.Router {
	r := chi.NewRouter()
	r.Post("/api/v1/notepad/embeds/resolve", s.ResolveEmbed)
	return r
}

func TestResolveEmbedReturnsMockPreview(t *testing.T) {
	t.Parallel()
	state := &State{}
	r := mountEmbedRouter(state)

	body, _ := json.Marshal(models.NotepadEmbedResolveRequest{
		Kind: models.NotepadEmbedObjectCard,
		Ref:  "rid.pipeline.sales-q1",
	})
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/embeds/resolve", bytes.NewReader(body)), uuid.New())
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("resolve status=%d body=%s", w.Code, w.Body.String())
	}
	var preview models.NotepadEmbedPreview
	if err := json.Unmarshal(w.Body.Bytes(), &preview); err != nil {
		t.Fatalf("resolve json: %v", err)
	}
	if preview.Kind != models.NotepadEmbedObjectCard || preview.Ref != "rid.pipeline.sales-q1" {
		t.Fatalf("preview drift: %+v", preview)
	}
	if !strings.Contains(preview.Title, "rid.pipeline.sales-q1") {
		t.Fatalf("expected ref echoed in title; got %q", preview.Title)
	}
}

func TestResolveEmbedRejectsEmptyRef(t *testing.T) {
	t.Parallel()
	state := &State{}
	r := mountEmbedRouter(state)
	body := []byte(`{"kind":"object_card","ref":""}`)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/embeds/resolve", bytes.NewReader(body)), uuid.New())
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty ref, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestResolveEmbedRejectsUnknownKind(t *testing.T) {
	t.Parallel()
	state := &State{}
	r := mountEmbedRouter(state)
	body := []byte(`{"kind":"sankey","ref":"x"}`)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/embeds/resolve", bytes.NewReader(body)), uuid.New())
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unknown kind, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "unsupported embed kind") {
		t.Fatalf("expected error message hint, got: %s", w.Body.String())
	}
}

func TestResolveEmbedRequiresAuth(t *testing.T) {
	t.Parallel()
	state := &State{}
	r := mountEmbedRouter(state)
	body := []byte(`{"kind":"object_card","ref":"x"}`)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/notepad/embeds/resolve", bytes.NewReader(body))
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without claims, got %d body=%s", w.Code, w.Body.String())
	}
}
