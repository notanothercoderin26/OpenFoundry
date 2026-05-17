package audittrail

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	databus "github.com/openfoundry/openfoundry-go/libs/event-bus-data"
)

// Emitter publishes an AuditEvent directly to TopicAuditEvents
// outside of any state-write transaction.
//
// Production state writes must still go through EmitToOutbox so the
// audit envelope and the SQL mutation commit atomically (ADR-0022).
// Emit is intended for callers that legitimately have no enclosing
// state mutation — read-side HTTP middleware audit logs, background
// jobs that have already committed their primary write, system events
// produced by services that don't own a Postgres database.
//
// Implementations must be safe for concurrent use.
type Emitter interface {
	Emit(ctx context.Context, event AuditEvent, auditCtx AuditContext) error
}

// KafkaEmitter is the production Emitter — a thin wrapper around the
// data-bus Publisher that builds the envelope, attaches OpenLineage
// headers, and writes to TopicAuditEvents.
type KafkaEmitter struct {
	Publisher databus.Publisher
	// Producer is the OpenLineage `producer` facet that identifies
	// the calling service. Required.
	Producer string
}

// NewKafkaEmitter wires an Emitter against an existing Publisher.
// `producer` is mandatory (the OpenLineage facet); empty values fail
// fast at construction to avoid silently un-attributed audit events.
func NewKafkaEmitter(p databus.Publisher, producer string) (*KafkaEmitter, error) {
	if p == nil {
		return nil, fmt.Errorf("audittrail: publisher is nil")
	}
	if producer == "" {
		return nil, fmt.Errorf("audittrail: producer (service identifier) is required")
	}
	return &KafkaEmitter{Publisher: p, Producer: producer}, nil
}

// Emit builds the envelope and publishes it to TopicAuditEvents.
//
// Kafka partition key is the resource_rid so a series of events for
// one resource lands on a single partition (same contract as the
// outbox path).
func (k *KafkaEmitter) Emit(ctx context.Context, event AuditEvent, auditCtx AuditContext) error {
	envelope, err := Build(event, auditCtx, time.Now().UTC())
	if err != nil {
		return err
	}
	payload, err := json.Marshal(envelope)
	if err != nil {
		return fmt.Errorf("encode audit envelope: %w", err)
	}
	headers := databus.NewOpenLineageHeaders(
		"audit",
		string(envelope.Kind),
		envelopeRunID(envelope),
		k.Producer,
	).WithEventTime(envelope.OccurredAt)
	key := []byte(envelope.ResourceRID)
	if len(key) == 0 {
		key = []byte(envelope.EventID.String())
	}
	return k.Publisher.Publish(ctx, TopicAuditEvents, key, payload, &headers)
}

// envelopeRunID returns the lineage run id: correlation_id when set,
// request_id as a fallback, finally the event_id.
func envelopeRunID(env AuditEnvelope) string {
	if env.CorrelationID != "" {
		return env.CorrelationID
	}
	if env.RequestID != "" {
		return env.RequestID
	}
	return env.EventID.String()
}

// NopEmitter discards every event. Useful in unit tests where audit
// emission is not under test and the caller does not want to wire a
// real Kafka publisher.
type NopEmitter struct{}

func (NopEmitter) Emit(_ context.Context, _ AuditEvent, _ AuditContext) error { return nil }
