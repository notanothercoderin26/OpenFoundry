package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/openfoundry/openfoundry-go/libs/capabilities"
)

// TestMountAPIRoutes_StubReturns501 asserts each gateway-facing prefix
// returns the documented 501 envelope so the frontend sees a typed
// error instead of a 502 from a missing upstream. Covers all three
// `u.NetworkBoundary` branches in the gateway router table.
func TestMountAPIRoutes_StubReturns501(t *testing.T) {
	t.Parallel()
	caps := capabilities.New("network-boundary-service", "test")
	r := chi.NewRouter()
	caps.Mount(r)
	mountAPIRoutes(r, caps)

	cases := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/v1/network-boundaries"},
		{http.MethodGet, "/api/v1/network-boundaries/abc"},
		{http.MethodPost, "/api/v1/network-boundaries"},
		{http.MethodGet, "/api/v1/network-boundary"},
		{http.MethodPut, "/api/v1/network-boundary/xyz"},
		{http.MethodGet, "/api/v1/data-connection/egress-policies"},
		{http.MethodDelete, "/api/v1/data-connection/egress-policies/p1"},
	}
	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
			if w.Code != http.StatusNotImplemented {
				t.Fatalf("%s %s = %d, want 501", tc.method, tc.path, w.Code)
			}
			var body map[string]string
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatalf("decode: %v (body=%q)", err, w.Body.String())
			}
			if body["code"] != "not_implemented" || body["service"] != "network-boundary-service" || body["milestone"] == "" {
				t.Fatalf("unexpected envelope: %+v", body)
			}
		})
	}
}
