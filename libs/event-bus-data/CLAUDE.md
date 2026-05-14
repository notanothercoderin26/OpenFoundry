# CLAUDE.md — libs/event-bus-data

OpenFoundry's **data-plane event bus** (Apache Kafka). Used for CDC,
ingestion, lineage, analytics. For control-plane RPC events use
[`libs/event-bus-control`](../event-bus-control/) (NATS JetStream).

## What this package owns

| Concern | File |
|---|---|
| `Publisher` — at-least-once Kafka producer (acks=all, idempotent) | `publisher.go` |
| `Subscriber` — manual-commit consumer | `subscriber.go` |
| `Config` + `ServicePrincipal` (SASL) | `config.go` |
| OpenLineage headers helper | `headers.go` |

## Delivery semantics

- **At-least-once** with explicit commits. Consumers MUST call
  `DataMessage.Commit()` (or `Subscriber.CommitOffsets()`) after a
  record is durably processed.
- **Auto-commit is disabled** in the default consumer config — don't
  re-enable it.
- **Compression**: zstd (set by `NewConfig`).

## Auto-creation and ACLs

- **Topic auto-creation is disabled.** Topic provisioning is owned
  out-of-band by the platform's topic registry.
- **Every service authenticates with its own SASL principal** —
  see `ServicePrincipal`. Don't share principals across services.

## OpenLineage headers

Records carry a small, well-known set of Kafka headers
(`ol-namespace`, `ol-job-name`, `ol-run-id`, `ol-event-time`,
`ol-producer`, `ol-schema-url`) so any consumer extracts them without
a schema-registry lookup. Use `OpenLineageHeaders` to read/write them.

## Implementation note

Uses `segmentio/kafka-go` (pure Go, no CGO). Producer settings:
`acks=all`, idempotent writes, zstd compression — pinned in `NewConfig`.

## bus-audit allowlist

Services depending on `event-bus-data` must be listed in
[`.github/bus-allowlist.yaml`](../../.github/bus-allowlist.yaml). A
new service that imports this package without an allowlist entry will
fail the `bus-audit` CI gate.

## Testing

```sh
go test ./libs/event-bus-data/...
```

Kafka-backed integration tests run behind `//go:build integration`.

## Don't

- Don't enable auto-commit. At-least-once means **the consumer**
  commits after durable processing.
- Don't reach for `rdkafka` or `confluent-kafka-go` — they require
  CGO and we deliberately ship pure Go.
- Don't publish via direct `kafka.Writer` from inside a state-write
  transaction; use the outbox + Debezium path (ADR-0022).
- Don't bypass `ServicePrincipal` to "just use the admin user" — the
  Strimzi ACLs deny it.
