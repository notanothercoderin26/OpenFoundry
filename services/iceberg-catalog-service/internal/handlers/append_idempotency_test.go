package handlers_test

import (
	"context"
	"crypto/sha256"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/repo"
)

// memIdempotencyStore embeds fakeAppendStore + adds an in-memory
// implementation of handlers.AppendIdempotencyStore so the handler's
// upcast assertion lights up. Keeping it in this file (not promoted
// into fakeAppendStore) means the pre-existing tests still exercise
// the "no idempotency" path.
type memIdempotencyStore struct {
	*fakeAppendStore
	mu      sync.Mutex
	records map[string]repo.AppendIdempotencyRecord // key = idempotency_key|table_id

	// forceRace, when non-nil, runs once before the next
	// RecordAppendIdempotency call and is used by the race test to
	// reserve the key under a sibling submission.
	forceRace func(s *memIdempotencyStore)
}

func newMemIdempotencyStore(f *fakeAppendStore) *memIdempotencyStore {
	return &memIdempotencyStore{fakeAppendStore: f, records: map[string]repo.AppendIdempotencyRecord{}}
}

func (s *memIdempotencyStore) keyOf(k string, t uuid.UUID) string { return k + "|" + t.String() }

func (s *memIdempotencyStore) LookupAppendIdempotency(_ context.Context, key string, tableID uuid.UUID) (*repo.AppendIdempotencyRecord, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.records[s.keyOf(key, tableID)]
	if !ok {
		return nil, false, nil
	}
	out := rec
	return &out, true, nil
}

func (s *memIdempotencyStore) RecordAppendIdempotency(_ context.Context, rec repo.AppendIdempotencyRecord) error {
	if s.forceRace != nil {
		race := s.forceRace
		s.forceRace = nil
		race(s)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	k := s.keyOf(rec.IdempotencyKey, rec.TableID)
	if _, exists := s.records[k]; exists {
		return repo.ErrAppendIdempotencyRace
	}
	s.records[k] = rec
	return nil
}

func TestAppendBatch_IdempotencyReplayReturnsPriorSnapshot(t *testing.T) {
	t.Parallel()
	base := &fakeAppendStore{table: appendFixtureTable("of_audit", "events", auditAppendSchema())}
	store := newMemIdempotencyStore(base)
	h := &handlers.Handlers{Repo: store}

	// First call commits.
	rec1 := httptest.NewRecorder()
	req1 := httptest.NewRequest(http.MethodPost, "/openfoundry/iceberg/v1/append", strings.NewReader(auditAppendFixture()))
	req1.Header.Set("Idempotency-Key", "demo-run-001")
	h.AppendBatch(rec1, req1)
	require.Equal(t, http.StatusAccepted, rec1.Code, rec1.Body.String())
	require.Equal(t, 1, base.commitCalls)

	// Second call with the SAME key + body: replay, no second commit.
	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodPost, "/openfoundry/iceberg/v1/append", strings.NewReader(auditAppendFixture()))
	req2.Header.Set("Idempotency-Key", "demo-run-001")
	h.AppendBatch(rec2, req2)
	require.Equal(t, http.StatusOK, rec2.Code, rec2.Body.String())
	assert.Equal(t, 1, base.commitCalls, "replay must not invoke CommitTable")
	// Same metadata_location on both responses.
	assert.Contains(t, rec2.Body.String(), `"metadata_location":`)
	assert.Equal(t,
		strings.TrimSpace(rec1.Body.String()),
		strings.TrimSpace(rec2.Body.String()),
	)
}

