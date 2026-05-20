package reindex

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/status"
)

type fakeSource struct {
	mu    sync.Mutex
	pages []ListPage
	calls int
	err   error
}

func (s *fakeSource) ListByType(_ context.Context, _ repos.TenantId, _ repos.TypeId, page, _ uint32) (ListPage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	if s.err != nil {
		return ListPage{}, s.err
	}
	idx := int(page) - 1
	if idx < 0 || idx >= len(s.pages) {
		return ListPage{}, nil
	}
	return s.pages[idx], nil
}

type fakeBackend struct {
	mu      sync.Mutex
	indexed []repos.IndexDoc
	failID  string
}

func (b *fakeBackend) Search(context.Context, repos.SearchQuery, repos.ReadConsistency) (repos.PagedResult[repos.SearchHit], error) {
	return repos.PagedResult[repos.SearchHit]{}, nil
}
func (b *fakeBackend) Index(_ context.Context, doc repos.IndexDoc) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if string(doc.ID) == b.failID {
		return errors.New("simulated backend failure")
	}
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

func discardLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestBackfillIndexesAllPages(t *testing.T) {
	t.Parallel()
	src := &fakeSource{pages: []ListPage{
		{Items: []SourceObject{
			{ID: "ac-1", TypeID: "Aircraft", Properties: map[string]any{"tail_number": "N12345"}},
			{ID: "ac-2", TypeID: "Aircraft", Properties: map[string]any{"tail_number": "N67890"}},
		}, Total: 3, HasNext: true},
		{Items: []SourceObject{
			{ID: "ac-3", TypeID: "Aircraft", Properties: map[string]any{"tail_number": "N00001"}},
		}, Total: 3, HasNext: false},
	}}
	backend := &fakeBackend{}
	tracker := status.NewTracker()
	runner := &Runner{Source: src, Backend: backend, Tracker: tracker, PageSize: 2, Log: discardLog()}

	res, err := runner.Backfill(context.Background(), "acme", "Aircraft")
	require.NoError(t, err)
	assert.Equal(t, 3, res.TotalRead)
	assert.Equal(t, 3, res.Indexed)
	assert.Equal(t, 0, res.Failed)
	assert.Len(t, backend.indexed, 3)
	assert.Equal(t, 2, src.calls)
	// tracker reflects the run.
	snap, ok := tracker.Snapshot("acme", "Aircraft")
	require.True(t, ok)
	assert.Equal(t, uint64(3), snap.IndexedCount)
}

func TestBackfillCountsIndividualFailuresButContinues(t *testing.T) {
	t.Parallel()
	src := &fakeSource{pages: []ListPage{
		{Items: []SourceObject{
			{ID: "good-1", TypeID: "Aircraft", Properties: map[string]any{}},
			{ID: "boom", TypeID: "Aircraft", Properties: map[string]any{}},
			{ID: "good-2", TypeID: "Aircraft", Properties: map[string]any{}},
		}, Total: 3, HasNext: false},
	}}
	backend := &fakeBackend{failID: "boom"}
	runner := &Runner{Source: src, Backend: backend, PageSize: 50, Log: discardLog()}

	res, err := runner.Backfill(context.Background(), "acme", "Aircraft")
	require.NoError(t, err)
	assert.Equal(t, 3, res.TotalRead)
	assert.Equal(t, 2, res.Indexed)
	assert.Equal(t, 1, res.Failed)
	assert.Contains(t, res.LastError, "boom")
}

func TestBackfillAbortsOnSourceTransportError(t *testing.T) {
	t.Parallel()
	src := &fakeSource{err: errors.New("connection refused")}
	backend := &fakeBackend{}
	runner := &Runner{Source: src, Backend: backend, PageSize: 50, Log: discardLog()}

	res, err := runner.Backfill(context.Background(), "acme", "Aircraft")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "connection refused")
	assert.Equal(t, 0, res.Indexed)
}

func TestBackfillStopsOnEmptyPageBeforeHasNextFlip(t *testing.T) {
	t.Parallel()
	src := &fakeSource{pages: []ListPage{{Items: nil, Total: 0, HasNext: false}}}
	backend := &fakeBackend{}
	runner := &Runner{Source: src, Backend: backend, PageSize: 50, Log: discardLog()}

	res, err := runner.Backfill(context.Background(), "acme", "Aircraft")
	require.NoError(t, err)
	assert.Equal(t, 0, res.TotalRead)
	assert.Equal(t, 1, src.calls)
}

func TestBackfillRejectsMissingDeps(t *testing.T) {
	t.Parallel()
	_, err := (&Runner{}).Backfill(context.Background(), "acme", "Aircraft")
	assert.ErrorContains(t, err, "nil Source")
	_, err = (&Runner{Source: &fakeSource{}}).Backfill(context.Background(), "acme", "Aircraft")
	assert.ErrorContains(t, err, "nil Backend")
}
