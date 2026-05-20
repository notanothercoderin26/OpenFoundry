package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

// fakeSavedGraphRepo is an in-memory SavedGraphRepo for handler-level
// tests. It mirrors the postgres-backed repo's contract without
// needing a database — owner scoping, token uniqueness, NotFound
// semantics and update merges all behave the same on the wire.
type fakeSavedGraphRepo struct {
	mu     sync.Mutex
	byID   map[uuid.UUID]*models.SavedGraph
	tokens map[string]uuid.UUID
}

func newFakeRepo() *fakeSavedGraphRepo {
	return &fakeSavedGraphRepo{
		byID:   make(map[uuid.UUID]*models.SavedGraph),
		tokens: make(map[string]uuid.UUID),
	}
}

func (f *fakeSavedGraphRepo) Create(_ context.Context, ownerID uuid.UUID, in models.CreateSavedGraphRequest) (*models.SavedGraph, error) {
	name, err := lineage.SanitizeName(in.Name)
	if err != nil {
		return nil, err
	}
	payload, err := lineage.SanitizePayload(in.Payload)
	if err != nil {
		return nil, err
	}
	branch := in.Branch
	if strings.TrimSpace(branch) == "" {
		branch = "master"
	}
	coloring := in.ColoringMode
	if strings.TrimSpace(coloring) == "" {
		coloring = "resource_type"
	}
	now := time.Now().UTC()
	row := &models.SavedGraph{
		ID:           uuid.New(),
		OwnerID:      ownerID,
		Name:         name,
		Branch:       branch,
		ColoringMode: coloring,
		Payload:      payload,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.byID[row.ID] = row
	return cloneGraph(row), nil
}

func (f *fakeSavedGraphRepo) List(_ context.Context, ownerID uuid.UUID) ([]models.SavedGraph, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]models.SavedGraph, 0)
	for _, row := range f.byID {
		if row.OwnerID == ownerID {
			out = append(out, *cloneGraph(row))
		}
	}
	return out, nil
}

func (f *fakeSavedGraphRepo) Get(_ context.Context, ownerID, id uuid.UUID) (*models.SavedGraph, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.byID[id]
	if !ok || row.OwnerID != ownerID {
		return nil, lineage.ErrSavedGraphNotFound
	}
	return cloneGraph(row), nil
}

func (f *fakeSavedGraphRepo) Update(_ context.Context, ownerID, id uuid.UUID, in models.UpdateSavedGraphRequest) (*models.SavedGraph, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.byID[id]
	if !ok || row.OwnerID != ownerID {
		return nil, lineage.ErrSavedGraphNotFound
	}
	if in.Name != nil {
		name, err := lineage.SanitizeName(*in.Name)
		if err != nil {
			return nil, err
		}
		row.Name = name
	}
	if in.Branch != nil {
		cleaned := strings.TrimSpace(*in.Branch)
		if cleaned == "" {
			return nil, errors.New("branch cannot be empty")
		}
		row.Branch = cleaned
	}
	if in.ColoringMode != nil {
		cleaned := strings.TrimSpace(*in.ColoringMode)
		if cleaned == "" {
			return nil, errors.New("coloring_mode cannot be empty")
		}
		row.ColoringMode = cleaned
	}
	if in.Payload != nil {
		payload, err := lineage.SanitizePayload(*in.Payload)
		if err != nil {
			return nil, err
		}
		row.Payload = payload
	}
	row.UpdatedAt = time.Now().UTC()
	return cloneGraph(row), nil
}

func (f *fakeSavedGraphRepo) Delete(_ context.Context, ownerID, id uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.byID[id]
	if !ok || row.OwnerID != ownerID {
		return lineage.ErrSavedGraphNotFound
	}
	if row.ShareToken != nil {
		delete(f.tokens, *row.ShareToken)
	}
	delete(f.byID, id)
	return nil
}

func (f *fakeSavedGraphRepo) Share(_ context.Context, ownerID, id uuid.UUID, readOnly bool) (*models.SavedGraph, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.byID[id]
	if !ok || row.OwnerID != ownerID {
		return nil, lineage.ErrSavedGraphNotFound
	}
	token, err := lineage.MintShareToken()
	if err != nil {
		return nil, err
	}
	if row.ShareToken != nil {
		delete(f.tokens, *row.ShareToken)
	}
	now := time.Now().UTC()
	row.ShareToken = &token
	row.ShareReadOnly = readOnly
	row.SharedAt = &now
	row.UpdatedAt = now
	f.tokens[token] = id
	return cloneGraph(row), nil
}

