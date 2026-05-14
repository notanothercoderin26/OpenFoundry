# CLAUDE.md — libs/audit-trail

> **SECURITY-CRITICAL.** This is the platform's audit emission path.
> `audit-compliance-service` and `audit-sink` consume what this package
> emits. Field renames here ripple through every downstream consumer
> and the Iceberg `of_audit.events` table.

## What this package owns

| Concern | File |
|---|---|
| 13 canonical audit event variants (media-set + media-item) + categories | `event.go`, `categories.go` |
| `AuditEnvelope` wire format published on Kafka `audit.events.v1` | `envelope.go` |
| `DeriveEventID` — deterministic v5 UUID for outbox idempotency | `event.go` |
| `EmitToOutbox` — atomic envelope + outbox.Enqueue inside a pgx tx | `publisher.go` |
| `Middleware` / `MiddlewareWithLogger` — chi-compatible HTTP audit hook | `middleware.go` |
| `AuditContext` — request-side metadata (actor, IP, request-id, …) | `event.go` |

## Wire-format invariants

These are **frozen** — Iceberg schema, audit-sink, audit-compliance and
external dashboards all depend on them:

- Top-level: `event_id`, `at` (epoch microseconds), `kind`, `categories`,
  `resource_rid`, `project_rid`, `markings_at_event`, `occurred_at`
  (RFC3339), `payload`.
- Optional request-side fields are omitted when unset.
- `payload.kind` is the variant discriminator (snake_case + dotted,
  e.g. `media_set.created`).
- `TopicAuditEvents` constant pins the Kafka topic name; never
  hardcode the string elsewhere.

## Conventions

- **Middleware is chi-compatible** (`func(http.Handler) http.Handler`).
  Mount once per router; errors from inner handlers propagate unchanged.
- **Records carry `category=audit`** — the collector's slog handler
  subscribes on that key. Don't introduce a different attribute name.
- **EmitToOutbox needs a caller-owned pgx tx** so the SQL mutation and
  the audit emission commit atomically (ADR-0022).

## Testing

```sh
go test ./libs/audit-trail/...
```

`TestEventIDMatchesCrossLanguageGolden` (`audit_test.go`) locks the v5
UUID derivation against precomputed Python `uuid.uuid5` values. A
regression here silently breaks outbox idempotency across producers —
never relax those assertions.

## Don't

- Don't add a new variant without updating the 7 audit categories +
  the `payload.kind` discriminator.
- Don't change the JSON shape of `AuditEnvelope` — extend with
  optional fields if you need more.
- Don't emit events outside the outbox (no direct Kafka producers
  inside a state-write transaction).
- Don't change `DeriveEventID`'s algorithm; it's RFC 4122 v5 SHA-1
  over `(namespace, kind|aggregate|seed)` and must stay deterministic.
