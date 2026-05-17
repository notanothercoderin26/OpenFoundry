// Handler-level tests for MergeBranch. Drive the chi router through
// httptest so we cover the full pipeline (resolve → auth → repo →
// writeBranchError mapping) without standing up postgres. The repo
// FF semantics themselves live under
// internal/repo/branches_merge_test.go (pgxmock-driven).
package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/dataset-versioning-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/dataset-versioning-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/dataset-versioning-service/internal/repo"
)

// mergeRouter wires only the merge endpoint so each test stays
// hermetic from the broader route table.
func mergeRouter(h *handlers.Handlers) *chi.Mux {
	r := chi.NewRouter()
	r.Route("/api/v1", func(api chi.Router) {
		api.Post("/datasets/{rid}/branches/{branch}:merge", h.MergeBranch)
	})
	return r
}

func newMergeReq(datasetID uuid.UUID, target, source string, claims *authmw.Claims) *http.Request {
	body := strings.NewReader(`{"source_branch":"` + source + `"}`)
	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/datasets/"+datasetID.String()+"/branches/"+target+":merge", body)
	if claims != nil {
		req = req.WithContext(authmw.ContextWithClaims(context.Background(), claims))
	}
	return req
}

func TestMergeBranchRequiresAuth(t *testing.T) {
	t.Parallel()
	store := newFakeStore(uuid.New())
	h := &handlers.Handlers{Repo: store}
	rec := httptest.NewRecorder()
	mergeRouter(h).ServeHTTP(rec, newMergeReq(store.datasets[0].ID, "main", "feature", nil))
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestMergeBranchRequiresWriteScope(t *testing.T) {
	t.Parallel()
	store := newFakeStore(uuid.New())
	h := &handlers.Handlers{Repo: store}
	caller := &authmw.Claims{Sub: uuid.New()} // no admin/write scope
	rec := httptest.NewRecorder()
	mergeRouter(h).ServeHTTP(rec, newMergeReq(store.datasets[0].ID, "main", "feature", caller))
	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestMergeBranchRejectsEmptySource(t *testing.T) {
	t.Parallel()
	store := newFakeStore(uuid.New())
	h := &handlers.Handlers{Repo: store}
	caller := &authmw.Claims{Sub: uuid.New(), Roles: []string{"admin"}}
	rec := httptest.NewRecorder()
	mergeRouter(h).ServeHTTP(rec, newMergeReq(store.datasets[0].ID, "main", "", caller))
	require.Equal(t, http.StatusBadRequest, rec.Code, "body: %s", rec.Body.String())
	assert.Contains(t, rec.Body.String(), "source_branch is required")
}

func TestMergeBranchRejectsMalformedBody(t *testing.T) {
	t.Parallel()
	store := newFakeStore(uuid.New())
	h := &handlers.Handlers{Repo: store}
	caller := &authmw.Claims{Sub: uuid.New(), Roles: []string{"admin"}}
	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/datasets/"+store.datasets[0].ID.String()+"/branches/main:merge",
		strings.NewReader(`{not json`))
	req = req.WithContext(authmw.ContextWithClaims(context.Background(), caller))
	rec := httptest.NewRecorder()
	mergeRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code, "body: %s", rec.Body.String())
}

func TestMergeBranchHappyPathReturnsFastForwardResult(t *testing.T) {
	t.Parallel()
	store := newFakeStore(uuid.New())
	owner := store.datasets[0].OwnerID
	newHead := uuid.New()
	newRID := models.TransactionRID(newHead)
	store.mergeOverride = func(target, source string, actor uuid.UUID) (*models.MergeBranchResult, error) {
		assert.Equal(t, "main", target)
		assert.Equal(t, "feature", source)
		assert.Equal(t, owner, actor)
		return &models.MergeBranchResult{
			Branch:                     models.RuntimeBranch{Name: target, HeadTransactionID: &newHead},
			FastForwarded:              true,
			NewHeadTransactionRID:      &newRID,
			PreviousHeadTransactionRID: nil,
		}, nil
	}
	h := &handlers.Handlers{Repo: store}
	caller := &authmw.Claims{Sub: owner, Roles: []string{"admin"}}
	rec := httptest.NewRecorder()
	mergeRouter(h).ServeHTTP(rec, newMergeReq(store.datasets[0].ID, "main", "feature", caller))
	require.Equal(t, http.StatusOK, rec.Code, "body: %s", rec.Body.String())
	var out models.MergeBranchResult
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.True(t, out.FastForwarded)
	require.NotNil(t, out.NewHeadTransactionRID)
	assert.Equal(t, newRID, *out.NewHeadTransactionRID)
}

