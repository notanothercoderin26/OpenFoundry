package reindex

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

// HTTPSource hits object-database-service over HTTP to enumerate
// objects of a given (tenant, type) pair. Matches the wire shape
// served by `GET /api/v1/ontology/types/{type_id}/objects` on that
// service (see services/object-database-service/internal/handlers/
// objects_bridge.go::ListObjectsByOntologyType).
type HTTPSource struct {
	BaseURL string
	Client  *http.Client
	// TenantHeader overrides the canonical "x-of-tenant" header name
	// if a deployment uses a different convention. Empty = default.
	TenantHeader string
}

// NewHTTPSource builds a source pointed at baseURL with a 30s timeout
// per request. baseURL must NOT end with a trailing slash.
func NewHTTPSource(baseURL string) *HTTPSource {
	return &HTTPSource{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Client:  &http.Client{Timeout: 30 * time.Second},
	}
}

type httpListResponse struct {
	Data    []SourceObject `json:"data"`
	Total   int            `json:"total"`
	Page    int            `json:"page"`
	PerPage int            `json:"per_page"`
}

func (s *HTTPSource) ListByType(ctx context.Context, tenant repos.TenantId, typeID repos.TypeId, page, perPage uint32) (ListPage, error) {
	if s.BaseURL == "" {
		return ListPage{}, fmt.Errorf("HTTPSource: BaseURL is empty")
	}
	if typeID == "" {
		return ListPage{}, repos.Invalid("HTTPSource: typeID required")
	}
	if perPage == 0 {
		perPage = 500
	}
	q := url.Values{}
	q.Set("page", fmt.Sprintf("%d", page))
	q.Set("per_page", fmt.Sprintf("%d", perPage))
	endpoint := fmt.Sprintf("%s/api/v1/ontology/types/%s/objects?%s", s.BaseURL, url.PathEscape(string(typeID)), q.Encode())

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return ListPage{}, err
	}
	hdr := s.TenantHeader
	if hdr == "" {
		hdr = "x-of-tenant"
	}
	if tenant != "" {
		req.Header.Set(hdr, string(tenant))
	}
	req.Header.Set("Accept", "application/json")

	client := s.Client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return ListPage{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return ListPage{}, fmt.Errorf("object-database-service returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var decoded httpListResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return ListPage{}, fmt.Errorf("decode response: %w", err)
	}
	return ListPage{
		Items:   decoded.Data,
		Total:   decoded.Total,
		HasNext: decoded.Page*decoded.PerPage < decoded.Total,
	}, nil
}
