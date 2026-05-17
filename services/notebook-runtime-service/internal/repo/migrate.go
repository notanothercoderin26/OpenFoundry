// Package repo owns the notebook-runtime-service's persistent state
// that this service is canonically responsible for.
//
// Historical note: the legacy `notebooks` / `cells` / `sessions` tables
// are provisioned externally (Helm / dev seed) — this package does not
// own their DDL. It DOES own `notebook_kernels`, the session ↔
// upstream-kernel mapping table that backs the jupyter/kernel-gateway
// proxy. Migrate() applies these owned tables idempotently on boot.
package repo

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate applies every embedded migration in lex order. The
// migrations are written to be idempotent (CREATE TABLE IF NOT
// EXISTS, …) so apply-on-boot is safe.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		body, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := pool.Exec(ctx, string(body)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
	}
	return nil
}
