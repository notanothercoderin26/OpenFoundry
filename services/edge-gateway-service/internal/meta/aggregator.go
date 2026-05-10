// Package meta implements the gateway-side aggregator that exposes a
// single read-only view of every service's capability catalog.
//
// Why this lives in the gateway: the per-service `/_meta/capabilities`
// endpoint (libs/capabilities) is mounted on each service's root
// router and is NOT exposed externally — only the gateway can reach
// in-cluster URLs. The aggregator fans out to every configured
// upstream, caches the merged response for a short TTL, and returns
// it under `GET /api/v1/_meta/capabilities`.
//
// See docs/agent-automation/AGENT-CAPABILITIES-ROADMAP.md (M1.1).
package meta

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"reflect"
	"sort"
	"sync"
	"time"

	"github.com/openfoundry/openfoundry-go/libs/capabilities"
	"github.com/openfoundry/openfoundry-go/services/edge-gateway-service/internal/config"
)

// Aggregator caches the fan-out response with a fixed TTL.
//
// Cache key is the upstream meta path (`/_meta/capabilities`,
// `/_meta/health`, `/_meta/version`) so a single instance backs all
// three gateway-side meta endpoints. The aggregator never touches
// auth — capability discovery is unauthenticated by design (just
// like /healthz), and only metadata is returned.
type Aggregator struct {
	upstreams []upstream
	client    *http.Client
	ttl       time.Duration
	now       func() time.Time

	mu     sync.Mutex
	cached map[string]*Response // keyed by upstream meta path
	expiry map[string]time.Time
}

type upstream struct {
	name string
	url  string
}

// Response is the wire shape of `GET /api/v1/_meta/capabilities`.
type Response struct {
	GeneratedAt string         `json:"generated_at"`
	Services    []ServiceEntry `json:"services"`
}

// ServiceEntry is the per-service slice of any aggregated meta
// response. The `Snapshot` / `Capabilities` pair is populated by the
// capabilities fan-out; `Payload` is the raw JSON body returned by
// generic upstream meta endpoints (health, version, deps) so the
// gateway can stay schema-agnostic.
type ServiceEntry struct {
	Service      string                    `json:"service"`
	URL          string                    `json:"url"`
	Status       string                    `json:"status"`
	Error        string                    `json:"error,omitempty"`
	Snapshot     *capabilities.Snapshot    `json:"snapshot,omitempty"`
	Capabilities []capabilities.Capability `json:"capabilities,omitempty"`
	Payload      json.RawMessage           `json:"payload,omitempty"`
}

// New builds an aggregator from the gateway's UpstreamURLs config.
//
// Empty URLs and duplicates (several logical names sharing a single
// service URL — common in the merged-context refactors) are folded
// to one fan-out call. The koanf tag is used as the public name so
// the response stays in sync with the values.yaml deployments key off.
func New(u config.UpstreamURLs, ttl time.Duration) *Aggregator {
	return &Aggregator{
		upstreams: enumerate(u),
		client:    &http.Client{Timeout: 5 * time.Second},
		ttl:       ttl,
		now:       time.Now,
		cached:    map[string]*Response{},
		expiry:    map[string]time.Time{},
	}
}

// enumerate walks UpstreamURLs via reflection so adding a new field
// to the struct automatically widens the aggregator — no second
// registration list to forget. Sorted by name for deterministic
// output and dedup by URL (several aliases hit the same binary).
func enumerate(u config.UpstreamURLs) []upstream {
	v := reflect.ValueOf(u)
	t := v.Type()
	seen := map[string]string{} // url -> first name
	out := make([]upstream, 0, t.NumField())
	for i := 0; i < t.NumField(); i++ {
		url := v.Field(i).String()
		if url == "" {
			continue
		}
		name := t.Field(i).Tag.Get("koanf")
		if name == "" {
			name = t.Field(i).Name
		}
		if existing, dup := seen[url]; dup {
			// Pick the lexicographically smaller name so the same URL
			// always appears under a single, predictable label.
			if name < existing {
				for j := range out {
					if out[j].url == url {
						out[j].name = name
					}
				}
				seen[url] = name
			}
			continue
		}
		seen[url] = name
		out = append(out, upstream{name: name, url: url})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].name < out[j].name })
	return out
}