func (f *fakeSavedGraphRepo) RevokeShare(_ context.Context, ownerID, id uuid.UUID) (*models.SavedGraph, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	row, ok := f.byID[id]
	if !ok || row.OwnerID != ownerID {
		return nil, lineage.ErrSavedGraphNotFound
	}
	if row.ShareToken != nil {
		delete(f.tokens, *row.ShareToken)
	}
	row.ShareToken = nil
	row.SharedAt = nil
	row.UpdatedAt = time.Now().UTC()
	return cloneGraph(row), nil
}

func (f *fakeSavedGraphRepo) GetByShareToken(_ context.Context, token string) (*models.SavedGraph, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id, ok := f.tokens[strings.TrimSpace(token)]
	if !ok {
		return nil, lineage.ErrSavedGraphNotFound
	}
	row, ok := f.byID[id]
	if !ok {
		return nil, lineage.ErrSavedGraphNotFound
	}
	return cloneGraph(row), nil
}

func cloneGraph(g *models.SavedGraph) *models.SavedGraph {
	out := *g
	if g.ShareToken != nil {
		token := *g.ShareToken
		out.ShareToken = &token
	}
	if g.SharedAt != nil {
		ts := *g.SharedAt
		out.SharedAt = &ts
	}
	// json.RawMessage is a []byte; cloning protects against the
	// handler mutating the in-memory row through the returned slice.
	out.Payload = append(json.RawMessage(nil), g.Payload...)
	return &out
}

func newTestRouter(repo SavedGraphRepo) (chi.Router, uuid.UUID) {
	owner := uuid.New()
	h := NewSavedGraphHandlers(repo)
	r := chi.NewRouter()
	// Public route — mounted before the auth shim, mirroring server.go.
	r.Get("/api/v1/lineage/shared/{token}", h.GetShared)
	r.Route("/api/v1/lineage/saved-graphs", func(api chi.Router) {
		api.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				ctx := authmw.ContextWithClaims(req.Context(), &authmw.Claims{Sub: owner})
				next.ServeHTTP(w, req.WithContext(ctx))
			})
		})
		api.Get("/", h.List)
		api.Post("/", h.Create)
		api.Get("/{id}", h.Get)
		api.Put("/{id}", h.Update)
		api.Delete("/{id}", h.Delete)
		api.Post("/{id}/share", h.Share)
		api.Delete("/{id}/share", h.RevokeShare)
	})
	return r, owner
}

func TestCreateThenListReturnsTheNewRow(t *testing.T) {
	router, _ := newTestRouter(newFakeRepo())
	body := must(json.Marshal(models.CreateSavedGraphRequest{
		Name:         "Daily extracts",
		Branch:       "master",
		ColoringMode: "build_status",
		Payload:      json.RawMessage(`{"camera":{"zoom":1.4}}`),
	}))

	resp := do(router, http.MethodPost, "/api/v1/lineage/saved-graphs/", bytes.NewReader(body))
	if resp.Code != http.StatusCreated {
		t.Fatalf("create: status %d, body %s", resp.Code, resp.Body.String())
	}
	var created models.SavedGraph
	if err := json.Unmarshal(resp.Body.Bytes(), &created); err != nil {
		t.Fatalf("create body: %v", err)
	}
	if created.Name != "Daily extracts" {
		t.Fatalf("name not persisted: %q", created.Name)
	}

	listResp := do(router, http.MethodGet, "/api/v1/lineage/saved-graphs/", nil)
	if listResp.Code != http.StatusOK {
		t.Fatalf("list: status %d", listResp.Code)
	}
	var list struct {
		Data []models.SavedGraph `json:"data"`
	}
	if err := json.Unmarshal(listResp.Body.Bytes(), &list); err != nil {
		t.Fatalf("list body: %v", err)
	}
	if len(list.Data) != 1 || list.Data[0].ID != created.ID {
		t.Fatalf("list mismatch: %+v", list)
	}
}

func TestCreateRejectsEmptyName(t *testing.T) {
	router, _ := newTestRouter(newFakeRepo())
	body := must(json.Marshal(models.CreateSavedGraphRequest{Name: "   "}))
	resp := do(router, http.MethodPost, "/api/v1/lineage/saved-graphs/", bytes.NewReader(body))
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.Code)
	}
}

func TestGetOtherOwnerIs404(t *testing.T) {
	repo := newFakeRepo()
	stranger := uuid.New()
	row := must(repo.Create(context.Background(), stranger, models.CreateSavedGraphRequest{
		Name:    "Stranger graph",
		Payload: json.RawMessage(`{}`),
	}))
	router, _ := newTestRouter(repo)
	resp := do(router, http.MethodGet, fmt.Sprintf("/api/v1/lineage/saved-graphs/%s", row.ID), nil)
	if resp.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (cross-owner read should be denied)", resp.Code)
	}
}