func TestMergeBranchMapsPreconditionFailedTo412(t *testing.T) {
	t.Parallel()
	store := newFakeStore(uuid.New())
	store.mergeOverride = func(string, string, uuid.UUID) (*models.MergeBranchResult, error) {
		return nil, errors.Join(repo.ErrPreconditionFailed, errors.New("target moved past fork point"))
	}
	h := &handlers.Handlers{Repo: store}
	caller := &authmw.Claims{Sub: uuid.New(), Roles: []string{"admin"}}
	rec := httptest.NewRecorder()
	mergeRouter(h).ServeHTTP(rec, newMergeReq(store.datasets[0].ID, "main", "feature", caller))
	assert.Equal(t, http.StatusPreconditionFailed, rec.Code)
}

func TestMergeBranchMapsValidationTo400(t *testing.T) {
	t.Parallel()
	store := newFakeStore(uuid.New())
	store.mergeOverride = func(string, string, uuid.UUID) (*models.MergeBranchResult, error) {
		return nil, errors.Join(repo.ErrValidation, errors.New("source and target branches must differ"))
	}
	h := &handlers.Handlers{Repo: store}
	caller := &authmw.Claims{Sub: uuid.New(), Roles: []string{"admin"}}
	rec := httptest.NewRecorder()
	mergeRouter(h).ServeHTTP(rec, newMergeReq(store.datasets[0].ID, "main", "feature", caller))
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestMergeBranchMapsNotFoundTo404(t *testing.T) {
	t.Parallel()
	store := newFakeStore(uuid.New())
	store.mergeOverride = func(string, string, uuid.UUID) (*models.MergeBranchResult, error) {
		return nil, repo.ErrNotFound
	}
	h := &handlers.Handlers{Repo: store}
	caller := &authmw.Claims{Sub: uuid.New(), Roles: []string{"admin"}}
	rec := httptest.NewRecorder()
	mergeRouter(h).ServeHTTP(rec, newMergeReq(store.datasets[0].ID, "main", "ghost", caller))
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestMergeBranchReturns404WhenDatasetMissing(t *testing.T) {
	t.Parallel()
	store := newFakeStore(uuid.New())
	h := &handlers.Handlers{Repo: store}
	caller := &authmw.Claims{Sub: uuid.New(), Roles: []string{"admin"}}
	rec := httptest.NewRecorder()
	mergeRouter(h).ServeHTTP(rec, newMergeReq(uuid.New() /* unknown */, "main", "feature", caller))
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestMergeBranchEmitsAuditEvent(t *testing.T) {
	t.Parallel()
	store := newFakeStore(uuid.New())
	newHead := uuid.New()
	newRID := models.TransactionRID(newHead)
	store.mergeOverride = func(target, source string, _ uuid.UUID) (*models.MergeBranchResult, error) {
		return &models.MergeBranchResult{
			Branch:                models.RuntimeBranch{Name: target, HeadTransactionID: &newHead},
			FastForwarded:         true,
			NewHeadTransactionRID: &newRID,
		}, nil
	}
	var captured handlers.AuditEvent
	auditCalled := false
	h := &handlers.Handlers{Repo: store, AuditSink: func(_ context.Context, e handlers.AuditEvent) {
		captured = e
		auditCalled = true
	}}
	caller := &authmw.Claims{Sub: uuid.New(), Roles: []string{"admin"}}
	rec := httptest.NewRecorder()
	mergeRouter(h).ServeHTTP(rec, newMergeReq(store.datasets[0].ID, "main", "feature", caller))
	require.Equal(t, http.StatusOK, rec.Code)
	require.True(t, auditCalled, "audit sink must be invoked on successful merge")
	assert.Equal(t, "dataset.branch.merge", captured.Action)
	assert.Equal(t, caller.Sub.String(), captured.Actor)
	assert.Equal(t, store.datasets[0].ID.String(), captured.DatasetRID)
	assert.Equal(t, "main", captured.Details["target_branch"])
	assert.Equal(t, "feature", captured.Details["source_branch"])
	assert.Equal(t, true, captured.Details["fast_forwarded"])
}
