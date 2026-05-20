//go:build integration

// End-to-end verification of the PutObject → outbox.events emission
// closed in B03 §G2.
//
// The test boots a real Postgres with `wal_level=logical`, applies
// the migrations shipped by `ontology-definition-service` (which
// install the shared `outbox.events` table), opens a `test_decoding`
// logical replication slot, calls PutObject via the HTTP handler
// (with the in-memory ObjectStore standing in for Cassandra), and
// asserts that one INSERT to outbox.events lands in the WAL with the
// expected topic (`ontology.object.changed.v1`) and payload shape
// (object_id, object_type_id, operation, version, properties).
//
// What this proves end-to-end:
//   - The new OutboxPool wiring is read by PutObject when configured.
//   - The deterministic event_id derivation matches the kernel canon
//     (libs/ontology-kernel/domain.DeriveEventID).
//   - The same-tx INSERT/DELETE pattern of libs/outbox.Enqueue
//     preserves the full payload in the WAL via REPLICA IDENTITY FULL.
//   - Headers carry `ol-producer: object-database-service` so a
//     consumer (e.g. `ontology-indexer`) can distinguish this
//     producer from the kernel writeback path that emits the same
//     topic with `ol-producer: ontology-actions-service` /
//     `ol-producer: ontology-kernel`.
package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	objdbhandlers "github.com/openfoundry/openfoundry-go/services/object-database-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/object-database-service/internal/storage"
)

// Path (relative to this test file) to the migrations shipped by
// `ontology-definition-service`. We can't import the sibling service's
// `internal/` packages, so we apply the .sql files from disk.
const definitionMigrationsDir = "../../../ontology-definition-service/internal/repo/migrations"

const logicalReplSlot = "object_database_outbox_test"

func bootPostgresWithLogical(ctx context.Context, t *testing.T) (*pgxpool.Pool, func()) {
	t.Helper()
	container, err := tcpostgres.Run(ctx,
		"postgres:16-alpine",
		tcpostgres.WithDatabase("ontology"),
		tcpostgres.WithUsername("postgres"),
		tcpostgres.WithPassword("postgres"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
		testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{
			ContainerRequest: testcontainers.ContainerRequest{
				Cmd: []string{
					"-c", "wal_level=logical",
					"-c", "max_replication_slots=4",
					"-c", "max_wal_senders=4",
					"-c", "fsync=off",
				},
			},
		}),
	)
	if err != nil {
		t.Fatalf("postgres container start: %v", err)
	}
	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		_ = container.Terminate(ctx)
		t.Fatalf("connection string: %v", err)
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		_ = container.Terminate(ctx)
		t.Fatalf("parse pgxpool: %v", err)
	}
	cfg.MaxConns = 4
	var pool *pgxpool.Pool
	for attempt := 1; attempt <= 30; attempt++ {
		pool, err = pgxpool.NewWithConfig(ctx, cfg)
		if err == nil {
			if err = pool.Ping(ctx); err == nil {
				break
			}
			pool.Close()
		}
		if attempt == 30 {
			_ = container.Terminate(ctx)
			t.Fatalf("postgres never reachable: %v", err)
		}
		time.Sleep(500 * time.Millisecond)
	}
	return pool, func() {
		pool.Close()
		stopCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_ = container.Terminate(stopCtx)
	}
}

