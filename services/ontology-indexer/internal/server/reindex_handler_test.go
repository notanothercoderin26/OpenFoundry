package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/reindex"
)

type fakeSource struct{ pages []reindex.ListPage }

func (s *fakeSource) ListByType(_ context.Context, _ repos.TenantId, _ repos.TypeId, page, _ uint32) (reindex.ListPage, error) {
	idx := int(page) - 1
	if idx < 0 || idx >= len(s.pages) {
		return reindex.ListPage{}, nil
	}
	return s.pages[idx], nil
}

type fakeBackend struct{ indexed []repos.IndexDoc }

func (b *fakeBackend) Search(context.Context, repos.SearchQuery, repos.ReadConsistency) (repos.PagedResult[repos.SearchHit], error) {
	return repos.PagedResult[repos.SearchHit]{}, nil
}
func (b *fakeBackend) Index(_ context.Context, doc repos.IndexDoc) error {
	b.indexed = append(b.indexed, doc)
	return nil
}
func (b *fakeBackend) Delete(context.Context, repos.TenantId, repos.ObjectId) (bool, error) {
	return true, nil
}
func (b *fakeBackend) SearchVector(context.Context, repos.VectorQuery, repos.ReadConsistency) ([]repos.SearchHit, error) {
	return nil, repos.ErrVectorSearchUnsupported()
}
func (b *fakeBackend) BulkIndex(ctx context.Context, docs []repos.IndexDoc) (repos.BulkOutcome, error) {
	return repos.DefaultBulkIndex(ctx, b, docs)
}

func newTestDeps(t *testing.T, src reindex.ObjectsSource, backend *fakeBackend) *ReindexDeps {
	t.Helper()
	deps := &ReindexDeps{
		Source:   src,
		Backend:  backend,
		Registry: reindex.NewRegistry(),
		PageSize: 50,
	}
	// Run backfill synchronously so tests can assert against final state
	// immediately after the POST returns.
	deps.run = func(jobID string, tenant repos.TenantId, typeID repos.TypeId) {
		runBackfill(deps, jobID, tenant, typeID)
	}
	return deps
}

func TestReindexStartRequiresObjectType(t *testing.T) {
	t.Parallel()
	deps := newTestDeps(t, &fakeSource{}, &fakeBackend{})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/ontology-indexer/reindex", nil)
	newReindexStartHandler(deps)(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestReindexStartReturnsJobIDAndRuns(t *testing.T) {
	t.Parallel()
	src := &fakeSource{pages: []reindex.ListPage{
		{Items: []reindex.SourceObject{
			{ID: "ac-1", TypeID: "Aircraft", Properties: map[string]any{"tail_number": "N12345"}},
			{ID: "ac-2", TypeID: "Aircraft", Properties: map[string]any{"tail_number": "N67890"}},
		}, Total: 2, HasNext: false},
	}}
	backend := &fakeBackend{}
	deps := newTestDeps(t, src, backend)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/ontology-indexer/reindex?objectType=Aircraft&tenant=acme", nil)
	newReindexStartHandler(deps)(rec, req)
	require.Equal(t, http.StatusAccepted, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	jobID, _ := resp["job_id"].(string)
	require.NotEmpty(t, jobID)
	assert.Equal(t, "Aircraft", resp["object_type"])

	job := deps.Registry.Get(jobID)
	require.NotNil(t, job)
	assert.Equal(t, reindex.JobCompleted, job.Status)
	assert.Equal(t, 2, job.Indexed)
	assert.Equal(t, 2, job.TotalRead)
	assert.Len(t, backend.indexed, 2)
}

func TestReindexStartDefaultsTenantToDefault(t *testing.T) {
	t.Parallel()
	src := &fakeSource{pages: []reindex.ListPage{{Items: []reindex.SourceObject{
		{ID: "ac-1", TypeID: "Aircraft", Properties: map[string]any{}},
	}, Total: 1, HasNext: false}}}
	deps := newTestDeps(t, src, &fakeBackend{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/ontology-indexer/reindex?objectType=Aircraft", nil)
	newReindexStartHandler(deps)(rec, req)
	require.Equal(t, http.StatusAccepted, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.Equal(t, "default", resp["tenant"])
}

func TestReindexStartReturns503WhenUnconfigured(t *testing.T) {
	t.Parallel()
	deps := &ReindexDeps{} // no Source/Backend/Registry
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/ontology-indexer/reindex?objectType=Aircraft", nil)
	newReindexStartHandler(deps)(rec, req)
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
}

func TestReindexStatusReturnsJob(t *testing.T) {
	t.Parallel()
	src := &fakeSource{pages: []reindex.ListPage{{Items: []reindex.SourceObject{
		{ID: "ac-1", TypeID: "Aircraft", Properties: map[string]any{}},
	}, Total: 1, HasNext: false}}}
	deps := newTestDeps(t, src, &fakeBackend{})

	// Kick the job through the start handler so the registry has one.
	startRec := httptest.NewRecorder()
	startReq := httptest.NewRequest(http.MethodPost, "/api/v1/ontology-indexer/reindex?objectType=Aircraft&tenant=acme", nil)
	newReindexStartHandler(deps)(startRec, startReq)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(startRec.Body.Bytes(), &resp))
	jobID := resp["job_id"].(string)

	// Mount the status handler through a chi router so URLParam works.
	r := chi.NewRouter()
	r.Get("/api/v1/ontology-indexer/reindex/{job_id}", newReindexStatusHandler(deps))
	statusRec := httptest.NewRecorder()
	statusReq := httptest.NewRequest(http.MethodGet, "/api/v1/ontology-indexer/reindex/"+jobID, nil)
	r.ServeHTTP(statusRec, statusReq)

	require.Equal(t, http.StatusOK, statusRec.Code)
	var job reindex.Job
	require.NoError(t, json.Unmarshal(statusRec.Body.Bytes(), &job))
	assert.Equal(t, jobID, job.ID)
	assert.Equal(t, reindex.JobCompleted, job.Status)
	assert.Equal(t, 1, job.Indexed)
}

func TestReindexStatusReturns404ForUnknownJob(t *testing.T) {
	t.Parallel()
	deps := newTestDeps(t, &fakeSource{}, &fakeBackend{})
	r := chi.NewRouter()
	r.Get("/api/v1/ontology-indexer/reindex/{job_id}", newReindexStatusHandler(deps))
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ontology-indexer/reindex/missing", nil)
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}
