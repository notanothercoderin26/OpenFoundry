package products

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/models"
)

// ResourceClient is the HTTP seam used by the publish (Fetch) and
// install (Create) flows to talk to the four owner services
// (ontology-definition, ontology-actions, pipeline-build,
// application-composition). Tests substitute an in-memory stub that
// records the calls and returns canned bodies.
type ResourceClient interface {
	// Fetch retrieves the JSON definition of a single resource from the
	// owner service. The returned payload is the raw response body
	// (assumed to be JSON); the publish path embeds it verbatim into
	// the bundle so consumers can decode it however they like.
	Fetch(ctx context.Context, kind models.ProductResourceType, ref string) (json.RawMessage, error)

	// Create asks the owner service to materialise a fresh resource
	// (with a new rid/id) in the target workspace, using the provided
	// JSON definition as the request body. Returns the new rid.
	//
	// targetWorkspaceRID is forwarded via the `X-Workspace-Rid` header
	// so the owner service can scope the new resource. The auth token
	// (forwarded from the caller via WithAuthToken) MUST be already set
	// on the underlying client.
	Create(
		ctx context.Context,
		kind models.ProductResourceType,
		targetWorkspaceRID string,
		body json.RawMessage,
	) (newRID string, err error)
}

// AuthForwarder is the interface satisfied by ResourceClient
// implementations that propagate the caller's bearer token to the
// owner services. The HTTP client implementation uses it; the in-memory
// stubs ignore it.
type AuthForwarder interface {
	WithAuthToken(token string) ResourceClient
}

// ServiceEndpoints lists the base URLs of the four owner services.
// Empty strings are accepted by the HTTP client but will cause Fetch /
// Create to return an error for the corresponding kind — that lets
// services without a configured peer surface a clear "not configured"
// error rather than NPE.
type ServiceEndpoints struct {
	OntologyDefinitionURL    string
	OntologyActionsURL       string
	PipelineBuildURL         string
	ApplicationCompositionURL string
}

// HTTPResourceClient is the production ResourceClient. It forwards a
// bearer token to every owner-service call.
type HTTPResourceClient struct {
	Endpoints  ServiceEndpoints
	HTTPClient *http.Client
	authToken  string
}

// NewHTTPResourceClient builds a client using the given endpoints. A
// default http.Client with a 30s timeout is used when nil.
func NewHTTPResourceClient(endpoints ServiceEndpoints, client *http.Client) *HTTPResourceClient {
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	return &HTTPResourceClient{Endpoints: endpoints, HTTPClient: client}
}

// WithAuthToken returns a shallow copy of the client that forwards the
// given bearer token to owner-service calls. The original client is
// not mutated, so concurrent requests with different tokens do not
// race.
func (c *HTTPResourceClient) WithAuthToken(token string) ResourceClient {
	clone := *c
	clone.authToken = token
	return &clone
}

// Fetch issues GET {service}/api/.../{ref} for the given kind.
func (c *HTTPResourceClient) Fetch(ctx context.Context, kind models.ProductResourceType, ref string) (json.RawMessage, error) {
	path, err := fetchPath(kind, ref)
	if err != nil {
		return nil, err
	}
	base, err := c.baseURL(kind)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(base, "/")+path, nil)
	if err != nil {
		return nil, err
	}
	c.applyAuth(req)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch %s/%s: %w", kind, ref, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read %s response: %w", kind, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch %s/%s: HTTP %d: %s", kind, ref, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return json.RawMessage(body), nil
}

