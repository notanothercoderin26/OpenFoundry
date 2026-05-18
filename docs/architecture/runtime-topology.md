# Runtime Topology

OpenFoundry runs as a layered service mesh behind a single HTTP edge
gateway, organised into **five target planes** — *storage*, *ingestion*,
*compute*, *control* and *relational state*. Each plane has an owning
ADR (0008–0012) that fixes its contracts, operators and SLOs. The map
below names the actual Go binaries under [`services/`](../../services/)
that anchor each plane; consolidation status is tracked in
[ADR-0030](./adr/ADR-0030-service-consolidation-30-targets.md) and the
companion [`services-and-ports.md`](./services-and-ports.md).

## High-Level Flow — target planes

```text
                                External BI clients
                            (Tableau / Superset / Arrow Flight SQL JDBC)
                                       |
                                       v
                              +----------------------+
                              | sql-bi-gateway       |  single edge SQL surface;
                              |   :50133 (Flight)    |  Arrow Flight SQL gRPC (substrate)
                              |   :50134 (HTTP)      |  + HTTP saved-queries / warehousing
                              |                      |    / tabular routes
                              +----------------------+
                                       :
                                       : per-statement routing by catalog prefix
                                       : (trino.* / vespa.* / postgres.* / local DataFusion
                                       :  or sql-warehousing Flight SQL backend if configured)
                                       :
Browser / API client                   :
        |                              :
        v                              :
   apps/web or external client         :
        |                              :
        v                              :
   edge-gateway-service (:8080) -------+
        |
        |   ┌─────────────────────── CONTROL PLANE ─────────────────────────┐
        +-> │ identity-federation-service · authorization-policy-service ·  │
        |   │ tenancy-organizations-service · ontology-definition-service · │
        |   │ ontology-actions-service · workflow-automation-service ·      │
        |   │ application-composition-service · notification-alerting-svc · │
        |   │ audit-compliance-service · telemetry-governance-service ·     │
        |   │ federation-product-exchange-service · sdk-generation-service  │
        |   │ ── async signals on NATS JetStream (libs/event-bus-control),  │
        |   │    governed by ADR-0011; SLOs in ADR-0012                     │
        |   └───────────────────────────────────────────────────────────────┘
        |
        |   ┌────────────────────── INGESTION PLANE ────────────────────────┐
        +-> │ connector-management-service · ingestion-replication-service  │
        |   │ ── durable streams on Apache Kafka (libs/event-bus-data),     │
        |   │    acks=all + idempotent producers; OpenLineage headers      │
        |   │    → lands data into the storage plane                       │
        |   └───────────────────────────────────────────────────────────────┘
        |                              │
        |                              v
        |   ┌─────────────────────── STORAGE PLANE ─────────────────────────┐
        |   │ Object storage:  Rook Ceph (RBD-fast block + RGW S3 EC 4+2)   │
        |   │ Lakehouse:       Apache Iceberg + Lakekeeper REST Catalog     │
        |   │                  (external warehouse — ADR-0008) +            │
        |   │                  iceberg-catalog-service (Foundry-internal    │
        |   │                  catalog — ADR-0041)                          │
        |   │ Streaming log:   Apache Kafka (Strimzi KRaft, rack-aware)     │
        |   │ Search/hybrid:   Vespa (production) + Vespa Lite for DX       │
        |   │ Embedded vector: pgvector co-located with relational state    │
        |   │ Kafka sinks:     ai-sink · audit-sink (data-plane consumers   │
        |   │                  that land Kafka records into storage)        │
        |   └───────────────────────────────────────────────────────────────┘
        |              ^                    ^                    ^
        |              | catalog/scan       | CDC/firehose       | writes
        |              |                    |                    |
        |   ┌─────────────────────── COMPUTE PLANE ─────────────────────────┐
        +-> │ sql-bi-gateway-service (edge SQL gateway, :50133 / :50134)    │
        |   │   routes per-statement to: local DataFusion (literal probes), │
        |   │   Trino (Iceberg analytics, ADR-0029),                        │
        |   │   Vespa (search / hybrid retrieval, ADR-0007),                │
        |   │   Postgres (OLTP reference)                                   │
        |   │ pipeline-build-service · pipeline-runner · pipeline-runner-   │
        |   │   spark · lineage-service · ontology-query-service ·          │
        |   │   ontology-exploratory-analysis-service · ontology-indexer ·  │
        |   │   notebook-runtime-service · model-catalog-service ·          │
        |   │   model-deployment-service · ai-evaluation-service ·          │
        |   │   llm-catalog-service · retrieval-context-service ·           │
        |   │   agent-runtime-service · entity-resolution-service ·         │
        |   │   compute-module-service · media-transform-runtime-service ·  │
        |   │   reindex-coordinator-service · solution-design-service       │
        |   │ ── service-to-service SQL: when needed, services consume      │
        |   │    other services' result sets as DataFusion tables via       │
        |   │    libs/query-engine FlightSqlTableProvider (ADR-0009).       │
        |   │    Today the only production Flight SQL endpoint is the       │
        |   │    sql-bi-gateway-service edge; internal compute pools        │
        |   │    referenced by older drafts are not deployed.               │
        |   └───────────────────────────────────────────────────────────────┘
        |
        |   ┌────────────────── RELATIONAL STATE PLANE ─────────────────────┐
        +-> │ dataset-versioning-service · media-sets-service ·             │
        |   │ object-database-service · code-repository-review-service      │
        |   │ ── Service-owned Postgres databases via CloudNativePG         │
        |   │    (ADR-0010, ADR-0024); pgvector for embedded vector search; │
        |   │    barman-cloud → RGW for backups + PITR                      │
        |   └───────────────────────────────────────────────────────────────┘
```