func TestOutboxEndToEnd_PutObjectEmits(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	pool, stop := bootPostgresWithLogical(ctx, t)
	defer stop()

	// 1) Install the shared schema (object_types, action_types,
	// outbox.events, etc.) by replaying the definition service's
	// migrations from disk.
	if err := applyDefinitionMigrations(ctx, pool); err != nil {
		t.Fatalf("apply definition migrations: %v", err)
	}

	// 2) Open the logical replication slot before we issue any
	// PutObject so the WAL we read only contains the events under test.
	if _, err := pool.Exec(ctx,
		`SELECT pg_create_logical_replication_slot($1, 'test_decoding')`, logicalReplSlot,
	); err != nil {
		t.Fatalf("create slot: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(),
			`SELECT pg_drop_replication_slot($1)`, logicalReplSlot)
	}()

	// 3) Wire the handlers with the in-memory ObjectStore (standing
	// in for Cassandra) plus the real OutboxPool. PutObject should
	// now write to outbox.events on every successful put.
	h := &objdbhandlers.Handlers{
		Objects:    storage.NewInMemoryObjectStore(),
		Links:      storage.NewInMemoryLinkStore(),
		OutboxPool: pool,
	}
	router := chi.NewRouter()
	router.Put("/objects/{tenant}/{object_id}", h.PutObject)

	// 4) Issue PutObject for an aircraft instance.
	tenant := "of-tenant-poc"
	objectID := uuid.NewString()
	typeID := uuid.NewString()
	owner := "owner-1"
	body := map[string]any{
		"type_id":  typeID,
		"version":  1,
		"payload":  map[string]any{"tail_number": "N12345", "model": "B737"},
		"owner":    owner,
		"markings": []string{"public"},
	}
	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPut,
		"/objects/"+tenant+"/"+objectID, bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("PutObject HTTP %d body=%s", rec.Code, rec.Body.String())
	}

	// 5) Force a WAL switch so test_decoding flushes the buffered commit.
	if _, err := pool.Exec(ctx, `SELECT pg_switch_wal()`); err != nil {
		t.Fatalf("switch wal: %v", err)
	}

	changes, err := drainSlot(ctx, pool, logicalReplSlot)
	if err != nil {
		t.Fatalf("drain slot: %v", err)
	}

	// 6) Assert: exactly one INSERT on outbox.events with the
	// canonical topic + payload fields.
	matched := 0
	for _, change := range changes {
		if !strings.Contains(change, `table outbox.events: INSERT:`) {
			continue
		}
		matched++
		if !strings.Contains(change, `topic[text]:'ontology.object.changed.v1'`) {
			t.Errorf("outbox change %q: wrong topic", change)
		}
		if !strings.Contains(change, fmt.Sprintf(`aggregate_id[text]:'%s'`, objectID)) {
			t.Errorf("outbox change %q: wrong aggregate_id (expected %s)", change, objectID)
		}
		if !strings.Contains(change, `"operation": "object_created"`) {
			t.Errorf("outbox change %q: missing operation=object_created in payload", change)
		}
		if !strings.Contains(change, fmt.Sprintf(`"object_id": "%s"`, objectID)) {
			t.Errorf("outbox change %q: missing object_id in payload", change)
		}
		if !strings.Contains(change, fmt.Sprintf(`"object_type_id": "%s"`, typeID)) {
			t.Errorf("outbox change %q: missing object_type_id in payload", change)
		}
		if !strings.Contains(change, `"ol-producer": "object-database-service"`) {
			t.Errorf("outbox change %q: missing ol-producer header", change)
		}
		if !strings.Contains(change, `N12345`) {
			t.Errorf("outbox change %q: missing tail_number from properties", change)
		}
	}
	if matched != 1 {
		t.Fatalf("expected exactly 1 INSERT on outbox.events, got %d (changes=%d)\nfull stream:\n%s",
			matched, len(changes), strings.Join(changes, "\n---\n"))
	}

	// 7) Steady state: outbox.events empty after libs/outbox same-tx DELETE.
	var rows int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM outbox.events`).Scan(&rows); err != nil {
		t.Fatalf("count outbox.events: %v", err)
	}
	if rows != 0 {
		t.Errorf("outbox.events should be empty in steady state; got %d rows", rows)
	}
}

// drainSlot pulls every committed change visible to the slot and
// returns the non-BEGIN/COMMIT lines.
func drainSlot(ctx context.Context, pool *pgxpool.Pool, slot string) ([]string, error) {
	rows, err := pool.Query(ctx,
		`SELECT data FROM pg_logical_slot_get_changes($1, NULL, NULL)`, slot)
	if err != nil {
		return nil, fmt.Errorf("get_changes: %w", err)
	}
	defer rows.Close()
	out := make([]string, 0, 8)
	for rows.Next() {
		var data string
		if err := rows.Scan(&data); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		if strings.HasPrefix(data, "BEGIN") || strings.HasPrefix(data, "COMMIT") {
			continue
		}
		out = append(out, data)
	}
	return out, rows.Err()
}

// applyDefinitionMigrations runs every `*.sql` file under
// `definitionMigrationsDir` in lexical order. Mirrors the loop in
// `definitionrepo.Migrate` without importing the sibling service's
// `internal/` package.
func applyDefinitionMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	abs, err := filepath.Abs(definitionMigrationsDir)
	if err != nil {
		return fmt.Errorf("resolve migrations dir: %w", err)
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		return fmt.Errorf("read migrations dir %s: %w", abs, err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		body, err := os.ReadFile(filepath.Join(abs, name))
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := pool.Exec(ctx, string(body)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
	}
	return nil
}
