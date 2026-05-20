package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/lineage"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/models"
)

// fakeDescRepo mirrors the postgres-backed repo's contract without
// needing a database. We only need to exercise the handler-visible
// behaviour: NotFound semantics, sanitize-then-upsert, delete idempotency.
type fakeDescRepo struct {
	mu    sync.Mutex
	store map[uuid.UUID]*models.NodeDescription
}

func newFakeDescRepo() *fakeDescRepo {
	return &fakeDescRepo{store: make(map[uuid.UUID]*models.NodeDescription)}
}

func (f *fakeDescRepo) Get(_ context.Context, nodeID uuid.UUID) (*models.NodeDescription, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.store[nodeID]
	if !ok {
		return nil, lineage.ErrNodeDescriptionNotFound
	}
	clone := *row
	return &clone, nil
}

func (f *fakeDescRepo) Upsert(_ context.Context, nodeID, ownerID uuid.UUID, description string) (*models.NodeDescription, error) {
	cleaned, err := lineage.SanitizeDescription(description)
	if err != nil {
		return nil, err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if cleaned == "" {
		if _, exists := f.store[nodeID]; !exists {
			return nil, lineage.ErrNodeDescriptionNotFound
		}
		delete(f.store, nodeID)
		return nil, lineage.ErrNodeDescriptionNotFound
	}
	row := &models.NodeDescription{
		NodeID:      nodeID,
		Description: cleaned,
		UpdatedBy:   ownerID,
		UpdatedAt:   time.Now().UTC(),
	}
	f.store[nodeID] = row
	clone := *row
	return &clone, nil
}

func (f *fakeDescRepo) Delete(_ context.Context, nodeID uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, exists := f.store[nodeID]; !exists {
		return lineage.ErrNodeDescriptionNotFound
	}
	delete(f.store, nodeID)
	return nil
}

func newDescTestRouter(repo NodeDescriptionRepo) (chi.Router, uuid.UUID) {
	owner := uuid.New()
	h := NewNodeDescriptionHandlers(repo)
	r := chi.NewRouter()
	r.Route("/api/v1/lineage/nodes/{id}/description", func(api chi.Router) {
		api.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				ctx := authmw.ContextWithClaims(req.Context(), &authmw.Claims{Sub: owner})
				next.ServeHTTP(w, req.WithContext(ctx))
			})
		})
		api.Get("/", h.Get)
		api.Put("/", h.Upsert)
		api.Delete("/", h.Delete)
	})
	return r, owner
}

func TestUpsertCreatesThenGetReturnsRow(t *testing.T) {
	repo := newFakeDescRepo()
	router, owner := newDescTestRouter(repo)
	nodeID := uuid.New()
	body, _ := json.Marshal(models.UpsertNodeDescriptionRequest{Description: "Driver health metrics, updated weekly."})

	resp := doReq(router, http.MethodPut, "/api/v1/lineage/nodes/"+nodeID.String()+"/description/", bytes.NewReader(body))
	if resp.Code != http.StatusOK {
		t.Fatalf("upsert: status %d body %s", resp.Code, resp.Body.String())
	}
	var stored models.NodeDescription
	_ = json.Unmarshal(resp.Body.Bytes(), &stored)
	if stored.NodeID != nodeID || stored.UpdatedBy != owner {
		t.Fatalf("unexpected stored row: %+v", stored)
	}
	if stored.Description != "Driver health metrics, updated weekly." {
		t.Fatalf("description not persisted: %q", stored.Description)
	}

	getResp := doReq(router, http.MethodGet, "/api/v1/lineage/nodes/"+nodeID.String()+"/description/", nil)
	if getResp.Code != http.StatusOK {
		t.Fatalf("get: status %d", getResp.Code)
	}
	var loaded models.NodeDescription
	_ = json.Unmarshal(getResp.Body.Bytes(), &loaded)
	if loaded.NodeID != nodeID || loaded.Description != "Driver health metrics, updated weekly." {
		t.Fatalf("get row mismatch: %+v", loaded)
	}
}

