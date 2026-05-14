# sdk-generation-service

SDK + OpenAPI contract generation/publication/versioning service.

Today the binary wires server + auth + metrics so the documented
endpoints can be exercised end-to-end; wire format is pinned via
the model JSON tags.

## Endpoints

| Method | Path                                                 | Auth       |
| ------ | ---------------------------------------------------- | ---------- |
| GET    | `/healthz`                                           | —          |
| GET    | `/metrics`                                           | —          |
| GET    | `/api/v1/sdk-generation-jobs`                        | bearer JWT |
| POST   | `/api/v1/sdk-generation-jobs`                        | bearer JWT |
| GET    | `/api/v1/sdk-generation-jobs/{id}`                   | bearer JWT |
| GET    | `/api/v1/sdk-generation-jobs/{id}/publications`      | bearer JWT |
| POST   | `/api/v1/sdk-generation-jobs/{id}/publications`      | bearer JWT |

## Schema

Two tables under the configured Postgres database, applied via
embedded migrations at startup (idempotent `CREATE TABLE IF NOT EXISTS`):

- `sdk_generation_jobs` — `(id, payload jsonb, created_at, updated_at)`
- `sdk_generation_publications` — `(id, parent_id → jobs, payload jsonb, created_at)`

## Configuration

| Variable                       | Required | Purpose                              |
| ------------------------------ | :------: | ------------------------------------ |
| `DATABASE_URL`                 | ✅       | Postgres connection string           |
| `JWT_SECRET` (or `OPENFOUNDRY_JWT_SECRET`) | ✅ | HS256 secret                |
| `HOST` / `PORT`                |          | default `0.0.0.0:50144`              |
| `METRICS_ADDR`                 |          | default `0.0.0.0:9090`               |
| `OTEL_TRACES_EXPORTER=none`    |          | disable tracing                      |

## Build / run

```sh
make build-services
DATABASE_URL=postgres://localhost/sdkgen JWT_SECRET=$(openssl rand -hex 32) \
OTEL_TRACES_EXPORTER=none ./bin/sdk-generation-service
```
