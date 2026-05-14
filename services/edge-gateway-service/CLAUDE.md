# CLAUDE.md — services/edge-gateway-service

> **EXTERNAL ENTRY POINT.** Every public HTTP request hits this service
> first. JWT validation, tenant-context derivation, rate-limiting and
> upstream routing all live here. Treat as security-adjacent.

## Where to look first

| Concern | Open this |
|---|---|
| Boot sequence + middleware order | `cmd/edge-gateway-service/main.go` + `internal/server/server.go` |
| Upstream URL configuration | `internal/config/config.go` (382 LOC, `DefaultUpstreams()`) |
| Route → upstream mapping | `internal/proxy/router_table.go` |
| Reverse-proxy machinery | `internal/proxy/proxy.go`, `internal/proxy/headers.go` |
| Rate limiting (Redis + in-memory token bucket) | `internal/middleware/ratelimit/` |
| Audit middleware | `internal/middleware/audit.go` |
| Errors | `internal/errs/` |
| `/meta` aggregator (probe / capabilities) | `internal/meta/aggregator.go` |
| Handlers (health, well-known) | `internal/handler/` |

## Boundaries you must not cross

- **Auth happens here, not in upstreams.** JWT validation runs in the
  gateway's middleware chain via `libs/auth-middleware`. Upstream
  services trust the `x-openfoundry-*` headers attached after validation.
- **Rate limiting must not crash the gateway.** The Redis middleware
  falls back to "allow" on any Redis-side error — keep that fallback;
  never let rate-limit failures take the gateway down.
- **Don't terminate TLS here.** TLS termination is at the ingress
  controller; this service speaks plain HTTP behind the ingress.
- **Don't proxy outbound traffic.** This is an *inbound* gateway only.

## Conventions

- **Adding a new service to the cluster:** register it in
  `internal/proxy/router_table.go` if it receives external HTTP
  traffic (per the root CLAUDE.md). Without that registration, the
  service is internal-only.
- **Upstream URL config:** `DefaultUpstreams()` provides localhost
  ports for dev / docker-compose. Production deployments override
  every field via Helm values; never bake production URLs into
  defaults.
- **Tenant context:** derived from JWT claims by `libs/auth-middleware`,
  forwarded downstream via `x-openfoundry-*` headers. Don't compute
  tenant context here a second time.
- **The 50-connection budget** to upstreams is shared with services
  via PgBouncer math — see `libs/db-pool`. Don't increase fan-out
  without checking the budget.

## Testing

```sh
go test ./services/edge-gateway-service/...
```

The reverse-proxy tests use `httptest.NewServer` upstreams; integration
with real services lives in `tests/integration/`.

## Don't

- Don't add per-request logic that does an upstream RPC; every extra
  hop multiplies p99 latency.
- Don't log the `authorization` header or its decoded JWT body.
- Don't bypass `internal/proxy/headers.go` when forwarding — it strips
  + injects the canonical OpenFoundry header set.
- Don't write to Postgres from this service; the gateway is stateless
  by design (Redis rate-limit state is the only mutable store).
