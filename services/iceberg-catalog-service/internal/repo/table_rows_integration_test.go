//go:build integration

// Postgres-backed integration tests for the Phase-B row storage path.
// Validates B06 §AC#1 + #3: an AppendBatch creates a fresh Iceberg
// snapshot, rows are persisted under that snapshot, ScanRows returns
// them in order, and a re-run with new rows produces a new snapshot
// without silently appending.

package repo

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	testingx "github.com/openfoundry/openfoundry-go/libs/testing"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/models"
)

func bootRepo(t *testing.T) *Repo {
	t.Helper()
	ctx := context.Background()
	h := testingx.BootPostgres(ctx, t)
	require.NoError(t, Migrate(ctx, h.Pool))
	return &Repo{Pool: h.Pool}
}

func seedTable(t *testing.T, r *Repo) (*models.IcebergTable, uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	owner := uuid.New()
	_, err := r.CreateNamespace(ctx, &models.CreateNamespaceRequest{
		ProjectRID: "ri.compass.main.folder.test",
		Name:       "events",
	}, owner)
	require.NoError(t, err)
	schemaJSON := mustJSON(t, map[string]any{
		"schema-id": 0, "type": "struct",
		"fields": []map[string]any{
			{"id": 1, "name": "id", "type": "string", "required": true},
			{"id": 2, "name": "ts", "type": "long", "required": true},
		},
	})
	table, _, err := r.CreateTable(ctx, "ri.compass.main.folder.test", []string{"events"}, &models.CreateTableRequest{
		Name:   "logins",
		Schema: schemaJSON,
	}, owner)
	require.NoError(t, err)
	return table, owner
}

func commitAppendSnapshot(t *testing.T, r *Repo, table *models.IcebergTable, snapshotID int64, rows []map[string]any) {
	t.Helper()
	ctx := context.Background()
	summary := mustJSON(t, map[string]any{"operation": "append"})
	snapshot := mustJSON(t, map[string]any{
		"snapshot-id":     snapshotID,
		"sequence-number": table.LastSequenceNumber + 1,
		"manifest-list":   "s3://x/manifests/" + uuid.NewString() + ".avro",
		"summary":         json.RawMessage(summary),
		"schema-id":       0,
	})
	commit := &models.CommitTableRequest{
		Identifier: &models.TableIdentifier{Namespace: []string{"events"}, Name: "logins"},
		Updates: []json.RawMessage{mustJSON(t, map[string]any{
			"action":   "add-snapshot",
			"snapshot": json.RawMessage(snapshot),
		})},
	}
	_, _, err := r.CommitTable(ctx, "ri.compass.main.folder.test", []string{"events"}, "logins", commit)
	require.NoError(t, err)
	require.NoError(t, r.InsertRowsForSnapshot(ctx, table.ID, snapshotID, rows))
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return b
}

func TestIntegration_InsertRowsForSnapshot_AndScanRows(t *testing.T) {
	r := bootRepo(t)
	table, _ := seedTable(t, r)

	rows := []map[string]any{
		{"id": "a", "ts": int64(1700000001)},
		{"id": "b", "ts": int64(1700000002)},
		{"id": "c", "ts": int64(1700000003)},
	}
	commitAppendSnapshot(t, r, table, 1, rows)

	out, snapshotID, err := r.ScanRows(context.Background(), ScanRowsRequest{TableID: table.ID})
	require.NoError(t, err)
	assert.Equal(t, int64(1), snapshotID)
	require.Len(t, out, 3)
	assert.Equal(t, "a", out[0]["id"])
	assert.Equal(t, "c", out[2]["id"])
}

func TestIntegration_ScanRows_NewSnapshotReplacesOldVisibility(t *testing.T) {
	r := bootRepo(t)
	table, _ := seedTable(t, r)

	// First snapshot with 2 rows.
	commitAppendSnapshot(t, r, table, 1, []map[string]any{
		{"id": "old-1"}, {"id": "old-2"},
	})
	// Second snapshot with different rows.
	commitAppendSnapshot(t, r, table, 2, []map[string]any{
		{"id": "new-1"}, {"id": "new-2"}, {"id": "new-3"},
	})

	// Default scan resolves to the latest snapshot — the second one.
	out, latest, err := r.ScanRows(context.Background(), ScanRowsRequest{TableID: table.ID})
	require.NoError(t, err)
	assert.Equal(t, int64(2), latest, "default scan returns the most recent snapshot")
	require.Len(t, out, 3)
	assert.Equal(t, "new-1", out[0]["id"])

	// Explicitly pinning the first snapshot still surfaces the old rows.
	snap1 := int64(1)
	out, sid, err := r.ScanRows(context.Background(), ScanRowsRequest{TableID: table.ID, SnapshotID: &snap1})
	require.NoError(t, err)
	assert.Equal(t, int64(1), sid)
	require.Len(t, out, 2)
	assert.Equal(t, "old-1", out[0]["id"])
}

func TestIntegration_ScanRows_LimitAndOffsetPaginate(t *testing.T) {
	r := bootRepo(t)
	table, _ := seedTable(t, r)
	rows := make([]map[string]any, 0, 10)
	for i := 0; i < 10; i++ {
		rows = append(rows, map[string]any{"id": "r-" + string(rune('a'+i))})
	}
	commitAppendSnapshot(t, r, table, 1, rows)
	first, _, err := r.ScanRows(context.Background(), ScanRowsRequest{TableID: table.ID, Limit: 3})
	require.NoError(t, err)
	require.Len(t, first, 3)
	second, _, err := r.ScanRows(context.Background(), ScanRowsRequest{TableID: table.ID, Limit: 3, Offset: 3})
	require.NoError(t, err)
	require.Len(t, second, 3)
	assert.NotEqual(t, first[0]["id"], second[0]["id"])
}

func TestIntegration_ScanRows_UnknownSnapshotReturnsSentinel(t *testing.T) {
	r := bootRepo(t)
	table, _ := seedTable(t, r)
	snapshot := int64(99999)
	_, _, err := r.ScanRows(context.Background(), ScanRowsRequest{TableID: table.ID, SnapshotID: &snapshot})
	require.ErrorIs(t, err, ErrRowsNoSnapshot)
}
