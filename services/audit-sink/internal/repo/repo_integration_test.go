//go:build integration

// Integration tests for the AuditService Postgres path.
//
// Two scenarios, both gated by `-tags=integration`:
//
//   - TestKafkaToPostgresAtLeast1000Eventsin5s — connects to a Kafka
//     broker via KAFKA_BOOTSTRAP_SERVERS plus a Postgres testcontainer,
//     publishes 1000 synthetic envelopes, drives the audit-sink
//     runtime, and asserts every row lands in audit_events within 5
//     seconds (the user-facing acceptance criterion). Skipped when
//     KAFKA_BOOTSTRAP_SERVERS is unset (same skip pattern as the
//     existing audit-sink runtime kafka_integration_test.go).
//
//   - TestQueryEventsPaginatedByActor — seeds 50 rows directly through
//     the repo and exercises the QueryEvents handler with a small
//     page_size to confirm cursor pagination + per-actor filtering.
//
// Both tests run under `go test -tags=integration -race
// ./services/audit-sink/...`.
package repo_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	kafka "github.com/segmentio/kafka-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	databus "github.com/openfoundry/openfoundry-go/libs/event-bus-data"
	testingx "github.com/openfoundry/openfoundry-go/libs/testing"
	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/config"
	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/envelope"
	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/repo"
	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/runtime"
	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/writer"
)

const auditTopic = "audit.events.v1"

func kafkaBrokersOrSkip(t *testing.T) []string {
	t.Helper()
	raw := strings.TrimSpace(os.Getenv("KAFKA_BOOTSTRAP_SERVERS"))
	if raw == "" {
		t.Skip("KAFKA_BOOTSTRAP_SERVERS not set; skipping Kafka↔Postgres integration test")
	}
	return strings.Split(raw, ",")
}

func createTopic(t *testing.T, brokers []string, topic string, partitions int) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, err := kafka.DialContext(ctx, "tcp", brokers[0])
	if err != nil {
		t.Fatalf("dial kafka: %v", err)
	}
	defer conn.Close()
	// CreateTopics is idempotent at the cluster level; ignore "already
	// exists" so reruns against a long-lived broker stay green.
	_ = conn.CreateTopics(kafka.TopicConfig{Topic: topic, NumPartitions: partitions, ReplicationFactor: 1})
}

// mkEnvelopeBytes builds a libs/audit-trail-style envelope with an
// actor_id field at the top level so the Postgres writer can index it.
func mkEnvelopeBytes(t *testing.T, actorID, resourceRID string, occurredAt time.Time) []byte {
	t.Helper()
	payload, err := json.Marshal(map[string]any{
		"kind":              "media_item.uploaded",
		"resource_rid":      resourceRID,
		"project_rid":       "proj-1",
		"markings_at_event": []string{},
	})
	require.NoError(t, err)
	body, err := json.Marshal(map[string]any{
		"event_id":          uuid.New().String(),
		"at":                occurredAt.UnixMicro(),
		"kind":              "media_item.uploaded",
		"categories":        []string{"dataImport"},
		"resource_rid":      resourceRID,
		"project_rid":       "proj-1",
		"markings_at_event": []string{},
		"actor_id":          actorID,
		"occurred_at":       occurredAt.Format(time.RFC3339Nano),
		"payload":           json.RawMessage(payload),
	})
	require.NoError(t, err)
	return body
}

