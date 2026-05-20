// Outbox envelope helper for `ontology-actions-service`.
//
// This is the action-type sibling of
// `services/ontology-definition-service/internal/repo/events.go`. The
// two services share the `openfoundry_ontology_service` Postgres
// database, the `outbox.events` table (installed by the definition
// service's migration `0008_ontology_schema_outbox.sql`), and the
// `outbox-pg-schemas` Debezium connector, so action-type events flow
// over the same WAL → Kafka path as object-type events.
//
// **Duplication TODO** (B02 §Deferred follow-up): once a third
// service-internal producer appears, lift this file + the matching
// helper in `ontology-definition-service` into `libs/ontology-outbox`
// or similar. For now keeping the copy local avoids a cross-service
// dependency hop and keeps the lift commit minimal.
package repo

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/openfoundry/openfoundry-go/libs/outbox"
)

// Topic + aggregate for action-type schema mutations. Kept in sync
// with the constants in
// `services/ontology-definition-service/internal/repo/events.go`
// (`TopicActionType`, `AggregateActionType`).
const (
	TopicActionType     = "ontology.action_type.changed.v1"
	AggregateActionType = "ontology_action_type"
)

// EventType is the discriminator copied into the envelope and onto the
// Kafka record headers so consumers can filter without parsing the
// payload.
type EventType string

const (
	EventCreated EventType = "created"
	EventUpdated EventType = "updated"
	EventDeleted EventType = "deleted"
)

// SchemaEventEnvelope is the canonical payload appended to outbox.events.
// Identical shape to the sibling envelope owned by
// `ontology-definition-service`.
type SchemaEventEnvelope struct {
	SchemaVersion int             `json:"schema_version"`
	EventType     EventType       `json:"event_type"`
	Aggregate     string          `json:"aggregate"`
	AggregateID   string          `json:"aggregate_id"`
	ActorID       uuid.UUID       `json:"actor_id"`
	OccurredAt    time.Time       `json:"occurred_at"`
	Before        json.RawMessage `json:"before,omitempty"`
	After         json.RawMessage `json:"after,omitempty"`
}

// EventOptions carries the inputs required to build and enqueue a
// single action-type mutation event.
type EventOptions struct {
	AggregateID string
	EventType   EventType
	ActorID     uuid.UUID
	Version     int
	Before      any
	After       any
	Lineage     map[string]string
}

// EnqueueActionTypeEvent builds the canonical envelope, computes a
// deterministic event_id and appends to outbox.events through
// libs/outbox.Enqueue.
//
// `tx` must be the same transaction the caller used for the primary
// write; the helper does not own the transaction lifecycle.
func EnqueueActionTypeEvent(ctx context.Context, tx pgx.Tx, opts EventOptions) error {
	if opts.AggregateID == "" {
		return fmt.Errorf("outbox enqueue: aggregate_id required")
	}
	if opts.EventType == "" {
		return fmt.Errorf("outbox enqueue: event_type required")
	}

	occurred := time.Now().UTC()
	beforeRaw, err := marshalOrNil(opts.Before)
	if err != nil {
		return fmt.Errorf("outbox enqueue: marshal before: %w", err)
	}
	afterRaw, err := marshalOrNil(opts.After)
	if err != nil {
		return fmt.Errorf("outbox enqueue: marshal after: %w", err)
	}

	env := SchemaEventEnvelope{
		SchemaVersion: 1,
		EventType:     opts.EventType,
		Aggregate:     AggregateActionType,
		AggregateID:   opts.AggregateID,
		ActorID:       opts.ActorID,
		OccurredAt:    occurred,
		Before:        beforeRaw,
		After:         afterRaw,
	}
	payload, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("outbox enqueue: marshal envelope: %w", err)
	}

	eventID := deterministicEventID(AggregateActionType, opts.AggregateID, opts.EventType, opts.Version, payload)

	evt := outbox.New(eventID, AggregateActionType, opts.AggregateID, TopicActionType, payload).
		WithHeader("event_type", string(opts.EventType)).
		WithHeader("schema_version", "1").
		WithHeader("ol-namespace", "openfoundry.ontology").
		WithHeader("ol-job-name", string(opts.EventType)+"."+AggregateActionType).
		WithHeader("ol-event-time", occurred.Format(time.RFC3339Nano)).
		WithHeader("ol-producer", "ontology-actions-service")

	for k, v := range opts.Lineage {
		key := k
		if len(key) < 3 || key[:3] != "ol-" {
			key = "ol-" + key
		}
		evt.WithHeader(key, v)
	}

	return outbox.Enqueue(ctx, tx, evt)
}

// deterministicEventID derives a v5 UUID from (aggregate, aggregate_id,
// event_type, version, payload_hash) so a retried handler converges to
// the same event_id and the outbox.events primary key absorbs the
// duplicate (libs/outbox.Enqueue handles the ON CONFLICT path).
// Identical algorithm to
// `services/ontology-definition-service/internal/repo/events.go::deterministicEventID`.
func deterministicEventID(aggregate, aggregateID string, evt EventType, version int, payload []byte) uuid.UUID {
	sum := sha256.Sum256(payload)
	name := aggregate + "|" + aggregateID + "|" + string(evt) + "|" + strconv.Itoa(version) + "|" + hex.EncodeToString(sum[:])
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte(name))
}

func marshalOrNil(v any) (json.RawMessage, error) {
	if v == nil {
		return nil, nil
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	if string(raw) == "null" {
		return nil, nil
	}
	return raw, nil
}
