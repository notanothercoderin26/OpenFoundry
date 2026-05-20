// Package providers polls the upstream LLM endpoints periodically so
// the Model Catalog UI can render a status badge ("Azure online",
// "Ollama unreachable", ...) and Chatbot Studio can fall back
// automatically when the primary provider is down.
//
// Closes B04 acceptance #6: "If Azure OpenAI network connectivity
// fails during a demo, the catalog fallback to Ollama is automatic
// and visible in the UI (status badge)."
//
// The prober is independent of the LLM invocation path — it only
// emits a /api/v1/llm/providers/health snapshot. Routing decisions
// (which model is actually used for a request) belong to
// agent-runtime-service; this package gives that service the
// signal it needs.
package providers

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/models"
)

// Status enumerates the lifecycle states a provider can be in. The
// values are wire-stable; the UI keys CSS classes off them.
type Status string

const (
	StatusUnknown  Status = "unknown"
	StatusOK       Status = "ok"
	StatusDegraded Status = "degraded"
	StatusDown     Status = "down"
)

// ProbeTarget describes one endpoint to probe.
type ProbeTarget struct {
	// Provider is the canonical token the catalog stores
	// (ANTHROPIC, OPENAI, AZURE, OLLAMA, BEDROCK).
	Provider models.Provider
	// BaseURL is the upstream's base URL. The prober GETs `URL`
	// (defaults to "{BaseURL}{ProbePath}") with a short timeout.
	BaseURL string
	// ProbePath is the suffix appended to BaseURL. Defaults differ
	// per provider so a generic GET succeeds:
	//   - OLLAMA  → /api/tags  (the standard Ollama liveness probe)
	//   - OPENAI  → /v1/models (returns the model list)
	//   - AZURE   → /openai/models?api-version=2024-08-01-preview
	//   - others  → /  (HEAD/GET of root)
	ProbePath string
	// Header is the optional auth header (e.g., "Bearer …" or
	// "api-key: …"). Empty for providers without auth (Ollama).
	Header string
	// HeaderName is the name of the auth header; defaults to
	// "Authorization".
	HeaderName string
}

// ProviderState is one snapshot row.
type ProviderState struct {
	Provider    models.Provider `json:"provider"`
	Status      Status          `json:"status"`
	LastCheckAt time.Time       `json:"last_check_at"`
	LatencyMS   int64           `json:"latency_ms"`
	HTTPStatus  int             `json:"http_status,omitempty"`
	Error       string          `json:"error,omitempty"`
}

// Snapshot is the JSON shape served by /api/v1/llm/providers/health.
type Snapshot struct {
	Providers []ProviderState `json:"providers"`
	CheckedAt time.Time       `json:"checked_at"`
}

// Prober runs a periodic background check against each configured
// upstream. Thread-safe: snapshots may be read while a probe is
// in flight.
type Prober struct {
	Targets  []ProbeTarget
	Client   *http.Client
	Interval time.Duration
	// DegradeAfter is the latency above which a successful probe is
	// reported as `degraded`. Defaults to 2 s.
	DegradeAfter time.Duration

	mu    sync.RWMutex
	state map[models.Provider]ProviderState
	now   func() time.Time
}

// NewProber wires defaults. Interval defaults to 30s; the HTTP client
// gets a 5s timeout per probe so a hung upstream cannot starve the
// loop.
func NewProber(targets []ProbeTarget) *Prober {
	return &Prober{
		Targets:      targets,
		Client:       &http.Client{Timeout: 5 * time.Second},
		Interval:     30 * time.Second,
		DegradeAfter: 2 * time.Second,
		state:        map[models.Provider]ProviderState{},
		now:          time.Now,
	}
}

// Run blocks until ctx is cancelled. Calls ProbeOnce immediately and
// then every Interval.
func (p *Prober) Run(ctx context.Context) {
	p.ProbeOnce(ctx)
	t := time.NewTicker(p.Interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			p.ProbeOnce(ctx)
		}
	}
}

// ProbeOnce probes every target in parallel and refreshes the
// snapshot. Safe to call manually from tests or via a `/probe-now`
// admin handler.
func (p *Prober) ProbeOnce(ctx context.Context) {
	if len(p.Targets) == 0 {
		return
	}
	results := make(chan ProviderState, len(p.Targets))
	for _, t := range p.Targets {
		t := t
		go func() {
			results <- p.probeOne(ctx, t)
		}()
	}
	collected := make([]ProviderState, 0, len(p.Targets))
	for i := 0; i < len(p.Targets); i++ {
		collected = append(collected, <-results)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, s := range collected {
		p.state[s.Provider] = s
	}
}

func (p *Prober) probeOne(ctx context.Context, t ProbeTarget) ProviderState {
	state := ProviderState{Provider: t.Provider, Status: StatusDown, LastCheckAt: p.now().UTC()}
	if t.BaseURL == "" {
		state.Status = StatusUnknown
		state.Error = "base URL not configured"
		return state
	}
	url := t.BaseURL + defaultProbePath(t)
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		state.Error = err.Error()
		return state
	}
	if t.Header != "" {
		name := t.HeaderName
		if name == "" {
			name = "Authorization"
		}
		req.Header.Set(name, t.Header)
	}
	start := p.now()
	resp, err := p.Client.Do(req)
	state.LatencyMS = p.now().Sub(start).Milliseconds()
	if err != nil {
		state.Error = err.Error()
		return state
	}
	defer resp.Body.Close()
	state.HTTPStatus = resp.StatusCode
	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		state.Status = StatusOK
		if p.DegradeAfter > 0 && time.Duration(state.LatencyMS)*time.Millisecond > p.DegradeAfter {
			state.Status = StatusDegraded
		}
	case resp.StatusCode == http.StatusUnauthorized, resp.StatusCode == http.StatusForbidden:
		// Auth failed but the endpoint is reachable — useful signal
		// for ops ("creds expired") so we surface it as degraded
		// rather than down.
		state.Status = StatusDegraded
		state.Error = fmt.Sprintf("auth failed (HTTP %d)", resp.StatusCode)
	default:
		state.Error = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return state
}

func defaultProbePath(t ProbeTarget) string {
	if t.ProbePath != "" {
		return t.ProbePath
	}
	switch t.Provider {
	case models.ProviderOllama:
		return "/api/tags"
	case models.ProviderOpenAI:
		return "/v1/models"
	case models.ProviderAzure:
		return "/openai/models?api-version=2024-08-01-preview"
	case models.ProviderAnthropic:
		return "/v1/messages"
	case models.ProviderBedrock:
		return "/"
	}
	return "/"
}

// CurrentSnapshot returns the latest probe results. Safe to call from
// HTTP handlers.
func (p *Prober) CurrentSnapshot() Snapshot {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := Snapshot{Providers: make([]ProviderState, 0, len(p.state)), CheckedAt: p.now().UTC()}
	for _, s := range p.state {
		out.Providers = append(out.Providers, s)
	}
	sort.Slice(out.Providers, func(i, j int) bool {
		return string(out.Providers[i].Provider) < string(out.Providers[j].Provider)
	})
	return out
}
