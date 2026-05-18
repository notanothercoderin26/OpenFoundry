# cipher-service

## LLM quick context (current code)

Placeholder backend for Cipher/key-management routes routed by edge-gateway.

Agent note: most /api/v1/auth/cipher requests intentionally return structured 501 until the Cipher milestones land.

Current surface:
- `GET /_meta/capabilities`
- `ANY /api/v1/auth/cipher* (501 placeholder)`
- `GET /healthz`
- `GET /metrics`

State/dependency hints:
- Contains `1` SQL migration/schema file(s); check service migrations before changing persisted models.
- Main internal packages: `audit`, `config`, `crypto`, `domain`, `handler`, `kms`, `repo`, `server`.
- Local service files present: `config.yaml`, `Dockerfile`.

Configuration signals:
Environment variables referenced by the code:
- `CONFIG_FILE`, `DATABASE_URL`

Keep this section in sync when changing routes, config, or persistence behavior.

Stub backend for `/api/v1/auth/cipher/*`. The edge gateway already
routes that prefix to the `Cipher` upstream
([`router_table.go`](../edge-gateway-service/internal/proxy/router_table.go)),
but no upstream existed yet — every call surfaced as a 502 in the web
UI. This binary fills that gap so the gateway sees a real HTTP server
returning the canonical envelope:

```json
{ "code": "not_implemented", "service": "cipher-service", "milestone": "A" }
```

Each milestone in
[`docs/migration/foundry-cipher-1to1-checklist.md`](../../docs/migration/foundry-cipher-1to1-checklist.md)
will land real handlers — encrypt/decrypt, key lifecycle, audit — and
peel routes off the catch-all stub. Until then, treat 501 as the
documented success case.

## Endpoints

| Route                                | Auth        | Status |
|--------------------------------------|-------------|--------|
| `GET /healthz`                       | public      | 200    |
| `GET /metrics`                       | public      | 200    |
| `GET /_meta/capabilities`            | public      | 200    |
| `* /api/v1/auth/cipher{,/...}`        | bearer JWT  | 501    |

## Build

```sh
go build -o bin/cipher-service ./services/cipher-service/cmd/cipher-service
```
