package handlers

import (
	"github.com/prometheus/client_golang/prometheus"

	"github.com/openfoundry/openfoundry-go/libs/observability"
)

// InvokeMetrics groups the Prometheus collectors emitted on every
// invocation. Register once at service startup via NewInvokeMetrics
// and pass the returned struct to the invoke handler.
type InvokeMetrics struct {
	Tokens *prometheus.CounterVec
	Cost   *prometheus.CounterVec
}

// NewInvokeMetrics registers the two LLM counters on m and returns the
// handle. The metric names are stable — dashboards and alerts key off
// them across services.
//
//	llm_tokens_total{model,kind="input|output"}
//	llm_cost_usd_total{model}
func NewInvokeMetrics(m *observability.Metrics) *InvokeMetrics {
	tokens := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llm_tokens_total",
		Help: "LLM tokens consumed per model and direction.",
	}, []string{"model", "kind"})
	cost := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llm_cost_usd_total",
		Help: "Estimated USD cost of LLM invocations per model.",
	}, []string{"model"})
	if m != nil {
		m.Register(tokens)
		m.Register(cost)
	}
	return &InvokeMetrics{Tokens: tokens, Cost: cost}
}
