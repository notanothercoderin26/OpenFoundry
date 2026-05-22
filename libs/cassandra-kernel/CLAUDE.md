# CLAUDE.md — libs/cassandra-kernel

OpenFoundry's Cassandra/Scylla wiring. Cluster + Session primitives,
migration ledger, and per-area store helpers (ontology objects/links,
identity sessions, action log, schema, read-model).

## What this package owns

| Concern | File |
|---|---|
| Cluster / Session wiring (gocql) with sane defaults | `cluster.go` |
| Idempotent `Migration` ledger (`CREATE TABLE IF NOT EXISTS` + `ALTER`) | `migrate.go`, `ontology_migrations.go` |
| Ontology object store (CQL adapter for `libs/ontology-kernel`) | `object_store.go` |
| Ontology link store | `link_store.go` |
| Read-model store (warm projections) | `read_model_store.go` |
| Action log store (action_log entries / revisions) | `action_log_store.go` |
| Schema store | `schema_store.go` |
| Identity-federation session store | `session_store.go` |
| Shared repo helpers (paged scans, TTL clones, etc.) | `repos_shared.go` |

## Driver + backend

- **Driver**: `gocql/gocql`. Pure Go, no CGO.
- **Backend**: Apache Cassandra 5.0 (k8ssandra-operator-managed) per
  [ADR-0020](../../docs/architecture/adr/ADR-0020-cassandra-as-operational-store.md).
  The schema is identical to ScyllaDB so the same DDL works against
  both during dev / CI.
- **Default consistency**: `LOCAL_QUORUM` (per ADR-0021).
- **Topology**: multi-DC `dc1:3, dc2:3, dc3:3, dc-b1:3`; `local_dc` is
  injected from `CASSANDRA_LOCAL_DC` env at service boot.

## Conventions

- **Stargate is not in the stack.** Services talk CQL directly via
  gocql. Don't add an HTTP / GraphQL layer on top.
- **Composite PKs are mandatory.** Never partition on `tenant_id` alone —
  the canonical pattern is
  `((tenant_id, type_id, time_bucket), updated_at DESC, object_id)`.
  Hot-partition tests assert this.
- **TTLs are pinned constants.** Changing a TTL in code without
  updating the DDL re-creates rows with a different TTL. Coordinate
  every TTL change with the keyspaces-job manifest.
- **Prepared statements are cached** at service startup. See per-service
  `*PreparedStatements` types; clone before mutating consistency /
  page-size to keep the cache immutable.
- **Optimistic concurrency**: Put uses `IF NOT EXISTS` for inserts and
  `IF version = ?` for updates; idempotent Delete by primary key.

## Migrations

Per-service `Migration` arrays live in each service's
`internal/cassandra-*` adapter and are applied via `Apply()` at boot.
The keyspaces-job manifest (`infra/k8s/platform/manifests/cassandra/keyspaces-job.yaml`)
provisions keyspaces with replication factors.

Once a migration ships, **add a new one** instead of editing the
existing array — Cassandra DDL is forward-only in practice.

## Testing

```sh
go test ./libs/cassandra-kernel/...
go test -tags integration ./libs/cassandra-kernel/...   # needs Docker
```

`object_store_integration_test.go` covers paged-scan + write-after-write
semantics under realistic consistency settings.

## Don't

- Don't add a single-PK partition table to a hot path; composite PK
  is mandatory (see ontology-anti-hot-partitions.md).
- Don't drop a column in a migration; nullify and stop writing it
  instead.
- Don't mutate a cached `*gocql.PreparedStatement` in place — clone
  before changing consistency.
