package cedarauthz

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"time"

	cedar "github.com/cedar-policy/cedar-go"
	"github.com/prometheus/client_golang/prometheus"
)

// AuthzEngine orchestrates policy evaluation, audit emission, and
// entity hydration. Composition mirrors the Rust impl:
//
//	AuthzEngine
//	  ├── *PolicyStore   (policy set + bundled schema)
//	  ├── AuthzAuditSink (audit emission, fire-and-forget)
//	  └── worker pool    (bounded buffered channel → fixed workers)
//
// Authorize is the canonical entry point. Callers that need raw
// diagnostics without audit emission can call PolicyStore.IsAuthorized
// directly.
//
// Audit emission is decoupled from the hot path through a buffered
// channel drained by a fixed worker pool. A slow sink (Kafka, etc.)
// applies backpressure by filling the buffer; once full, new events
// are dropped and counted in audit_emit_dropped_total. The worker
// invokes the sink with a per-event timeout (EngineConfig.AuditEmitTimeout).
// Callers MUST invoke Shutdown on service stop to drain the buffer.
type AuthzEngine struct {
	store *PolicyStore
	audit AuthzAuditSink
	cfg   EngineConfig

	events chan AuthzAuditEvent
	wg     sync.WaitGroup

	shutdownOnce sync.Once
	shutdown     atomic.Bool
}

// EngineConfig tunes the audit-emit worker pool. Zero values resolve
// to documented defaults via normalize() — pass `EngineConfig{}` to
// accept all defaults.
type EngineConfig struct {
	// AuditEmitTimeout caps how long a single Sink.Emit may take.
	// Workers wrap each event in context.WithTimeout(detached, this).
	// Default: 5s.
	AuditEmitTimeout time.Duration

	// AuditBufferSize is the channel capacity between Authorize and the
	// worker pool. Once full, further submissions increment
	// audit_emit_dropped_total{reason="buffer_full"} and return
	// immediately. Default: 1024.
	AuditBufferSize int

	// AuditWorkerCount is the number of goroutines draining the
	// channel. Default: 64.
	AuditWorkerCount int

	// AuditShutdownTimeout bounds Shutdown's wait for in-flight events
	// to drain. Default: 10s.
	AuditShutdownTimeout time.Duration

	// MetricsRegisterer registers the audit-emit collectors against a
	// service registry. nil is allowed — collectors still record into
	// package singletons (useful for tests via the helpers), they just
	// aren't scraped on /metrics. Re-registering the same collectors
	// across binaries is safe (AlreadyRegisteredError is ignored).
	MetricsRegisterer prometheus.Registerer
}

func (c *EngineConfig) normalize() {
	if c.AuditEmitTimeout <= 0 {
		c.AuditEmitTimeout = 5 * time.Second
	}
	if c.AuditBufferSize <= 0 {
		c.AuditBufferSize = 1024
	}
	if c.AuditWorkerCount <= 0 {
		c.AuditWorkerCount = 64
	}
	if c.AuditShutdownTimeout <= 0 {
		c.AuditShutdownTimeout = 10 * time.Second
	}
}

// NewEngine builds an engine from a [*PolicyStore] and an audit sink
// using default EngineConfig values. Pass [NoopAuditSink]{} for tests;
// the worker pool is skipped automatically and no background goroutines
// are spawned.
func NewEngine(store *PolicyStore, audit AuthzAuditSink) *AuthzEngine {
	return NewEngineWithConfig(store, audit, EngineConfig{})
}

// NewEngineNoopAudit is a convenience constructor matching the Rust
// `with_noop_audit` helper. Synchronous, zero background goroutines.
func NewEngineNoopAudit(store *PolicyStore) *AuthzEngine {
	return NewEngineWithConfig(store, NoopAuditSink{}, EngineConfig{})
}

// NewEngineWithConfig constructs an engine with full control over the
// audit worker pool. See [EngineConfig] for the available knobs.
func NewEngineWithConfig(store *PolicyStore, audit AuthzAuditSink, cfg EngineConfig) *AuthzEngine {
	if audit == nil {
		audit = NoopAuditSink{}
	}
	cfg.normalize()
	RegisterAuditMetrics(cfg.MetricsRegisterer)

	e := &AuthzEngine{store: store, audit: audit, cfg: cfg}

	// NoopAuditSink is the dominant test-time sink: short-circuit the
	// pool to avoid burning 64 goroutines per construction.
	if _, noop := audit.(NoopAuditSink); noop {
		return e
	}

	e.events = make(chan AuthzAuditEvent, cfg.AuditBufferSize)
	e.wg.Add(cfg.AuditWorkerCount)
	for i := 0; i < cfg.AuditWorkerCount; i++ {
		go e.emitWorker()
	}
	return e
}

// Store returns the underlying policy store handle.
func (e *AuthzEngine) Store() *PolicyStore { return e.store }

// Audit returns the configured sink.
func (e *AuthzEngine) Audit() AuthzAuditSink { return e.audit }

// AuthorizeOutcome is the result returned by [AuthzEngine.Authorize].
type AuthorizeOutcome struct {
	Decision    cedar.Decision
	PolicyIDs   []string
	Diagnostics []string
}

