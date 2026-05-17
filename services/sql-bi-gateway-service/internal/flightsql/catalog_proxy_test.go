// Unit + integration coverage for the Flight SQL GetTables /
// GetSchemas proxy to iceberg-catalog-service. See round_trip_test.go
// for the SELECT 1 round trip and catalog sentinel tests.

package flightsql

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/flight"
	"github.com/apache/arrow-go/v18/arrow/flight/flightsql"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/sql-bi-gateway-service/internal/catalog"
	"github.com/openfoundry/openfoundry-go/services/sql-bi-gateway-service/internal/config"
)

// stubCatalogServer is a tiny HTTP server that responds to the two
// iceberg-catalog endpoints we depend on (ListNamespaces and
// ListTables per namespace). It captures the bearer token presented
// on each request so the proxy test can verify token propagation.
func stubCatalogServer(t *testing.T) (*httptest.Server, *sync.Map) {
	t.Helper()

	tokens := &sync.Map{}
	namespaces := [][]string{
		{"sales"},
		{"marketing"},
	}
	tablesByNS := map[string][]catalog.TableIdentifier{
		"sales":     {{Namespace: []string{"sales"}, Name: "orders"}, {Namespace: []string{"sales"}, Name: "customers"}},
		"marketing": {{Namespace: []string{"marketing"}, Name: "campaigns"}},
	}

	var counter int
	var mu sync.Mutex
	record := func(token string) {
		mu.Lock()
		defer mu.Unlock()
		tokens.Store(counter, token)
		counter++
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/iceberg/v1/namespaces", func(w http.ResponseWriter, r *http.Request) {
		record(r.Header.Get("Authorization"))
		_ = json.NewEncoder(w).Encode(map[string]any{"namespaces": namespaces})
	})
	for ns, ids := range tablesByNS {
		ns, ids := ns, ids
		mux.HandleFunc("/iceberg/v1/namespaces/"+ns+"/tables", func(w http.ResponseWriter, r *http.Request) {
			record(r.Header.Get("Authorization"))
			_ = json.NewEncoder(w).Encode(map[string]any{"identifiers": ids})
		})
	}
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, tokens
}

func TestServeTablesProxiesIcebergCatalog(t *testing.T) {
	t.Parallel()

	stub, _ := stubCatalogServer(t)

	cfg := &config.Config{
		Host:              "127.0.0.1",
		AllowAnonymous:    true,
		JWTSecret:         "test-secret",
		IcebergCatalogURL: stub.URL,
	}
	svc := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))

	schema, ch, err := svc.serveTables(context.Background(), "")
	if err != nil {
		t.Fatalf("serveTables: %v", err)
	}
	assertTablesSchema(t, schema)

	rows := drainTableRows(t, ch)
	wantNames := []string{"campaigns", "customers", "orders"}
	gotNames := make([]string, 0, len(rows))
	for _, r := range rows {
		gotNames = append(gotNames, r.tableName)
		if r.catalogName != GatewayCatalog {
			t.Errorf("catalog mismatch: %q", r.catalogName)
		}
		if r.tableType != "TABLE" {
			t.Errorf("table_type must be TABLE, got %q", r.tableType)
		}
	}
	sort.Strings(gotNames)
	if !sliceEqual(gotNames, wantNames) {
		t.Fatalf("table list mismatch:\n  got:  %v\n  want: %v", gotNames, wantNames)
	}
}

func TestServeTablesFallsBackOnCatalogError(t *testing.T) {
	t.Parallel()

	// Point at an unreachable URL so the catalog call fails fast.
	cfg := &config.Config{
		Host:              "127.0.0.1",
		AllowAnonymous:    true,
		JWTSecret:         "test-secret",
		IcebergCatalogURL: "http://127.0.0.1:1", // closed port
	}
	svc := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	schema, ch, err := svc.serveTables(ctx, "")
	if err != nil {
		t.Fatalf("serveTables: %v", err)
	}
	assertTablesSchema(t, schema)
	rows := drainTableRows(t, ch)
	// Sentinel path advertises 4 backends with `_meta` placeholders.
	if len(rows) != 4 {
		t.Fatalf("sentinel fallback should produce 4 rows, got %d", len(rows))
	}
	for _, r := range rows {
		if r.tableName != "_meta" {
			t.Errorf("sentinel row must use _meta placeholder, got %q", r.tableName)
		}
	}
}

