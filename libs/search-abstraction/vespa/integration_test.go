//go:build integration

// Real-Vespa integration tests for the MappingRegistrar surface.
//
// These tests skip unless the operator has wired both VESPA_SEARCH_ENDPOINT
// (typically port 8080) and VESPA_CONFIG_ENDPOINT (typically port 19071)
// to a running Vespa cluster. The simplest way to provide one:
//
//	docker run --rm -d --name vespa-it -p 8080:8080 -p 19071:19071 \
//	  vespaengine/vespa:8.327
//	# wait ~30s for the config server to become ready
//	export VESPA_SEARCH_ENDPOINT=http://localhost:8080
//	export VESPA_CONFIG_ENDPOINT=http://localhost:19071
//	make test-integration PKG=./libs/search-abstraction/vespa/...
//
// IMPORTANT: each scenario assumes a dedicated Vespa instance. The
// prepareandactivate REST endpoint is a replace-all deploy — running
// these tests against a shared cluster will wipe schemas other
// tenants have deployed. Run against `docker run vespaengine/vespa`
// or a per-PR ephemeral instance only.
package vespa

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

// vespaEndpointsOrSkip returns (searchEndpoint, configEndpoint) when
// both env vars are set; otherwise skips the test.
func vespaEndpointsOrSkip(t *testing.T) (string, string) {
	t.Helper()
	search := strings.TrimSpace(os.Getenv("VESPA_SEARCH_ENDPOINT"))
	config := strings.TrimSpace(os.Getenv("VESPA_CONFIG_ENDPOINT"))
	if search == "" || config == "" {
		t.Skip("VESPA_SEARCH_ENDPOINT / VESPA_CONFIG_ENDPOINT not set; skipping real-Vespa integration test")
	}
	return search, config
}

// waitForConfigServerReady polls /ApplicationStatus until it returns
// 200 or the deadline expires. Brings the test out of "Vespa is still
// booting" territory before the first deploy.
func waitForConfigServerReady(t *testing.T, configEndpoint string, deadline time.Duration) {
	t.Helper()
	httpc := &http.Client{Timeout: 5 * time.Second}
	end := time.Now().Add(deadline)
	for time.Now().Before(end) {
		resp, err := httpc.Get(configEndpoint + "/ApplicationStatus")
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return
			}
		}
		time.Sleep(2 * time.Second)
	}
	t.Fatalf("vespa config server at %s never became ready within %s", configEndpoint, deadline)
}

// indexWithRetry calls Index until it succeeds or the deadline expires.
// Vespa's content cluster has a propagation delay between an
// application-package deploy and the doc-type being ready for writes
// — typically a couple of seconds but worth budgeting more.
func indexWithRetry(t *testing.T, b *Backend, doc searchabstraction.IndexDoc, deadline time.Duration) error {
	t.Helper()
	end := time.Now().Add(deadline)
	var lastErr error
	for time.Now().Before(end) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err := b.Index(ctx, doc)
		cancel()
		if err == nil {
			return nil
		}
		lastErr = err
		time.Sleep(1 * time.Second)
	}
	return lastErr
}

// searchWithRetry polls Search until it returns at least one hit or
// the deadline expires. Vespa indexing is asynchronous with respect
// to the document PUT 200 response.
func searchWithRetry(t *testing.T, b *Backend, q searchabstraction.SearchQuery, deadline time.Duration) ([]searchabstraction.SearchHit, error) {
	t.Helper()
	end := time.Now().Add(deadline)
	var lastErr error
	for time.Now().Before(end) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		out, err := b.Search(ctx, q, repos.Eventual())
		cancel()
		if err == nil && len(out.Items) > 0 {
			return out.Items, nil
		}
		lastErr = err
		time.Sleep(1 * time.Second)
	}
	return nil, lastErr
}

