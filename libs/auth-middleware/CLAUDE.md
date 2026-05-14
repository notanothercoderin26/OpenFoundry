# CLAUDE.md — libs/auth-middleware

> **SECURITY-CRITICAL.** This is the JWT validation chain that fronts
> every protected route in every service. Default to additive changes;
> never weaken a check or remove a default without an explicit
> human-approved RFC.

## What this package owns

| Concern | File |
|---|---|
| Bearer-token parsing + JWT validation middleware | `middleware.go` |
| Named aliases (`AuthLayer`, `AuthUser`, `AuthUser{From,Must}Context`) | `layer.go` |
| HS256 + RS256 signing/verification, env-driven config | `jwt.go` |
| Token factory helpers (`BuildAccessClaims`, `BuildRefreshClaims`, `BuildAPIKeyClaims`) | `claims_builder.go` |
| Wire-stable Claims + SessionScope structs | `claims.go` |
| Unattended secret resolution (`LoadOrGenerate`, `ResolveUnattended`) | `secret_loader.go` |
| RBAC: `RequireRoles`, `RequireAdmin`, `RequirePermissions` + role constants | `rbac.go` |
| Marking enforcement: `CallerClearances`, `EnforceMarkings` | `markings.go` |
| Row-level-security helpers (`RLSContext`, `OrgFilter`, `OwnerOrOrgFilter`) | `rls.go` |
| Tenant resolution + quota tiers | `tenant.go` |
| Purpose / checkpoint gates | `purpose_checkpoint.go` |

## Boundaries you must not cross

- **Token signing/verification lives here.** Do not inline-validate JWTs
  in handlers; always go through `Middleware` / `Required` / `AuthLayer`.
- **Claims is the wire contract.** SDKs, frontend, and every internal
  service depend on its JSON shape. Field renames / type changes are
  wire-breaking — extend, don't rewrite.
- **Marking enforcement** must use `EnforceMarkings`; never compare
  marking strings directly in handler code.
- **Default deny.** New helpers must return `false` / error on
  ambiguity, never silently allow.

## Conventions

- **Middleware shape:** `func(http.Handler) http.Handler` (chi-compatible).
- **Context plumbing:** claims live in `r.Context()` — fetch via
  `FromContext` / `AuthUserFromContext`, never parse JWT in handlers.
- **Tenant quota policy values** are pinned — changing a number breaks
  dashboards + runbooks across services.

## Testing

```sh
go test ./libs/auth-middleware/...
```

Every public path has a unit test next to it. When changing token
issuance or validation, **add a test before** changing the production
code — there are golden-shape tests on `Claims` that pin the wire
format.

## Don't

- Don't add a "skip auth for service-X" fast path — use scopes or
  permissions instead.
- Don't log token contents (access, refresh, MFA codes); the slog
  formatters in `libs/observability` redact known fields, keep the
  field names consistent.
- Don't parse JWTs outside this package. If you need a new claim,
  extend `Claims` here and update SDKs in the same PR.
- Don't rename JSON fields on `Claims`, `SessionScope`, or `TenantQuotaPolicy`.
