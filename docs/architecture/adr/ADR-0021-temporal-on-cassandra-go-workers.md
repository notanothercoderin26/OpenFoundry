# ADR-0021: Temporal on Cassandra, with business workers in Go

> **Superseded by [ADR-0037](./ADR-0037-foundry-pattern-orchestration.md) on 2026-05-04.**
> The Temporal-on-Cassandra direction recorded below is replaced by a
> distributed Foundry-pattern substrate (Spark Operator + Kafka +
> Postgres state machines + transactional outbox / Debezium). The
> migration is tracked in
> [`docs/architecture/migration-plan-foundry-pattern-orchestration.md`](../migration-plan-foundry-pattern-orchestration.md).

- **Status:** Superseded by [ADR-0037](./ADR-0037-foundry-pattern-orchestration.md)
- **Date:** 2026-05-02
- **Superseded:** 2026-05-04
- **Deciders:** OpenFoundry platform architecture group
- **Supersedes / supplements:**
  - The bespoke scheduler in
    [services/workflow-automation-service](../../../services/workflow-automation-service)
    and the in-process tick loop in
    [services/pipeline-schedule-service](../../../services/pipeline-schedule-service).
  - The "workflow engine casero" risk recorded in
    [docs/architecture/audit-and-reference-no-spof.md](../audit-and-reference-no-spof.md).
- **Related ADRs:**
  - [ADR-0020](./ADR-0020-cassandra-as-operational-store.md) — Temporal
    persistence and visibility share the platform Cassandra cluster.
  - [ADR-0022](./ADR-0022-transactional-outbox-postgres-debezium.md) —
    Activities that must publish a domain event do so by writing to the
    Postgres outbox; Debezium publishes to Kafka.
  - [ADR-0025](./ADR-0025-eliminate-custom-scheduler.md) — Companion
    decision that retires the in-house scheduler.

## Context

OpenFoundry today runs two pieces of in-process workflow machinery:

- `services/workflow-automation-service` reimplements scheduling and
  orchestration with Postgres state and an in-process cron library.
- `services/pipeline-schedule-service` runs an in-process tick loop and
  is currently scaled to **a single replica** because two replicas would
  double-fire jobs.

Both implementations lack durable execution, signal handling, exactly-
once scheduling guarantees, retries with bounded backoff, deduplication
of side effects and any cross-service coordination story. The audit in
[docs/architecture/audit-and-reference-no-spof.md](../audit-and-reference-no-spof.md)
classifies this as a critical SPOF and a correctness risk.

The platform also needs, going forward:

- Long-running approval flows with human-in-the-loop signals.
- Pipeline runs with retry, compensation and visibility.
- Scheduled jobs with exactly-once semantics across replicas and DCs.
- A multi-DC story that survives a regional failure
  ([ADR-0023](./ADR-0023-iceberg-cross-region-dr.md)).

A workflow engine that is durable, replayable and multi-DC is the
correct primitive here. We need to choose the engine, the persistence
backend and — critically — the language in which workers are written.

## Options considered

### Engine choice

#### Engine A — Temporal (chosen)

- Apache-2.0, mature, durable execution model, exactly-once activity
  semantics, signals, queries, updates, schedules, child workflows,
  versioning (`patched`), continue-as-new, multi-DC.
- First-class persistence backends include **Cassandra**, which we are
  already adopting in [ADR-0020](./ADR-0020-cassandra-as-operational-store.md);
  this collapses two storage decisions into one.
- Polyglot SDK story (Go, Java, .NET, TypeScript, Python, Ruby) makes
  it possible to mix the language we use for workers with the language
  we use for services.

#### Engine B — Argo Workflows

- Kubernetes-native, YAML / DAG style, optimised for batch / CI-style
  pipelines.
- Lacks first-class signals, durable per-instance state machines, and
  a programmable workflow API. Not a fit for human-in-the-loop
  approvals or for long-running domain workflows.

#### Engine C — Cadence (Uber)

- The ancestor of Temporal. Smaller community, slower release cadence,
  Temporal is the de facto successor.

