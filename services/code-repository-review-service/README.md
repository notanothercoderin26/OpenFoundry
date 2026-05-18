# code-repository-review-service

## LLM context

Backs code-security scan creation and review-oriented global-branch metadata endpoints.

Agent note: routes are mounted under `/v1`, not `/api/v1`; the edge gateway may add or rewrite prefixes externally.

## Entrypoints

- `cmd/code-repository-review-service/main.go` builds the `code-repository-review-service` binary.

## Current HTTP / runtime surface

- `POST /v1/code-security/scans`
- `/v1/global-branches*`
- `GET /healthz`
- `GET /healthz/json`
- `GET /metrics`

## State and dependencies

- Contains `3` SQL migration/schema file(s); check service migrations before changing persisted models.
- Main internal packages: `codesecurity`, `config`, `handlers`, `models`, `repo`, `server`, `subscriber`.
- Local service files present: `Dockerfile`.

## Configuration signals

Environment variables referenced by the code:
- `BRANCH_EVENTS_CONSUMER_GROUP`, `DATABASE_URL`, `HOST`, `JWT_SECRET`, `KAFKA_BOOTSTRAP_SERVERS`, `KAFKA_BROKERS`, `PORT`, `SERVICE_ACTOR`
- `SERVICE_VERSION`

## Build

```sh
go build -o bin/code-repository-review-service ./services/code-repository-review-service/cmd/code-repository-review-service
```

## Before editing

- Start from the entrypoint and `internal/server`/`internal/handlers` to confirm mounted routes.
- Treat this README as a map of the current code, not a product spec; update it in the same PR as behavior changes.
- Prefer existing shared libraries under `libs/` for auth, observability, storage, and generated contracts instead of duplicating patterns.
