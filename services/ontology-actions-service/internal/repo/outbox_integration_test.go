//go:build integration

// End-to-end verification of the action-type CRUD path lifted out of
// the kernel (B02 §Deferred follow-up — closed). The test starts a
// real Postgres with `wal_level=logical`, applies the
// `ontology-definition-service` migrations (which install both the
// `action_types` and `outbox.events` tables in the shared
// `openfoundry_ontology_service` database), opens a `test_decoding`
// logical replication slot, exercises Create / Update / Delete on
// the lifted Repo, and asserts that exactly three INSERTs to
// `outbox.events` land in the WAL with the expected topic
// (`ontology.action_type.changed.v1`) and event-type discriminators
// (`created`, `updated`, `deleted`).
//
// The test purposely does NOT spin up the kernel — it talks to the
// new `repo.Repo` directly. The kernel-side List / Get / Validate /
// Execute paths are out of scope here; their behavior is unchanged
// by the lift and is already covered by the kernel's own tests.
package repo_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	kmodels "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/models"
	actionsrepo "github.com/openfoundry/openfoundry-go/services/ontology-actions-service/internal/repo"
)

// Path (relative to this test file) to the migrations shipped by
// `ontology-definition-service`. We can't import the sibling service's
// `internal/` packages because Go's visibility rule forbids it, so we
// load the .sql files from disk at test setup time.
const definitionMigrationsDir = "../../../ontology-definition-service/internal/repo/migrations"

const logicalReplSlot = "action_types_outbox_test"

// bootPostgresWithLogical mirrors the helper used by the definition
// service integration test. Kept local to avoid a cross-service
// dependency for test-only infrastructure.
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

func TestOutboxEndToEnd_ActionTypeLifecycle(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	pool, stop := bootPostgresWithLogical(ctx, t)
	defer stop()

	// 1) Bring up the shared schema by applying every .sql under
	// `ontology-definition-service/internal/repo/migrations/`. Both
	// services share the database, so the same migrations install
	// the tables the action repo needs (`action_types`,
	// `object_types`, `outbox.events`).
	if err := applyDefinitionMigrations(ctx, pool); err != nil {
		t.Fatalf("apply definition migrations: %v", err)
	}

	// 2) Seed an object type the action type can reference. The
	// action_types FK requires a real object_types row.
	objectTypeID := uuid.New()
	ownerID := uuid.New()
	if _, err := pool.Exec(ctx,
		`INSERT INTO ontology_schema.object_types
		   (id, name, display_name, description, owner_id)
		 VALUES ($1, $2, $3, $4, $5)`,
		objectTypeID, "Aircraft", "Aircraft",
		"Aviation airframe (action_type test fixture).", ownerID); err != nil {
		t.Fatalf("seed object_type: %v", err)
	}

	// 3) Open the logical replication slot AFTER the object_type
	// seed so the WAL we read only contains action-type events.
	if _, err := pool.Exec(ctx,
		`SELECT pg_create_logical_replication_slot($1, 'test_decoding')`, logicalReplSlot,
	); err != nil {
		t.Fatalf("create slot: %v", err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(),
			`SELECT pg_drop_replication_slot($1)`, logicalReplSlot)
	}()

	// 4) Exercise the lifted CRUD path.
	actRepo := &actionsrepo.Repo{Pool: pool}
	actor := uuid.New()

	desc := "Schedule an A-check on this airframe."
	created, err := actRepo.CreateActionType(ctx, &kmodels.CreateActionTypeRequest{
		Name:          "schedule_a_check",
		DisplayName:   ptr("Schedule A-check"),
		Description:   &desc,
		ObjectTypeID:  objectTypeID,
		OperationKind: "update_object",
	}, actor)
	if err != nil {
		t.Fatalf("CreateActionType: %v", err)
	}
	if created == nil {
		t.Fatal("CreateActionType returned nil")
	}

	newDisplay := "Schedule A-check (mid-week)"
	if _, err := actRepo.UpdateActionType(ctx, created.ID,
		&kmodels.UpdateActionTypeRequest{DisplayName: &newDisplay}, actor); err != nil {
		t.Fatalf("UpdateActionType: %v", err)
	}

	if _, err := actRepo.DeleteActionType(ctx, created.ID, actor); err != nil {
		t.Fatalf("DeleteActionType: %v", err)
	}

	// 5) Force a WAL segment switch so test_decoding flushes the
	// buffered commits.
	if _, err := pool.Exec(ctx, `SELECT pg_switch_wal()`); err != nil {
		t.Fatalf("switch wal: %v", err)
	}

	changes, err := drainSlot(ctx, pool, logicalReplSlot)
	if err != nil {
		t.Fatalf("drain slot: %v", err)
	}

	// 6) Expect exactly three INSERTs to outbox.events with the
	// canonical action_type topic. Each carries the matching
	// event_type ("created", "updated", "deleted") in payload and on
	// the Kafka record headers.
	want := []string{"created", "updated", "deleted"}
	got := 0
	for _, change := range changes {
		if !strings.Contains(change, `table outbox.events: INSERT:`) {
			continue
		}
		if !strings.Contains(change, `topic[text]:'ontology.action_type.changed.v1'`) {
			t.Errorf("action_type change %q: wrong topic", change)
		}
		if !strings.Contains(change, fmt.Sprintf(`aggregate_id[text]:'%s'`, created.ID)) {
			t.Errorf("action_type change %q: wrong aggregate_id", change)
		}
		if !strings.Contains(change, `"ol-producer": "ontology-actions-service"`) {
			t.Errorf("action_type change %q: missing ol-producer header", change)
		}
		if got >= len(want) {
			t.Errorf("more than %d INSERTs on outbox.events", len(want))
			break
		}
		expected := fmt.Sprintf(`"event_type": "%s"`, want[got])
		if !strings.Contains(change, expected) {
			t.Errorf("INSERT #%d: expected %q in payload, got %q", got, expected, change)
		}
		got++
	}
	if got != 3 {
		t.Fatalf("expected 3 INSERTs on outbox.events, got %d (changes=%d)\nfull stream:\n%s",
			got, len(changes), strings.Join(changes, "\n---\n"))
	}

	// 7) Steady state: outbox.events empty.
	var rows int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM outbox.events`).Scan(&rows); err != nil {
		t.Fatalf("count outbox.events: %v", err)
	}
	if rows != 0 {
		t.Errorf("outbox.events should be empty after libs/outbox same-tx DELETE; got %d rows", rows)
	}

	// 8) Steady state: action_types row gone after Delete.
	var atRows int
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM ontology_schema.action_types WHERE id = $1`,
		created.ID).Scan(&atRows); err != nil {
		t.Fatalf("count action_types: %v", err)
	}
	if atRows != 0 {
		t.Errorf("action_types row should be deleted; got %d rows", atRows)
	}
}

// drainSlot pulls every change visible on the slot and discards
// BEGIN/COMMIT markers so callers only deal with table-level events.
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

func ptr[T any](v T) *T { return &v }

// applyDefinitionMigrations reads every `*.sql` file under
// `definitionMigrationsDir` in lexical order and executes it against
// the given pool. Mirrors the behaviour of `definitionrepo.Migrate`
// without importing the sibling service's `internal/` package (Go
// visibility rule).
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

// Compile-time anchor for unused imports.
var _ = json.RawMessage("")