func TestFlightSQLGetTablesEndToEnd(t *testing.T) {
	t.Parallel()

	stub, seenTokens := stubCatalogServer(t)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	addr := ln.Addr().String()

	cfg := &config.Config{
		Host:              "127.0.0.1",
		AllowAnonymous:    true,
		JWTSecret:         "test-secret",
		IcebergCatalogURL: stub.URL,
	}
	svc := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	go func() { _ = svc.Serve(ctx, ln) }()
	t.Cleanup(func() { _ = svc.Stop() })

	client := dialFlightClient(t, ctx, addr)
	defer client.Close()

	// Build a real signed JWT — the gateway decodes the token before
	// forwarding it to the catalog, so a placeholder string would be
	// rejected upstream of the catalog client.
	token := issueTestJWT(t, cfg.JWTSecret)
	authCtx := metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+token)

	info, err := client.GetTables(authCtx, &flightsql.GetTablesOpts{})
	if err != nil {
		t.Fatalf("GetTables: %v", err)
	}
	if len(info.GetEndpoint()) == 0 {
		t.Fatalf("expected at least one endpoint")
	}
	reader, err := client.DoGet(authCtx, info.GetEndpoint()[0].GetTicket())
	if err != nil {
		t.Fatalf("DoGet: %v", err)
	}
	defer reader.Release()

	assertTablesSchema(t, reader.Schema())

	totalRows := 0
	sawOrders := false
	for reader.Next() {
		rec := reader.RecordBatch()
		totalRows += int(rec.NumRows())
		nameCol := rec.Column(2).(*array.String)
		for i := 0; i < nameCol.Len(); i++ {
			if nameCol.Value(i) == "orders" {
				sawOrders = true
			}
		}
	}
	if err := reader.Err(); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if totalRows != 3 {
		t.Fatalf("expected 3 catalog tables, got %d", totalRows)
	}
	if !sawOrders {
		t.Fatalf("expected to see `orders` table in the result")
	}

	saw := false
	want := "Bearer " + token
	seenTokens.Range(func(_, v any) bool {
		if v.(string) == want {
			saw = true
			return false
		}
		return true
	})
	if !saw {
		t.Fatalf("bearer token was not forwarded to iceberg-catalog")
	}
}

// issueTestJWT mints a short-lived HS256 token using the gateway's
// auth-middleware encoder so the Flight SQL surface accepts it and
// the catalog client forwards the same string upstream.
func issueTestJWT(t *testing.T, secret string) string {
	t.Helper()
	jwt := authmw.NewJWTConfig(secret)
	tok, err := authmw.EncodeToken(jwt, &authmw.Claims{
		Sub:   uuid.New(),
		JTI:   uuid.New(),
		IAT:   time.Now().Unix(),
		EXP:   time.Now().Add(time.Hour).Unix(),
		Email: "bi-client@example.com",
		Roles: []string{"viewer"},
	})
	if err != nil {
		t.Fatalf("issue test jwt: %v", err)
	}
	return tok
}

// TestFlightSQLRequiresBearer verifies that, in non-anonymous mode,
// the Flight SQL surface rejects requests with no authorization
// metadata as Unauthenticated.
func TestFlightSQLRequiresBearer(t *testing.T) {
	t.Parallel()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("bind: %v", err)
	}
	addr := ln.Addr().String()

	cfg := &config.Config{
		Host:           "127.0.0.1",
		AllowAnonymous: false,
		JWTSecret:      "test-secret",
	}
	svc := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	go func() { _ = svc.Serve(ctx, ln) }()
	t.Cleanup(func() { _ = svc.Stop() })

	client := dialFlightClient(t, ctx, addr)
	defer client.Close()

	_, err = client.GetCatalogs(ctx)
	if err == nil {
		t.Fatalf("expected Unauthenticated error, got nil")
	}
	if st, ok := status.FromError(err); !ok || st.Code() != codes.Unauthenticated {
		t.Fatalf("want code=Unauthenticated, got err=%v", err)
	}
}

// --- helpers --------------------------------------------------------

type tableRowSnapshot struct {
	catalogName string
	schemaName  string
	tableName   string
	tableType   string
}

func assertTablesSchema(t *testing.T, sc *arrow.Schema) {
	t.Helper()
	want := []string{"catalog_name", "db_schema_name", "table_name", "table_type"}
	got := make([]string, 0, len(want))
	for _, f := range sc.Fields() {
		got = append(got, f.Name)
		if f.Type.ID() != arrow.STRING {
			t.Errorf("field %q must be string, got %s", f.Name, f.Type)
		}
	}
	if !sliceEqual(got, want) {
		t.Fatalf("GetTables schema mismatch:\n  got:  %v\n  want: %v", got, want)
	}
}

func drainTableRows(t *testing.T, ch <-chan flight.StreamChunk) []tableRowSnapshot {
	t.Helper()
	rows := []tableRowSnapshot{}
	for chunk := range ch {
		rec := chunk.Data
		if rec == nil {
			continue
		}
		catCol := rec.Column(0).(*array.String)
		schCol := rec.Column(1).(*array.String)
		nameCol := rec.Column(2).(*array.String)
		typeCol := rec.Column(3).(*array.String)
		for i := 0; i < int(rec.NumRows()); i++ {
			rows = append(rows, tableRowSnapshot{
				catalogName: catCol.Value(i),
				schemaName:  schCol.Value(i),
				tableName:   nameCol.Value(i),
				tableType:   typeCol.Value(i),
			})
		}
		rec.Release()
	}
	return rows
}

func dialFlightClient(t *testing.T, ctx context.Context, addr string) *flightsql.Client {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		c, err := flightsql.NewClientCtx(ctx, addr, nil, nil,
			grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err == nil {
			return c
		}
		if time.Now().After(deadline) {
			t.Fatalf("could not connect to Flight SQL server at %s: %v", addr, err)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func sliceEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