// TestKafkaToPostgresAtLeast1000Eventsin5s pins the user-facing
// acceptance criterion: 1000 synthetic events synced from Kafka to
// Postgres within 5 seconds.
func TestKafkaToPostgresAtLeast1000Eventsin5s(t *testing.T) {
	brokers := kafkaBrokersOrSkip(t)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pg := testingx.BootPostgres(ctx, t)
	require.NoError(t, repo.Migrate(ctx, pg.Pool))
	store := &repo.Repo{Pool: pg.Pool}

	// Per-test topic so concurrent runs don't share Kafka offsets.
	topic := auditTopic + "-test-" + uuid.NewString()
	createTopic(t, brokers, topic, 4)

	// Produce 1000 events ahead of the consumer so we can measure the
	// drain time end-to-end.
	const totalEvents = 1000
	w := &kafka.Writer{Addr: kafka.TCP(brokers...), Topic: topic, RequiredAcks: kafka.RequireAll, Balancer: &kafka.Hash{}}
	defer w.Close()

	now := time.Now().UTC()
	msgs := make([]kafka.Message, 0, totalEvents)
	for i := 0; i < totalEvents; i++ {
		actor := fmt.Sprintf("actor-%d", i%10)
		body := mkEnvelopeBytes(t, actor, fmt.Sprintf("rid-%d", i), now.Add(-time.Duration(totalEvents-i)*time.Millisecond))
		msgs = append(msgs, kafka.Message{Key: []byte(actor), Value: body})
	}
	produceCtx, produceCancel := context.WithTimeout(ctx, 60*time.Second)
	require.NoError(t, w.WriteMessages(produceCtx, msgs...))
	produceCancel()

	cfgBus := databus.NewConfig(brokers, databus.InsecureDev("audit-sink-test"))
	groupID := "audit-sink-test-" + uuid.NewString()
	sub, err := databus.NewKafkaSubscriber(cfgBus, groupID, []string{topic})
	require.NoError(t, err)
	defer sub.Close()

	pgw := writer.NewPostgresWriter(store)
	metrics := runtime.NewMetrics()
	cfg := &config.Config{BatchPolicy: config.BatchPolicy{MaxRecords: 200, MaxWait: 100 * time.Millisecond}}
	cfg.Service.Name = "audit-sink"
	cfg.Service.Version = "test"

	runCtx, runCancel := context.WithCancel(ctx)
	defer runCancel()
	done := make(chan error, 1)
	go func() {
		done <- runtime.Run(runCtx, cfg, sub, pgw, metrics, slog.New(slog.NewTextHandler(io.Discard, nil)))
	}()

	start := time.Now()
	deadline := start.Add(5 * time.Second)
	for {
		var count int
		require.NoError(t, pg.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM audit_events").Scan(&count))
		if count >= totalEvents {
			t.Logf("ingested %d events in %s", count, time.Since(start))
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("only ingested %d/%d events in 5s", count, totalEvents)
		}
		time.Sleep(50 * time.Millisecond)
	}

	runCancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("runtime did not exit after cancel")
	}

	// Validate per-actor query latency from the index: 100 events per
	// actor (1000/10) must come back in well under 100ms.
	queryStart := time.Now()
	var perActor int
	require.NoError(t, pg.Pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM audit_events WHERE actor_id = $1", "actor-3").Scan(&perActor))
	assert.Equal(t, 100, perActor)
	assert.Less(t, time.Since(queryStart), 100*time.Millisecond,
		"actor-indexed query should serve from idx_audit_events_actor_occurred_at in <100ms")
}

// TestQueryEventsPaginatedByActor seeds 50 events and walks pagination
// to assert the cursor returns the full set in chunks of 20.
func TestQueryEventsPaginatedByActor(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	pg := testingx.BootPostgres(ctx, t)
	require.NoError(t, repo.Migrate(ctx, pg.Pool))
	store := &repo.Repo{Pool: pg.Pool}

	const targetActor = "actor-target"
	const otherActor = "actor-other"
	const targetRows = 50
	const noiseRows = 25

	base := time.Now().UTC().Add(-time.Hour)
	batch := make([]envelope.AuditEnvelope, 0, targetRows+noiseRows)
	for i := 0; i < targetRows; i++ {
		raw := mkEnvelopeBytes(t, targetActor, fmt.Sprintf("rid-target-%d", i), base.Add(time.Duration(i)*time.Second))
		env, err := envelope.Decode(raw)
		require.NoError(t, err)
		batch = append(batch, env)
	}
	for i := 0; i < noiseRows; i++ {
		raw := mkEnvelopeBytes(t, otherActor, fmt.Sprintf("rid-noise-%d", i), base.Add(time.Duration(i)*time.Second))
		env, err := envelope.Decode(raw)
		require.NoError(t, err)
		batch = append(batch, env)
	}
	inserted, err := store.InsertBatch(ctx, batch)
	require.NoError(t, err)
	require.Equal(t, len(batch), inserted)

	h := &handlers.Handlers{Repo: store}

	gathered := make([]string, 0, targetRows)
	cursor := ""
	pages := 0
	for {
		pages++
		url := fmt.Sprintf("/api/v1/audit/events?actor_id=%s&page_size=20", targetActor)
		if cursor != "" {
			url += "&cursor=" + cursor
		}
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, url, nil)
		h.QueryEvents(rec, req)
		require.Equal(t, http.StatusOK, rec.Code, "page %d body: %s", pages, rec.Body.String())

		var resp handlers.QueryEventsResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		require.NotEmpty(t, resp.Events, "page %d returned 0 events", pages)
		for _, e := range resp.Events {
			gathered = append(gathered, e.EventID)
			assert.Equal(t, targetActor, e.ActorID)
		}
		if resp.NextCursor == "" {
			break
		}
		cursor = resp.NextCursor
		require.LessOrEqual(t, pages, 5, "pagination did not terminate")
	}
	assert.Equal(t, targetRows, len(gathered))

	// Deduplicate to confirm no row was returned twice across pages.
	seen := make(map[string]struct{}, targetRows)
	for _, id := range gathered {
		_, dup := seen[id]
		assert.False(t, dup, "duplicate event id across pages: %s", id)
		seen[id] = struct{}{}
	}
}
