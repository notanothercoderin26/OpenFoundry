package capabilities

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestIngestChiRoutes(t *testing.T) {
	t.Parallel()

	rg := New("ontology-actions-service", "test")
	r := chi.NewRouter()
	rg.Mount(r) // pre-registers _meta.capabilities.list at /_meta/capabilities.

	// Pre-register a curated entry that ingest must NOT overwrite.
	rg.MustRegister(r, Capability{
		ID:           "actions.execute.post",
		Method:       http.MethodPost,
		Path:         "/api/v1/ontology/actions/{id}/execute",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Curated.",
	}, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))

	// Mount a kernel-style subrouter with several routes via Route+Get/Post.
	r.Route("/api/v1/ontology", func(api chi.Router) {
		api.Get("/actions", func(http.ResponseWriter, *http.Request) {})
		api.Post("/actions", func(http.ResponseWriter, *http.Request) {})
		api.Get("/actions/{id}", func(http.ResponseWriter, *http.Request) {})
		// Same path/method as curated — ingest must skip.
		api.Post("/actions/{id}/execute", func(http.ResponseWriter, *http.Request) {})
	})

	added, err := rg.IngestChiRoutes(r, IngestOptions{
		IDPrefix:  "ontology",
		AuthPaths: []string{"/api/"},
		Tags:      []string{"ontology"},
	})
	if err != nil {
		t.Fatalf("ingest: %v", err)
	}
	// Expected: 3 new (list/create/get-by-id). Execute is curated.
	if added != 3 {
		t.Fatalf("added=%d want 3", added)
	}

	snap := rg.Snapshot()
	got := map[string]Capability{}
	for _, c := range snap.Capabilities {
		got[c.ID] = c
	}
	if c, ok := got["actions.execute.post"]; !ok || !c.Stable || c.Summary != "Curated." {
		t.Fatalf("curated entry overwritten: %+v", c)
	}
	// Synthesised IDs are deterministic.
	for _, want := range []string{
		"ontology.api.v1.ontology.actions.get",
		"ontology.api.v1.ontology.actions.post",
		"ontology.api.v1.ontology.actions.id.get",
	} {
		c, ok := got[want]
		if !ok {
			t.Fatalf("missing synthesised id %q in %v", want, keys(got))
		}
		if !c.RequiresAuth {
			t.Fatalf("%s should require auth", want)
		}
		if c.Stable {
			t.Fatalf("%s should be unstable by default", want)
		}
	}
}

func keys(m map[string]Capability) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
