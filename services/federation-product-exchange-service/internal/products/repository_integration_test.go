//go:build integration

package products

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	testingx "github.com/openfoundry/openfoundry-go/libs/testing"
	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/repo"
)

// TestProductsEndToEndPostgres exercises the full publish → install → idempotent install
// pipeline against the real PGX-backed Repository. The bundle storage
// stays in-memory because what we're validating is the SQL contract,
// not the bytes-at-rest behaviour (covered by the FilesystemBundleStorage
// unit path in storage.go).
func TestProductsEndToEndPostgres(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	harness := testingx.BootPostgres(ctx, t)
	t.Cleanup(func() { harness.Stop(context.Background()) })
	require.NoError(t, repo.Migrate(ctx, harness.Pool))

	pgRepo := NewPGXRepository(harness.Pool)
	storage := NewMemoryBundleStorage()
	stub := newStubClient()
	stub.seed(models.ProductResourceOntologyType, "obj-customer", json.RawMessage(`{"id":"obj-customer","name":"Customer"}`))
	stub.seed(models.ProductResourceActionType, "act-mark-vip", json.RawMessage(`{"id":"act-mark-vip","name":"Mark VIP"}`))
	stub.seed(models.ProductResourcePipeline, "pipe-enrich", json.RawMessage(`{"id":"pipe-enrich","name":"Enrich"}`))
	stub.seed(models.ProductResourceApp, "app-portal", json.RawMessage(`{"id":"app-portal","name":"Portal"}`))

	h := NewHandlers(pgRepo, storage, stub, []byte("integration-marketplace-sign-key"), "marketplace")

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

	// Create a product with all 4 resource kinds — matches the acceptance
	// criterion of "E2E: publish product with 4 resources".
	body := postJSON(t, srv.URL+"/api/v1/marketplace/products", map[string]any{
		"name":   "Customer 360 (integration)",
		"author": "Integration",
		"resources": []map[string]any{
			{"type": "ONTOLOGY_TYPE", "ref": "obj-customer"},
			{"type": "ACTION_TYPE", "ref": "act-mark-vip"},
			{"type": "PIPELINE", "ref": "pipe-enrich"},
			{"type": "APP", "ref": "app-portal"},
		},
	}, http.StatusCreated)
	var p models.Product
	require.NoError(t, json.Unmarshal(body, &p))

	// Publish a version.
	versionBody := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID+"/versions", map[string]any{"version": "1.2.3"}, http.StatusCreated)
	var version models.ProductVersion
	require.NoError(t, json.Unmarshal(versionBody, &version))
	assert.True(t, strings.HasSuffix(version.BundlePath, "/1.2.3.tar.gz"))
	require.NotEmpty(t, version.Signature)

	// Publishing the same version again must conflict.
	postJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID+"/versions", map[string]any{"version": "1.2.3"}, http.StatusConflict)

	// Install into the target workspace.
	installBody := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID+"/install", map[string]any{
		"version":              "1.2.3",
		"target_workspace_rid": "ri.workspace.integration",
	}, http.StatusCreated)
	var ins models.Installation
	require.NoError(t, json.Unmarshal(installBody, &ins))
	require.Equal(t, models.InstallationStatusInstalled, ins.Status)
	require.Len(t, ins.ResourceMappings, 4)

	// Idempotent re-install: same triple → 200 OK with the same RID.
	repeatBody := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID+"/install", map[string]any{
		"version":              "1.2.3",
		"target_workspace_rid": "ri.workspace.integration",
	}, http.StatusOK)
	var repeat models.Installation
	require.NoError(t, json.Unmarshal(repeatBody, &repeat))
	assert.Equal(t, ins.RID, repeat.RID)

	// Installing a *different* workspace works and produces a fresh row.
	otherBody := postJSON(t, srv.URL+"/api/v1/marketplace/products/"+p.RID+"/install", map[string]any{
		"version":              "1.2.3",
		"target_workspace_rid": "ri.workspace.integration-2",
	}, http.StatusCreated)
	var other models.Installation
	require.NoError(t, json.Unmarshal(otherBody, &other))
	assert.NotEqual(t, ins.RID, other.RID)

	// Listing installations filtered by target_workspace_rid → exactly 1.
	listBody := getJSON(t, srv.URL+"/api/v1/marketplace/products/installations?target_workspace_rid=ri.workspace.integration", http.StatusOK)
	var listResp installationListResponse
	require.NoError(t, json.Unmarshal(listBody, &listResp))
	assert.Equal(t, 1, listResp.Total)
	require.Len(t, listResp.Items, 1)
	assert.Equal(t, "ri.workspace.integration", listResp.Items[0].TargetWorkspaceRID)
}
