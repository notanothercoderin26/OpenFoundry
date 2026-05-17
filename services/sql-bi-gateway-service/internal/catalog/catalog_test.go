package catalog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientListNamespacesPropagatesBearer(t *testing.T) {
	t.Parallel()

	var seenAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		if r.URL.Path != "/iceberg/v1/namespaces" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"namespaces": [][]string{{"sales"}, {"sales", "europe"}},
		})
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	got, err := c.ListNamespaces(context.Background(), "abc.token")
	if err != nil {
		t.Fatalf("ListNamespaces: %v", err)
	}
	if seenAuth != "Bearer abc.token" {
		t.Fatalf("want Bearer abc.token, got %q", seenAuth)
	}
	if len(got) != 2 || got[0][0] != "sales" || got[1][1] != "europe" {
		t.Fatalf("unexpected namespaces: %+v", got)
	}
}

func TestClientListTablesEncodesNamespace(t *testing.T) {
	t.Parallel()

	var seenPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenPath = r.URL.Path
		_ = json.NewEncoder(w).Encode(map[string]any{
			"identifiers": []map[string]any{
				{"namespace": []string{"sales", "europe"}, "name": "orders"},
				{"namespace": []string{"sales", "europe"}, "name": "customers"},
			},
		})
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	tables, err := c.ListTables(context.Background(), "", []string{"sales", "europe"})
	if err != nil {
		t.Fatalf("ListTables: %v", err)
	}
	if seenPath != "/iceberg/v1/namespaces/sales.europe/tables" {
		t.Fatalf("unexpected path: %s", seenPath)
	}
	if len(tables) != 2 || tables[0].Name != "orders" {
		t.Fatalf("unexpected tables: %+v", tables)
	}
}

func TestClientListTablesNonOK(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	if _, err := c.ListTables(context.Background(), "", []string{"x"}); err == nil {
		t.Fatalf("expected error on 403, got nil")
	}
}

func TestClientListTablesRequiresNonEmptyNamespace(t *testing.T) {
	t.Parallel()
	c := NewClient("http://example.invalid")
	if _, err := c.ListTables(context.Background(), "", nil); err == nil {
		t.Fatalf("expected error for empty namespace")
	}
}

func TestNormaliseBaseURL(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"":                                 "",
		"  ":                               "",
		"iceberg-catalog-service:8197":     "http://iceberg-catalog-service:8197",
		"http://iceberg-catalog:8197/":     "http://iceberg-catalog:8197",
		"https://catalog.openfoundry.dev/": "https://catalog.openfoundry.dev",
	}
	for input, want := range cases {
		if got := normaliseBaseURL(input); got != want {
			t.Errorf("normaliseBaseURL(%q) = %q, want %q", input, got, want)
		}
	}
}