func TestAppendBatch_IdempotencyMismatchReturnsConflict(t *testing.T) {
	t.Parallel()
	base := &fakeAppendStore{table: appendFixtureTable("of_audit", "events", auditAppendSchema())}
	store := newMemIdempotencyStore(base)
	h := &handlers.Handlers{Repo: store}

	body1 := auditAppendFixture()
	// Same key, different body (different event_id) — must 409.
	body2 := strings.Replace(body1,
		`"00000000-0000-7000-8000-000000000001"`,
		`"00000000-0000-7000-8000-000000000099"`,
		1,
	)

	rec1 := httptest.NewRecorder()
	req1 := httptest.NewRequest(http.MethodPost, "/openfoundry/iceberg/v1/append", strings.NewReader(body1))
	req1.Header.Set("Idempotency-Key", "demo-run-001")
	h.AppendBatch(rec1, req1)
	require.Equal(t, http.StatusAccepted, rec1.Code)

	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodPost, "/openfoundry/iceberg/v1/append", strings.NewReader(body2))
	req2.Header.Set("Idempotency-Key", "demo-run-001")
	h.AppendBatch(rec2, req2)
	assert.Equal(t, http.StatusConflict, rec2.Code, rec2.Body.String())
	assert.Equal(t, 1, base.commitCalls, "conflicting body must not commit again")
}

func TestAppendBatch_NoIdempotencyHeaderKeepsLegacyBehaviour(t *testing.T) {
	t.Parallel()
	// Two calls without the header — both commit. Confirms we did not
	// change the contract for callers that don't opt in.
	base := &fakeAppendStore{table: appendFixtureTable("of_audit", "events", auditAppendSchema())}
	store := newMemIdempotencyStore(base)
	h := &handlers.Handlers{Repo: store}

	for i := 0; i < 2; i++ {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/openfoundry/iceberg/v1/append", strings.NewReader(auditAppendFixture()))
		h.AppendBatch(rec, req)
		require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
	}
	assert.Equal(t, 2, base.commitCalls)
}

func TestAppendBatch_KeyTooLongReturnsBadRequest(t *testing.T) {
	t.Parallel()
	base := &fakeAppendStore{table: appendFixtureTable("of_audit", "events", auditAppendSchema())}
	store := newMemIdempotencyStore(base)
	h := &handlers.Handlers{Repo: store}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/openfoundry/iceberg/v1/append", strings.NewReader(auditAppendFixture()))
	req.Header.Set("Idempotency-Key", strings.Repeat("a", 201))
	h.AppendBatch(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, 0, base.commitCalls)
}

func TestAppendBatch_IdempotencyRaceFoldsBackToReplay(t *testing.T) {
	t.Parallel()
	// Simulate the race window: between our CommitTable and our
	// Record, a concurrent submission for the same key inserts a
	// matching record. The handler should fold back to the replay
	// response (HTTP 200) rather than surface the race.
	base := &fakeAppendStore{table: appendFixtureTable("of_audit", "events", auditAppendSchema())}
	store := newMemIdempotencyStore(base)
	hash := sha256Body([]byte(auditAppendFixture()))
	store.forceRace = func(s *memIdempotencyStore) {
		// Manually reserve the key under the sibling's snapshot — the
		// hash matches what our caller computed, so the resolved
		// outcome is "replay" not "conflict".
		s.mu.Lock()
		defer s.mu.Unlock()
		s.records["demo-run-002|"+base.table.ID.String()] = repo.AppendIdempotencyRecord{
			IdempotencyKey:   "demo-run-002",
			TableID:          base.table.ID,
			RequestHash:      hash,
			SnapshotID:       1234567890,
			MetadataLocation: "s3://warehouse/of_test/events/metadata/sibling.metadata.json",
		}
	}

	h := &handlers.Handlers{Repo: store}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/openfoundry/iceberg/v1/append", strings.NewReader(auditAppendFixture()))
	req.Header.Set("Idempotency-Key", "demo-run-002")
	h.AppendBatch(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), "sibling.metadata.json")
	assert.Equal(t, 1, base.commitCalls, "we did commit our own snapshot before discovering the race")
}

func sha256Body(b []byte) []byte {
	sum := sha256.Sum256(b)
	return sum[:]
}
