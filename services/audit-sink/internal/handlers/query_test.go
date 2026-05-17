package handlers

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/repo"
)

// TestCursorRoundTrip pins the opaque base64 encoding round-trip so the
// next_cursor handed to clients round-trips back as a Cursor unchanged.
func TestCursorRoundTrip(t *testing.T) {
	t.Parallel()
	c := repo.Cursor{
		OccurredAt: time.Date(2026, 5, 17, 12, 0, 0, 123456, time.UTC),
		EventID:    uuid.New(),
	}
	got, err := decodeCursor(encodeCursor(c))
	require.NoError(t, err)
	assert.Equal(t, c.EventID, got.EventID)
	assert.True(t, c.OccurredAt.Equal(got.OccurredAt), "occurred_at must round-trip: got %v want %v", got.OccurredAt, c.OccurredAt)
}

// TestDecodeCursorRejectsGarbage protects the API from forged cursors:
// non-base64, non-JSON, missing fields all fall to a single error path.
func TestDecodeCursorRejectsGarbage(t *testing.T) {
	t.Parallel()
	cases := []string{
		"not-base64-???",
		"YWJj",                // base64("abc") — invalid JSON
		"e30",                 // base64("{}") — missing fields
		"eyJlIjoiYmFkIn0",     // base64({"e":"bad"}) — bad uuid
	}
	for _, raw := range cases {
		_, err := decodeCursor(raw)
		assert.Error(t, err, "want decode error for %q", raw)
	}
}

// TestRecordEventRejectsEmptyEnvelope verifies that the write-through
// path rejects requests with no envelope body without touching the
// repo. The handler does not need a configured Repo for this branch.
func TestRecordEventRejectsEmptyEnvelope(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	req := httptest.NewRequest("POST", "/api/v1/audit/events", nil)
	rec := httptest.NewRecorder()
	h.RecordEvent(rec, req)
	assert.Equal(t, 400, rec.Code)
}

// TestQueryEventsRejectsBadPageSize covers the validator on the read
// path: page_size must be a positive int when present.
func TestQueryEventsRejectsBadPageSize(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	req := httptest.NewRequest("GET", "/api/v1/audit/events?page_size=-3", nil)
	rec := httptest.NewRecorder()
	h.QueryEvents(rec, req)
	assert.Equal(t, 400, rec.Code)
}

// TestQueryEventsRejectsBadTime locks the time-parse error path so a
// caller doesn't get a 500 for a malformed `from`.
func TestQueryEventsRejectsBadTime(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	req := httptest.NewRequest("GET", "/api/v1/audit/events?from=yesterday", nil)
	rec := httptest.NewRecorder()
	h.QueryEvents(rec, req)
	assert.Equal(t, 400, rec.Code)
}
