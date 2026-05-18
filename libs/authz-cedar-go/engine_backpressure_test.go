package cedarauthz_test

import (
	"context"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	cedar "github.com/cedar-policy/cedar-go"
	"github.com/cedar-policy/cedar-go/types"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	cedarauthz "github.com/openfoundry/openfoundry-go/libs/authz-cedar-go"
)

// slowSink models a Kafka broker that has stalled. Each Emit parks
// for the configured delay; the call count is exposed for assertions.
type slowSink struct {
	delay     time.Duration
	emitted   atomic.Int64
	inflight  atomic.Int64
	maxInflt  atomic.Int64
	respectCx bool
}

func (s *slowSink) Emit(ctx context.Context, _ cedarauthz.AuthzAuditEvent) {
	now := s.inflight.Add(1)
	for {
		prev := s.maxInflt.Load()
		if now <= prev || s.maxInflt.CompareAndSwap(prev, now) {
			break
		}
	}
	defer s.inflight.Add(-1)
	if s.respectCx {
		select {
		case <-ctx.Done():
		case <-time.After(s.delay):
		}
	} else {
		time.Sleep(s.delay)
	}
	s.emitted.Add(1)
}

// TestEngineSlowSinkDoesNotBlockAuthorize is the headline test for the
// audit-emit backpressure fix. Setup:
//
//   - 4 audit workers, buffer 8, emit timeout 50ms, sink sleeps 10s.
//   - Fire 100 Authorize() in tight succession.
//
// Assertions:
//
//   - (a) All 100 Authorize calls return within ~50ms total (none
//     stalled on the audit sink).
//   - (b) authz_audit_emit_dropped_total{reason="buffer_full"} reflects
//     the events that were dropped because the buffer overflowed.
//   - (c) Live goroutine count never exceeds baseline + workers + small
//     slack, regardless of how many Authorize calls fired.
func TestEngineSlowSinkDoesNotBlockAuthorize(t *testing.T) {
	store, err := cedarauthz.NewWithPolicies([]cedarauthz.PolicyRecord{{
		ID:     "permit-all",
		Source: `permit(principal, action, resource);`,
	}})
	require.NoError(t, err)

	const (
		workers = 4
		buffer  = 8
		calls   = 100
	)

	sink := &slowSink{delay: 10 * time.Second}

	reg := prometheus.NewRegistry()
	eng := cedarauthz.NewEngineWithConfig(store, sink, cedarauthz.EngineConfig{
		AuditEmitTimeout:     50 * time.Millisecond,
		AuditBufferSize:      buffer,
		AuditWorkerCount:     workers,
		AuditShutdownTimeout: 100 * time.Millisecond,
		MetricsRegisterer:    reg,
	})
	t.Cleanup(func() { _ = eng.Shutdown(context.Background()) })

	user := types.NewEntityUID("User", "alice")
	action := types.NewEntityUID("Action", "read")
	dataset := types.NewEntityUID("Dataset", "ds-1")
	entities := cedar.EntityMap{}

	baseline := runtime.NumGoroutine()
	maxObserved := baseline
	var maxMu sync.Mutex
	stopObserver := make(chan struct{})
	observerDone := make(chan struct{})
	go func() {
		defer close(observerDone)
		ticker := time.NewTicker(2 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stopObserver:
				return
			case <-ticker.C:
				if n := runtime.NumGoroutine(); n > maxObserved {
					maxMu.Lock()
					if n > maxObserved {
						maxObserved = n
					}
					maxMu.Unlock()
				}
			}
		}
	}()

	start := time.Now()
	for i := 0; i < calls; i++ {
		out, aerr := eng.Authorize(context.Background(), user, action, dataset,
			cedar.NewRecord(cedar.RecordMap{}), entities)
		require.NoError(t, aerr)
		require.True(t, out.IsAllow())
	}
	elapsed := time.Since(start)

	close(stopObserver)
	<-observerDone

	// (a) No call blocked on the sink — 100 Authorize() under 500ms is
	// the practical bound (Cedar eval per call is well under a ms in
	// this trivial policy set).
	assert.Less(t, elapsed, 500*time.Millisecond,
		"audit pool back-pressure must not stall the hot path; took %s", elapsed)

	// (b) Drop counter reflects buffer overflow. Workers parked on the
	// 10s sleep absorb `workers` events into "inflight"; the channel
	// absorbs `buffer` more; the remainder MUST be dropped.
	expectedMinDropped := calls - workers - buffer
	droppedTotal := testutil.ToFloat64(cedarauthz.AuditEmitDroppedForTest().WithLabelValues("buffer_full"))
	assert.GreaterOrEqualf(t, int(droppedTotal), expectedMinDropped,
		"expected ≥%d drops once buffer+workers were saturated; got %d", expectedMinDropped, int(droppedTotal))

	// (c) Goroutine count stayed bounded. Slack accounts for runtime
	// helpers (timers, the observer itself, gc bg, etc.).
	maxMu.Lock()
	peak := maxObserved
	maxMu.Unlock()
	const slack = 32
	upper := baseline + workers + slack
	assert.LessOrEqualf(t, peak, upper,
		"goroutine count grew unboundedly: baseline=%d, peak=%d, workers=%d, slack=%d",
		baseline, peak, workers, slack)
}

