# knowledge-index-service

## LLM quick context (current code)

HTTP frontend for AI knowledge-base management. Routes are wired to a
real implementation that lives in `libs/ai-kernel-go/handlers`
(`knowledge.go` ~515 LOC, `knowledge_store.go` ~349 LOC, tests
~225 LOC). The previous "501 placeholder" milestone (S8.6) is closed.

Agent note: search routes for knowledge bases are routed to
`retrieval-context-service` by the gateway and never reach this
binary.

Current surface (all under `/api/v1/ai/knowledge-bases`, auth required):

- `GET    /`                                — list knowledge bases
- `POST   /`                                — create knowledge base
- `GET    /{id}`                            — get knowledge base
- `PATCH  /{id}`                            — update knowledge base
- `DELETE /{id}`                            — delete knowledge base
- `GET    /{id}/documents`                  — list documents
- `POST   /{id}/documents`                  — create document
- `GET    /{id}/documents/{document_id}`    — get document
- `DELETE /{id}/documents/{document_id}`    — delete document
- `POST   /{id}/search`                     — search (handled here when the
  gateway does not divert to `retrieval-context-service`)
- `GET    /healthz`                         — liveness
- `GET    /metrics`                         — Prometheus scrape

State/dependency hints:

- Persistence backed by Postgres via `aikernel.NewPGKnowledgeStore`
  (see `libs/ai-kernel-go/handlers/knowledge_store.go`). Migrations are
  owned by the shared `ai-kernel-go` library, not by this service.
- Main internal packages: `config`, `handler`, `server`.
- Local service files present: `config.yaml`, `Dockerfile`.

Configuration signals:

Environment variables / config keys referenced by the code:

- `CONFIG_FILE`
- `DATABASE_URL` (or `database.url`) — required for production
  persistence. Server boot fails with a clear error when missing.
- `allow_fake_store` — opt-in flag that swaps the Postgres store for
  `aikernel.NewFakeKnowledgeStore()`. Restricted to local/test runs;
  passing a `FakeKnowledgeStore` without this flag is rejected.
- `JWT.Secret`, `JWT.Issuer`, `JWT.Audience` — `auth-middleware` JWT
  validation chain.

Keep this section in sync when changing routes, config, or persistence
behavior.

## How it is wired

`internal/handler/knowledge.go` is a thin adapter: each route delegates
to a method on `aikernel.KnowledgeHandlers` from
`libs/ai-kernel-go/handlers`. The `Server` constructor
(`internal/server/server.go`) builds the `KnowledgeHandlers` from one
of three sources, in priority order:

1. An explicitly injected `KnowledgeStore` via the `WithKnowledgeStore`
   option (used by tests).
2. A pgx pool injected via `WithPostgresPool` → wraps a
   `NewPGKnowledgeStore` automatically.
3. `allow_fake_store=true` → in-memory `FakeKnowledgeStore` (local/test
   only).

If none of the above is provided and `database.url` is empty, `New`
returns an error rather than silently starting an unbacked server.

The edge gateway points `u.KnowledgeIndex` at this binary (see
`services/edge-gateway-service/internal/proxy/router_table.go`).

## Tests

Server tests pin the contract end-to-end:

- `TestKnowledgeRoutesNo501` (`internal/server/server_test.go:26`)
  drives a real request through the chi router with a valid JWT and
  asserts `GET /api/v1/ai/knowledge-bases` returns 200 and `POST`
  succeeds (the test fails if any route returns 501).
- `TestProductionWithoutDatabaseFails` — production wiring without
  `database.url` and without `allow_fake_store` is rejected at boot.
- `TestFakeStoreRequiresExplicitAllowFlag` — `FakeKnowledgeStore` is
  refused unless `allow_fake_store=true` is set explicitly.

## Build

```sh
go build -o bin/knowledge-index-service ./services/knowledge-index-service/cmd/knowledge-index-service
```
