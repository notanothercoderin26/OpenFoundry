# global-branch-service

Cross-application Global Branching surface (parity target tracked in
[`docs/migration/foundry-global-branching-1to1-checklist.md`](../../docs/migration/foundry-global-branching-1to1-checklist.md)).

**Status: stub.** Every product endpoint currently answers 501 Not
Implemented via [`handler.NotImplemented`](internal/handler/health.go).
The service exists because the edge gateway already routes
`/api/v1/code-repos/repositories/{repository}/branches` to a
`global-branch` upstream
([`router_table.go:285-287`](../edge-gateway-service/internal/proxy/router_table.go));
without a binary the frontend was getting 502s instead of a structured
error code.

ADR-0030 originally merged this surface into `code-repository-review-service`.
This stub re-instates the standalone binary so the gateway routing,
the Helm release and the parity backlog can be incrementally filled
in. Re-evaluate the consolidation once the GB.* checklist items land.

## Endpoints

| Route | Status |
|---|---|
| `GET /healthz` | live (standard payload) |
| `GET /metrics` | Prometheus |
| `GET /_meta/capabilities` | capability catalog |
| `GET/POST /api/v1/code-repos/repositories/{repository}/branches` | 501 stub |
| `* /api/v1/code-repos/repositories/{repository}/branches/*` | 501 stub |

## Build

```sh
go build -o bin/global-branch-service ./services/global-branch-service/cmd/global-branch-service
```
