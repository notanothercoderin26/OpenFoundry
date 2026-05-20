package handlers

import (
	"context"
	"crypto/sha256"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/repo"
)

// AppendIdempotencyStore is an optional upcast applied to handlers.Store
// at runtime — matching the same "interface upcast" pattern used by
// catalog_missing.go for the catalog-admin endpoints. Production builds
// have it (Repo implements it); the in-memory test fakes that don't
// implement it fall back to the original "always commit" behaviour so
// pre-existing tests stay green.
type AppendIdempotencyStore interface {
	// LookupAppendIdempotency returns the prior record for the
	// (idempotency_key, table_id) pair. Found=false means "no prior
	// commit under this key — caller should proceed".
	LookupAppendIdempotency(ctx context.Context, key string, tableID uuid.UUID) (record *repo.AppendIdempotencyRecord, found bool, err error)
	// RecordAppendIdempotency persists the dedup tuple. Returns
	// repo.ErrAppendIdempotencyRace when another concurrent submission
	// for the same key beat us to the insert — the caller should
	// re-Lookup and treat the race result the same way as a duplicate
	// submission.
	RecordAppendIdempotency(ctx context.Context, record repo.AppendIdempotencyRecord) error
}

// hashAppendRequest returns sha256 over the raw HTTP body. The client
// has full control over byte-equality semantics (the same intent must
// re-serialize identically), which is the contract clients already
// expect from idempotency keys on stripe-style APIs.
func hashAppendRequest(rawBody []byte) []byte {
	sum := sha256.Sum256(rawBody)
	return sum[:]
}
