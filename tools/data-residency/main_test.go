package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func newFixtureRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, ".github", "data-residency-allowlist.yaml"), `
version: 1
default_regions: [us-east-1, eu-west-1]
default_marking_tags: [public, internal]
services:
  identity-federation-service:
    regions: [us-east-1, eu-west-1]
    marking_tags: [public, internal, pii]
    grandfathered_migrations:
      - 0001_grandfathered.sql
  payments-service:
    regions: [us-east-1]
restricted_tables:
  users:
    allowed_services: [identity-federation-service]
  audit_events:
    allowed_services: [audit-compliance-service]
grandfathered_handler_queries:
  - file: services/legacy-service/internal/handlers/legacy.go
    table: audit_events
`)
	return root
}

func TestLoadAllowlist(t *testing.T) {
	root := newFixtureRoot(t)
	al, err := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if al.Version != 1 {
		t.Fatalf("version: got %d", al.Version)
	}
	if got := al.Services["identity-federation-service"].Regions; len(got) != 2 || got[0] != "us-east-1" {
		t.Fatalf("identity regions: %v", got)
	}
	if got := al.RestrictedTables["users"].AllowedServices; len(got) != 1 || got[0] != "identity-federation-service" {
		t.Fatalf("users allowed: %v", got)
	}
	if len(al.GrandfatheredQueries) != 1 {
		t.Fatalf("grandfathered queries: %+v", al.GrandfatheredQueries)
	}
}

