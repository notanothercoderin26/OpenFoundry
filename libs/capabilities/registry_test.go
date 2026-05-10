package capabilities

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func TestCapability_Validate(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		cap     Capability
		wantErr error
	}{
		{
			name: "ok",
			cap:  Capability{ID: "svc.thing.get", Method: "GET", Path: "/api/v1/thing"},
		},
		{
			name:    "empty id",
			cap:     Capability{Method: "GET", Path: "/x"},
			wantErr: ErrInvalidCapability,
		},
		{
			name:    "id with whitespace",
			cap:     Capability{ID: "svc thing", Method: "GET", Path: "/x"},
			wantErr: ErrInvalidCapability,
		},
		{
			name:    "unknown method",
			cap:     Capability{ID: "x", Method: "TRACE", Path: "/x"},
			wantErr: ErrInvalidCapability,
		},
		{
			name:    "path missing slash",
			cap:     Capability{ID: "x", Method: "GET", Path: "x"},
			wantErr: ErrInvalidCapability,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := tc.cap.Validate()
			if tc.wantErr == nil {
				if err != nil {
					t.Fatalf("expected nil, got %v", err)
				}
				return
			}
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("expected %v, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestRegistry_RegisterAndServe(t *testing.T) {
	t.Parallel()
	rg := New("test-service", "1.2.3")
	rg.now = func() time.Time { return time.Date(2026, 5, 10, 0, 0, 0, 0, time.UTC) }

	r := chi.NewRouter()
	called := false
	rg.MustRegister(r, Capability{
		ID:     "test.thing.get",
		Method: "GET",
		Path:   "/api/thing",
		Stable: true,
		Tags:   []string{"thing"},
	}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	}))
	rg.Mount(r)

	// Hit the registered route — confirms registration also wired chi.
	req := httptest.NewRequest(http.MethodGet, "/api/thing", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if !called || w.Code != http.StatusNoContent {
		t.Fatalf("handler not invoked: called=%v code=%d", called, w.Code)
	}

	// Hit the meta route and assert the snapshot shape.
	req = httptest.NewRequest(http.MethodGet, "/_meta/capabilities", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("/_meta/capabilities = %d, body=%s", w.Code, w.Body.String())
	}
	var snap Snapshot
	if err := json.Unmarshal(w.Body.Bytes(), &snap); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	if snap.SchemaVersion != SchemaVersion {
		t.Fatalf("schema_version = %d, want %d", snap.SchemaVersion, SchemaVersion)
	}
	if snap.Service != "test-service" || snap.Version != "1.2.3" {
		t.Fatalf("unexpected identity: %+v", snap)
	}
	if len(snap.Capabilities) != 5 {
		t.Fatalf("expected 5 capabilities (4 meta + thing), got %d: %+v",
			len(snap.Capabilities), snap.Capabilities)
	}
	// Sorted by ID — meta entry should appear first.
	if snap.Capabilities[0].ID != "_meta.capabilities.list" {
		t.Fatalf("capabilities not sorted by id: %+v", snap.Capabilities)
	}
	// Service field is propagated automatically.
	for _, c := range snap.Capabilities {
		if c.Service != "test-service" {
			t.Fatalf("capability %s missing service field: %+v", c.ID, c)
		}
	}
}

func TestRegistry_DuplicateID(t *testing.T) {
	t.Parallel()
	rg := New("svc", "")
	r := chi.NewRouter()
	cap := Capability{ID: "dup", Method: "GET", Path: "/a"}
	if err := rg.Register(r, cap, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})); err != nil {
		t.Fatalf("first register: %v", err)
	}
	cap.Path = "/b"
	err := rg.Register(r, cap, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	if !errors.Is(err, ErrDuplicateCapability) {
		t.Fatalf("expected ErrDuplicateCapability, got %v", err)
	}
}

func TestRegistry_NilArgs(t *testing.T) {
	t.Parallel()
	rg := New("svc", "")
	cap := Capability{ID: "x", Method: "GET", Path: "/x"}
	if err := rg.Register(nil, cap, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})); !errors.Is(err, ErrInvalidCapability) {
		t.Fatalf("nil router: expected ErrInvalidCapability, got %v", err)
	}
	if err := rg.Register(chi.NewRouter(), cap, nil); !errors.Is(err, ErrInvalidCapability) {
		t.Fatalf("nil handler: expected ErrInvalidCapability, got %v", err)
	}
}

func TestNew_PanicsOnEmptyService(t *testing.T) {
	t.Parallel()
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic on empty service")
		}
	}()
	_ = New("  ", "")
}