func TestIntegration_RegisterDeploysSchemaAndIndexesDocument(t *testing.T) {
	searchEndpoint, configEndpoint := vespaEndpointsOrSkip(t)
	waitForConfigServerReady(t, configEndpoint, 60*time.Second)

	typeID := repos.TypeId("ItAircraft" + strings.ReplaceAll(uuid.NewString()[:8], "-", ""))
	tenant := repos.TenantId("acme-it")
	b := NewWithOptions(searchEndpoint, WithConfigEndpoint(configEndpoint))

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	require.NoError(t, b.RegisterTypeMapping(ctx, searchabstraction.TypeMapping{
		TypeID:  typeID,
		Fields: []searchabstraction.MappingField{
			{Name: "tail_number", Type: searchabstraction.FieldString, Searchable: true, Filterable: true},
			{Name: "max_passengers", Type: searchabstraction.FieldInteger, Sortable: true},
		},
	}))

	// Deploy is acknowledged synchronously; the content cluster needs
	// a moment to honor writes against the new schema.
	require.NoError(t, indexWithRetry(t, b, searchabstraction.IndexDoc{
		Tenant:  tenant,
		ID:      "ac-1",
		TypeID:  typeID,
		Version: 1,
		Payload: json.RawMessage(`{"tail_number":"N12345","max_passengers":180}`),
	}, 30*time.Second), "Index against newly-deployed schema")

	typeQ := typeID
	hits, err := searchWithRetry(t, b, searchabstraction.SearchQuery{
		Tenant: tenant,
		TypeID: &typeQ,
		Filters: map[string]string{"tail_number": "N12345"},
		Page:    repos.Page{Size: 5},
	}, 30*time.Second)
	require.NoError(t, err)
	require.NotEmpty(t, hits, "search must return the indexed document once Vespa flushes the write")
	assert.Equal(t, repos.ObjectId("ac-1"), hits[0].ID)
}

func TestIntegration_RegisterAccumulatesAcrossCalls(t *testing.T) {
	searchEndpoint, configEndpoint := vespaEndpointsOrSkip(t)
	waitForConfigServerReady(t, configEndpoint, 60*time.Second)

	suffix := strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	typeA := repos.TypeId("ItAlphaA" + suffix)
	typeB := repos.TypeId("ItAlphaB" + suffix)
	tenant := repos.TenantId("acme-it")
	b := NewWithOptions(searchEndpoint, WithConfigEndpoint(configEndpoint))

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	require.NoError(t, b.RegisterTypeMapping(ctx, searchabstraction.TypeMapping{
		TypeID: typeA,
		Fields: []searchabstraction.MappingField{{Name: "name", Type: searchabstraction.FieldString, Searchable: true}},
	}))
	require.NoError(t, b.RegisterTypeMapping(ctx, searchabstraction.TypeMapping{
		TypeID: typeB,
		Fields: []searchabstraction.MappingField{{Name: "name", Type: searchabstraction.FieldString, Searchable: true}},
	}))

	// Both schemas must accept writes — proves Register accumulates
	// rather than replacing on each deploy.
	require.NoError(t, indexWithRetry(t, b, searchabstraction.IndexDoc{
		Tenant: tenant, ID: "a-1", TypeID: typeA, Version: 1,
		Payload: json.RawMessage(`{"name":"alpha-one"}`),
	}, 30*time.Second), "Index against schema A after both deploys")
	require.NoError(t, indexWithRetry(t, b, searchabstraction.IndexDoc{
		Tenant: tenant, ID: "b-1", TypeID: typeB, Version: 1,
		Payload: json.RawMessage(`{"name":"beta-one"}`),
	}, 30*time.Second), "Index against schema B after both deploys")
}