#### Engine D — Roll our own (current state)

- Already proved insufficient. Rejected.

### Persistence backend for Temporal

Temporal's first-class backends are Cassandra, PostgreSQL and MySQL.

- **Cassandra (chosen)** — Aligns with
  [ADR-0020](./ADR-0020-cassandra-as-operational-store.md). Multi-DC
  story works out of the box with `NetworkTopologyStrategy`. No second
  storage technology to introduce.
- **PostgreSQL** — Would force us to either size the consolidated
  Postgres clusters for Temporal write load (a poor fit per the same
  reasoning as ADR-0020) or stand up a dedicated `pg-temporal` cluster
  (a regression from the consolidation in
  [ADR-0024](./ADR-0024-postgres-consolidation.md)).

### Visibility backend

Temporal's visibility store can be backed by the same persistence
backend, by Elasticsearch (advanced visibility) or by SQL.

- **Cassandra (chosen, advanced visibility via Cassandra 5 SAI)** —
  Avoids introducing Elasticsearch as a new operational dependency.
  Cassandra 5's Storage-Attached Indexes provide enough query
  flexibility for the visibility workloads we need (workflow listings,
  filters by type / status / time / tag).
- **Elasticsearch** — Rejected. Adds a new HA stateful system whose
  search needs are already covered by Vespa
  ([ADR-0028](./ADR-0028-search-backend-abstraction.md)) for our
  domain search. Adding Elasticsearch only for Temporal visibility
  would duplicate the search-engine concern in the platform.

### Worker language

#### Worker option W1 — Go SDK in dedicated worker pods (chosen)

- `go.temporal.io/sdk` is GA, has been used in production by Temporal
  Inc. and many third parties for years, and exposes the full feature
  surface (interceptors, testing framework, Sessions, Schedules,
  versioning, replay tests, encryption codecs).
- Workers run as **independent Kubernetes Deployments**, not as
  sidecars in the application service pods. Communication with
  application services is **HTTP REST + JSON** (see "Wire format"
  below); Temporal mediates execution.
- Application services keep the **client side** of Temporal via
  `libs/temporal-client`, a thin wrapper over the gRPC API that gives
  callers typed helpers to start workflows, send signals, query state
  and wait for results.
- Operational footprint:
  - Go toolchain is the single language for both services and workers.
  - Independent scaling of workers: a workflow that needs more
    activity throughput scales by adding `workers-go/<domain>/`
    pods, not by scaling the application services.
  - Independent crash isolation between application services and
    worker pods.

#### Worker option W2 — Java SDK in dedicated worker pods

- Equivalent maturity to Go. Rejected because Go's runtime footprint
  (single static binary, ~20 MB image) is a better fit for the
  platform than the JVM, and because the team has more Go than Java
  bandwidth.

#### Worker option W3 — Sidecar (same pod) with Go / Java

- Co-located worker shares the lifecycle of the application service
  pod. Adds coupling (a worker restart impacts the service and vice
  versa), complicates HPA (the metric you scale on becomes ambiguous),
  and buys us nothing that pod-separated workers do not already give
  us.
- Rejected.

## Decision

We adopt **Temporal 1.24+** with **Cassandra as both persistence and
visibility backend**, deployed via the official `temporalio/temporal`
Helm chart. We deploy:

- `frontend` × 3
- `history` × 3
- `matching` × 3
- `worker` (Temporal system worker) × 3
- `web` (Temporal UI) × 2 behind the OpenFoundry edge gateway with
  OIDC authentication via `identity-federation-service`.

Business workflows and activities are written in **Go**, using the GA
`go.temporal.io/sdk` v1.28+, and live under a dedicated top-level
directory `workers-go/` with one binary per domain
(`workflow-automation`, `pipeline`, `approvals`, `automation-ops`,
`reindex`).

Application services keep the **client side only**, via the
`libs/temporal-client` library with strongly typed per-domain client
helpers.

