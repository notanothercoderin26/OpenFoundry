package vespa

import (
	"archive/zip"
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
)

// fakeConfigServer captures every prepareandactivate POST so tests can
// assert against the deployed application package's contents.
type fakeConfigServer struct {
	mu    sync.Mutex
	calls []deployCall
	fail  bool
}

type deployCall struct {
	tenant      string
	contentType string
	pkg         []byte
}

func (s *fakeConfigServer) handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.fail {
			http.Error(w, `{"error":"simulated"}`, http.StatusInternalServerError)
			return
		}
		// Path is /application/v2/tenant/{tenant}/prepareandactivate.
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		var tenant string
		if len(parts) >= 4 {
			tenant = parts[3]
		}
		s.calls = append(s.calls, deployCall{tenant: tenant, contentType: r.Header.Get("Content-Type"), pkg: body})
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"session-id":"42"}`))
	}
}

func filenamesInPackage(t *testing.T, pkg []byte) []string {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(pkg), int64(len(pkg)))
	require.NoError(t, err)
	out := make([]string, 0, len(zr.File))
	for _, f := range zr.File {
		out = append(out, f.Name)
	}
	return out
}

func TestRegisterTypeMappingDeploysApplicationPackage(t *testing.T) {
	t.Parallel()
	srv := &fakeConfigServer{}
	cfgServer := httptest.NewServer(srv.handler())
	defer cfgServer.Close()

	b := NewWithOptions("http://localhost:8080",
		WithConfigEndpoint(cfgServer.URL),
		WithVespaTenant("openfoundry"),
	)

	err := b.RegisterTypeMapping(context.Background(), searchabstraction.TypeMapping{
		TypeID: "Aircraft",
		Fields: []searchabstraction.MappingField{
			{Name: "tail_number", Type: searchabstraction.FieldString, Searchable: true},
		},
	})
	require.NoError(t, err)
	srv.mu.Lock()
	defer srv.mu.Unlock()
	require.Len(t, srv.calls, 1)
	assert.Equal(t, "openfoundry", srv.calls[0].tenant)
	assert.Equal(t, "application/zip", srv.calls[0].contentType)
	names := filenamesInPackage(t, srv.calls[0].pkg)
	assert.Contains(t, names, "services.xml")
	assert.Contains(t, names, "schemas/aircraft.sd")
}

func TestRegisterTypeMappingAccumulatesAcrossCalls(t *testing.T) {
	t.Parallel()
	srv := &fakeConfigServer{}
	cfgServer := httptest.NewServer(srv.handler())
	defer cfgServer.Close()
	b := NewWithOptions("http://localhost:8080", WithConfigEndpoint(cfgServer.URL))

	require.NoError(t, b.RegisterTypeMapping(context.Background(), searchabstraction.TypeMapping{TypeID: "Aircraft"}))
	require.NoError(t, b.RegisterTypeMapping(context.Background(), searchabstraction.TypeMapping{TypeID: "Airport"}))

	srv.mu.Lock()
	defer srv.mu.Unlock()
	require.Len(t, srv.calls, 2)
	// Second deploy includes both schemas.
	names := filenamesInPackage(t, srv.calls[1].pkg)
	assert.Contains(t, names, "schemas/aircraft.sd")
	assert.Contains(t, names, "schemas/airport.sd")
}

func TestDropTypeMappingDeploysWithoutTheDroppedType(t *testing.T) {
	t.Parallel()
	srv := &fakeConfigServer{}
	cfgServer := httptest.NewServer(srv.handler())
	defer cfgServer.Close()
	b := NewWithOptions("http://localhost:8080", WithConfigEndpoint(cfgServer.URL))

	b.SeedSchemas([]searchabstraction.TypeMapping{{TypeID: "Aircraft"}, {TypeID: "Airport"}})
	require.NoError(t, b.DropTypeMapping(context.Background(), "", "Aircraft"))

	srv.mu.Lock()
	defer srv.mu.Unlock()
	require.Len(t, srv.calls, 1)
	names := filenamesInPackage(t, srv.calls[0].pkg)
	assert.NotContains(t, names, "schemas/aircraft.sd")
	assert.Contains(t, names, "schemas/airport.sd")
}

func TestSeedSchemasPopulatesCacheButDoesNotDeploy(t *testing.T) {
	t.Parallel()
	srv := &fakeConfigServer{}
	cfgServer := httptest.NewServer(srv.handler())
	defer cfgServer.Close()
	b := NewWithOptions("http://localhost:8080", WithConfigEndpoint(cfgServer.URL))

	b.SeedSchemas([]searchabstraction.TypeMapping{{TypeID: "Aircraft"}, {TypeID: "Airport"}})
	srv.mu.Lock()
	assert.Empty(t, srv.calls, "Seed must not POST to the config server")
	srv.mu.Unlock()
	snap := b.SchemaSnapshot()
	assert.Len(t, snap, 2)

	// First Register after Seed includes the seeded schemas.
	require.NoError(t, b.RegisterTypeMapping(context.Background(), searchabstraction.TypeMapping{TypeID: "Helicopter"}))
	srv.mu.Lock()
	defer srv.mu.Unlock()
	require.Len(t, srv.calls, 1)
	names := filenamesInPackage(t, srv.calls[0].pkg)
	assert.Contains(t, names, "schemas/aircraft.sd")
	assert.Contains(t, names, "schemas/airport.sd")
	assert.Contains(t, names, "schemas/helicopter.sd")
}

func TestRegisterTypeMappingReturnsSentinelWhenConfigEndpointMissing(t *testing.T) {
	t.Parallel()
	b := New("http://localhost:8080") // no WithConfigEndpoint
	err := b.RegisterTypeMapping(context.Background(), searchabstraction.TypeMapping{TypeID: "Aircraft"})
	require.ErrorIs(t, err, searchabstraction.ErrMappingDeployUnconfigured,
		"unconfigured deploy must surface a recognisable sentinel so callers can OutcomeSkippedNoOp")
	// Cache is still updated so a later configure-and-redeploy works.
	snap := b.SchemaSnapshot()
	assert.Len(t, snap, 1)
}

func TestRegisterTypeMappingPropagatesDeployFailure(t *testing.T) {
	t.Parallel()
	srv := &fakeConfigServer{fail: true}
	cfgServer := httptest.NewServer(srv.handler())
	defer cfgServer.Close()
	b := NewWithOptions("http://localhost:8080", WithConfigEndpoint(cfgServer.URL))
	err := b.RegisterTypeMapping(context.Background(), searchabstraction.TypeMapping{TypeID: "Aircraft"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "500")
}

func TestRegisterTypeMappingRejectsEmptyTypeID(t *testing.T) {
	t.Parallel()
	b := New("http://localhost:8080")
	err := b.RegisterTypeMapping(context.Background(), searchabstraction.TypeMapping{})
	require.Error(t, err)
}