// TestEngineShutdownDrainsInflight covers the explicit drain semantics.
// A slow-but-bounded sink should let Shutdown return without timeout
// when ShutdownTimeout > sink latency.
func TestEngineShutdownDrainsInflight(t *testing.T) {
	store, err := cedarauthz.NewWithPolicies([]cedarauthz.PolicyRecord{{
		ID:     "permit-all",
		Source: `permit(principal, action, resource);`,
	}})
	require.NoError(t, err)

	sink := &slowSink{delay: 20 * time.Millisecond, respectCx: true}
	eng := cedarauthz.NewEngineWithConfig(store, sink, cedarauthz.EngineConfig{
		AuditEmitTimeout:     200 * time.Millisecond,
		AuditBufferSize:      16,
		AuditWorkerCount:     4,
		AuditShutdownTimeout: 2 * time.Second,
	})

	user := types.NewEntityUID("User", "alice")
	action := types.NewEntityUID("Action", "read")
	dataset := types.NewEntityUID("Dataset", "ds-1")
	for i := 0; i < 8; i++ {
		_, _ = eng.Authorize(context.Background(), user, action, dataset,
			cedar.NewRecord(cedar.RecordMap{}), cedar.EntityMap{})
	}

	require.NoError(t, eng.Shutdown(context.Background()))
	assert.EqualValues(t, 8, sink.emitted.Load(),
		"all queued events must drain before Shutdown returns")
	assert.EqualValues(t, 0, sink.inflight.Load(),
		"no in-flight emit may outlive Shutdown")
}

// TestEngineShutdownIsIdempotent verifies multiple Shutdown calls don't
// panic or double-close the channel.
func TestEngineShutdownIsIdempotent(t *testing.T) {
	store, err := cedarauthz.NewEmpty()
	require.NoError(t, err)
	eng := cedarauthz.NewEngineWithConfig(store, &slowSink{delay: time.Millisecond}, cedarauthz.EngineConfig{
		AuditWorkerCount: 2,
		AuditBufferSize:  4,
	})
	require.NoError(t, eng.Shutdown(context.Background()))
	require.NoError(t, eng.Shutdown(context.Background()))
}

// TestEngineNoopAuditSkipsWorkerPool guards the optimisation that
// NewEngineNoopAudit / NewEngine(_, NoopAuditSink{}) spawn zero
// background goroutines.
func TestEngineNoopAuditSkipsWorkerPool(t *testing.T) {
	store, err := cedarauthz.NewEmpty()
	require.NoError(t, err)

	baseline := runtime.NumGoroutine()
	eng := cedarauthz.NewEngineNoopAudit(store)
	// Allow scheduler to settle.
	time.Sleep(20 * time.Millisecond)
	delta := runtime.NumGoroutine() - baseline
	assert.LessOrEqualf(t, delta, 2, "NoopAuditSink path must not spawn worker goroutines, delta=%d", delta)
	require.NoError(t, eng.Shutdown(context.Background()))
}
