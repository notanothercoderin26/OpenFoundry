package audittrail

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	databus "github.com/openfoundry/openfoundry-go/libs/event-bus-data"
)

type capturePublisher struct {
	topic   string
	key     []byte
	payload []byte
	lineage *databus.OpenLineageHeaders
}

func (c *capturePublisher) Publish(_ context.Context, topic string, key, payload []byte, lineage *databus.OpenLineageHeaders) error {
	c.topic = topic
	c.key = append([]byte(nil), key...)
	c.payload = append([]byte(nil), payload...)
	c.lineage = lineage
	return nil
}
func (c *capturePublisher) Flush(_ context.Context) error { return nil }
func (c *capturePublisher) Close() error                  { return nil }

func TestNewKafkaEmitterValidation(t *testing.T) {
	t.Parallel()
	_, err := NewKafkaEmitter(nil, "svc")
	require.Error(t, err)
	_, err = NewKafkaEmitter(&capturePublisher{}, "")
	require.Error(t, err)
	_, err = NewKafkaEmitter(&capturePublisher{}, "svc")
	require.NoError(t, err)
}

func TestKafkaEmitterPublishesToAuditTopic(t *testing.T) {
	t.Parallel()
	pub := &capturePublisher{}
	em, err := NewKafkaEmitter(pub, "test-service")
	require.NoError(t, err)

	event := NewMediaSetCreated("rid-1", "proj-1", []string{"pii"}, "name", "schema", "open", true)
	ctx := AuditContext{ActorID: "user-1", RequestID: "req-1"}

	require.NoError(t, em.Emit(context.Background(), event, ctx))

	assert.Equal(t, TopicAuditEvents, pub.topic)
	assert.Equal(t, []byte("rid-1"), pub.key, "partition key must be the resource RID")
	require.NotNil(t, pub.lineage)
	assert.Equal(t, "test-service", pub.lineage.Producer)
	assert.Equal(t, string(event.Kind), pub.lineage.JobName)
	assert.Equal(t, "req-1", pub.lineage.RunID, "request_id should drive lineage run_id")

	var env AuditEnvelope
	require.NoError(t, json.Unmarshal(pub.payload, &env))
	assert.Equal(t, "user-1", env.ActorID)
	assert.Equal(t, KindMediaSetCreated, env.Kind)
	assert.NotEqual(t, uuid.Nil, env.EventID, "deterministic event_id should populate")
}

func TestKafkaEmitterFallsBackToEventIDForKey(t *testing.T) {
	t.Parallel()
	pub := &capturePublisher{}
	em, err := NewKafkaEmitter(pub, "svc")
	require.NoError(t, err)

	// Empty resource_rid — partition key must still be deterministic
	// and never empty (Kafka treats nil keys as round-robin).
	require.NoError(t, em.Emit(context.Background(), AuditEvent{
		Kind:        KindMediaItemDownloaded,
		ResourceRID: "",
	}, AuditContext{ActorID: "u"}))
	assert.NotEmpty(t, pub.key, "empty resource_rid must still produce a stable key")
}

// errPublisher returns an error from Publish so the test can verify
// the emitter surfaces it without swallowing or wrapping.
type errPublisher struct{}

func (errPublisher) Publish(_ context.Context, _ string, _, _ []byte, _ *databus.OpenLineageHeaders) error {
	return errBoom
}
func (errPublisher) Flush(_ context.Context) error { return nil }
func (errPublisher) Close() error                  { return nil }

var errBoom = errors.New("boom")

func TestKafkaEmitterPropagatesPublishError(t *testing.T) {
	t.Parallel()
	em, err := NewKafkaEmitter(errPublisher{}, "svc")
	require.NoError(t, err)
	got := em.Emit(context.Background(), AuditEvent{Kind: KindMediaSetCreated, ResourceRID: "r"}, AuditContext{})
	assert.ErrorIs(t, got, errBoom)
}

func TestNopEmitterSilent(t *testing.T) {
	t.Parallel()
	require.NoError(t, (NopEmitter{}).Emit(context.Background(), AuditEvent{}, AuditContext{}))
}
