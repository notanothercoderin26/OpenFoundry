//go:build integration

// schemasync integration tests against a real Vespa cluster. Skipped
// unless VESPA_SEARCH_ENDPOINT and VESPA_CONFIG_ENDPOINT are set; see
// libs/search-abstraction/vespa/integration_test.go for the bring-up
// recipe and the dedicated-Vespa caveat.
//
// The unit tests under handler_test.go and translate_test.go cover
// the decision tree exhaustively — these tests fill the gap they
// leave by validating that an envelope handled by ProcessRecord
// actually lands on Vespa via the real MappingRegistrar deploy.

package schemasync

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
	"github.com/openfoundry/openfoundry-go/libs/search-abstraction/vespa"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

func vespaEndpointsOrSkip(t *testing.T) (string, string) {
	t.Helper()
	search := strings.TrimSpace(os.Getenv("VESPA_SEARCH_ENDPOINT"))
	config := strings.TrimSpace(os.Getenv("VESPA_CONFIG_ENDPOINT"))
	if search == "" || config == "" {
		t.Skip("VESPA_SEARCH_ENDPOINT / VESPA_CONFIG_ENDPOINT not set; skipping real-Vespa schemasync integration test")
	}
	return search, config
}

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

func indexWithRetry(t *testing.T, b *vespa.Backend, doc searchabstraction.IndexDoc, deadline time.Duration) error {
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

func TestIntegration_HandlerProcessRecordDeploysToRealVespa(t *testing.T) {
	searchEndpoint, configEndpoint := vespaEndpointsOrSkip(t)
	waitForConfigServerReady(t, configEndpoint, 60*time.Second)

	typeID := "ItSync" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	backend := vespa.NewWithOptions(searchEndpoint, vespa.WithConfigEndpoint(configEndpoint))

	envelope := SchemaEventEnvelope{
		SchemaVersion: 1,
		EventType:     EventCreated,
		Aggregate:     "ontology_object_type",
		AggregateID:   typeID,
		After: rawJSON(t, ObjectTypePayload{
			APIName: typeID,
			Name:    typeID,
			Properties: []PropertyPayload{
				{Name: "tail_number", PropertyType: "string", Searchable: true, Filterable: true},
				{Name: "max_passengers", PropertyType: "integer", Sortable: true},
			},
		}),
	}
	raw := rawJSON(t, envelope)

	h := &Handler{Backend: backend}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	outcome, err := h.ProcessRecord(ctx, raw)
	require.NoError(t, err, "ProcessRecord against a real, configured Vespa backend must succeed")
	assert.Equal(t, OutcomeRegistered, outcome)

	// Proof of deploy: a write against the freshly-deployed doc-type
	// is accepted by the content cluster.
	require.NoError(t, indexWithRetry(t, backend, searchabstraction.IndexDoc{
		Tenant:  repos.TenantId("acme-it"),
		ID:      repos.ObjectId("ac-1"),
		TypeID:  repos.TypeId(typeID),
		Version: 1,
		Payload: json.RawMessage(`{"tail_number":"N12345","max_passengers":180}`),
	}, 30*time.Second), "Index against schema deployed via ProcessRecord")
}

func TestIntegration_HandlerDropEnvelopeRemovesSchema(t *testing.T) {
	searchEndpoint, configEndpoint := vespaEndpointsOrSkip(t)
	waitForConfigServerReady(t, configEndpoint, 60*time.Second)

	typeID := "ItSyncDrop" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	backend := vespa.NewWithOptions(searchEndpoint, vespa.WithConfigEndpoint(configEndpoint))

	// Register via Handler.
	createdRaw := rawJSON(t, SchemaEventEnvelope{
		SchemaVersion: 1,
		EventType:     EventCreated,
		Aggregate:     "ontology_object_type",
		AggregateID:   typeID,
		After: rawJSON(t, ObjectTypePayload{
			APIName: typeID, Properties: []PropertyPayload{{Name: "name", PropertyType: "string"}},
		}),
	})
	h := &Handler{Backend: backend}
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	out, err := h.ProcessRecord(ctx, createdRaw)
	require.NoError(t, err)
	require.Equal(t, OutcomeRegistered, out)

	// Drop via Handler.
	deletedRaw := rawJSON(t, SchemaEventEnvelope{
		SchemaVersion: 1,
		EventType:     EventDeleted,
		Aggregate:     "ontology_object_type",
		AggregateID:   typeID,
		Before: rawJSON(t, ObjectTypePayload{APIName: typeID}),
	})
	out, err = h.ProcessRecord(ctx, deletedRaw)
	require.NoError(t, err)
	require.Equal(t, OutcomeDropped, out)

	// Writes against the dropped doc-type must fail once Vespa
	// converges on the redeploy.
	end := time.Now().Add(30 * time.Second)
	var lastErr error
	for time.Now().Before(end) {
		err := backend.Index(ctx, searchabstraction.IndexDoc{
			Tenant: "acme-it", ID: "drop-1", TypeID: repos.TypeId(typeID), Version: 1,
			Payload: json.RawMessage(`{"name":"should-fail"}`),
		})
		if err != nil {
			lastErr = err
			break
		}
		time.Sleep(1 * time.Second)
	}
	require.Error(t, lastErr, "Index after Handler-driven drop must fail")
}

func rawJSON(t *testing.T, v any) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return b
}
