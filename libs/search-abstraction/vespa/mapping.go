package vespa

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"sort"
	"sync"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

// configFields are the per-Backend state needed for MappingRegistrar.
// They live on the same struct as the SearchBackend fields because the
// schema deploy uses the same auth header.
type configFields struct {
	configEndpoint string
	tenantName     string
	applicationName string

	mu      sync.Mutex
	schemas map[string]searchabstraction.TypeMapping
}

func (b *Backend) ensureSchemaState() *configFields {
	if b.cfg == nil {
		b.cfg = &configFields{
			tenantName:      "default",
			applicationName: "default",
			schemas:         map[string]searchabstraction.TypeMapping{},
		}
	}
	if b.cfg.schemas == nil {
		b.cfg.schemas = map[string]searchabstraction.TypeMapping{}
	}
	if b.cfg.tenantName == "" {
		b.cfg.tenantName = "default"
	}
	if b.cfg.applicationName == "" {
		b.cfg.applicationName = "default"
	}
	return b.cfg
}

// WithConfigEndpoint sets the Vespa Config Server endpoint used to
// deploy application packages. Required for MappingRegistrar; the
// SearchBackend surface still works without it.
func WithConfigEndpoint(url string) Option {
	return func(b *Backend) {
		s := b.ensureSchemaState()
		s.configEndpoint = trimRight(url, "/")
	}
}

// WithVespaTenant sets the Vespa tenant name (defaults to "default").
// Only matters when WithConfigEndpoint is also set.
func WithVespaTenant(name string) Option {
	return func(b *Backend) {
		if name == "" {
			return
		}
		s := b.ensureSchemaState()
		s.tenantName = name
	}
}

// WithVespaApplication sets the Vespa application name (defaults to
// "default"). Only matters when WithConfigEndpoint is also set.
func WithVespaApplication(name string) Option {
	return func(b *Backend) {
		if name == "" {
			return
		}
		s := b.ensureSchemaState()
		s.applicationName = name
	}
}

// SeedSchemas pre-populates the in-memory schema cache without
// triggering a deploy. The indexer calls this at startup with the
// mappings it pulls from ontology-definition-service so the first
// RegisterTypeMapping after restart includes every already-deployed
// schema in the rebuilt application package.
//
// See PoC/blockers/B03-ontology-indexer.md §G5 for the wipe-on-restart
// rationale.
func (b *Backend) SeedSchemas(mappings []searchabstraction.TypeMapping) {
	s := b.ensureSchemaState()
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, m := range mappings {
		if m.TypeID == "" {
			continue
		}
		s.schemas[string(m.TypeID)] = m
	}
}

// MappingRegistrar surface — Vespa deploys the whole application
// package on every register/drop, with the cumulative schema set.

// RegisterTypeMapping upserts the supplied mapping into the in-memory
// cache and POSTs the rebuilt application package to the Config Server.
// When WithConfigEndpoint was not configured the call is a documented
// no-op (warn log via the caller; the surface still implements
// MappingRegistrar so the indexer's type-assertion succeeds).
func (b *Backend) RegisterTypeMapping(ctx context.Context, m searchabstraction.TypeMapping) error {
	if m.TypeID == "" {
		return repos.Invalid("vespa MappingRegistrar: TypeID is empty")
	}
	s := b.ensureSchemaState()
	if s.configEndpoint == "" {
		// No config server wired — keep the in-memory cache updated so
		// a later seed-or-flip-on is honoured, and surface
		// ErrMappingDeployUnconfigured so the schemasync handler can
		// report OutcomeSchemaSkippedNoOp honestly.
		s.mu.Lock()
		s.schemas[string(m.TypeID)] = m
		s.mu.Unlock()
		return searchabstraction.ErrMappingDeployUnconfigured
	}
	s.mu.Lock()
	s.schemas[string(m.TypeID)] = m
	snapshot := schemaSnapshot(s)
	s.mu.Unlock()
	return b.deploy(ctx, s, snapshot)
}

// DropTypeMapping removes the mapping from the cache and redeploys.
// A drop with an unknown TypeID is not an error — the redeploy still
// runs so the Vespa cluster ends up in the desired state.
func (b *Backend) DropTypeMapping(ctx context.Context, _ repos.TenantId, typeID repos.TypeId) error {
	if typeID == "" {
		return repos.Invalid("vespa MappingRegistrar: TypeID is empty")
	}
	s := b.ensureSchemaState()
	if s.configEndpoint == "" {
		s.mu.Lock()
		delete(s.schemas, string(typeID))
		s.mu.Unlock()
		return searchabstraction.ErrMappingDeployUnconfigured
	}
	s.mu.Lock()
	delete(s.schemas, string(typeID))
	snapshot := schemaSnapshot(s)
	s.mu.Unlock()
	return b.deploy(ctx, s, snapshot)
}

// SchemaSnapshot returns the current cache. Useful for ops endpoints
// + integration assertions.
func (b *Backend) SchemaSnapshot() []searchabstraction.TypeMapping {
	s := b.ensureSchemaState()
	s.mu.Lock()
	defer s.mu.Unlock()
	return schemaSnapshot(s)
}

// schemaSnapshot is called under the mutex. Returns a slice copy
// sorted by TypeID so deploys are deterministic.
func schemaSnapshot(s *configFields) []searchabstraction.TypeMapping {
	keys := make([]string, 0, len(s.schemas))
	for k := range s.schemas {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]searchabstraction.TypeMapping, 0, len(keys))
	for _, k := range keys {
		out = append(out, s.schemas[k])
	}
	return out
}

// deploy zips the cumulative schema set and POSTs to the Config
// Server's prepareandactivate endpoint.
//
// Vespa convention: the POST body is the raw zipped application
// package with Content-Type: application/zip. The response is a JSON
// document with the new session id and (on failure) a list of error
// messages — we only assert HTTP status here.
func (b *Backend) deploy(ctx context.Context, s *configFields, mappings []searchabstraction.TypeMapping) error {
	pkg, err := BuildApplicationPackage(mappings)
	if err != nil {
		return repos.Backend("vespa deploy build: " + err.Error())
	}
	url := fmt.Sprintf("%s/application/v2/tenant/%s/prepareandactivate", s.configEndpoint, s.tenantName)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(pkg))
	if err != nil {
		return repos.Backend("vespa deploy req: " + err.Error())
	}
	req.Header.Set("Content-Type", "application/zip")
	b.applyAuth(req)
	resp, err := b.http.Do(req)
	if err != nil {
		return repos.Backend("vespa deploy send: " + err.Error())
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return repos.Backend(fmt.Sprintf("vespa deploy HTTP %d: %s", resp.StatusCode, bytes.TrimSpace(body)))
	}
	return nil
}

// Compile-time check that the Backend satisfies the MappingRegistrar
// surface. The schemasync handler relies on this assertion succeeding
// against `*vespa.Backend` even when WithConfigEndpoint is not used.
var _ searchabstraction.MappingRegistrar = (*Backend)(nil)

// trimRight is a tiny local helper to avoid pulling in strings just
// for this. The Vespa backend's other files already do the same
// (see vespa.go::WithClient).
func trimRight(s, cutset string) string {
	for len(s) > 0 && bytesContains([]byte(cutset), s[len(s)-1]) {
		s = s[:len(s)-1]
	}
	return s
}

func bytesContains(b []byte, c byte) bool {
	for _, x := range b {
		if x == c {
			return true
		}
	}
	return false
}
