//go:build integration

// The integration tag is overloaded in this repo to mean "uses
// testcontainers / Docker" most of the time, but the acceptance
// criterion for the ontology object store explicitly asks for
// `go test -tags=integration ./services/object-database-service/...`
// to be green. The HTTP-side tests below are Docker-free; they pin
// the same scenarios validated by the fast unit tests but at higher
// scale (5k rows + filter pushdown) so the integration target still
// exercises the ontology runtime.
package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/openfoundry/openfoundry-go/services/object-database-service/internal/handlers"
)

func TestIntegrationListObjectsFilterAtFiveThousand(t *testing.T) {
	h := newTestHandlers(t)
	const total = 5000
	for i := 0; i < total; i++ {
		seedObject(t, h, "Customer", fmt.Sprintf("cust-%05d", i), map[string]any{
			"country": pickCountry(i),
			"tier":    pickTier(i),
		})
	}
	mux := mountOntologyRoutes(h)
	body := strings.NewReader(`{"filters":[{"property_name":"country","operator":"equals","value":"ES"},{"property_name":"tier","operator":"equals","value":"gold"}],"per_page":100}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/ontology/types/Customer/objects/query", body)
	rr := httptest.NewRecorder()

	start := time.Now()
	mux.ServeHTTP(rr, req)
	elapsed := time.Since(start)

	if rr.Code != http.StatusOK {
		t.Fatalf("query: got %d, body=%s", rr.Code, rr.Body.String())
	}
	if elapsed > 1500*time.Millisecond {
		t.Fatalf("5k filter took %s, want <1500ms (in-memory + JSON decode)", elapsed)
	}
	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got, _ := resp["total"].(float64); int(got) == 0 {
		t.Fatalf("expected non-zero total, got %v", resp["total"])
	}
}

func TestIntegrationTraverseLinksFanout(t *testing.T) {
	h := newTestHandlers(t)
	seedObject(t, h, "Customer", "root", map[string]any{"name": "Root"})
	const fanout = 50
	for i := 0; i < fanout; i++ {
		id := fmt.Sprintf("leaf-%03d", i)
		seedObject(t, h, "Customer", id, map[string]any{"name": id})
		seedLink(t, h, "knows", "root", id)
	}
	mux := mountOntologyRoutes(h)
	body := strings.NewReader(`{"primary_key":"root","link_type_api_name":"knows","direction":"outgoing","depth":1,"limit":1000}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/ontology/types/Customer/links/traverse", body)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("traverse: got %d", rr.Code)
	}
	var resp handlers.TraverseLinksResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Edges) != fanout {
		t.Fatalf("expected %d edges, got %d", fanout, len(resp.Edges))
	}
	if len(resp.Objects) != fanout {
		t.Fatalf("expected %d hydrated neighbours, got %d", fanout, len(resp.Objects))
	}
}