> `sql-bi-gateway-service` is the **single** edge SQL surface for
> external BI clients (Tableau, Superset, Arrow Flight SQL JDBC). It
> exposes an Arrow Flight SQL gRPC listener on `:50133` and an HTTP
> router on `:50134` (saved queries, warehousing CRUD, tabular
> analysis). The Flight SQL surface today is **substrate-only**: a
> literal-SELECT evaluator (`libs/query-engine`) answers BI client
> probes, and any richer statement is federated by catalog prefix to a
> configured Flight SQL backend (`WAREHOUSING_FLIGHT_SQL_URL`,
> `TRINO_FLIGHT_SQL_URL`, `VESPA_FLIGHT_SQL_URL`,
> `POSTGRES_FLIGHT_SQL_URL`). See
> [`services/sql-bi-gateway-service/README.md`](../../services/sql-bi-gateway-service/README.md),
> [ADR-0014](./adr/ADR-0014-retire-trino-flight-sql-only.md) and
> [ADR-0029](./adr/ADR-0029-reintroduce-trino-for-iceberg-analytics.md).

### Plane → owning ADR

| Plane                | Owning ADR(s)                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Storage**          | [ADR-0008 — Iceberg REST Catalog (Lakekeeper, external warehouse)](./adr/ADR-0008-iceberg-rest-catalog-lakekeeper.md) + [ADR-0041 — `iceberg-catalog-service` (Foundry-internal catalog)](./adr/ADR-0041-iceberg-catalog-service.md) |
| **Ingestion**        | [ADR-0011 — Control vs Data bus contract](./adr/ADR-0011-control-vs-data-bus-contract.md) (Kafka data plane)                                                                                                                        |
| **Compute**          | [ADR-0009 — Internal query fabric: DataFusion + Flight SQL](./adr/ADR-0009-internal-query-fabric-datafusion-flightsql.md)                                                                                                           |
| **Control**          | [ADR-0011 — Control vs Data bus contract](./adr/ADR-0011-control-vs-data-bus-contract.md) (NATS JetStream control plane)                                                                                                            |
| **Relational state** | [ADR-0010 — CloudNativePG as the single Postgres operator](./adr/ADR-0010-cnpg-postgres-operator.md) + [ADR-0024 — Postgres consolidation](./adr/ADR-0024-postgres-consolidation.md)                                                |
| **Cross-plane SLOs** | [ADR-0012 — Data-plane SLOs, SLIs and error budgets](./adr/ADR-0012-data-plane-slos.md)                                                                                                                                             |

## Service Families

The table below maps each Go binary under `services/` to the plane it
anchors. For default ports and gateway-route ownership, see
[`services-and-ports.md`](./services-and-ports.md).

| Family | Services |
| --- | --- |
| Entry & experience | `edge-gateway-service`, `apps/web` (frontend, not a Go binary) |
| Control plane | `identity-federation-service`, `authorization-policy-service`, `tenancy-organizations-service`, `ontology-definition-service`, `ontology-actions-service`, `workflow-automation-service`, `application-composition-service`, `notification-alerting-service`, `audit-compliance-service`, `telemetry-governance-service`, `federation-product-exchange-service`, `sdk-generation-service` |
| Ingestion plane | `connector-management-service`, `ingestion-replication-service` |
| Storage plane | `iceberg-catalog-service`, `ai-sink`, `audit-sink` |
| Compute plane | `sql-bi-gateway-service`, `pipeline-build-service`, `pipeline-runner`, `lineage-service`, `ontology-query-service`, `ontology-exploratory-analysis-service`, `ontology-indexer`, `notebook-runtime-service`, `model-catalog-service`, `model-deployment-service`, `ai-evaluation-service`, `llm-catalog-service`, `retrieval-context-service`, `agent-runtime-service`, `entity-resolution-service`, `compute-module-service`, `media-transform-runtime-service`, `reindex-coordinator-service`, `solution-design-service` |
| Relational state plane | `dataset-versioning-service`, `media-sets-service`, `object-database-service`, `code-repository-review-service` |

