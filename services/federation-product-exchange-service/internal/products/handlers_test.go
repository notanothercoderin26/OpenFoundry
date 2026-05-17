package products

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/models"
)

// testServer wires the products handlers under /api/v1/marketplace/products
// the same way internal/server/server.go does it, but without the
// listings + product-distribution surface so we can drive products in
// isolation.
type testServer struct {
	URL     string
	Handlers *Handlers
	Stub    *stubResourceClient
	Storage *MemoryBundleStorage
}

func newTestServer(t *testing.T) *testServer {
	t.Helper()
	repo := newMemoryRepo()
	storage := NewMemoryBundleStorage()
	stub := newStubClient()
	h := NewHandlers(repo, storage, stub, []byte("test-secret-marketplace-key"), "marketplace")

	r := chi.NewRouter()
	r.Route("/api/v1/marketplace/products", func(api chi.Router) {
		api.Get("/", h.ListProducts)
		api.Post("/", h.CreateProduct)
		api.Get("/installations", h.ListInstallations)
		api.Post("/installations/{rid}/uninstall", h.Uninstall)
		api.Get("/{rid}", h.GetProduct)
		api.Post("/{rid}/versions", h.PublishVersion)
		api.Post("/{rid}/install", h.InstallProduct)
	})
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return &testServer{URL: srv.URL, Handlers: h, Stub: stub, Storage: storage}
}

func TestCreateAndGetProduct(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t)

	body := postJSON(t, srv.URL+"/api/v1/marketplace/products", map[string]any{
		"name":        "Customer 360",
		"description": "Customer bundle",
		"author":      "Platform team",
		"resources": []map[string]any{
			{"type": "ONTOLOGY_TYPE", "ref": "obj-customer"},
		},
	}, http.StatusCreated)
	var created models.Product
	require.NoError(t, json.Unmarshal(body, &created))
	assert.Equal(t, "Customer 360", created.Name)
	assert.Equal(t, models.ProductStatusDraft, created.Status)
	assert.Equal(t, "", created.Version)
	require.NotEmpty(t, created.RID)
	assert.True(t, strings.HasPrefix(created.RID, "ri.marketplace.product."))

	got := getJSON(t, srv.URL+"/api/v1/marketplace/products/"+created.RID, http.StatusOK)
	var fetched models.Product
	require.NoError(t, json.Unmarshal(got, &fetched))
	assert.Equal(t, created.RID, fetched.RID)
	assert.Len(t, fetched.Resources, 1)
}

func TestCreateProductRejectsInvalidResourceType(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t)
	body := postJSON(t, srv.URL+"/api/v1/marketplace/products", map[string]any{
		"name": "Bad",
		"resources": []map[string]any{
			{"type": "NOT_A_REAL_TYPE", "ref": "x"},
		},
	}, http.StatusBadRequest)
	assert.Contains(t, string(body), "invalid resource type")
}