func TestIntegration_DropRemovesSchemaFromCluster(t *testing.T) {
	searchEndpoint, configEndpoint := vespaEndpointsOrSkip(t)
	waitForConfigServerReady(t, configEndpoint, 60*time.Second)

	typeID := repos.TypeId("ItDrop" + strings.ReplaceAll(uuid.NewString()[:8], "-", ""))
	tenant := repos.TenantId("acme-it")
	b := NewWithOptions(searchEndpoint, WithConfigEndpoint(configEndpoint))

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	require.NoError(t, b.RegisterTypeMapping(ctx, searchabstraction.TypeMapping{
		TypeID: typeID,
		Fields: []searchabstraction.MappingField{{Name: "name", Type: searchabstraction.FieldString}},
	}))
	require.NoError(t, indexWithRetry(t, b, searchabstraction.IndexDoc{
		Tenant: tenant, ID: "drop-1", TypeID: typeID, Version: 1,
		Payload: json.RawMessage(`{"name":"will-be-dropped"}`),
	}, 30*time.Second))

	require.NoError(t, b.DropTypeMapping(ctx, "", typeID))

	// After Drop, any write against the dropped doc-type must fail.
	// Retry the assertion because the redeploy needs a moment to land.
	end := time.Now().Add(30 * time.Second)
	var lastErr error
	for time.Now().Before(end) {
		err := b.Index(ctx, searchabstraction.IndexDoc{
			Tenant: tenant, ID: "drop-2", TypeID: typeID, Version: 2,
			Payload: json.RawMessage(`{"name":"should-fail"}`),
		})
		if err != nil {
			lastErr = err
			break
		}
		time.Sleep(1 * time.Second)
	}
	require.Error(t, lastErr, "Index after Drop must fail because the doc-type is no longer in the application")
}

func TestIntegration_SeedPreservesSchemasAcrossNewBackendInstance(t *testing.T) {
	searchEndpoint, configEndpoint := vespaEndpointsOrSkip(t)
	waitForConfigServerReady(t, configEndpoint, 60*time.Second)

	suffix := strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	typeOriginal := repos.TypeId("ItSeedOrig" + suffix)
	typeNew := repos.TypeId("ItSeedNew" + suffix)
	tenant := repos.TenantId("acme-it")

	// Phase 1: a "previous run" registers the original schema.
	bOld := NewWithOptions(searchEndpoint, WithConfigEndpoint(configEndpoint))
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	require.NoError(t, bOld.RegisterTypeMapping(ctx, searchabstraction.TypeMapping{
		TypeID: typeOriginal,
		Fields: []searchabstraction.MappingField{{Name: "name", Type: searchabstraction.FieldString}},
	}))
	require.NoError(t, indexWithRetry(t, bOld, searchabstraction.IndexDoc{
		Tenant: tenant, ID: "seed-1", TypeID: typeOriginal, Version: 1,
		Payload: json.RawMessage(`{"name":"original"}`),
	}, 30*time.Second))

	// Phase 2: a "restart" creates a fresh Backend (empty cache). It
	// SeedSchemas with the known previous state before registering a
	// new schema. Without the seed, the next RegisterTypeMapping
	// would redeploy a package containing only the new schema and
	// wipe typeOriginal.
	bNew := NewWithOptions(searchEndpoint, WithConfigEndpoint(configEndpoint))
	bNew.SeedSchemas([]searchabstraction.TypeMapping{
		{TypeID: typeOriginal, Fields: []searchabstraction.MappingField{{Name: "name", Type: searchabstraction.FieldString}}},
	})
	require.NoError(t, bNew.RegisterTypeMapping(ctx, searchabstraction.TypeMapping{
		TypeID: typeNew,
		Fields: []searchabstraction.MappingField{{Name: "name", Type: searchabstraction.FieldString}},
	}))

	// Both schemas must still accept writes — proves SeedSchemas
	// prevented the wipe.
	require.NoError(t, indexWithRetry(t, bNew, searchabstraction.IndexDoc{
		Tenant: tenant, ID: "seed-2", TypeID: typeOriginal, Version: 2,
		Payload: json.RawMessage(`{"name":"original-still-here"}`),
	}, 30*time.Second), "Index against seeded schema after restart-with-new-deploy")
	require.NoError(t, indexWithRetry(t, bNew, searchabstraction.IndexDoc{
		Tenant: tenant, ID: "seed-3", TypeID: typeNew, Version: 1,
		Payload: json.RawMessage(`{"name":"new"}`),
	}, 30*time.Second), "Index against newly-deployed schema")
}
