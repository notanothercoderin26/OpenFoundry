package reindex

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRegistryLifecycleCompletesJob(t *testing.T) {
	t.Parallel()
	reg := NewRegistry()
	t0 := time.Date(2026, 5, 20, 12, 0, 0, 0, time.UTC)
	reg.now = func() time.Time { return t0 }

	j := reg.Create("acme", "Aircraft")
	require.NotNil(t, j)
	require.NotEmpty(t, j.ID)
	assert.Equal(t, JobPending, j.Status)

	reg.MarkRunning(j.ID)
	running := reg.Get(j.ID)
	assert.Equal(t, JobRunning, running.Status)

	reg.Complete(j.ID, Result{
		TotalRead:   100,
		Indexed:     99,
		Failed:      1,
		LastError:   "row x42 failed",
		StartedAt:   t0,
		CompletedAt: t0.Add(5 * time.Second),
		Duration:    5 * time.Second,
	})
	done := reg.Get(j.ID)
	assert.Equal(t, JobCompleted, done.Status)
	assert.Equal(t, 100, done.TotalRead)
	assert.Equal(t, 99, done.Indexed)
	assert.Equal(t, 1, done.Failed)
	assert.Equal(t, "row x42 failed", done.LastError)
	assert.Equal(t, int64(5000), done.DurationMS)
}

func TestRegistryFailRecordsError(t *testing.T) {
	t.Parallel()
	reg := NewRegistry()
	reg.now = func() time.Time { return time.Date(2026, 5, 20, 12, 0, 0, 0, time.UTC) }
	j := reg.Create("acme", "Aircraft")
	reg.MarkRunning(j.ID)
	reg.Fail(j.ID, Result{TotalRead: 50, Indexed: 50}, errors.New("source unreachable"))

	got := reg.Get(j.ID)
	require.NotNil(t, got)
	assert.Equal(t, JobFailed, got.Status)
	assert.Equal(t, "source unreachable", got.Error)
	assert.Equal(t, 50, got.Indexed)
}

func TestRegistryGetReturnsCopy(t *testing.T) {
	t.Parallel()
	reg := NewRegistry()
	j := reg.Create("acme", "Aircraft")
	got := reg.Get(j.ID)
	got.Status = "tampered"
	again := reg.Get(j.ID)
	assert.Equal(t, JobPending, again.Status, "Get must return a copy")
}

func TestRegistryGetMissingReturnsNil(t *testing.T) {
	t.Parallel()
	reg := NewRegistry()
	assert.Nil(t, reg.Get("does-not-exist"))
}

func TestRegistryListReturnsAllJobs(t *testing.T) {
	t.Parallel()
	reg := NewRegistry()
	reg.Create("acme", "Aircraft")
	reg.Create("acme", "Airport")
	assert.Len(t, reg.List(), 2)
}