func TestPublishVersionBuildsAndStoresBundle(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t)

	// Seed the resources the publish flow will fetch.
	srv.Stub.seed(models.ProductResourceOntologyType, "obj-customer", json.RawMessage(`{"id":"obj-customer","name":"Customer"}`))
	srv.Stub.seed(models.ProductResourceActionType, "act-mark-vip", json.RawMessage(`{"id":"act-mark-vip","name":"Mark VIP"}`))

	// Create the product.
	body := postJSON(t, srv.URL+"/api/v1/marketplace/products", map[string]any{
		"name":   "Customer 360",
		"author": "Platform",
		"resources": []map[string]any{
			{"type": "ONTOLOGY_TYPE", "ref": "obj-customer"},
			{"type": "ACTION_TYPE", "ref": "act-mark-vip"},
		},
	}, http.StatusCreated)
	var product models.Product
	require.NoError(t, json.Unmarshal(body, &product))

	// Publish version 1.0.0.
	publishBody := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+product.RID+"/versions", map[string]any{"version": "1.0.0"}, http.StatusCreated)
	var version models.ProductVersion
	require.NoError(t, json.Unmarshal(publishBody, &version))
	assert.Equal(t, "1.0.0", version.Version)
	assert.Equal(t, "marketplace/"+product.RID+"/1.0.0.tar.gz", version.BundlePath)
	require.NotEmpty(t, version.Signature)

	// The bundle bytes must exist in storage and verify against the
	// stored signature using the SAME key the handler used to sign.
	bytesInStorage, err := srv.Storage.Get(context.Background(), version.BundlePath)
	require.NoError(t, err)
	require.NotEmpty(t, bytesInStorage)
	manifest, files, sig, err := ReadBundle(bytesInStorage, []byte("test-secret-marketplace-key"))
	require.NoError(t, err)
	assert.Equal(t, version.Signature, sig, "bundle signature must match the stored signature")
	assert.Equal(t, product.RID, manifest.ProductRID)
	require.Contains(t, files, "ontology/obj-customer.json")
	require.Contains(t, files, "actions/act-mark-vip.json")

	// Product row is now PUBLISHED with a manifest URL.
	got := getJSON(t, srv.URL+"/api/v1/marketplace/products/"+product.RID, http.StatusOK)
	var refreshed models.Product
	require.NoError(t, json.Unmarshal(got, &refreshed))
	assert.Equal(t, models.ProductStatusPublished, refreshed.Status)
	assert.Equal(t, "1.0.0", refreshed.Version)
	assert.NotEmpty(t, refreshed.ManifestURL)
	assert.Equal(t, version.Signature, refreshed.Signature)
}

func TestPublishVersionRejectsRangeVersion(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t)
	srv.Stub.seed(models.ProductResourceOntologyType, "x", json.RawMessage(`{}`))
	body := postJSON(t, srv.URL+"/api/v1/marketplace/products", map[string]any{
		"name":      "Bad",
		"resources": []map[string]any{{"type": "ONTOLOGY_TYPE", "ref": "x"}},
	}, http.StatusCreated)
	var p models.Product
	require.NoError(t, json.Unmarshal(body, &p))
	postJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID+"/versions", map[string]any{"version": "^1.0"}, http.StatusBadRequest)
	postJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID+"/versions", map[string]any{"version": "~1.2.3"}, http.StatusBadRequest)
	postJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID+"/versions", map[string]any{"version": "1.2"}, http.StatusBadRequest)
}

func TestPublishVersionRequiresResources(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t)
	body := postJSON(t, srv.URL+"/api/v1/marketplace/products", map[string]any{
		"name":      "Empty",
		"resources": []map[string]any{},
	}, http.StatusCreated)
	var p models.Product
	require.NoError(t, json.Unmarshal(body, &p))
	postJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID+"/versions", map[string]any{"version": "1.0.0"}, http.StatusBadRequest)
}

func TestInstallProductCreatesResourcesAndRecordsMappings(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t)
	srv.Stub.seed(models.ProductResourceOntologyType, "obj-customer", json.RawMessage(`{"id":"obj-customer","name":"Customer"}`))
	srv.Stub.seed(models.ProductResourceActionType, "act-mark-vip", json.RawMessage(`{"id":"act-mark-vip","name":"Mark VIP"}`))
	srv.Stub.seed(models.ProductResourcePipeline, "pipe-enrich", json.RawMessage(`{"id":"pipe-enrich","name":"Enrich"}`))
	srv.Stub.seed(models.ProductResourceApp, "app-portal", json.RawMessage(`{"id":"app-portal","name":"Portal"}`))

	product := mustPublish(t, srv, "1.0.0", []map[string]any{
		{"type": "ONTOLOGY_TYPE", "ref": "obj-customer"},
		{"type": "ACTION_TYPE", "ref": "act-mark-vip"},
		{"type": "PIPELINE", "ref": "pipe-enrich"},
		{"type": "APP", "ref": "app-portal"},
	})

	installBody := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+product.RID+"/install", map[string]any{
		"version":              "1.0.0",
		"target_workspace_rid": "ri.workspace.test-target",
	}, http.StatusCreated)
	var ins models.Installation
	require.NoError(t, json.Unmarshal(installBody, &ins))
	assert.Equal(t, models.InstallationStatusInstalled, ins.Status)
	require.Len(t, ins.ResourceMappings, 4, "every manifest entry must produce one mapping")
	for _, mapping := range ins.ResourceMappings {
		assert.True(t, strings.HasPrefix(mapping.DstRID, "ri.installed."), "mapping dst_rid must look like a new rid: %s", mapping.DstRID)
	}

	// The stub recorded one Create per resource scoped to the target workspace.
	calls := srv.Stub.createdCalls()
	require.Len(t, calls, 4)
	seen := map[models.ProductResourceType]bool{}
	for _, call := range calls {
		seen[call.Type] = true
		assert.Equal(t, "ri.workspace.test-target", call.Workspace)
	}
	assert.True(t, seen[models.ProductResourceOntologyType])
	assert.True(t, seen[models.ProductResourceActionType])
	assert.True(t, seen[models.ProductResourcePipeline])
	assert.True(t, seen[models.ProductResourceApp])
}

