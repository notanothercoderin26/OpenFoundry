package cedarauthz

import (
	"sync"

	"github.com/prometheus/client_golang/prometheus"
)

// Singleton collectors for the audit-emit worker pool. Pattern mirrors
// libs/auth-middleware/metrics.go and libs/ontology-kernel/metrics —
// counters live as package-level vars initialised exactly once, then
// re-registered against any number of service registries via the
// AlreadyRegisteredError-tolerant Register call.
var (
	metricsOnce sync.Once

	auditEmitInflight   prometheus.Gauge
	auditEmitQueueSize  prometheus.Gauge
	auditEmitDropped    *prometheus.CounterVec
	auditEmitDuration   *prometheus.HistogramVec
	auditEmitTimeouts   prometheus.Counter
)

func initMetrics() {
	metricsOnce.Do(func() {
		auditEmitInflight = prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "authz_audit_emit_inflight",
			Help: "Authz audit events currently being emitted by a worker.",
		})
		auditEmitQueueSize = prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "authz_audit_emit_queue_size",
			Help: "Authz audit events buffered awaiting a worker.",
		})
		auditEmitDropped = prometheus.NewCounterVec(
			prometheus.CounterOpts{
				Name: "authz_audit_emit_dropped_total",
				Help: "Authz audit events dropped because the emit buffer was full or the engine was shut down.",
			},
			[]string{"reason"},
		)
		auditEmitDuration = prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "authz_audit_emit_duration_seconds",
				Help:    "Wall-clock duration of an authz audit emit, partitioned by outcome.",
				Buckets: prometheus.ExponentialBuckets(0.001, 2.0, 12),
			},
			[]string{"outcome"},
		)
		auditEmitTimeouts = prometheus.NewCounter(prometheus.CounterOpts{
			Name: "authz_audit_emit_timeouts_total",
			Help: "Authz audit emits whose context exceeded AuditEmitTimeout.",
		})
	})
}

// RegisterAuditMetrics registers the audit-emit collectors against the
// supplied registerer. Re-registration is tolerated — duplicate
// registrations return prometheus.AlreadyRegisteredError, which is
// silently ignored so multi-binary tests stay safe (same convention as
// libs/auth-middleware.RegisterMetrics).
//
// Safe to call with a nil registerer (no-op): the singletons stay
// usable so record helpers don't crash; the values just aren't exported
// on any /metrics endpoint.
func RegisterAuditMetrics(registry prometheus.Registerer) {
	initMetrics()
	if registry == nil {
		return
	}
	for _, c := range []prometheus.Collector{
		auditEmitInflight,
		auditEmitQueueSize,
		auditEmitDropped,
		auditEmitDuration,
		auditEmitTimeouts,
	} {
		_ = registry.Register(c)
	}
}

// auditEmitInflightGauge / auditEmitQueueSizeGauge / auditEmitDroppedCounter /
// auditEmitDurationHistogram / auditEmitTimeoutCounter expose the underlying
// collectors for tests. Production code uses the recordX helpers below
// so the increment surface stays narrow.

func auditEmitInflightGauge() prometheus.Gauge {
	initMetrics()
	return auditEmitInflight
}

func auditEmitQueueSizeGauge() prometheus.Gauge {
	initMetrics()
	return auditEmitQueueSize
}

func auditEmitDroppedCounter() *prometheus.CounterVec {
	initMetrics()
	return auditEmitDropped
}

func auditEmitDurationHistogram() *prometheus.HistogramVec {
	initMetrics()
	return auditEmitDuration
}

func auditEmitTimeoutCounter() prometheus.Counter {
	initMetrics()
	return auditEmitTimeouts
}

func recordAuditDropped(reason string) {
	initMetrics()
	auditEmitDropped.WithLabelValues(reason).Inc()
}

func recordAuditDuration(outcome string, seconds float64) {
	initMetrics()
	auditEmitDuration.WithLabelValues(outcome).Observe(seconds)
}

func recordAuditTimeout() {
	initMetrics()
	auditEmitTimeouts.Inc()
}