func TestUpdatePatchesOnlyProvidedFields(t *testing.T) {
	router, owner := newTestRouter(newFakeRepo())
	createBody := must(json.Marshal(models.CreateSavedGraphRequest{Name: "Original", Payload: json.RawMessage(`{"a":1}`)}))
	createResp := do(router, http.MethodPost, "/api/v1/lineage/saved-graphs/", bytes.NewReader(createBody))
	var created models.SavedGraph
	_ = json.Unmarshal(createResp.Body.Bytes(), &created)
	if created.OwnerID != owner {
		t.Fatalf("owner mismatch: %v vs %v", created.OwnerID, owner)
	}

	newName := "Renamed"
	patch := must(json.Marshal(models.UpdateSavedGraphRequest{Name: &newName}))
	resp := do(router, http.MethodPut, "/api/v1/lineage/saved-graphs/"+created.ID.String(), bytes.NewReader(patch))
	if resp.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.Code, resp.Body.String())
	}
	var updated models.SavedGraph
	_ = json.Unmarshal(resp.Body.Bytes(), &updated)
	if updated.Name != "Renamed" || string(updated.Payload) != `{"a":1}` {
		t.Fatalf("patch did not isolate fields: %+v", updated)
	}
}

func TestShareMintsThenSharedEndpointReturnsRow(t *testing.T) {
	repo := newFakeRepo()
	router, _ := newTestRouter(repo)
	createBody := must(json.Marshal(models.CreateSavedGraphRequest{Name: "To share", Payload: json.RawMessage(`{"x":1}`)}))
	createResp := do(router, http.MethodPost, "/api/v1/lineage/saved-graphs/", bytes.NewReader(createBody))
	var created models.SavedGraph
	_ = json.Unmarshal(createResp.Body.Bytes(), &created)

	shareResp := do(router, http.MethodPost, "/api/v1/lineage/saved-graphs/"+created.ID.String()+"/share", nil)
	if shareResp.Code != http.StatusOK {
		t.Fatalf("share status = %d, body %s", shareResp.Code, shareResp.Body.String())
	}
	var share models.ShareTokenResponse
	_ = json.Unmarshal(shareResp.Body.Bytes(), &share)
	if share.Token == "" || !share.ReadOnly {
		t.Fatalf("share response degenerate: %+v", share)
	}

	// Public read — no auth.
	publicResp := do(router, http.MethodGet, "/api/v1/lineage/shared/"+share.Token, nil)
	if publicResp.Code != http.StatusOK {
		t.Fatalf("shared GET status = %d", publicResp.Code)
	}
	if strings.Contains(publicResp.Body.String(), "owner_id") {
		t.Fatalf("public response leaks owner_id: %s", publicResp.Body.String())
	}

	// Revoke — token should stop resolving.
	revoke := do(router, http.MethodDelete, "/api/v1/lineage/saved-graphs/"+created.ID.String()+"/share", nil)
	if revoke.Code != http.StatusNoContent {
		t.Fatalf("revoke status = %d", revoke.Code)
	}
	after := do(router, http.MethodGet, "/api/v1/lineage/shared/"+share.Token, nil)
	if after.Code != http.StatusNotFound {
		t.Fatalf("revoked token still resolves: %d %s", after.Code, after.Body.String())
	}
}

func TestSharedEndpointNotFoundForGarbageToken(t *testing.T) {
	router, _ := newTestRouter(newFakeRepo())
	resp := do(router, http.MethodGet, "/api/v1/lineage/shared/not-a-real-token", nil)
	if resp.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.Code)
	}
}

func TestDeleteRemovesRow(t *testing.T) {
	router, _ := newTestRouter(newFakeRepo())
	createBody := must(json.Marshal(models.CreateSavedGraphRequest{Name: "doomed", Payload: json.RawMessage(`{}`)}))
	createResp := do(router, http.MethodPost, "/api/v1/lineage/saved-graphs/", bytes.NewReader(createBody))
	var created models.SavedGraph
	_ = json.Unmarshal(createResp.Body.Bytes(), &created)

	resp := do(router, http.MethodDelete, "/api/v1/lineage/saved-graphs/"+created.ID.String(), nil)
	if resp.Code != http.StatusNoContent {
		t.Fatalf("status = %d", resp.Code)
	}
	get := do(router, http.MethodGet, "/api/v1/lineage/saved-graphs/"+created.ID.String(), nil)
	if get.Code != http.StatusNotFound {
		t.Fatalf("post-delete GET should be 404, got %d", get.Code)
	}
}

func do(router http.Handler, method, path string, body *bytes.Reader) *httptest.ResponseRecorder {
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

func must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}
