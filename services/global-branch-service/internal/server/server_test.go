package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/openfoundry/openfoundry-go/libs/capabilities"
)

// TestMountAPIRoutes_BranchesStubReturns501 asserts that the gateway-facing
// `/branches` route is registered AND answers 501 with the documented
// stub body, so frontend callers see a stable error code instead of the
// previous 502 from a missing upstream.
func TestMountAPIRoutes_BranchesStubReturns501(t *testing.T) {
	t.Parallel()
	caps := capabilities.New("global-branch-service", "test")
	r := chi.NewRouter()
	caps.Mount(r)
	mountAPIRoutes(r, caps)

	for _, method := range []string{http.MethodGet, http.MethodPost} {
		req := httptest.NewRequest(method, "/api/v1/code-repos/repositories/repo-123/branches", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusNotImplemented {
			t.Fatalf("%s /branches status = %d, want 501", method, w.Code)
		}
		var body map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if body["code"] != "not_implemented" || body["service"] != "global-branch-service" || body["milestone"] == "" {
			t.Fatalf("unexpected body: %+v", body)
		}
	}

	// Nested branch path (future shape) also 501s instead of 404.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/code-repos/repositories/repo-123/branches/feature-x", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotImplemented {
		t.Fatalf("nested branch status = %d, want 501", w.Code)
	}

	// Capability catalog should list the stubbed routes.
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/_meta/capabilities", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("/_meta/capabilities = %d", w.Code)
	}
	var snap capabilities.Snapshot
	if err := json.Unmarshal(w.Body.Bytes(), &snap); err != nil {
		t.Fatalf("decode catalog: %v", err)
	}
	want := map[string]bool{
		"global-branch.repository-branches.list":   false,
		"global-branch.repository-branches.create": false,
	}
	for _, c := range snap.Capabilities {
		if _, ok := want[c.ID]; ok {
			want[c.ID] = true
		}
	}
	for id, seen := range want {
		if !seen {
			t.Fatalf("capability %s not registered in catalog", id)
		}
	}
}
