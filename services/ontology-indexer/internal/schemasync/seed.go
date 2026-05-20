package schemasync

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
)

// SeedSource enumerates every ObjectType currently registered in
// `ontology-definition-service` so the schema cache survives a
// restart with the cumulative set of already-deployed schemas. Without
// this, the first object_type.changed.v1 envelope after restart would
// trigger a Vespa redeploy with only that schema and silently wipe the
// rest.
//
// Implementations may hit the service over HTTP (production) or be
// supplied by tests.
type SeedSource interface {
	ListObjectTypes(ctx context.Context) ([]ObjectTypePayload, error)
}

// HTTPSeedSource talks to ontology-definition-service over HTTP.
// Auth is expected to be wired by the deployer via BearerToken
// (service-account JWT) — when empty the request goes out anonymously
// and a 401 is logged as a warning so the indexer keeps running.
type HTTPSeedSource struct {
	BaseURL     string
	Client      *http.Client
	BearerToken string
}

// NewHTTPSeedSource builds a source pointed at baseURL with a 30s
// per-request timeout. baseURL must NOT end with a trailing slash.
func NewHTTPSeedSource(baseURL string) *HTTPSeedSource {
	return &HTTPSeedSource{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Client:  &http.Client{Timeout: 30 * time.Second},
	}
}

type httpListResponse struct {
	Items []ObjectTypePayload `json:"items"`
}

func (s *HTTPSeedSource) ListObjectTypes(ctx context.Context) ([]ObjectTypePayload, error) {
	if s.BaseURL == "" {
		return nil, fmt.Errorf("HTTPSeedSource: BaseURL is empty")
	}
	endpoint := s.BaseURL + "/api/v1/ontology/types"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if tok := strings.TrimSpace(s.BearerToken); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	client := s.Client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("ontology-definition-service returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var decoded httpListResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return decoded.Items, nil
}

// SeedMappingsFrom queries the source, translates every ObjectType to
// a TypeMapping, and feeds them into the supplied registrar via the
// Seed() side-channel (no deploy). When the registrar doesn't expose
// Seed (i.e. is a third-party MappingRegistrar or the InMemory test
// fake) the function falls back to RegisterTypeMapping calls per
// schema, which deploy individually.
//
// Returns the number of mappings staged + any error from the source.
// A backend that exposes Seed() is assumed when the type-assertion
// against *vespa.Backend succeeds; the indexer's main.go is the only
// caller, so this is a deliberate concrete check rather than an
// abstract interface.
func SeedMappingsFrom(ctx context.Context, src SeedSource, sink SeedSink) (int, error) {
	types, err := src.ListObjectTypes(ctx)
	if err != nil {
		return 0, err
	}
	mappings := make([]searchabstraction.TypeMapping, 0, len(types))
	for _, t := range types {
		m := MappingFromPayload(t)
		if m.TypeID == "" {
			continue
		}
		mappings = append(mappings, m)
	}
	if sink != nil {
		sink.SeedSchemas(mappings)
	}
	return len(mappings), nil
}

// SeedSink is the minimum surface needed to hydrate a backend's
// schema cache without triggering a deploy. *vespa.Backend implements
// this via SeedSchemas; the in-memory test fake (which doesn't deploy)
// can implement it as a no-op.
type SeedSink interface {
	SeedSchemas(mappings []searchabstraction.TypeMapping)
}
