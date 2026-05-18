package repo

import (
	"embed"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSplitMigrationChunksReturnsSingleChunkWhenNoMarker(t *testing.T) {
	t.Parallel()
	body := "CREATE TABLE foo (id INT);\nCREATE INDEX bar ON foo(id);\n"
	chunks := splitMigrationChunks(body)
	require.Len(t, chunks, 1)
	assert.Equal(t, body, chunks[0])
}

func TestSplitMigrationChunksSplitsOnMarker(t *testing.T) {
	t.Parallel()
	body := strings.Join([]string{
		"-- phase 1",
		"ALTER TABLE foo ADD COLUMN x INT;",
		"-- TX-BREAK",
		"-- phase 2",
		"UPDATE foo SET x = 1 WHERE x IS NULL;",
		"-- TX-BREAK",
		"-- phase 3",
		"ALTER TABLE foo ALTER COLUMN x SET NOT NULL;",
		"",
	}, "\n")
	chunks := splitMigrationChunks(body)
	require.Len(t, chunks, 3)
	assert.Contains(t, chunks[0], "ADD COLUMN x INT")
	assert.NotContains(t, chunks[0], "UPDATE foo")
	assert.Contains(t, chunks[1], "UPDATE foo")
	assert.NotContains(t, chunks[1], "ADD COLUMN")
	assert.Contains(t, chunks[2], "SET NOT NULL")
}

func TestSplitMigrationChunksIgnoresMarkerWithLeadingWhitespace(t *testing.T) {
	t.Parallel()
	body := "ALTER TABLE foo ADD COLUMN x INT;\n   -- TX-BREAK   \nUPDATE foo SET x = 1;\n"
	chunks := splitMigrationChunks(body)
	require.Len(t, chunks, 2, "marker with surrounding whitespace must still split")
}

func TestSplitMigrationChunksDoesNotSplitOnInlineMarker(t *testing.T) {
	t.Parallel()
	// A marker that's not on its own line (e.g., trailing a statement)
	// must NOT split — otherwise an accidental string match inside a
	// comment or DO $$ block could fracture a migration. Only whole-line
	// matches count.
	body := "ALTER TABLE foo ADD COLUMN x INT; -- TX-BREAK inline note\nUPDATE foo SET x = 1;\n"
	chunks := splitMigrationChunks(body)
	require.Len(t, chunks, 1)
}

// Make sure the actual CRW.1 migration on disk has the marker in place
// and produces the four chunks we expect — guards against a future edit
// silently collapsing back to a single transaction.
func TestCRW1MigrationIsPhased(t *testing.T) {
	t.Parallel()
	body, err := migrationsFS.ReadFile("migrations/20260518000000_code_repository_resource_crw1.sql")
	require.NoError(t, err)
	chunks := splitMigrationChunks(string(body))
	require.Len(t, chunks, 4, "CRW.1 must run as 4 independent transactions")
	assert.Contains(t, chunks[0], "ADD COLUMN IF NOT EXISTS rid")
	assert.Contains(t, chunks[1], "CREATE TRIGGER trg_repository_resource_defaults")
	assert.Contains(t, chunks[2], "UPDATE repositories")
	assert.Contains(t, chunks[3], "ALTER COLUMN rid SET NOT NULL")
	// The trigger MUST be installed before the backfill — that's the
	// whole reason this migration is phased.
	triggerIdx, backfillIdx := -1, -1
	for i, c := range chunks {
		if strings.Contains(c, "CREATE TRIGGER trg_repository_resource_defaults") {
			triggerIdx = i
		}
		if strings.Contains(c, "UPDATE repositories") {
			backfillIdx = i
		}
	}
	assert.Less(t, triggerIdx, backfillIdx,
		"trigger phase must precede backfill phase")
}

// Compile-time sanity: migrationsFS must still embed the migrations dir.
var _ embed.FS = migrationsFS