func TestUpsertOverwritesExisting(t *testing.T) {
	repo := newFakeDescRepo()
	router, _ := newDescTestRouter(repo)
	nodeID := uuid.New()
	first, _ := json.Marshal(models.UpsertNodeDescriptionRequest{Description: "first"})
	second, _ := json.Marshal(models.UpsertNodeDescriptionRequest{Description: "second"})

	_ = doReq(router, http.MethodPut, "/api/v1/lineage/nodes/"+nodeID.String()+"/description/", bytes.NewReader(first))
	resp := doReq(router, http.MethodPut, "/api/v1/lineage/nodes/"+nodeID.String()+"/description/", bytes.NewReader(second))
	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d", resp.Code)
	}
	var stored models.NodeDescription
	_ = json.Unmarshal(resp.Body.Bytes(), &stored)
	if stored.Description != "second" {
		t.Fatalf("overwrite failed: %q", stored.Description)
	}
}

func TestUpsertWithEmptyBodyDeletesAndReturns204(t *testing.T) {
	repo := newFakeDescRepo()
	router, _ := newDescTestRouter(repo)
	nodeID := uuid.New()

	create, _ := json.Marshal(models.UpsertNodeDescriptionRequest{Description: "to be cleared"})
	_ = doReq(router, http.MethodPut, "/api/v1/lineage/nodes/"+nodeID.String()+"/description/", bytes.NewReader(create))

	clear, _ := json.Marshal(models.UpsertNodeDescriptionRequest{Description: "   "})
	resp := doReq(router, http.MethodPut, "/api/v1/lineage/nodes/"+nodeID.String()+"/description/", bytes.NewReader(clear))
	if resp.Code != http.StatusNoContent {
		t.Fatalf("status = %d body=%s", resp.Code, resp.Body.String())
	}

	getResp := doReq(router, http.MethodGet, "/api/v1/lineage/nodes/"+nodeID.String()+"/description/", nil)
	if getResp.Code != http.StatusNotFound {
		t.Fatalf("get after clear = %d", getResp.Code)
	}
}

func TestGetMissingReturns404(t *testing.T) {
	router, _ := newDescTestRouter(newFakeDescRepo())
	resp := doReq(router, http.MethodGet, "/api/v1/lineage/nodes/"+uuid.New().String()+"/description/", nil)
	if resp.Code != http.StatusNotFound {
		t.Fatalf("status = %d", resp.Code)
	}
}

func TestDeleteMissingReturns204(t *testing.T) {
	router, _ := newDescTestRouter(newFakeDescRepo())
	resp := doReq(router, http.MethodDelete, "/api/v1/lineage/nodes/"+uuid.New().String()+"/description/", nil)
	if resp.Code != http.StatusNoContent {
		t.Fatalf("expected idempotent delete, got %d", resp.Code)
	}
}

func TestBadUUID400s(t *testing.T) {
	router, _ := newDescTestRouter(newFakeDescRepo())
	resp := doReq(router, http.MethodGet, "/api/v1/lineage/nodes/not-a-uuid/description/", nil)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", resp.Code)
	}
}

func TestOversizedDescription400s(t *testing.T) {
	router, _ := newDescTestRouter(newFakeDescRepo())
	nodeID := uuid.New()
	body, _ := json.Marshal(models.UpsertNodeDescriptionRequest{Description: strings.Repeat("a", lineage.MaxNodeDescriptionLen+1)})
	resp := doReq(router, http.MethodPut, "/api/v1/lineage/nodes/"+nodeID.String()+"/description/", bytes.NewReader(body))
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body=%s", resp.Code, resp.Body.String())
	}
}

// Compile-time check that the interface declared in the handler
// package is in sync with the real repo we wire in main.go.
var _ NodeDescriptionRepo = (*lineage.NodeDescriptionRepo)(nil)

func doReq(router http.Handler, method, path string, body *bytes.Reader) *httptest.ResponseRecorder {
	var req *http.Request
	if body != nil {
		req = httptest.NewRequest(method, path, body)
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

// Local sanity check — ensures the fake repo behaves like the real
// one for the empty-string delete branch. Helpful when iterating on
// SanitizeDescription so both paths stay aligned.
func TestFakeUpsertEmptySurfacesNotFound(t *testing.T) {
	repo := newFakeDescRepo()
	_, err := repo.Upsert(context.Background(), uuid.New(), uuid.New(), "  ")
	if !errors.Is(err, lineage.ErrNodeDescriptionNotFound) {
		t.Fatalf("expected ErrNodeDescriptionNotFound, got %v", err)
	}
}