func TestCheckMigrationsHappyPath(t *testing.T) {
	root := newFixtureRoot(t)
	al, err := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	mig := filepath.Join(root, "services", "identity-federation-service", "internal", "repo", "migrations")
	writeFile(t, filepath.Join(mig, "0002_new.sql"), "-- residency: us-east-1\nCREATE TABLE foo();\n")
	v, err := checkMigrations(root, al, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 0 {
		t.Fatalf("expected 0 violations, got: %+v", v)
	}
}

func TestCheckMigrationsMissingHeader(t *testing.T) {
	root := newFixtureRoot(t)
	al, _ := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	mig := filepath.Join(root, "services", "identity-federation-service", "internal", "repo", "migrations")
	writeFile(t, filepath.Join(mig, "0002_new.sql"), "-- a comment\nCREATE TABLE foo();\n")
	v, err := checkMigrations(root, al, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 1 || v[0].Kind != "migration_missing_residency" {
		t.Fatalf("expected missing header violation, got: %+v", v)
	}
}

func TestCheckMigrationsRegionNotAllowed(t *testing.T) {
	root := newFixtureRoot(t)
	al, _ := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	mig := filepath.Join(root, "services", "payments-service", "internal", "repo", "migrations")
	writeFile(t, filepath.Join(mig, "0001_new.sql"), "-- residency: eu-central-1\n")
	v, err := checkMigrations(root, al, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 1 || v[0].Kind != "migration_region_not_allowed" || v[0].Region != "eu-central-1" {
		t.Fatalf("expected region-not-allowed violation, got: %+v", v)
	}
}

func TestCheckMigrationsGrandfathered(t *testing.T) {
	root := newFixtureRoot(t)
	al, _ := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	mig := filepath.Join(root, "services", "identity-federation-service", "internal", "repo", "migrations")
	// Grandfathered file with no residency header — should be exempt.
	writeFile(t, filepath.Join(mig, "0001_grandfathered.sql"), "CREATE TABLE legacy();\n")
	v, err := checkMigrations(root, al, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 0 {
		t.Fatalf("grandfathered should be exempt, got: %+v", v)
	}
}

func TestCheckMigrationsGateNewOnly(t *testing.T) {
	root := newFixtureRoot(t)
	al, _ := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	mig := filepath.Join(root, "services", "identity-federation-service", "internal", "repo", "migrations")
	// Existing grandfathered file without a header — must remain ignored.
	writeFile(t, filepath.Join(mig, "0001_grandfathered.sql"), "CREATE TABLE legacy();\n")
	// New file without a header — only this one should be flagged.
	newRel := "services/identity-federation-service/internal/repo/migrations/0002_new.sql"
	writeFile(t, filepath.Join(root, newRel), "CREATE TABLE new_table();\n")
	addedSet := map[string]bool{newRel: true}
	v, err := checkMigrations(root, al, true, addedSet)
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 1 || !strings.HasSuffix(v[0].File, "0002_new.sql") {
		t.Fatalf("expected only the new file to be flagged, got: %+v", v)
	}
}

func TestCheckMigrationsGateNewOnlyIgnoresEvenGrandfatheredNewAdd(t *testing.T) {
	// If a file appears as added in the diff, the grandfathered list must
	// not exempt it — grandfathering only protects pre-existing files.
	root := newFixtureRoot(t)
	al, _ := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	mig := filepath.Join(root, "services", "identity-federation-service", "internal", "repo", "migrations")
	newRel := "services/identity-federation-service/internal/repo/migrations/0001_grandfathered.sql"
	writeFile(t, filepath.Join(mig, "0001_grandfathered.sql"), "CREATE TABLE legacy();\n")
	v, err := checkMigrations(root, al, true, map[string]bool{newRel: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 1 {
		t.Fatalf("expected the file to be flagged despite being in grandfathered list, got: %+v", v)
	}
}

func TestCheckHandlersAllowedService(t *testing.T) {
	root := newFixtureRoot(t)
	al, _ := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	hand := filepath.Join(root, "services", "identity-federation-service", "internal", "handlers")
	writeFile(t, filepath.Join(hand, "users.go"), `package handlers

func F(pool any) {
	_, _ = pool.Query(ctx, "SELECT * FROM users WHERE id = $1", id)
}
`)
	v, err := checkHandlers(root, al)
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 0 {
		t.Fatalf("identity is allowed to read users, got: %+v", v)
	}
}

func TestCheckHandlersForbiddenService(t *testing.T) {
	root := newFixtureRoot(t)
	al, _ := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	hand := filepath.Join(root, "services", "payments-service", "internal", "handlers")
	writeFile(t, filepath.Join(hand, "x.go"), `package handlers

func F(pool any) {
	row := pool.QueryRow(ctx, ` + "`SELECT email FROM users WHERE id = $1`" + `, id)
	_ = row
}
`)
	v, err := checkHandlers(root, al)
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 1 || v[0].Kind != "handler_restricted_table_access" || v[0].Table != "users" {
		t.Fatalf("expected forbidden handler violation, got: %+v", v)
	}
}

func TestCheckHandlersGrandfathered(t *testing.T) {
	root := newFixtureRoot(t)
	al, _ := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	hand := filepath.Join(root, "services", "legacy-service", "internal", "handlers")
	writeFile(t, filepath.Join(hand, "legacy.go"), `package handlers

func F(pool any) {
	_, _ = pool.Exec(ctx, "INSERT INTO audit_events (id) VALUES ($1)", id)
}
`)
	v, err := checkHandlers(root, al)
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 0 {
		t.Fatalf("grandfathered query should be exempt, got: %+v", v)
	}
}

func TestCheckHandlersIgnoresComments(t *testing.T) {
	root := newFixtureRoot(t)
	al, _ := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	hand := filepath.Join(root, "services", "payments-service", "internal", "handlers")
	writeFile(t, filepath.Join(hand, "x.go"), `package handlers

// FROM users in a comment must not trigger a violation.
func F(pool any) {
	/* SELECT FROM users another comment */
	_, _ = pool.Exec(ctx, "SELECT 1")
}
`)
	v, err := checkHandlers(root, al)
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 0 {
		t.Fatalf("comments must not trip the gate, got: %+v", v)
	}
}

func TestCheckHandlersWordBoundary(t *testing.T) {
	// "users_archive" is not "users". The check must use word boundaries.
	root := newFixtureRoot(t)
	al, _ := loadAllowlist(filepath.Join(root, ".github", "data-residency-allowlist.yaml"))
	hand := filepath.Join(root, "services", "payments-service", "internal", "handlers")
	writeFile(t, filepath.Join(hand, "x.go"), `package handlers

func F(pool any) {
	_, _ = pool.Query(ctx, "SELECT * FROM users_archive")
}
`)
	v, err := checkHandlers(root, al)
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 0 {
		t.Fatalf("users_archive must not match users, got: %+v", v)
	}
}

func TestStripGoCommentsPreservesStrings(t *testing.T) {
	in := "// comment\n\"FROM users // not a comment\" /* block */ /*x*/ x"
	out := stripGoComments(in)
	if !strings.Contains(out, "FROM users // not a comment") {
		t.Fatalf("string contents lost: %q", out)
	}
	if strings.Contains(out, "block") {
		t.Fatalf("block comment not stripped: %q", out)
	}
}

func TestFindMatchingParen(t *testing.T) {
	s := `pool.Query(ctx, "SELECT (a)", arg)`
	open := strings.IndexByte(s, '(')
	close := findMatchingParen(s, open)
	if close != len(s)-1 {
		t.Fatalf("close idx: got %d want %d", close, len(s)-1)
	}
}
