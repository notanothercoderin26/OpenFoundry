// Phase-B row storage backing /openfoundry/iceberg/v1/{append,scan}.
//
// See migrations/20260520130000_iceberg_table_rows.sql for the
// rationale: production deployments swap the AppendBatch handler to
// write Parquet against object storage. The PoC stores rows in
// Postgres so pipeline-runtime can read them back end-to-end without
// an object-store round-trip. The interface here is stable across the
// swap — callers always go through the catalog's HTTP surface.

package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/models"
)

// ErrRowsNoSnapshot indicates the requested table/snapshot pair has
// no rows persisted. Handlers map this to 200 + empty rows for the
// scan endpoint (a snapshot with zero rows is a valid state).
var ErrRowsNoSnapshot = errors.New("iceberg table rows: no snapshot found")

// InsertRowsForSnapshot bulk-inserts the supplied rows under the
// (table_id, snapshot_id) pair. Caller is responsible for having
// committed the snapshot first via CommitTable — we look up the
// snapshot's BIGSERIAL pk before the insert.
//
// Each row gets a deterministic row_index starting at 0; callers that
// need stable ordering should pre-sort.
func (r *Repo) InsertRowsForSnapshot(ctx context.Context, tableID uuid.UUID, snapshotID int64, rows []map[string]any) error {
	if len(rows) == 0 {
		return nil
	}
	var snapshotPK int64
	if err := r.Pool.QueryRow(ctx,
		`SELECT id FROM iceberg_snapshots WHERE table_id = $1 AND snapshot_id = $2`,
		tableID, snapshotID,
	).Scan(&snapshotPK); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("snapshot %d not found for table %s: %w", snapshotID, tableID, ErrRowsNoSnapshot)
		}
		return fmt.Errorf("lookup snapshot pk: %w", err)
	}

	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	batch := &pgx.Batch{}
	for i, row := range rows {
		payload, err := json.Marshal(row)
		if err != nil {
			return fmt.Errorf("encode row %d: %w", i, err)
		}
		batch.Queue(
			`INSERT INTO iceberg_table_rows (table_id, snapshot_pk, row_index, payload)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (table_id, snapshot_pk, row_index) DO UPDATE SET payload = EXCLUDED.payload`,
			tableID, snapshotPK, i, payload,
		)
	}
	br := tx.SendBatch(ctx, batch)
	for range rows {
		if _, err := br.Exec(); err != nil {
			_ = br.Close()
			return fmt.Errorf("batch insert: %w", err)
		}
	}
	if err := br.Close(); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ScanRowsRequest narrows a /scan invocation.
type ScanRowsRequest struct {
	TableID    uuid.UUID
	SnapshotID *int64 // nil = current snapshot of the table's main branch
	Limit      int    // 0 = unlimited
	Offset     int
}

// ScanRows returns rows for the requested snapshot in row_index order.
// When SnapshotID is nil the helper resolves the table's current
// snapshot (via iceberg_table_branches.main, falling back to the
// latest by sequence_number). An unknown snapshot returns the
// ErrRowsNoSnapshot sentinel.
func (r *Repo) ScanRows(ctx context.Context, req ScanRowsRequest) ([]map[string]any, int64, error) {
	snapshotPK, snapshotID, err := r.resolveSnapshotPK(ctx, req.TableID, req.SnapshotID)
	if err != nil {
		return nil, 0, err
	}

	q := `SELECT payload FROM iceberg_table_rows
	      WHERE snapshot_pk = $1 ORDER BY row_index`
	args := []any{snapshotPK}
	if req.Limit > 0 {
		q += fmt.Sprintf(" LIMIT $%d", len(args)+1)
		args = append(args, req.Limit)
	}
	if req.Offset > 0 {
		q += fmt.Sprintf(" OFFSET $%d", len(args)+1)
		args = append(args, req.Offset)
	}
	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("scan rows: %w", err)
	}
	defer rows.Close()
	out := make([]map[string]any, 0, req.Limit)
	for rows.Next() {
		var payload []byte
		if err := rows.Scan(&payload); err != nil {
			return nil, 0, err
		}
		row := map[string]any{}
		if err := json.Unmarshal(payload, &row); err != nil {
			return nil, 0, fmt.Errorf("decode row: %w", err)
		}
		out = append(out, row)
	}
	return out, snapshotID, rows.Err()
}

// resolveSnapshotPK maps an optional Iceberg snapshot_id to the
// catalog's internal BIGSERIAL pk. Returns the snapshot_id as a
// second value so the scan endpoint can echo it back to the caller.
func (r *Repo) resolveSnapshotPK(ctx context.Context, tableID uuid.UUID, snapshotID *int64) (int64, int64, error) {
	if snapshotID != nil {
		var pk int64
		err := r.Pool.QueryRow(ctx,
			`SELECT id FROM iceberg_snapshots WHERE table_id = $1 AND snapshot_id = $2`,
			tableID, *snapshotID,
		).Scan(&pk)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, 0, ErrRowsNoSnapshot
		}
		if err != nil {
			return 0, 0, err
		}
		return pk, *snapshotID, nil
	}
	// Current snapshot of the table's main branch — or, fallback,
	// latest by sequence_number.
	var pk, sid int64
	err := r.Pool.QueryRow(ctx,
		`SELECT s.id, s.snapshot_id
		   FROM iceberg_snapshots s
		   JOIN iceberg_table_branches b
		     ON b.table_id = s.table_id
		    AND b.snapshot_id = s.snapshot_id
		    AND b.name IN ('main', 'master')
		  WHERE s.table_id = $1
		  ORDER BY s.sequence_number DESC
		  LIMIT 1`,
		tableID,
	).Scan(&pk, &sid)
	if errors.Is(err, pgx.ErrNoRows) {
		// No main branch reference yet — fall back to the absolute
		// latest snapshot for this table.
		err = r.Pool.QueryRow(ctx,
			`SELECT id, snapshot_id
			   FROM iceberg_snapshots
			  WHERE table_id = $1
			  ORDER BY sequence_number DESC
			  LIMIT 1`,
			tableID,
		).Scan(&pk, &sid)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, 0, ErrRowsNoSnapshot
		}
	}
	if err != nil {
		return 0, 0, err
	}
	return pk, sid, nil
}

// Compile-time check: keep IcebergTable importable here without an
// unused-import flag.
var _ = (*models.IcebergTable)(nil)
