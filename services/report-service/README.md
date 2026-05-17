# report-service

Stub binary that backs the `/api/v1/reports*` routes the edge gateway
has been pointing at via `u.Report` (see
`services/edge-gateway-service/internal/proxy/router_table.go`). Until
the real implementation lands every request returns a structured 501:

```json
{
  "code": "not_implemented",
  "service": "report-service",
  "milestone": "S8.6"
}
```

The frontend's `apps/web/src/lib/api/reports.ts` calls (`/reports/overview`,
`/reports/catalog`, `/reports/definitions`, `/reports/schedules`,
`/reports/executions/*`) all land on this binary via the gateway.

## Exposed surfaces

- `GET  /healthz`               — liveness payload
- `GET  /metrics`               — Prometheus scrape endpoint
- `ANY  /api/v1/reports[/*]`    — 501 placeholder (auth required)

## Build

```sh
go build -o bin/report-service ./services/report-service/cmd/report-service
```
