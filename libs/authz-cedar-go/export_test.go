package cedarauthz

import "github.com/prometheus/client_golang/prometheus"

// AuditEmitDroppedForTest exposes the dropped-events counter for the
// backpressure test. _test.go-only so production code can't observe
// the collector handle directly (use RegisterAuditMetrics + /metrics).
func AuditEmitDroppedForTest() *prometheus.CounterVec { return auditEmitDroppedCounter() }