// Handler serves the aggregated catalog at `/_meta/capabilities`.
func (a *Aggregator) Handler() http.Handler {
	return a.handlerFor("/_meta/capabilities", true)
}

// HealthHandler serves the aggregated `/_meta/health` envelope.
func (a *Aggregator) HealthHandler() http.Handler {
	return a.handlerFor("/_meta/health", false)
}

// VersionHandler serves the aggregated `/_meta/version` payloads.
func (a *Aggregator) VersionHandler() http.Handler {
	return a.handlerFor("/_meta/version", false)
}

// handlerFor returns an http.Handler that fans out to `path` on
// every upstream and returns a [Response]. When `decodeSnapshot` is
// true the body is parsed into [capabilities.Snapshot]; otherwise it
// is forwarded verbatim as `payload`.
func (a *Aggregator) handlerFor(path string, decodeSnapshot bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := a.snapshot(r.Context(), path, decodeSnapshot)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=30")
		_ = json.NewEncoder(w).Encode(resp)
	})
}

func (a *Aggregator) snapshot(ctx context.Context, path string, decodeSnapshot bool) *Response {
	a.mu.Lock()
	if cached, ok := a.cached[path]; ok && a.now().Before(a.expiry[path]) {
		a.mu.Unlock()
		return cached
	}
	a.mu.Unlock()

	resp := a.fanOut(ctx, path, decodeSnapshot)

	a.mu.Lock()
	a.cached[path] = resp
	a.expiry[path] = a.now().Add(a.ttl)
	a.mu.Unlock()
	return resp
}

func (a *Aggregator) fanOut(ctx context.Context, path string, decodeSnapshot bool) *Response {
	results := make([]ServiceEntry, len(a.upstreams))
	var wg sync.WaitGroup
	for i, up := range a.upstreams {
		wg.Add(1)
		go func(i int, up upstream) {
			defer wg.Done()
			results[i] = a.fetch(ctx, up, path, decodeSnapshot)
		}(i, up)
	}
	wg.Wait()
	return &Response{
		GeneratedAt: a.now().UTC().Format(time.RFC3339),
		Services:    results,
	}
}

func (a *Aggregator) fetch(ctx context.Context, up upstream, path string, decodeSnapshot bool) ServiceEntry {
	entry := ServiceEntry{Service: up.name, URL: up.url, Status: "error"}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, up.url+path, nil)
	if err != nil {
		entry.Error = err.Error()
		return entry
	}
	resp, err := a.client.Do(req)
	if err != nil {
		entry.Error = err.Error()
		return entry
	}
	defer func() { _ = resp.Body.Close() }()
	// `/_meta/health` returns 503 on degraded; capture the body anyway.
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		entry.Error = err.Error()
		return entry
	}
	if resp.StatusCode >= 500 && resp.StatusCode != http.StatusServiceUnavailable {
		entry.Error = "upstream status " + resp.Status
		return entry
	}
	if resp.StatusCode == http.StatusNotFound {
		entry.Error = "upstream status " + resp.Status
		return entry
	}
	if decodeSnapshot {
		var snap capabilities.Snapshot
		if err := json.Unmarshal(body, &snap); err != nil {
			entry.Error = err.Error()
			return entry
		}
		entry.Status = "ok"
		entry.Snapshot = &snap
		entry.Capabilities = snap.Capabilities
		if snap.Service != "" {
			entry.Service = snap.Service
		}
		return entry
	}
	entry.Payload = json.RawMessage(body)
	entry.Status = "ok"
	if resp.StatusCode == http.StatusServiceUnavailable {
		entry.Status = "degraded"
	}
	return entry
}

// Errs sentinel — kept for callers that want to distinguish empty
// snapshot from a true error condition in tests.
var ErrNoUpstreams = errors.New("meta: no upstreams configured")
