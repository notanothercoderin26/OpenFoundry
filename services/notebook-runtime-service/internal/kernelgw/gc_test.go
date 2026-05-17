package kernelgw

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

// fakeRepo records calls and lets the test pre-seed the "stale" list.
type fakeRepo struct {
	mu       sync.Mutex
	stale    []Mapping
	deleted  []uuid.UUID
	touched  map[uuid.UUID]time.Time
	listErr  error
	delErr   map[uuid.UUID]error
	mappings map[uuid.UUID]Mapping
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		touched:  map[uuid.UUID]time.Time{},
		delErr:   map[uuid.UUID]error{},
		mappings: map[uuid.UUID]Mapping{},
	}
}

func (f *fakeRepo) Insert(_ context.Context, m Mapping) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.mappings[m.SessionID] = m
	return nil
}

func (f *fakeRepo) GetBySession(_ context.Context, id uuid.UUID) (Mapping, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	m, ok := f.mappings[id]
	if !ok {
		return Mapping{}, ErrMappingNotFound
	}
	return m, nil
}

func (f *fakeRepo) Touch(_ context.Context, id uuid.UUID, at time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.touched[id] = at
	return nil
}

func (f *fakeRepo) DeleteBySession(_ context.Context, id uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.delErr[id]; err != nil {
		return err
	}
	f.deleted = append(f.deleted, id)
	delete(f.mappings, id)
	return nil
}

func (f *fakeRepo) ListIdleBefore(_ context.Context, _ time.Time) ([]Mapping, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.listErr != nil {
		return nil, f.listErr
	}
	out := make([]Mapping, len(f.stale))
	copy(out, f.stale)
	return out, nil
}

type fakeClock struct{ now time.Time }

func (c *fakeClock) Now() time.Time                  { return c.now }
func (c *fakeClock) NewTicker(_ time.Duration) Ticker { return staleTicker{} }

type staleTicker struct{}

func (staleTicker) C() <-chan time.Time { ch := make(chan time.Time); return ch }
func (staleTicker) Stop()                {}

// TestSweepOnce_DeletesUpstreamAndMapping: happy path — one stale
// mapping, gateway returns 204, repo row is removed.
func TestSweepOnce_DeletesUpstreamAndMapping(t *testing.T) {
	t.Parallel()
	var deleted []string
	gw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			deleted = append(deleted, r.URL.Path)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		t.Fatalf("unexpected gateway call: %s %s", r.Method, r.URL.Path)
	}))
	defer gw.Close()

	client, err := New(Config{HTTPBaseURL: gw.URL})
	if err != nil {
		t.Fatalf("client init: %v", err)
	}

	repo := newFakeRepo()
	staleID, _ := uuid.NewV7()
	repo.stale = []Mapping{{
		SessionID:       staleID,
		GatewayKernelID: "kernel-abc",
		LastActivity:    time.Now().Add(-2 * time.Hour),
	}}

	gc := &GC{
		Repo:        repo,
		Client:      client,
		IdleTimeout: 30 * time.Minute,
		Clock:       &fakeClock{now: time.Now()},
	}
	gc.SweepOnce(context.Background())

	if len(deleted) != 1 || deleted[0] != "/api/kernels/kernel-abc" {
		t.Fatalf("expected DELETE /api/kernels/kernel-abc, got %v", deleted)
	}
	if len(repo.deleted) != 1 || repo.deleted[0] != staleID {
		t.Fatalf("expected mapping deletion for %s, got %v", staleID, repo.deleted)
	}
}

// TestSweepOnce_GatewayErrorKeepsMapping: when the gateway DELETE
// fails, we MUST keep the mapping row so the next sweep retries.
func TestSweepOnce_GatewayErrorKeepsMapping(t *testing.T) {
	t.Parallel()
	gw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer gw.Close()

	client, err := New(Config{HTTPBaseURL: gw.URL})
	if err != nil {
		t.Fatalf("client init: %v", err)
	}
	repo := newFakeRepo()
	staleID, _ := uuid.NewV7()
	repo.stale = []Mapping{{SessionID: staleID, GatewayKernelID: "kernel-zzz"}}

	gc := &GC{
		Repo:        repo,
		Client:      client,
		IdleTimeout: 30 * time.Minute,
		Clock:       &fakeClock{now: time.Now()},
	}
	gc.SweepOnce(context.Background())

	if len(repo.deleted) != 0 {
		t.Fatalf("mapping must be retained on gateway error, deleted=%v", repo.deleted)
	}
}

// TestSweepOnce_NoStaleNoCalls: empty stale list = no gateway calls,
// no repo deletes.
func TestSweepOnce_NoStaleNoCalls(t *testing.T) {
	t.Parallel()
	called := 0
	gw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called++
		w.WriteHeader(http.StatusOK)
	}))
	defer gw.Close()

	client, err := New(Config{HTTPBaseURL: gw.URL})
	if err != nil {
		t.Fatalf("client init: %v", err)
	}
	repo := newFakeRepo()
	gc := &GC{Repo: repo, Client: client, IdleTimeout: 30 * time.Minute, Clock: &fakeClock{now: time.Now()}}
	gc.SweepOnce(context.Background())
	if called != 0 {
		t.Fatalf("expected no gateway calls when nothing is stale, got %d", called)
	}
}

// TestSweepOnce_ListErrorIsSwallowed: a transient repo error must not
// abort future sweeps; SweepOnce returns without panic and without
// invoking the gateway.
func TestSweepOnce_ListErrorIsSwallowed(t *testing.T) {
	t.Parallel()
	called := 0
	gw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called++
	}))
	defer gw.Close()

	client, err := New(Config{HTTPBaseURL: gw.URL})
	if err != nil {
		t.Fatalf("client init: %v", err)
	}
	repo := newFakeRepo()
	repo.listErr = errors.New("boom")
	gc := &GC{Repo: repo, Client: client, IdleTimeout: 30 * time.Minute, Clock: &fakeClock{now: time.Now()}}
	gc.SweepOnce(context.Background())
	if called != 0 {
		t.Fatalf("expected no gateway calls on list error, got %d", called)
	}
}
