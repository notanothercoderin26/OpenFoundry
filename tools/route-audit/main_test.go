package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeComparablePath(t *testing.T) {
	if got := normalizePath("/api//v1/items/{id:uuid}/"); got != "/api/v1/items/{id}" {
		t.Fatalf("normalizePath mismatch: %q", got)
	}
	if got := comparablePath("/api/v1/items/{item_id}/runs/{run_id}"); got != "/api/v1/items/{}/runs/{}" {
		t.Fatalf("comparablePath mismatch: %q", got)
	}
}

func TestExtractGoRoutesAndClassifyPlaceholders(t *testing.T) {
	repo := t.TempDir()
	root := filepath.Join(repo, "services", "svc", "internal", "server")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	code := `package server
import (
  "net/http"
  "github.com/go-chi/chi/v5"
)
func Build() http.Handler {
  r := chi.NewRouter()
  r.Route("/api/v1", func(api chi.Router) {
    api.Get("/things", listThings)
    api.Method(http.MethodPost, "/things", createThing)
  })
  return r
}
func listThings(w http.ResponseWriter, r *http.Request) { writeEmptyList(w) }
func createThing(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNotImplemented) }
`
	if err := os.WriteFile(filepath.Join(root, "server.go"), []byte(code), 0o644); err != nil {
		t.Fatal(err)
	}
	routes := extractGoRoutes(repo, "svc")
	if len(routes) != 2 {
		t.Fatalf("expected 2 routes, got %d: %#v", len(routes), routes)
	}
	statuses := map[string]string{}
	for _, r := range routes {
		statuses[r.Method+" "+r.Path] = r.Status
	}
	if statuses["GET /api/v1/things"] != "empty-envelope" {
		t.Fatalf("GET status mismatch: %#v", statuses)
	}
	if statuses["POST /api/v1/things"] != "501" {
		t.Fatalf("POST status mismatch: %#v", statuses)
	}
}

func TestExtractGoRoutesPropagatesNestedPrefixThroughMountHelper(t *testing.T) {
	repo := t.TempDir()
	root := filepath.Join(repo, "services", "svc", "internal", "server")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	code := `package server
import (
  "net/http"
  "github.com/go-chi/chi/v5"
)
func BuildRouter() http.Handler {
  r := chi.NewRouter()
  r.Route("/api/v1/ontology", func(api chi.Router) {
    mountActions(api)
  })
  return r
}
func mountActions(r chi.Router) {
  r.Get("/actions", listActions)
}
func listActions(w http.ResponseWriter, r *http.Request) {}
`
	if err := os.WriteFile(filepath.Join(root, "server.go"), []byte(code), 0o644); err != nil {
		t.Fatal(err)
	}
	routes := extractGoRoutes(repo, "svc")
	if len(routes) != 1 {
		t.Fatalf("expected 1 route, got %d: %#v", len(routes), routes)
	}
	if routes[0].Path != "/api/v1/ontology/actions" {
		t.Fatalf("nested helper prefix was not propagated: %#v", routes[0])
	}
}

func TestExtractGoRoutesSeedsServerNewConstructor(t *testing.T) {
	repo := t.TempDir()
	root := filepath.Join(repo, "services", "svc", "internal", "server")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	code := `package server
import (
  "net/http"
  "github.com/go-chi/chi/v5"
)
func New() *http.Server {
  r := chi.NewRouter()
  r.Route("/api/v1", func(api chi.Router) {
    api.Get("/things", listThings)
  })
  return &http.Server{Handler: r}
}
func listThings(w http.ResponseWriter, r *http.Request) {}
`
	if err := os.WriteFile(filepath.Join(root, "server.go"), []byte(code), 0o644); err != nil {
		t.Fatal(err)
	}
	routes := extractGoRoutes(repo, "svc")
	if len(routes) != 1 {
		t.Fatalf("expected 1 route, got %d: %#v", len(routes), routes)
	}
	if routes[0].Path != "/api/v1/things" {
		t.Fatalf("New constructor route was not extracted: %#v", routes[0])
	}
}
