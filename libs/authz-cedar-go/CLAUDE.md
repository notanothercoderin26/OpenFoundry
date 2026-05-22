# CLAUDE.md — libs/authz-cedar-go

> **SECURITY-CRITICAL.** This is the in-process Cedar policy evaluator
> every service uses. A bug here is exploitable by every other service.
> Default deny is the prime invariant; add tests **before** changing
> evaluation logic.

## What this package owns

| Concern | File |
|---|---|
| Cedar policy engine + decision API | `engine.go` |
| Schema bundling (compile-time `SchemaSource`) | `engine.go` |
| Policy hot-reload + mutex-guarded reload | `engine.go` |
| Per-decision audit sinks (slog, Kafka) | `audit.go`, `audit_kafka.go` |
| Schedule-policy helpers (cron-style policy gating) | `schedule_policies.go` |
| chi middleware (`AdminGuard` and friends) | `chi.go` |
| Cedar conformance suite | `conformance_test.go` |

## Backing dependency

`github.com/cedar-policy/cedar-go` v1.6.0+ (post-1.0).
`conformance_test.go` re-runs the AWS Cedar conformance suite locally.

## Boundaries you must not cross

- **`AdminGuard` middleware** (`chi.go`) is the only sanctioned path
  to enforce admin-policy checks. Don't reimplement Cedar evaluation
  in handlers.
- **Default deny.** Every new helper must return `denied` on error,
  missing data, or schema-validation failure. There are tests asserting
  this — keep them green.
- **Decision logging is mandatory.** Every decision emits via the
  configured `AuditSink`. Don't add a fast-path that skips it.
- **Cedar entities** must be typed by RID; never construct an entity
  with a raw string ID without going through the helper that validates
  RID format.

## Conventions

- **Per ADR-0027:** every service evaluates policies in-process. There
  is no central policy decision point.
- **Policies are loaded from `pg-policy.cedar_policies`** at startup and
  refreshed via NATS event. The engine holds them under a `sync.RWMutex`
  for hot-reload safety.
- **Schema is bundled at compile time** via `SchemaSource`; runtime
  callers must not load arbitrary schemas.

## Testing

```sh
go test ./libs/authz-cedar-go/...
```

`conformance_test.go` re-runs the cedar-go conformance suite. When
upgrading cedar-go, ensure conformance still passes before merging.

## Don't

- Don't bypass `AdminGuard` to "just do the check inline".
- Don't relax error handling to return `allowed` on transient
  schema-validation errors.
- Don't load policies from outside `pg-policy.cedar_policies` without
  ADR-level approval.
- Don't add a custom audit sink that drops decisions silently.