// Create issues POST {service}/api/.../{collection} with the JSON body
// and reads the new rid from the response.
func (c *HTTPResourceClient) Create(
	ctx context.Context,
	kind models.ProductResourceType,
	targetWorkspaceRID string,
	body json.RawMessage,
) (string, error) {
	path, err := createPath(kind)
	if err != nil {
		return "", err
	}
	base, err := c.baseURL(kind)
	if err != nil {
		return "", err
	}
	// Strip top-level id/rid fields from the body so the owner service
	// allocates a fresh identifier. The mutation works on a copy.
	stripped, err := stripIdentityFields(body)
	if err != nil {
		return "", fmt.Errorf("strip identity fields: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(base, "/")+path, bytes.NewReader(stripped))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if targetWorkspaceRID != "" {
		req.Header.Set("X-Workspace-Rid", targetWorkspaceRID)
	}
	c.applyAuth(req)
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("create %s: %w", kind, err)
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read %s create response: %w", kind, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("create %s: HTTP %d: %s", kind, resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return extractNewRID(respBody)
}

func (c *HTTPResourceClient) baseURL(kind models.ProductResourceType) (string, error) {
	switch kind {
	case models.ProductResourceOntologyType:
		if c.Endpoints.OntologyDefinitionURL == "" {
			return "", fmt.Errorf("ontology-definition endpoint not configured")
		}
		return c.Endpoints.OntologyDefinitionURL, nil
	case models.ProductResourceActionType:
		if c.Endpoints.OntologyActionsURL == "" {
			return "", fmt.Errorf("ontology-actions endpoint not configured")
		}
		return c.Endpoints.OntologyActionsURL, nil
	case models.ProductResourcePipeline:
		if c.Endpoints.PipelineBuildURL == "" {
			return "", fmt.Errorf("pipeline-build endpoint not configured")
		}
		return c.Endpoints.PipelineBuildURL, nil
	case models.ProductResourceApp:
		if c.Endpoints.ApplicationCompositionURL == "" {
			return "", fmt.Errorf("application-composition endpoint not configured")
		}
		return c.Endpoints.ApplicationCompositionURL, nil
	default:
		return "", fmt.Errorf("unknown resource kind %q", kind)
	}
}

func (c *HTTPResourceClient) applyAuth(req *http.Request) {
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}
}

func fetchPath(kind models.ProductResourceType, ref string) (string, error) {
	switch kind {
	case models.ProductResourceOntologyType:
		return "/api/v1/ontology/object-types/" + ref, nil
	case models.ProductResourceActionType:
		return "/api/v1/ontology/actions/" + ref, nil
	case models.ProductResourcePipeline:
		return "/api/v1/pipelines/" + ref, nil
	case models.ProductResourceApp:
		return "/api/v1/apps/" + ref, nil
	default:
		return "", fmt.Errorf("unknown resource kind %q", kind)
	}
}

func createPath(kind models.ProductResourceType) (string, error) {
	switch kind {
	case models.ProductResourceOntologyType:
		return "/api/v1/ontology/object-types", nil
	case models.ProductResourceActionType:
		return "/api/v1/ontology/actions", nil
	case models.ProductResourcePipeline:
		return "/api/v1/pipelines", nil
	case models.ProductResourceApp:
		return "/api/v1/apps", nil
	default:
		return "", fmt.Errorf("unknown resource kind %q", kind)
	}
}

// stripIdentityFields removes the top-level "id" and "rid" keys from
// body so the owner service mints a fresh identifier. It returns the
// re-encoded JSON, or body verbatim when it is not a JSON object.
func stripIdentityFields(body json.RawMessage) ([]byte, error) {
	if len(bytes.TrimSpace(body)) == 0 {
		return []byte("{}"), nil
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(body, &obj); err != nil {
		// Not a JSON object — pass through unchanged.
		return body, nil
	}
	delete(obj, "id")
	delete(obj, "rid")
	return json.Marshal(obj)
}

// extractNewRID reads the new identifier from a create response. We try
// id then rid; both are common in the existing service surfaces.
func extractNewRID(body []byte) (string, error) {
	if len(bytes.TrimSpace(body)) == 0 {
		return "", errors.New("create response is empty")
	}
	var generic map[string]json.RawMessage
	if err := json.Unmarshal(body, &generic); err != nil {
		return "", fmt.Errorf("decode create response: %w", err)
	}
	for _, key := range []string{"rid", "id"} {
		raw, ok := generic[key]
		if !ok {
			continue
		}
		var s string
		if err := json.Unmarshal(raw, &s); err == nil && strings.TrimSpace(s) != "" {
			return s, nil
		}
	}
	return "", errors.New("create response did not include id or rid")
}
