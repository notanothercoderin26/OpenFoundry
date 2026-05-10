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
// Cache key is global (the snapshot is identical for every caller) so
// a single in-process cache suffices. The aggregator never touches
// auth — capability discovery is unauthenticated by design (just
// like /healthz), and only metadata is returned.
type Aggregator struct {
	upstreams []upstream
	client    *http.Client
	ttl       time.Duration
	now       func() time.Time

	mu     sync.Mutex
	cached *Response
	expiry time.Time
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

// ServiceEntry is the per-service slice of the aggregated catalog.
//
// Status is `ok` when the upstream replied 200 with a parseable
// snapshot, `error` otherwise (Error is then populated). Capabilities
// is nil on error.
type ServiceEntry struct {
	Service      string                    `json:"service"`
	URL          string                    `json:"url"`
	Status       string                    `json:"status"`
	Error        string                    `json:"error,omitempty"`
	Snapshot     *capabilities.Snapshot    `json:"snapshot,omitempty"`
	Capabilities []capabilities.Capability `json:"capabilities,omitempty"`
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

// Handler serves the aggregated catalog.
func (a *Aggregator) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := a.snapshot(r.Context())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=30")
		_ = json.NewEncoder(w).Encode(resp)
	})
}

func (a *Aggregator) snapshot(ctx context.Context) *Response {
	a.mu.Lock()
	if a.cached != nil && a.now().Before(a.expiry) {
		cached := a.cached
		a.mu.Unlock()
		return cached
	}
	a.mu.Unlock()

	resp := a.fanOut(ctx)

	a.mu.Lock()
	a.cached = resp
	a.expiry = a.now().Add(a.ttl)
	a.mu.Unlock()
	return resp
}

func (a *Aggregator) fanOut(ctx context.Context) *Response {
	results := make([]ServiceEntry, len(a.upstreams))
	var wg sync.WaitGroup
	for i, up := range a.upstreams {
		wg.Add(1)
		go func(i int, up upstream) {
			defer wg.Done()
			results[i] = a.fetch(ctx, up)
		}(i, up)
	}
	wg.Wait()
	return &Response{
		GeneratedAt: a.now().UTC().Format(time.RFC3339),
		Services:    results,
	}
}

func (a *Aggregator) fetch(ctx context.Context, up upstream) ServiceEntry {
	entry := ServiceEntry{Service: up.name, URL: up.url, Status: "error"}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, up.url+"/_meta/capabilities", nil)
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
	if resp.StatusCode != http.StatusOK {
		entry.Error = "upstream status " + resp.Status
		return entry
	}
	var snap capabilities.Snapshot
	if err := json.NewDecoder(resp.Body).Decode(&snap); err != nil {
		entry.Error = err.Error()
		return entry
	}
	entry.Status = "ok"
	entry.Snapshot = &snap
	entry.Capabilities = snap.Capabilities
	// Prefer the upstream's self-reported name so the response stays
	// authoritative even if the koanf field name drifts.
	if snap.Service != "" {
		entry.Service = snap.Service
	}
	return entry
}

// Errs sentinel — kept for callers that want to distinguish empty
// snapshot from a true error condition in tests.
var ErrNoUpstreams = errors.New("meta: no upstreams configured")
