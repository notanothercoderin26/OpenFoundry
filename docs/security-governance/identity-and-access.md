# Identity and access

Identity and access are one of the strongest implemented capability areas in the current repo.

## Repository signals

`identity-federation-service` already exposes first-class support for:

- registration and login
- JWT access and refresh flows (with JWKS rotation)
- MFA + WebAuthn
- OIDC sign-in (SAML sign-in flow pending — see [ROADMAP](../../ROADMAP.md))
- SCIM provisioning
- session management
- user, role, group, and permission administration
- control-panel and admin-oriented surfaces

You can see the route surface in `services/identity-federation-service/cmd/identity-federation-service/main.go` and `services/identity-federation-service/internal/server/`.

## Domain building blocks

Relevant internal packages include:

- `internal/domain/jwt` — JWT issuance + validation, JWKS handling
- `internal/domain/rbac` — role-based access primitives
- `internal/domain/mfa` — MFA / WebAuthn enrollment and verification
- `internal/domain/saml` — SAML SP (sign-in flow pending)
- `internal/domain/oauth` — OAuth/OIDC provider integration
- `internal/domain/sessions` — session lifecycle, revocation, scoped claims
- `internal/domain/scim` — SCIM resources

ABAC primitives are owned by `services/authorization-policy-service` (Cedar engine) — see [Policies and authorization](./policies-and-authorization.md).

The shared HTTP layer (`libs/auth-middleware`) extracts claims into `r.Context()` so handlers never parse JWTs themselves; this is enforced by convention in [`CLAUDE.md`](../../CLAUDE.md) §"Conventions".

## Why this matters

This gives OpenFoundry a strong foundation for identity-aware operational workflows, not only for simple API authentication.