## Shared Runtime Dependencies

Each platform substrate is anchored to one of the planes above:

- **Postgres** for service-owned relational state — provisioned and
  operated through CloudNativePG (ADR-0010 + ADR-0024). Synchronous
  replicas for HA; barman-cloud → RGW for backups + PITR.
- **NATS JetStream** for async control-plane messaging — see
  [`libs/event-bus-control`](../../libs/event-bus-control/) and
  [ADR-0011](./adr/ADR-0011-control-vs-data-bus-contract.md). The
  package is Go (`segmentio/kafka-go`-compatible wire encoding for the
  Kafka-live bridge; native NATS for the main path).
- **Apache Kafka** for the data plane — see
  [`libs/event-bus-data`](../../libs/event-bus-data/) and
  [ADR-0011](./adr/ADR-0011-control-vs-data-bus-contract.md).
  At-least-once with explicit commits, `acks=all`, idempotent producers,
  zstd compression. `segmentio/kafka-go` (pure Go, no CGO).
- **Object storage**: Rook Ceph (RBD-fast block + RGW S3 EC 4+2). The
  Iceberg layer on top runs **two catalogs by design**:
  - **Lakekeeper** owns the *external warehouse* used by internal sinks
    (`audit-sink`, `ai-sink`, `lineage-service`,
    `dataset-versioning-service`, the Go `pipeline-runner` post-ADR-0045) —
    see [ADR-0008](./adr/ADR-0008-iceberg-rest-catalog-lakekeeper.md).
  - **`iceberg-catalog-service`** owns the *Foundry-internal* catalog
    (multi-table all-or-nothing commit, markings + Cedar, strict schema
    evolution, `master`↔`main` alias) consumed by external Iceberg
    clients (PyIceberg, Spark, Trino, Snowflake) and the `/iceberg-tables`
    admin UI — see [ADR-0041](./adr/ADR-0041-iceberg-catalog-service.md).
- **Vespa** for production search **and** local DX (single-node
  `vespaengine/vespa` container in dev compose); pgvector for embedded
  vector search co-located with relational state. See
  [ADR-0007](./adr/ADR-0007-search-engine-choice.md).
- **Iceberg maintenance**: Flink jobs for rewrite / expire / orphans.

The CI smoke job creates service-specific databases, reflecting
database-per-service isolation rather than a shared schema.

## Control Plane vs Data Plane (Event Bus split)

Events travel over **two distinct buses**, each tuned for different
workloads. Services pick the one that matches the message they emit;
many touch both. The split is formalised in
[ADR-0011](./adr/ADR-0011-control-vs-data-bus-contract.md); latency
budgets live in [ADR-0012](./adr/ADR-0012-data-plane-slos.md).

| Plane             | Package                  | Transport          | Latency  | Retention   | Throughput | Typical traffic                                                     |
| ----------------- | ------------------------ | ------------------ | -------- | ----------- | ---------- | ------------------------------------------------------------------- |
| **Control plane** | `libs/event-bus-control` | NATS JetStream     | µs–ms    | hours/days  | MB/s       | RPC-ish events, signals, fan-out, notifications, workflow triggers  |
| **Data plane**    | `libs/event-bus-data`    | Apache Kafka       | ms       | weeks–PB    | GB–PB/s    | CDC streams, ingestion firehoses, lineage, analytics, audit archive |

### Why two buses

