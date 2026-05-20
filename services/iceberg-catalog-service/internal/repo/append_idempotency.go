package repo

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// AppendIdempotencyRecord is the row persisted by the append handler
// after a successful commit so a redelivery (same Idempotency-Key,
// same body) returns the original snapshot instead of producing a new
// one. Lives in repo so the handler can import this type without
// flipping the dep direction.
type AppendIdempotencyRecord struct {
	IdempotencyKey   string
	TableID          uuid.UUID
	RequestHash      []byte
	SnapshotID       int64
	MetadataLocation string
}

// ErrAppendIdempotencyRace signals that an INSERT into
// iceberg_append_idempotency lost a unique-key race against a
// concurrent submission with the same (idempotency_key, table_id).
// The handler resolves the race by re-Lookup and applying the same
// replay / conflict semantics.
var ErrAppendIdempotencyRace = errors.New("append idempotency: concurrent insert")

// LookupAppendIdempotency returns the record persisted by a prior
// successful append under the same (key, table) pair, if any.
func (r *Repo) LookupAppendIdempotency(
	ctx context.Context,
	key string,
	tableID uuid.UUID,
) (*AppendIdempotencyRecord, bool, error) {
	const q = `
		SELECT idempotency_key, table_id, request_hash, snapshot_id, metadata_location
		  FROM iceberg_append_idempotency
		 WHERE idempotency_key = $1 AND table_id = $2`
	var rec AppendIdempotencyRecord
	err := r.Pool.QueryRow(ctx, q, key, tableID).Scan(
		&rec.IdempotencyKey,
		&rec.TableID,
		&rec.RequestHash,
		&rec.SnapshotID,
		&rec.MetadataLocation,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return &rec, true, nil
}

// RecordAppendIdempotency inserts the dedup row produced by a
// successful append. Returns ErrAppendIdempotencyRace when the unique
// key was already taken by a concurrent winner.
func (r *Repo) RecordAppendIdempotency(ctx context.Context, rec AppendIdempotencyRecord) error {
	const q = `
		INSERT INTO iceberg_append_idempotency
		       (idempotency_key, table_id, request_hash, snapshot_id, metadata_location)
		VALUES ($1, $2, $3, $4, $5)`
	_, err := r.Pool.Exec(ctx, q,
		rec.IdempotencyKey, rec.TableID, rec.RequestHash, rec.SnapshotID, rec.MetadataLocation,
	)
	if err == nil {
		return nil
	}
	// 23505 = unique_violation. Same PK already taken by a concurrent winner.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrAppendIdempotencyRace
	}
	return err
}
