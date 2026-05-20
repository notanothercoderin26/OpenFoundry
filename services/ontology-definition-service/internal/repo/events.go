// Topics, aggregate names, envelope construction, and the
// outbox.Enqueue glue for ontology schema mutations.
//
// Per ADR-0022, every Create/Update/Delete on an ontology resource must
// emit a domain event to the data bus by enqueuing into outbox.events
// within the same Postgres transaction as the primary write. Debezium's
// Outbox Event Router SMT then routes the record to Kafka, keyed by the
// `topic` column and deduplicated by `event_id`.
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

// Topic and aggregate constants.
//
// Versioning convention (ADR-0022 §"Topic conventions"):
//
//	<domain>.<entity>.<event>.v<N>
//
// `changed` is the catch-all event verb covering Created/Updated/Deleted
// — the discriminator lives in the envelope's EventType field. This
// keeps the topic count bounded and lets consumers subscribe by
// resource family rather than per-verb.
const (
	TopicObjectType         = "ontology.object_type.changed.v1"
	TopicLinkType           = "ontology.link_type.changed.v1"
	TopicProperty           = "ontology.property.changed.v1"
	TopicObjectTypeGroup    = "ontology.object_type_group.changed.v1"
	TopicInterface          = "ontology.interface.changed.v1"
	TopicSharedPropertyType = "ontology.shared_property_type.changed.v1"
	TopicObjectView         = "ontology.object_view.changed.v1"
	// TopicActionType is reserved for `ontology-actions-service` once
	// the kernel-side hook into libs/ontology-kernel/handlers/actions
	// is wired (see PoC/blockers/B02-ontology-definition.md §Deferred).
	// The topic CR is already provisioned via
	// infra/helm/infra/kafka-cluster/templates/topics-ontology-schema-v1.yaml.
	TopicActionType = "ontology.action_type.changed.v1"

	AggregateObjectType         = "ontology_object_type"
	AggregateLinkType           = "ontology_link_type"
	AggregateProperty           = "ontology_property"
	AggregateObjectTypeGroup    = "ontology_object_type_group"
	AggregateInterface          = "ontology_interface"
	AggregateSharedPropertyType = "ontology_shared_property_type"
	AggregateObjectView         = "ontology_object_view"
	AggregateActionType         = "ontology_action_type"
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
//
// The shape is deliberately minimal and stable: consumers parse it
// without an Apicurio schema lookup in dev/test, and with one in
// production. Versioning is via the topic name (`.v1` suffix); adding
// optional fields is allowed, removing or renaming fields requires a
// new topic version.
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
// single schema-mutation event.
//
// Before and After are nil for the "wrong side" of the event:
//
//   - Created  → Before nil, After populated
//   - Updated  → both populated (callers should snapshot before
//     mutating)
//   - Deleted  → Before populated, After nil
//
// Version is used in the deterministic event_id derivation; it should
// be the post-write optimistic-concurrency version of the aggregate
// (1 for create, the new version for update, the pre-delete version
// for delete).
type EventOptions struct {
	Topic       string
	Aggregate   string
	AggregateID string
	EventType   EventType
	ActorID     uuid.UUID
	Version     int
	Before      any
	After       any
	// Lineage carries optional OpenLineage context propagated from the
	// caller. Keys without the `ol-` prefix are prefixed automatically.
	Lineage map[string]string
}

// EnqueueSchemaEvent builds the canonical envelope, computes a
// deterministic event_id, and appends to outbox.events through
// libs/outbox.Enqueue.
//
// `tx` must be the same transaction the caller used for the primary
// write; the helper does not own the transaction lifecycle.
func EnqueueSchemaEvent(ctx context.Context, tx pgx.Tx, opts EventOptions) error {
	if opts.Topic == "" || opts.Aggregate == "" || opts.AggregateID == "" {
		return fmt.Errorf("outbox enqueue: topic, aggregate and aggregate_id required")
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
		Aggregate:     opts.Aggregate,
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

	eventID := deterministicEventID(opts.Aggregate, opts.AggregateID, opts.EventType, opts.Version, payload)

	evt := outbox.New(eventID, opts.Aggregate, opts.AggregateID, opts.Topic, payload).
		WithHeader("event_type", string(opts.EventType)).
		WithHeader("schema_version", "1").
		WithHeader("ol-namespace", "openfoundry.ontology").
		WithHeader("ol-job", string(opts.EventType)+"."+opts.Aggregate).
		WithHeader("ol-event-time", occurred.Format(time.RFC3339Nano)).
		WithHeader("ol-producer", "ontology-definition-service")

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
//
// This is the contract from ADR-0022 §"Schema": "deterministic UUIDv5
// computed from (aggregate, aggregate_id, version, payload_hash)".
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