- **Control traffic** is small, latency-sensitive messages ("refresh
  dataset quality", "workflow trigger requested", "notification
  updated"). It needs sub-millisecond fan-out, ephemeral consumers,
  short retention. NATS JetStream fits.
- **Data traffic** is large volumes that must be replayable for hours
  or days (CDC, ingestion, lineage feeding the catalog), consumed by
  online services and batch/analytics jobs. Kafka's partitioned,
  long-retention log fits — and most third-party tooling (Flink,
  Spark, Iceberg ingest paths) expects Kafka.

Splitting the buses gives independent operational envelopes: control
outages don't block data ingestion, and a runaway data producer can't
starve control signals.

### Delivery semantics

- `event-bus-control` (NATS JetStream): durable streams, at-least-once
  with consumer ack windows. Defaults to 7-day retention and 1M-message
  caps per stream — see
  [`libs/event-bus-control/subscriber.go`](../../libs/event-bus-control/subscriber.go).
- `event-bus-data` (Kafka): at-least-once with **explicit commits**.
  Auto-commit is disabled by default; consumers must call
  `DataMessage.Commit(ctx)` (or `Subscriber.CommitOffsets`) once a
  record is durably processed. Producers run with `acks=all`,
  idempotence enabled, zstd compression. See
  [`libs/event-bus-data/subscriber.go`](../../libs/event-bus-data/subscriber.go).

### Topic / subject governance

- Both buses **disable broker-level auto-creation** of topics/subjects.
  Topics are provisioned out of band by the platform's topic registry
  so ownership, retention, partitions and ACLs are managed as code.
- On Kafka, each service authenticates with its own SASL principal
  (`ServicePrincipal` in
  [`libs/event-bus-data/config.go`](../../libs/event-bus-data/config.go)).
  Strimzi ACLs grant `Allow Read` / `Allow Write` on topic prefixes by
  service identity, not by IP or shared credentials.
- On NATS, equivalent isolation is enforced via per-account credentials
  and subject permissions in the JetStream account graph.

### OpenLineage propagation

Every record published through `event-bus-data` carries a small set of
well-known Kafka headers modelling the OpenLineage facets propagated
through pipelines:

| Header         | Meaning                                                  |
| -------------- | -------------------------------------------------------- |
| `ol-namespace` | OpenLineage `namespace` (e.g. `of://datasets`)           |
| `ol-job-name`  | OpenLineage `job.name` of the producing job              |
| `ol-run-id`    | OpenLineage `run.runId`                                  |
| `ol-event-time`| RFC 3339 timestamp for this record                       |
| `ol-producer`  | Producer identity URL (per OpenLineage spec)             |
| `ol-schema-url`| Optional schema/contract URL for the payload (when known)|

This lets `lineage-service` and downstream consumers reconstruct
dataset lineage without a separate side-channel. See
[`libs/event-bus-data/headers.go`](../../libs/event-bus-data/headers.go).

### Picking the right bus

- If the message represents a **command, signal, or short-lived
  notification** that should be acted on immediately and discarded, use
  `event-bus-control`.
- If the message represents **durable state change in a dataset or
  pipeline** that downstream analytics/lineage/audit consumers need to
  replay, use `event-bus-data`.

## Internal query fabric

ADR-0009 establishes Flight SQL P2P as the contract for
service-to-service SQL. The current implementation has two pieces:

- **`libs/query-engine`** ports DataFusion + `FlightSqlTableProvider`
  into Go. It lets a service consume another service's Arrow Flight SQL
  result set as a DataFusion table. Today it also hosts the
  *literal-SELECT evaluator* (`SELECT 1`, `SELECT 'hello'`, …) that
  answers BI client probes when no warehousing backend is configured —
  see
  [`libs/query-engine/doc.go`](../../libs/query-engine/doc.go).
- **`sql-bi-gateway-service`** (port `:50133` gRPC, `:50134` HTTP) is
  the single edge SQL surface. Statements arriving over Flight SQL are
  classified by catalog prefix and federated:
  - `trino.<...>` → Trino (Iceberg analytics, ADR-0029)
  - `vespa.<...>` → Vespa Flight SQL endpoint
  - `postgres.<...>` → Postgres Flight SQL endpoint
  - otherwise → local DataFusion (literal probes) or
    `WAREHOUSING_FLIGHT_SQL_URL` if set

A statement that targets an unconfigured backend fails with
`ErrBackendUnavailable`. The richer "internal compute pool" referenced
by older drafts of this document (a separate `sql-warehousing-service`
binary on port `50123`) is **not** currently deployed — its routing
table entries remain so the gateway can federate to it if it returns,
but the service is retired and the gateway answers locally in the
meantime. See
[`services/sql-bi-gateway-service/internal/routing/`](../../services/sql-bi-gateway-service/internal/routing/).

## Frontend Coupling

[`apps/web/src/routes/*`](../../apps/web/src/routes/) and
[`apps/web/src/lib/api/*`](../../apps/web/src/lib/api/) mirror the
runtime surface area exposed by `edge-gateway-service`. Route families
such as `datasets`, `pipelines`, `ontology`, `ai`, `ml`, `marketplace`
and `code-repos` map onto the backend service topology declared in
[`router_table.go`](../../services/edge-gateway-service/internal/proxy/router_table.go).

## Why The Gateway Matters

`edge-gateway-service` is the control-plane HTTP entrypoint:

- it exposes `/healthz`, `/metrics` and the `/api/*` surface
- it centralises cross-cutting middleware: auth (JWT via
  `libs/auth-middleware`), CORS, request IDs, rate limiting, audit
  fan-out
- it routes downstream traffic to specialised services rather than
  collapsing everything into a single backend

That keeps the browser client simpler while preserving service
autonomy behind the edge.
