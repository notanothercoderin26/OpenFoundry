// Outbox emission for object-instance mutations.
//
// Mirrors libs/ontology-kernel/domain.ApplyObjectWithOutbox without
// depending on its storage-abstraction adapter. Two reasons for the
// duplication:
//
//   1. The handlers in this service hold `storage.Object` /
//      `storage.ObjectStore` types declared locally in
//      internal/storage; they are field-compatible with their kernel
//      counterparts but Go's type system treats them as distinct.
//   2. The kernel helper accepts a `storageabstraction.ObjectStore`
//      and we don't want to write a one-method adapter just to call
//      it.
//
// The deterministic event_id algorithm IS reused
// (`domain.DeriveEventID`) so retries from this service and the
// kernel converge on the same outbox.events row when they happen to
// mutate the same (tenant, object_id, version).
//
// See PoC/blockers/B03-ontology-indexer.md §G2 for the full
// post-mortem and migration plan.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	domain "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/domain"
	"github.com/openfoundry/openfoundry-go/libs/outbox"
)

// Topic + aggregate constants pinned to the kernel canon. The indexer
// (services/ontology-indexer) subscribes to `ontology.object.changed.v1`
// — see B03 §G1 for why the plural spelling was wrong.
const (
	TopicObjectChangedV1 = "ontology.object.changed.v1"
	AggregateObject      = "object"
)

// objectChangedPayload is the canonical Kafka payload for object
// instance writes. Mirrors libs/ontology-kernel/handlers/objects.ApplyObjectWrite —
// keep the field names in lock-step so a single consumer schema
// covers both producers.
type objectChangedPayload struct {
	ObjectID       string          `json:"object_id"`
	ObjectTypeID   string          `json:"object_type_id"`
	Operation      string          `json:"operation"`
	Properties     json.RawMessage `json:"properties"`
	ActorID        string          `json:"actor_id,omitempty"`
	OrganizationID *string         `json:"organization_id,omitempty"`
	Marking        string          `json:"marking,omitempty"`
	Version        uint64          `json:"version"`
	Deleted        bool            `json:"deleted,omitempty"`
}

// enqueueObjectChanged appends an `ontology.object.changed.v1` event
// to the outbox in a fresh Postgres transaction. The caller is
// expected to have completed the primary write (Cassandra) before
// invoking this helper; the deterministic event_id makes the whole
// chain idempotent on retry.
//
// `pool` may be nil — the helper is a no-op so the legacy direct
// PutObject path (no Postgres pool wired) keeps working in dev /
// in-memory tests. Production deployments fail fast in main.go when
// DATABASE_URL is missing (see services/object-database-service/cmd/.../main.go).
func enqueueObjectChanged(
	ctx context.Context,
	pool *pgxpool.Pool,
	tenant, objectID, typeID string,
	version uint64,
	operation string,
	properties json.RawMessage,
	actorID string,
	organizationID *string,
	marking string,
	deleted bool,
) (uuid.UUID, error) {
	eventID := domain.DeriveEventID(tenant, AggregateObject, objectID, version)
	if pool == nil {
		// Outbox disabled by config; surface the deterministic
		// event_id anyway so callers can log it.
		return eventID, nil
	}

	if properties == nil {
		properties = json.RawMessage(`{}`)
	}
	body, err := json.Marshal(objectChangedPayload{
		ObjectID:       objectID,
		ObjectTypeID:   typeID,
		Operation:      operation,
		Properties:     properties,
		ActorID:        actorID,
		OrganizationID: organizationID,
		Marking:        marking,
		Version:        version,
		Deleted:        deleted,
	})
	if err != nil {
		return eventID, fmt.Errorf("encode object event payload: %w", err)
	}

	evt := outbox.New(eventID, AggregateObject, objectID, TopicObjectChangedV1, body).
		WithHeader("event_type", operation).
		WithHeader("schema_version", "1").
		WithHeader("ol-namespace", "openfoundry.ontology").
		WithHeader("ol-job", operation+"."+AggregateObject).
		WithHeader("ol-producer", "object-database-service")
	if tenant != "" {
		evt.WithHeader("tenant", tenant)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return eventID, fmt.Errorf("begin outbox tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(context.Background())
		}
	}()
	if err := outbox.Enqueue(ctx, tx, evt); err != nil {
		return eventID, fmt.Errorf("enqueue object event: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return eventID, fmt.Errorf("commit outbox tx: %w", err)
	}
	committed = true
	return eventID, nil
}
