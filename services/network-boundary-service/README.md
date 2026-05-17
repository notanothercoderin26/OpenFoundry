# network-boundary-service (stub)

Backs the `/api/v1/network-boundaries`, `/api/v1/network-boundary` and
`/api/v1/data-connection/egress-policies` route prefixes that the edge
gateway fans out to `u.NetworkBoundary`. Without this binary those
paths return 502 to the frontend because no upstream is listening.

Per [ADR-0030](../../docs/architecture/adr/ADR-0030-service-consolidation-30-targets.md)
the surface is slated to merge into `authorization-policy-service`
during milestone S8.6 / B14. Until then every handler responds:

```http
HTTP/1.1 501 Not Implemented
Content-Type: application/json; charset=utf-8

{"code":"not_implemented","service":"network-boundary-service","milestone":"S8.6/B14"}
```

`/healthz`, `/metrics` and `/_meta/*` work normally so the pod passes
k8s probes and is visible to platform tooling.

## Build

```sh
go build -o bin/network-boundary-service ./services/network-boundary-service/cmd/network-boundary-service
```

## Routes

Keep this list in sync with the `u.NetworkBoundary` branch in
[`services/edge-gateway-service/internal/proxy/router_table.go`](../edge-gateway-service/internal/proxy/router_table.go).
