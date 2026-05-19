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

func mountAIPRouter(s *State) chi.Router {
	r := chi.NewRouter()
	r.Post("/api/v1/notepad/aip/transform", s.AIPTransform)
	return r
}

func TestAIPTransformFixGrammar(t *testing.T) {
	t.Parallel()
	r := mountAIPRouter(&State{})
	body, _ := json.Marshal(models.AIPTransformRequest{
		Op:   models.AIPTransformFixGrammar,
		Text: "this needs fixing",
	})
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/aip/transform", bytes.NewReader(body)), uuid.New())
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("transform status=%d body=%s", w.Code, w.Body.String())
	}
	var result models.AIPTransformResult
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if result.Result != "This needs fixing." {
		t.Fatalf("fix_grammar drift: %q", result.Result)
	}
	if result.Provider != "deterministic" {
		t.Fatalf("expected deterministic provider, got %q", result.Provider)
	}
}

func TestAIPTransformChainPreservesOriginal(t *testing.T) {
	t.Parallel()
	r := mountAIPRouter(&State{})
	// First transform: shorten
	first, _ := json.Marshal(models.AIPTransformRequest{
		Op:   models.AIPTransformShorten,
		Text: "Sentence one. Sentence two. Sentence three. Sentence four.",
	})
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/aip/transform", bytes.NewReader(first)), uuid.New())
	req.ContentLength = int64(len(first))
	r.ServeHTTP(w, req)
	var firstResult models.AIPTransformResult
	_ = json.Unmarshal(w.Body.Bytes(), &firstResult)

	// Chain: pass first result back in for a second transform
	chained, _ := json.Marshal(models.AIPTransformRequest{
		Op:   models.AIPTransformFixGrammar,
		Text: firstResult.Result,
	})
	w = httptest.NewRecorder()
	req = withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/aip/transform", bytes.NewReader(chained)), uuid.New())
	req.ContentLength = int64(len(chained))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("chain status=%d body=%s", w.Code, w.Body.String())
	}
	var secondResult models.AIPTransformResult
	_ = json.Unmarshal(w.Body.Bytes(), &secondResult)
	if secondResult.SourceText != firstResult.Result {
		t.Fatalf("chain did not preserve previous result as source: %+v", secondResult)
	}
}

func TestAIPTransformRejectsEmptyText(t *testing.T) {
	t.Parallel()
	r := mountAIPRouter(&State{})
	body := []byte(`{"op":"shorten","text":""}`)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/aip/transform", bytes.NewReader(body)), uuid.New())
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty text, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestAIPTransformRejectsUnknownOp(t *testing.T) {
	t.Parallel()
	r := mountAIPRouter(&State{})
	body := []byte(`{"op":"make_it_pop","text":"hi"}`)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/aip/transform", bytes.NewReader(body)), uuid.New())
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unknown op, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "unsupported AIP op") {
		t.Fatalf("expected hint in body, got %s", w.Body.String())
	}
}

func TestAIPTransformRequiresAuth(t *testing.T) {
	t.Parallel()
	r := mountAIPRouter(&State{})
	body := []byte(`{"op":"fix_grammar","text":"hi"}`)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/notepad/aip/transform", bytes.NewReader(body))
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}
