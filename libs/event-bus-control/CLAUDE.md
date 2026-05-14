# CLAUDE.md — libs/event-bus-control

OpenFoundry's **control-plane event bus** (NATS JetStream). Used for
RPC events, signals, and fan-out. For the data plane (CDC, lineage,
analytics), use [`libs/event-bus-data`](../event-bus-data/) (Kafka).

## What this package owns

| Concern | File |
|---|---|
| `Connect` — NATS + JetStream wiring | `connectors.go` |
| `Publisher` — typed publish over `Event<T>` envelope | `publisher.go` |
| `Subscriber` — durable pull-consumer wrapper | `subscriber.go` |
| `EnsureStream` — idempotent stream creation | `subscriber.go` |
| Well-known subjects + stream names | `topics.go`, `workflows.go` |
| `Event<T>` envelope (JSON wire format) | `event.go` |
| Schema Registry primitives (Avro / JSON Schema / Protobuf) | `schema_registry.go` |
| Compatibility checks (BACKWARD / FORWARD / FULL / NONE) | `schema_registry.go` |
| Kafka-live bridge (deprecated path) | `kafka_live.go` |
| Allowlist contract for the `bus-audit` gate | `contracts.go` |

## When to use this vs `event-bus-data`

| Use case | Pick |
|---|---|
| RPC-style "X happened, react somewhere" | controlbus (low latency, hours retention) |
| Signals between services in the same workflow | controlbus |
| CDC, ingestion, lineage, analytics | databus (Kafka, days–weeks retention) |
| Cross-DC replication / massive throughput | databus |

## Conventions

- **Stream defaults**: `LimitsPolicy` retention, 1M msgs, 7d age. Override
  in `EnsureStream` only when there's a written reason.
- **Subjects use `<domain>.>` wildcards** so a single stream captures the
  whole subtree (e.g. `of.datasets.>` matches every datasets event).
- **`Event<T>` JSON is wire-stable** across services and SDKs — extend
  with optional fields, never rename.
- **Schema Registry helpers are pure**: no DB, no HTTP. The Schema
  Registry service layers persistence + REST on top.

## bus-audit allowlist

Services depending on `event-bus-control` or `event-bus-data` must be
listed in [`.github/bus-allowlist.yaml`](../../.github/bus-allowlist.yaml).
A new service that imports either lib without an allowlist entry will
fail the `bus-audit` CI gate.

## Testing

```sh
go test ./libs/event-bus-control/...
```

NATS-backed integration tests run behind `//go:build integration`.

## Don't

- Don't add a non-`Event<T>` publish path; subscribers depend on the
  envelope shape.
- Don't bypass `EnsureStream` to create streams ad-hoc; configs drift
  silently and Reaper sees inconsistent retention.
- Don't reach for Kafka here; data-plane traffic belongs in
  `event-bus-data`.
