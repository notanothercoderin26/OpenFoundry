// Package catalog speaks the subset of the Iceberg REST Catalog API
// the Flight SQL surface needs to populate `GetSchemas` and `GetTables`
// with real datasets: list namespaces and list tables in a namespace.
//
// The client is deliberately tiny — no retry, no caching, no
// connection pooling beyond what http.Client provides. BI navigator
// fan-out (Tableau / Superset issue one GetTables per schema on
// connect) is rate-limited by the per-tenant quotas the gateway
// already enforces upstream.
package catalog

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// TableIdentifier mirrors the iceberg-catalog wire type so the Flight
// SQL builder doesn't have to import models from another service.
type TableIdentifier struct {
	Namespace []string `json:"namespace"`
	Name      string   `json:"name"`
}

// Client talks to iceberg-catalog-service over HTTP. The bearer token
// presented by the BI client on the Flight SQL surface is propagated
// verbatim so the catalog enforces the same row-level / marking-level
// authorization as a direct REST caller would see.
type Client struct {
	baseURL string
	http    *http.Client
}

// NewClient builds a Client bound to baseURL. baseURL accepts either
// `http://host:port` or `host:port` (we prefix `http://` when no
// scheme is present so the caller can pass the same string they put
// in `ICEBERG_CATALOG_URL`).
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: normaliseBaseURL(baseURL),
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

// WithHTTPClient overrides the underlying http.Client. Used by tests
// to inject an httptest.Server-backed transport.
func (c *Client) WithHTTPClient(h *http.Client) *Client {
	c.http = h
	return c
}

// BaseURL reports the normalised base URL — used in error messages
// surfaced through gRPC statuses so operators can spot a misconfigured
// `ICEBERG_CATALOG_URL` from the BI client's perspective.
func (c *Client) BaseURL() string { return c.baseURL }

// ListNamespaces returns every namespace path the caller is allowed to
// see. Maps onto `GET /iceberg/v1/namespaces`.
func (c *Client) ListNamespaces(ctx context.Context, bearer string) ([][]string, error) {
	body, err := c.get(ctx, "/iceberg/v1/namespaces", bearer)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Namespaces [][]string `json:"namespaces"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("catalog: decode namespaces response: %w", err)
	}
	return resp.Namespaces, nil
}

// ListTables returns the table identifiers under a single namespace.
// Maps onto `GET /iceberg/v1/namespaces/{ns}/tables`. The path
// segments are joined by `.` so multi-segment namespaces round-trip
// faithfully — mirroring the encoding `namespacePath` accepts on the
// catalog side.
func (c *Client) ListTables(ctx context.Context, bearer string, namespace []string) ([]TableIdentifier, error) {
	if len(namespace) == 0 {
		return nil, fmt.Errorf("catalog: namespace must contain at least one segment")
	}
	encoded := url.PathEscape(strings.Join(namespace, "."))
	body, err := c.get(ctx, "/iceberg/v1/namespaces/"+encoded+"/tables", bearer)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Identifiers []TableIdentifier `json:"identifiers"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("catalog: decode tables response: %w", err)
	}
	return resp.Identifiers, nil
}

// get issues an authenticated GET to path and returns the response
// body on 2xx, an error otherwise.
func (c *Client) get(ctx context.Context, path, bearer string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("catalog: build request: %w", err)
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("catalog: %s %s: %w", http.MethodGet, c.baseURL+path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("catalog: read body: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("catalog: %s %s returned %d: %s",
			http.MethodGet, c.baseURL+path, resp.StatusCode, trimBody(body))
	}
	return body, nil
}

func trimBody(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) > 256 {
		return s[:256] + "…"
	}
	return s
}

func normaliseBaseURL(raw string) string {
	t := strings.TrimRight(strings.TrimSpace(raw), "/")
	if t == "" {
		return ""
	}
	if !strings.HasPrefix(t, "http://") && !strings.HasPrefix(t, "https://") {
		t = "http://" + t
	}
	return t
}
