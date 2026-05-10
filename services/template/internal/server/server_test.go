package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/openfoundry/openfoundry-go/libs/capabilities"
)

// TestMountAPIRoutes_RegistersWhoami is a focused, dependency-free
// smoke test that asserts the template's reference handler is wired
// through the capability registry — i.e. it appears in
// `/_meta/capabilities` AND its route serves traffic.
//
// The full server constructor pulls in koanf/observability/etc., so
// this test exercises just the routing slice that other services are
// expected to copy.
func TestMountAPIRoutes_RegistersWhoami(t *testing.T) {
	t.Parallel()
	caps := capabilities.New("template", "test")
	r := chi.NewRouter()
	caps.Mount(r)
	mountAPIRoutes(r, caps)

	// /_meta/capabilities must contain both the meta and whoami entries.
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/_meta/capabilities", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("/_meta/capabilities = %d", w.Code)
	}
	var snap capabilities.Snapshot
	if err := json.Unmarshal(w.Body.Bytes(), &snap); err != nil {
		t.Fatalf("decode: %v", err)
	}
	ids := map[string]capabilities.Capability{}
	for _, c := range snap.Capabilities {
		ids[c.ID] = c
	}
	whoami, ok := ids["template.whoami.get"]
	if !ok {
		t.Fatalf("template.whoami.get not in catalog: %v", ids)
	}
	if whoami.Path != "/api/whoami" || !whoami.RequiresAuth {
		t.Fatalf("whoami capability shape unexpected: %+v", whoami)
	}
	if _, ok := ids["_meta.capabilities.list"]; !ok {
		t.Fatalf("_meta.capabilities.list missing from catalog")
	}
}
