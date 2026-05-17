// Package lineageconsumer is the Kafka consumer for the
// `lineage.events` topic.
//
// Producers anywhere in the mesh publish OL RunEvents to this topic;
// the consumer decodes them and hands them to lineagegraph.Repo.Ingest
// so they show up in upstream/downstream BFS queries. Producers can
// also POST events at /api/v1/lineage/events — the consumer is one of
// two dual entrypoints.
package lineageconsumer

import (
	"context"
	"errors"
	"log/slog"
	"time"

	databus "github.com/openfoundry/openfoundry-go/libs/event-bus-data"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/openlineage"
)

// Ingester is the minimal write surface the consumer needs. Satisfied
// by *lineagegraph.Repo in production and by stubs in tests.
type Ingester interface {
	Ingest(ctx context.Context, ev *openlineage.RunEvent) error
}

// Topic is the canonical Kafka topic name. Pinned so producers and
// consumers stay in sync without a registry lookup.
const Topic = "lineage.events"

// ConsumerGroup is this service's consumer-group id.
const ConsumerGroup = "lineage-service.openlineage-graph"

// Subscriber is the minimal Kafka surface we need. databus.Subscriber
// implements this; the test harness substitutes a fake.
type Subscriber interface {
	Poll(ctx context.Context) (*databus.DataMessage, error)
	CommitMessages(ctx context.Context, msgs []*databus.DataMessage) error
	Close() error
}

// Run pumps messages out of `sub`, decodes them as OpenLineage events,
// persists them, and commits the offset.
//
// Semantics:
//   - At-least-once (commit only after a successful Ingest).
//   - A malformed event is logged + skipped + committed (poison-pill
//     records would otherwise stall the partition forever).
//   - Returns nil on ctx.Done(), the underlying error otherwise.
func Run(ctx context.Context, sub Subscriber, graph Ingester, log *slog.Logger) error {
	if sub == nil {
		return errors.New("lineageconsumer: nil subscriber")
	}
	for {
		msg, err := sub.Poll(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return nil
			}
			log.Error("lineage consumer poll failed", slog.String("error", err.Error()))
			// Back off briefly so a broker hiccup doesn't busy-loop.
			select {
			case <-ctx.Done():
				return nil
			case <-time.After(500 * time.Millisecond):
			}
			continue
		}
		if err := handle(ctx, msg, graph, log); err != nil {
			log.Error("lineage consumer ingest failed; not committing offset",
				slog.String("topic", msg.Topic),
				slog.Int("partition", msg.Partition),
				slog.Int64("offset", msg.Offset),
				slog.String("error", err.Error()))
			// Don't commit. The next Poll will re-deliver this record
			// (at-least-once). Sleep so we don't hammer a poisoned
			// broker — but stop early on shutdown.
			select {
			case <-ctx.Done():
				return nil
			case <-time.After(time.Second):
			}
			continue
		}
		if err := sub.CommitMessages(ctx, []*databus.DataMessage{msg}); err != nil {
			log.Error("lineage consumer commit failed",
				slog.String("topic", msg.Topic),
				slog.Int64("offset", msg.Offset),
				slog.String("error", err.Error()))
		}
	}
}

// handle decodes one record. A decode failure is logged but treated
// as "successfully handled" so a poison-pill payload doesn't block the
// partition.
func handle(ctx context.Context, msg *databus.DataMessage, graph Ingester, log *slog.Logger) error {
	ev, err := openlineage.DecodeEvent(msg.Value)
	if err != nil {
		log.Warn("lineage event decode failed; dropping record",
			slog.String("topic", msg.Topic),
			slog.Int64("offset", msg.Offset),
			slog.String("error", err.Error()))
		return nil
	}
	return graph.Ingest(ctx, ev)
}