// IsAllow reports whether the decision was Allow.
func (o *AuthorizeOutcome) IsAllow() bool { return o.Decision == cedar.Allow }

// Authorize evaluates a Cedar request and queues an audit event for
// asynchronous emission. A slow sink can never stall this call: when
// the buffer is full the event is dropped and counted in
// authz_audit_emit_dropped_total{reason="buffer_full"}.
//
// Callers that need synchronous audit must call the sink directly.
func (e *AuthzEngine) Authorize(
	ctx context.Context,
	principal cedar.EntityUID,
	action cedar.EntityUID,
	resource cedar.EntityUID,
	context_ cedar.Record,
	entities cedar.EntityGetter,
) (*AuthorizeOutcome, error) {
	req := cedar.Request{
		Principal: principal,
		Action:    action,
		Resource:  resource,
		Context:   context_,
	}
	decision, diag := e.store.IsAuthorized(entities, req)

	policyIDs := make([]string, 0, len(diag.Reasons))
	for _, r := range diag.Reasons {
		policyIDs = append(policyIDs, string(r.PolicyID))
	}
	diagnostics := make([]string, 0, len(diag.Errors))
	for _, d := range diag.Errors {
		diagnostics = append(diagnostics, d.String())
	}

	decisionStr := "deny"
	if decision == cedar.Allow {
		decisionStr = "allow"
	}

	event := AuthzAuditEvent{
		Timestamp:   time.Now().UTC(),
		Principal:   principal.String(),
		Action:      action.String(),
		Resource:    resource.String(),
		Decision:    decisionStr,
		PolicyIDs:   append([]string(nil), policyIDs...),
		Diagnostics: append([]string(nil), diagnostics...),
	}
	e.submitAudit(ctx, event)

	return &AuthorizeOutcome{
		Decision:    decision,
		PolicyIDs:   policyIDs,
		Diagnostics: diagnostics,
	}, nil
}

// submitAudit enqueues an event for the worker pool. If the pool is
// disabled (NoopAuditSink fast path), the sink is invoked inline
// against a detached context — the noop is effectively free.
func (e *AuthzEngine) submitAudit(ctx context.Context, event AuthzAuditEvent) {
	if e.events == nil {
		// NoopAuditSink fast path — call inline so the sink contract
		// (every decision emits) is preserved without spawning workers.
		e.audit.Emit(detachContext(ctx), event)
		return
	}
	if e.shutdown.Load() {
		recordAuditDropped("shutdown")
		return
	}
	select {
	case e.events <- event:
		auditEmitQueueSizeGauge().Set(float64(len(e.events)))
	default:
		recordAuditDropped("buffer_full")
	}
}

// emitWorker drains e.events. Each event is emitted with a fresh
// context.WithTimeout derived from a detached background — the
// request's ctx never bounds audit emission (matches the Rust
// `tokio::spawn` semantic of detaching from the request span).
func (e *AuthzEngine) emitWorker() {
	defer e.wg.Done()
	for event := range e.events {
		auditEmitInflightGauge().Inc()
		auditEmitQueueSizeGauge().Set(float64(len(e.events)))

		emitCtx, cancel := context.WithTimeout(context.Background(), e.cfg.AuditEmitTimeout)
		start := time.Now()
		e.audit.Emit(emitCtx, event)
		elapsed := time.Since(start)
		outcome := "ok"
		if emitCtx.Err() != nil {
			outcome = "timeout"
			recordAuditTimeout()
		}
		cancel()
		recordAuditDuration(outcome, elapsed.Seconds())
		auditEmitInflightGauge().Dec()
	}
}

// Shutdown stops accepting new audit events and waits for inflight +
// queued events to drain, bounded by EngineConfig.AuditShutdownTimeout
// (or the caller's ctx, whichever expires first). Idempotent and safe
// for a NoopAuditSink engine — returns nil immediately when there is
// no worker pool.
//
// Returns context.DeadlineExceeded if the drain didn't complete in
// time; the queued events are abandoned (workers exit when the
// channel is closed regardless of the wait outcome).
func (e *AuthzEngine) Shutdown(ctx context.Context) error {
	var outErr error
	e.shutdownOnce.Do(func() {
		e.shutdown.Store(true)
		if e.events == nil {
			return
		}
		close(e.events)

		done := make(chan struct{})
		go func() {
			e.wg.Wait()
			close(done)
		}()

		timeout := e.cfg.AuditShutdownTimeout
		if timeout <= 0 {
			timeout = 10 * time.Second
		}
		timer := time.NewTimer(timeout)
		defer timer.Stop()

		select {
		case <-done:
		case <-timer.C:
			outErr = errors.New("authz-cedar: audit-emit drain timed out")
		case <-ctx.Done():
			outErr = ctx.Err()
		}
	})
	return outErr
}

// detachContext returns a new context that intentionally does NOT
// propagate cancellation from `parent`. The Rust impl uses
// `tokio::spawn` which doesn't propagate the request span; we mirror
// that by giving the audit goroutine a fresh background context so
// request cancellation doesn't cancel audit emission mid-write.
func detachContext(_ context.Context) context.Context {
	return context.Background()
}
