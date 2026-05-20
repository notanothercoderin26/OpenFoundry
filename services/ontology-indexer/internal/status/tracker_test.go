package status

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

func TestTrackerRecordIndexedAggregates(t *testing.T) {
	t.Parallel()
	tr := NewTracker()
	indexedAt := time.Date(2026, 5, 20, 12, 0, 5, 0, time.UTC)
	eventAt := time.Date(2026, 5, 20, 12, 0, 0, 0, time.UTC)
	tr.now = func() time.Time { return indexedAt }

	tr.RecordIndexed("acme", "Aircraft", eventAt)
	tr.RecordIndexed("acme", "Aircraft", eventAt.Add(time.Second))

	snap, ok := tr.Snapshot("acme", "Aircraft")
	require.True(t, ok)
	assert.Equal(t, uint64(2), snap.IndexedCount)
	assert.Equal(t, uint64(0), snap.DeletedCount)
	assert.Equal(t, indexedAt, snap.LastIndexedAt)
	assert.Equal(t, eventAt.Add(time.Second), snap.LastEventTime)
	assert.InDelta(t, 4.0, snap.LagSeconds, 0.001)
}

func TestTrackerLagClampedAtZero(t *testing.T) {
	t.Parallel()
	tr := NewTracker()
	indexedAt := time.Date(2026, 5, 20, 12, 0, 0, 0, time.UTC)
	eventAt := indexedAt.Add(2 * time.Second) // producer clock ahead
	tr.now = func() time.Time { return indexedAt }

	tr.RecordIndexed("acme", "Aircraft", eventAt)
	snap, _ := tr.Snapshot("acme", "Aircraft")
	assert.Equal(t, 0.0, snap.LagSeconds)
}

func TestTrackerSnapshotAggregatesAcrossTenantsWhenTenantOmitted(t *testing.T) {
	t.Parallel()
	tr := NewTracker()
	base := time.Date(2026, 5, 20, 12, 0, 0, 0, time.UTC)
	tr.now = func() time.Time { return base.Add(time.Second) }

	tr.RecordIndexed("acme", "Aircraft", base)
	tr.RecordIndexed("globex", "Aircraft", base)
	tr.RecordIndexed("globex", "Aircraft", base)
	tr.RecordDeleted("acme", "Aircraft", base)

	snap, ok := tr.Snapshot(repos.TenantId(""), "Aircraft")
	require.True(t, ok)
	assert.Equal(t, uint64(3), snap.IndexedCount)
	assert.Equal(t, uint64(1), snap.DeletedCount)
}

func TestTrackerSnapshotMissingTypeReturnsFalse(t *testing.T) {
	t.Parallel()
	tr := NewTracker()
	_, ok := tr.Snapshot("acme", "Aircraft")
	assert.False(t, ok)
}

func TestTrackerRecordIgnoresEmptyKeys(t *testing.T) {
	t.Parallel()
	tr := NewTracker()
	tr.RecordIndexed("", "Aircraft", time.Now())
	tr.RecordIndexed("acme", "", time.Now())
	assert.Empty(t, tr.All())
}

func TestTrackerAllReturnsEveryEntry(t *testing.T) {
	t.Parallel()
	tr := NewTracker()
	tr.RecordIndexed("acme", "Aircraft", time.Now())
	tr.RecordIndexed("acme", "Airport", time.Now())
	tr.RecordIndexed("globex", "Aircraft", time.Now())
	all := tr.All()
	assert.Len(t, all, 3)
}

func TestTrackerConcurrentRecordIsSafe(t *testing.T) {
	t.Parallel()
	tr := NewTracker()
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				tr.RecordIndexed("acme", "Aircraft", time.Now())
			}
		}()
	}
	wg.Wait()
	snap, ok := tr.Snapshot("acme", "Aircraft")
	require.True(t, ok)
	assert.Equal(t, uint64(1600), snap.IndexedCount)
}
