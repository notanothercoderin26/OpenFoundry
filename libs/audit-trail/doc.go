// Package audittrail emits structured audit events for the
// audit-compliance collector.
//
// What this package owns
//
//   - The 13 canonical audit event variants (media-set + media-item).
//   - The 7 Foundry audit categories (camelCase JSON tokens).
//   - AuditContext for request-side metadata (actor, IP, request-id, …).
//   - AuditEnvelope, the wire format published on Kafka topic
//     `audit.events.v1` (TopicAuditEvents constant).
//   - DeriveEventID, a deterministic v5 UUID derivation that ensures
//     retried handlers collapse to the same outbox row.
//
// Wire-format invariants
//
// JSON is byte-stable so audit-sink processes events emitted by any
// producer the same way:
//
//   - Top-level: `event_id`, `at` (epoch microseconds), `kind`,
//     `categories`, `resource_rid`, `project_rid`, `markings_at_event`,
//     `occurred_at` (RFC3339), `payload`.
//   - Optional request-side fields are omitted when unset.
//   - `payload.kind` is the variant discriminator (snake_case +
//     dotted, e.g. "media_set.created").
//
// Outbox publisher
//
// EmitToOutbox composes audit envelope + outbox.Enqueue inside a
// caller-owned pgx transaction so the SQL mutation and the audit
// emission land atomically (ADR-0022).
//
// HTTP middleware
//
// Middleware (and MiddlewareWithLogger) is a chi-compatible HTTP
// middleware that emits one structured `request handled` slog record
// per request, tagged with `category=audit`, carrying http_method /
// http_path / http_status / duration_ms. Mount once per Router; the
// audit-compliance collector subscribes to records carrying that
// category.
package audittrail
