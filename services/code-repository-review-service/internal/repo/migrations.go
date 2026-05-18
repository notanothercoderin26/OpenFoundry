// Package repo holds the SQL queries + migration runner for
// code-repository-review-service.
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

// txBreakMarker splits a single migration file into independent
// chunks, each run as its own pool.Exec (and therefore its own
// implicit transaction). Use it inside a migration when a phase must
// commit before the next one — typically when a fast schema change
// must be durable before a long-running backfill, so a backfill
// timeout doesn't roll back the schema additions. Migrations that
// don't include the marker run as one chunk (pgx multi-statement
// Exec is atomic in PostgreSQL's simple query protocol).
const txBreakMarker = "-- TX-BREAK"

// Migrate applies every embedded `migrations/*.sql` file in lexical
// order. Migrations are idempotent (CREATE TABLE IF NOT EXISTS).
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
		chunks := splitMigrationChunks(string(body))
		for i, chunk := range chunks {
			if strings.TrimSpace(chunk) == "" {
				continue
			}
			if _, err := pool.Exec(ctx, chunk); err != nil {
				if len(chunks) == 1 {
					return fmt.Errorf("apply %s: %w", name, err)
				}
				return fmt.Errorf("apply %s (chunk %d/%d): %w", name, i+1, len(chunks), err)
			}
		}
	}
	return nil
}

// splitMigrationChunks splits a migration body on `-- TX-BREAK` lines.
// The marker is matched as a whole line (leading/trailing whitespace
// allowed) so it cannot be confused with an inline comment. Returns
// the original body in a single-element slice when no marker is
// present.
func splitMigrationChunks(body string) []string {
	if !strings.Contains(body, txBreakMarker) {
		return []string{body}
	}
	lines := strings.Split(body, "\n")
	var chunks []string
	var current strings.Builder
	for _, line := range lines {
		if strings.TrimSpace(line) == txBreakMarker {
			chunks = append(chunks, current.String())
			current.Reset()
			continue
		}
		current.WriteString(line)
		current.WriteByte('\n')
	}
	chunks = append(chunks, current.String())
	return chunks
}