func TestInstallProductIsIdempotent(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t)
	srv.Stub.seed(models.ProductResourceOntologyType, "obj-x", json.RawMessage(`{"id":"obj-x"}`))
	product := mustPublish(t, srv, "1.0.0", []map[string]any{{"type": "ONTOLOGY_TYPE", "ref": "obj-x"}})

	first := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+product.RID+"/install", map[string]any{
		"version":              "1.0.0",
		"target_workspace_rid": "ri.workspace.ws-1",
	}, http.StatusCreated)
	var firstIns models.Installation
	require.NoError(t, json.Unmarshal(first, &firstIns))
	assert.Equal(t, models.InstallationStatusInstalled, firstIns.Status)

	// Second install of the same (product, version, workspace) → no-op
	// with the same RID and no new Create calls.
	second := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+product.RID+"/install", map[string]any{
		"version":              "1.0.0",
		"target_workspace_rid": "ri.workspace.ws-1",
	}, http.StatusOK)
	var secondIns models.Installation
	require.NoError(t, json.Unmarshal(second, &secondIns))
	assert.Equal(t, firstIns.RID, secondIns.RID)
	assert.Equal(t, models.InstallationStatusInstalled, secondIns.Status)
	assert.Equal(t, len(firstIns.ResourceMappings), len(secondIns.ResourceMappings))
	assert.Len(t, srv.Stub.createdCalls(), 1, "idempotent install must not re-call the owner service")
}

func TestInstallRejectsCorruptSignature(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t)
	srv.Stub.seed(models.ProductResourceOntologyType, "obj-x", json.RawMessage(`{"id":"obj-x"}`))
	product := mustPublish(t, srv, "1.0.0", []map[string]any{{"type": "ONTOLOGY_TYPE", "ref": "obj-x"}})

	// Replace the bundle bytes with junk that does not parse as
	// gzip+tar. The install path must surface this as a 400 before
	// ever talking to the owner service.
	expectedPath := "marketplace/" + product.RID + "/1.0.0.tar.gz"
	require.NoError(t, srv.Storage.Put(context.Background(), expectedPath, []byte("not a real gzip stream")))

	body := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+product.RID+"/install", map[string]any{
		"version":              "1.0.0",
		"target_workspace_rid": "ri.workspace.tamper",
	}, http.StatusBadRequest)
	assert.Contains(t, strings.ToLower(string(body)), "invalid")
	assert.Empty(t, srv.Stub.createdCalls(), "corrupt bundle must not reach the owner service")
}

func TestInstallRejectsSignatureMismatchAfterReSign(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t)
	srv.Stub.seed(models.ProductResourceOntologyType, "obj-x", json.RawMessage(`{"id":"obj-x"}`))
	product := mustPublish(t, srv, "1.0.0", []map[string]any{{"type": "ONTOLOGY_TYPE", "ref": "obj-x"}})

	// Re-sign the bundle with a different key so the install path
	// recomputes a signature that does not match the stored row.
	srv.Handlers.SignKey = []byte("a-completely-different-marketplace-secret")
	body := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+product.RID+"/install", map[string]any{
		"version":              "1.0.0",
		"target_workspace_rid": "ri.workspace.mismatch",
	}, http.StatusBadRequest)
	assert.Contains(t, string(body), "signature")
	assert.Empty(t, srv.Stub.createdCalls(), "signature mismatch must not reach the owner service")
}