Activities Go invokes do not bypass service boundaries: they call the
owning service over **HTTP REST + JSON** with a service-token bearer
and the `x-audit-correlation-id` header (see "Wire format" below).
There is no shortcut from Go workers to Cassandra or Postgres. The
single exception is the `reindex` worker, whose explicit job is to
scan Cassandra and publish to Kafka — that exception is documented
inline in [`workers-go/README.md`](../../../workers-go/README.md).

### Wire format between Go activities and application services

The receiving services (`ontology-actions-service`,
`pipeline-authoring-service`, `pipeline-build-service`,
`audit-compliance-service`, `automation-operations-service`) all
expose REST handlers, not gRPC servers. The activities are thin
enough (a JSON encode + an HTTP POST) that they need no generated
bindings on the worker side. The audit-correlation header
`x-audit-correlation-id` is identical on the wire whether the
transport is HTTP or gRPC metadata, so nothing in the audit chain is
sensitive to the choice.

The canonical contract for activities is therefore:

- **Transport**: HTTP/1.1 to the owning service inside the cluster.
- **Body**: JSON, shape derived from the corresponding `proto/`
  message but written directly as `map[string]any` in Go (the proto
  files remain the source-of-truth that the receiving handler
  validates against).
- **Auth**: `Authorization: Bearer <service-token>` from
  `OF_<SERVICE>_BEARER_TOKEN`.
- **Correlation**: `x-audit-correlation-id: <uuid-v7>` from the
  workflow's `audit_correlation_id` search attribute.
- **Idempotency**: 4xx responses (other than 429) become
  `temporal.NewNonRetryableApplicationError`; 5xx and 429 are retried
  by Temporal under the workflow's `RetryPolicy`.

`proto/` continues to be the contract source for the TypeScript web
client. If a future audit shows the maintenance cost of hand-written
JSON in Go activities exceeds the buf-generated alternative, this
decision can be revisited without touching the receiving services
or the Temporal wiring.


## Topology and configuration

### Helm release

- Chart: `temporalio/temporal` (Helm chart, Apache-2.0).
- Namespace: `temporal-system`.
- Persistence: Cassandra cluster from
  [ADR-0020](./ADR-0020-cassandra-as-operational-store.md), keyspaces
  `temporal_persistence` and `temporal_visibility`.
- TLS: enabled in production (mTLS via Linkerd in-mesh; Temporal
  frontend exposed only inside the mesh).
- Authentication: Temporal CLI / UI authenticate against
  `identity-federation-service` OIDC.

### Keyspaces

| Keyspace                | RF                       | Schema source                  |
| ----------------------- | ------------------------ | ------------------------------ |
| `temporal_persistence`  | `{dc1:3, dc2:3, dc3:3}`  | Temporal schema CLI            |
| `temporal_visibility`   | `{dc1:3, dc2:3, dc3:3}`  | Temporal schema CLI            |

Schema is bootstrapped via `temporal-cassandra-tool setup-schema` and
`update-schema` as a Helm Job (`pre-install` / `pre-upgrade`).

### Default consistency

`LOCAL_QUORUM` for both reads and writes, matching the platform default
([ADR-0020](./ADR-0020-cassandra-as-operational-store.md)).

### Worker layout

```
workers-go/
  go.work
  go.work.sum
  shared/                     (proto-generated clients, common helpers)
  workflow-automation/        (binary; one Temporal task queue)
    cmd/worker/main.go
    workflows/
    activities/
    Dockerfile
  pipeline/
  approvals/
  automation-ops/
  reindex/
```

Each worker:

- Reads `TEMPORAL_HOSTPORT`, `TEMPORAL_NAMESPACE` and
  `TEMPORAL_TASK_QUEUE` from environment.
- Registers its workflows and activities at startup.
- Calls application services over HTTP REST + JSON (see "Wire format"
  above), propagating the `x-audit-correlation-id` header.
- Emits OpenTelemetry traces and Prometheus metrics in the same
  format as the rest of the platform.

### Client layout

`libs/temporal-client` exposes typed wrappers per domain:

```go
type WorkflowAutomationClient struct { /* … */ }

func (c *WorkflowAutomationClient) RunActionWorkflow(ctx context.Context, req RunActionRequest) (WorkflowHandle, error)
```

Configured from the `TEMPORAL_HOSTPORT` env var. No business logic
lives in workers; no workflow definitions live in application
services.

## Operational consequences

- New top-level directory `workers-go/` with its own `go.work` and CI
  job (`go-workers-build`).
- New `infra/helm/infra/manifests/temporal/` Helm release.
- New runbook `infra/runbooks/temporal.md` covering schema upgrades,
  task queue rebalancing, scaling history shards, namespace
  configuration, retention policies and the failover procedure for the
  multi-DC scenario in [ADR-0023](./ADR-0023-iceberg-cross-region-dr.md).
- Grafana dashboard 17567 imported for Temporal SDK metrics.
- New `just` recipes: `just go-build`, `just go-test`,
  `just go-worker <name>`, `just temporal-tctl`.
- Dependency on the Go toolchain in CI and dev images.

## Consequences

### Positive

- Durable execution, exactly-once activity semantics and bounded
  retries become platform primitives, removing a whole class of
  correctness bugs.
- The custom scheduler in `pipeline-schedule-service` is retired
  ([ADR-0025](./ADR-0025-eliminate-custom-scheduler.md)); Temporal
  Schedules give exactly-once cron semantics across replicas and DCs.
- Multi-DC failover for workflows comes for free with the Cassandra
  multi-DC topology already chosen in
  [ADR-0020](./ADR-0020-cassandra-as-operational-store.md).
- Application services' public contracts (gRPC / OpenAPI / SDK) do not
  change because Temporal lives behind them.

### Negative

- Workers cannot share business types with application services through
  a single type system; the contract is HTTP/JSON, with `proto/` as the
  message-shape source-of-truth. This is a feature, not a bug — the
  contract is explicit, versioned, and the same one external clients
  use.
- Temporal adds a new HA stateful system to operate (the Temporal
  cluster itself). Mitigated by sharing the Cassandra backend with
  the rest of the platform.

## Re-evaluation trigger

This ADR is **scheduled for re-evaluation in May 2027** (T+12 months),
or sooner if a platform-internal pain point (e.g. cross-language type
drift, build-time cost of Go workers) materially changes the trade-off
captured here.

## Follow-ups (historical — superseded)

The follow-up tasks below were the implementation roadmap for the
Temporal-on-Cassandra direction recorded in this ADR. **All of them
are superseded** by the Foundry-pattern migration tracked in
[ADR-0037](./ADR-0037-foundry-pattern-orchestration.md) and
[`docs/architecture/migration-plan-foundry-pattern-orchestration.md`](../migration-plan-foundry-pattern-orchestration.md).
Kept verbatim as audit trail; do not act on them.

- Implement migration plan task **S2.1** (Temporal cluster HA on
  Cassandra).
- Implement migration plan task **S2.2** (client library
  `libs/temporal-client` + Go worker scaffolding under `workers-go/`).
- Implement migration plan tasks **S2.3 – S2.7** (port each existing
  workflow to a Go worker; retire the legacy scheduler).

## Migration log (FASE 0 → FASE 11)

The retirement of this ADR landed across eleven phases of the
Foundry-pattern migration plan
([`docs/architecture/migration-plan-foundry-pattern-orchestration.md`](../migration-plan-foundry-pattern-orchestration.md)).
Per-phase summary:

| Phase | Surface | Outcome |
|---|---|---|
| FASE 0 | Decision capture (this Superseded banner; ADR-0037; ADR-0038 event/idempotency contract). | Done. |
| FASE 1 | New libraries: `libs/state-machine`, `libs/saga`, `libs/event-scheduler`, `libs/idempotency`, `libs/outbox`. | Done — every library ships its own migration template + integration tests. |
| FASE 2 | Outbox + Debezium contract validated end-to-end (`outbox.events` per bounded context, Debezium EventRouter SMT). | Done. |
| FASE 3 | `pipeline-worker` (Go) → SparkApplication CRs submitted by `pipeline-build-service`; cron-driven runs fired by the `schedules-tick` CronJob from `libs/event-scheduler`. | Done — Tareas 3.1 → 3.7. |
| FASE 4 | `reindex-worker` (Go) → `services/reindex-coordinator-service` (Kafka-driven, Postgres-resumable cursor in `pg-runtime-config.reindex_jobs`). | Done — Tareas 4.1 → 4.4. |
| FASE 5 | `workflow-automation-worker` (Go) → `services/workflow-automation-service` self-contained (Kafka condition consumer + state machine `automation_runs` + outbox publishing `automate.outcome.v1`). | Done — Tareas 5.1 → 5.4. |
| FASE 6 | `automation-ops-worker` (Go) → `services/automation-operations-service` (saga consumer + `libs/saga::SagaRunner` driving step graphs registered in `domain.dispatcher`, LIFO compensation validated by the chaos test under `tests/saga_chaos`). | Done — Tareas 6.1 → 6.5. |
| FASE 7 | `approvals-worker` (Go) → `services/approvals-service` (`audit_compliance.approval_requests` state machine) + `approvals-timeout-sweep` Kubernetes CronJob driving the `pending → expired` transition every 5 min. | Done — Tareas 7.1 → 7.5. |
| FASE 8 | Workspace-wide cleanup: delete every `temporal_adapter` package, drop every `temporal-client` dependency, `git rm -rf libs/temporal-client/`. | Done — Tareas 8.1 → 8.3. |
| FASE 9 | Infrastructure cleanup: `git rm -rf infra/helm/infra/temporal/` (chart wrapper + 1.2.0 dep tarball + UI ingress + ServiceMonitor); helmfile gating + `temporal` repo entry retired; Cassandra DROP runbook (irreversible — operator-driven); `workers-go/` deleted entirely (alongside `go-workers.yml` CI matrix and `libs/testing` Temporal harness); `docker-publish.yml` matrix rebuilt to list real services + `pipeline-runner`; new `integration-foundry-pattern.yml` running the libs/saga + libs/state-machine + libs/outbox + libs/idempotency + automation-operations chaos tests on every PR. | Done — Tareas 9.1 → 9.4. |
| FASE 10 | Documentation: this Migration log; README sweep across services / libs / infra; canonical [`docs/architecture/foundry-pattern-orchestration.md`](../foundry-pattern-orchestration.md). | Done — Tareas 10.1 → 10.3. |
| FASE 11 | End-to-end verification (smoke against a cluster with the cutover applied). | Pending. |

### What stays after FASE 11

- **Cassandra cluster.** Cassandra is *not* retired; only the
  `temporal_persistence` and `temporal_visibility` keyspaces are
  dropped (per the runbook at
  [`infra/runbooks/temporal.md`](../../../infra/runbooks/temporal.md)).
  The ontology object store + every other application keyspace
  stays untouched.
- **Postgres CNPG clusters.** Each consolidated CNPG cluster
  (`pg-policy`, `pg-runtime-config`, `pg-schemas`, `pg-lakekeeper`)
  keeps the bounded-context schemas it already had; the new tables
  introduced by FASE 5/6/7 (`workflow_automation.automation_runs`,
  `automation_operations.saga_state` (or per-DB `saga.state`),
  `audit_compliance.approval_requests`, plus the per-cluster
  `outbox.events` and `processed_events`) live alongside them.
- **Per-service `temporal_adapter` packages are gone everywhere.**
  No service imports anything from the Temporal SDK after FASE 8.

### Why the supersession was clean

The ADR-0021 design isolated Temporal behind two thin seams that
turned out to be exactly the seams the migration needed:

1. Every workflow body called out to a REST handler — no business
   logic ran in Go.
2. Every caller talked to Temporal through
   `libs/temporal-client` — a single import surface.

Replacing the substrate meant deleting those seams, not rewriting
business logic. Every domain's effect call still lands on the same
HTTP endpoint it landed on before; the only change is what
*invokes* the call (a Kafka consumer + state-machine apply
instead of a Temporal activity).
