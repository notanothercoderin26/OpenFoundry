# `libs/authz-cedar-go`

Cedar policy evaluator backed by
[`github.com/cedar-policy/cedar-go`](https://github.com/cedar-policy/cedar-go)
v1.6.0+ (post-1.0).

## Status — conformance-ready

This package provides the following surfaces:

- `lib.go` — `PolicyStore` (in-memory `*cedar.PolicySet` + bundled
  schema, behind a `sync.RWMutex`), `PolicyRecord` (mirrors the
  `pg-policy.cedar_policies` row shape), `ReplacePolicies` with strict
  schema validation + atomic swap.
- `engine.go` — `AuthzEngine` + `AuthorizeOutcome`, fire-and-forget
  audit emission via goroutine.
- `audit.go` — `AuthzAuditEvent` (wire-format pinned to
  `audit.authz.v1`), `AuthzAuditSink` interface, `NoopAuditSink`,
  `SlogAuditSink`.
- `errors.go` — `PolicyParseError`, `ValidationError`, sentinel errors.
- `cedar_schema.cedarschema` — bundled schema.
- `pg.go` — Postgres reload adapter for the latest active policy version
  per id, with atomic replacement semantics.
- `nats.go` — hot-reload subscriber interface for `authz.policy.changed`.
- `audit_kafka.go` — Kafka audit sink publishing `audit.authz.v1` with
  the OpenLineage header shape.
- `chi.go` — chi middleware guard.
- `iceberg_policies.go` / `schedule_policies.go` — policy bundles.
- Tests covering schema parsing, policy validation (strict mode,
  duplicate ids, schema-incompatible attribute), end-to-end Allow/Deny
  via the engine, diagnostics reasons/errors, Postgres reload,
  Kafka/NATS reload/audit adapters, policy-bundle validation, and audit
  JSON byte-compatible wire-format pinning.

## Remaining follow-up

- Keep extending the local conformance corpus when new service policy
  shapes land, and run it before cedar-go upgrades.

## Cedar-go API notes

Key cedar-go v1.6.0 API surfaces used here:

| API                                                              | cedar-go v1.6.0                                          |
|------------------------------------------------------------------|----------------------------------------------------------|
| Policy set construction                                          | `cedar.NewPolicySet()`                                   |
| Policy parsing                                                   | `var p cedar.Policy; p.UnmarshalCedar(b []byte) error`   |
| Authorization                                                    | `policySet.IsAuthorized(entities, req)` returns `(Decision, Diagnostic)` |
| Schema parsing                                                   | `var s schema.Schema; s.UnmarshalCedar(b)` (in `x/exp/schema`) |
| Validation                                                       | `validate.New(resolved, validate.WithStrict()).Policy(id, ast)` per-policy (in `x/exp/schema/validate`) |
| Decision constants                                               | `cedar.Allow / cedar.Deny`                               |
| Diagnostic reasons                                               | `Diagnostic.Reasons` field (typed `[]DiagnosticReason`)  |
| Diagnostic errors                                                | `Diagnostic.Errors` field (typed `[]DiagnosticError`)    |

The validator is in an experimental namespace
(`x/exp/schema/validate`) but is the same code path the cedar-go
maintainers use to run the AWS Cedar conformance suite. Pinned to
v1.6.0; bumps require running the conformance mirror.

The validator consumes `*ast.Policy` from `cedar-go/x/exp/ast`, but the
top-level `cedar.Policy.AST()` returns `*ast.Policy` from
`cedar-go/ast`. Both packages share an identical memory layout; we use
the same direct pointer cast that cedar-go's own test suite uses (see
`internal/testvalidate/testvalidate.go RunPolicyChecks`).

## Wire-compat invariants (locked)

`AuthzAuditEvent` JSON shape pinned by `audit_test.go`:

- snake_case fields (`policy_ids`, not `policyIds`).
- `tenant`, `policy_ids`, `diagnostics` use `omitempty` — they MUST be
  absent from the wire when empty.
- `decision` is the lowercase string `"allow"` or `"deny"`.

## Usage

```go
store, err := cedarauthz.NewWithPolicies([]cedarauthz.PolicyRecord{
    {ID: "permit-read", Source: `permit(principal, action == Action::"read", resource is Dataset);`},
})
if err != nil { /* handle */ }

eng := cedarauthz.NewEngine(store, cedarauthz.SlogAuditSink{})

out, err := eng.Authorize(ctx, principal, action, resource, contextRecord, entities)
if err != nil { /* handle */ }
if !out.IsAllow() {
    // policy denied — diagnostics in out.Diagnostics
}
```