func TestInstallMarksFailureWhenOwnerServiceErrors(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t)
	srv.Stub.seed(models.ProductResourceOntologyType, "obj-x", json.RawMessage(`{"id":"obj-x"}`))
	product := mustPublish(t, srv, "1.0.0", []map[string]any{{"type": "ONTOLOGY_TYPE", "ref": "obj-x"}})
	srv.Stub.failCreateFor(models.ProductResourceOntologyType, errStubBoom)

	body := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+product.RID+"/install", map[string]any{
		"version":              "1.0.0",
		"target_workspace_rid": "ri.workspace.broken",
	}, http.StatusBadGateway)
	assert.Contains(t, string(body), "boom")

	// The installation row exists in FAILED state with a populated
	// failure_reason — the install path must persist the error so the
	// caller can inspect what went wrong.
	list := getJSON(t, srv.URL+"/api/v1/marketplace/products/installations?target_workspace_rid=ri.workspace.broken", http.StatusOK)
	var listResp installationListResponse
	require.NoError(t, json.Unmarshal(list, &listResp))
	require.Len(t, listResp.Items, 1)
	assert.Equal(t, models.InstallationStatusFailed, listResp.Items[0].Status)
	assert.Contains(t, listResp.Items[0].FailureReason, "boom")
}

func TestPublishFetchFailureSurfacesError(t *testing.T) {
	t.Parallel()
	srv := newTestServer(t)
	srv.Stub.seed(models.ProductResourceOntologyType, "obj-x", json.RawMessage(`{}`))
	srv.Stub.failFetchFor(models.ProductResourceOntologyType, "obj-x", errStubBoom)

	body := postJSON(t, srv.URL+"/api/v1/marketplace/products", map[string]any{
		"name":      "X",
		"resources": []map[string]any{{"type": "ONTOLOGY_TYPE", "ref": "obj-x"}},
	}, http.StatusCreated)
	var p models.Product
	require.NoError(t, json.Unmarshal(body, &p))

	resp := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID+"/versions", map[string]any{"version": "1.0.0"}, http.StatusBadGateway)
	assert.Contains(t, string(resp), "boom")
}

// ── helpers ────────────────────────────────────────────────────────────

func postJSON(t *testing.T, url string, payload any, want int) []byte {
	t.Helper()
	body, err := json.Marshal(payload)
	require.NoError(t, err)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	defer resp.Body.Close()
	respBody := readAll(t, resp)
	require.Equalf(t, want, resp.StatusCode, "unexpected status for %s: %s", url, string(respBody))
	return respBody
}

func getJSON(t *testing.T, url string, want int) []byte {
	t.Helper()
	resp, err := http.Get(url)
	require.NoError(t, err)
	defer resp.Body.Close()
	respBody := readAll(t, resp)
	require.Equalf(t, want, resp.StatusCode, "unexpected status for %s: %s", url, string(respBody))
	return respBody
}

func readAll(t *testing.T, resp *http.Response) []byte {
	t.Helper()
	buf := new(bytes.Buffer)
	_, err := buf.ReadFrom(resp.Body)
	require.NoError(t, err)
	return buf.Bytes()
}

// mustPublish creates a product with the given resources and publishes
// the supplied version. The returned product reflects the post-publish
// state (status PUBLISHED, latest version + manifest url stamped).
func mustPublish(t *testing.T, srv *testServer, version string, resources []map[string]any) models.Product {
	t.Helper()
	body := postJSON(t, srv.URL+"/api/v1/marketplace/products", map[string]any{
		"name":      "Test",
		"resources": resources,
	}, http.StatusCreated)
	var p models.Product
	require.NoError(t, json.Unmarshal(body, &p))

	_ = postJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID+"/versions", map[string]any{"version": version}, http.StatusCreated)

	got := getJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID, http.StatusOK)
	var refreshed models.Product
	require.NoError(t, json.Unmarshal(got, &refreshed))
	return refreshed
}
