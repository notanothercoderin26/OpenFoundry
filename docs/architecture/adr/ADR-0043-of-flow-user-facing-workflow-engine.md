# ADR-0043: of-flow user-facing workflow engine (Conductor-OSS-inspired, no Temporal)

- **Status:** Accepted
- **Date:** 2026-05-08
- **Deciders:** OpenFoundry technical committee
- **Related ADRs:**
  - [ADR-0021](./ADR-0021-temporal-on-cassandra-go-workers.md) — Temporal
    on Cassandra (superseded by ADR-0037 for *internal* orchestration).
  - [ADR-0037](./ADR-0037-foundry-pattern-orchestration.md) — Foundry-pattern
    distributed orchestration. **Internal-only** orchestration substrate.
  - [ADR-0011](./ADR-0011-control-vs-data-bus-contract.md) — control bus
    (NATS) vs data bus (Kafka).
  - [ADR-0022](./ADR-0022-transactional-outbox-postgres-debezium.md) —
    transactional outbox.
  - [ADR-0027](./ADR-0027-cedar-policy-engine.md) — Cedar policy engine.
- **Full design rationale (archived):**
  [`docs/archive/AUDIT-RESPONSE-AND-FLOW-ENGINE-DESIGN.md`](../../archive/AUDIT-RESPONSE-AND-FLOW-ENGINE-DESIGN.md),
  Parts II–III.

## Context

ADR-0037 retired Temporal as the *internal* orchestration substrate and
replaced it with the Foundry-pattern (Kafka outbox, Spark Operator
CRs, Postgres state machines). That decision is correct for
infrastructure-level coordination (saga choreography, scheduled
fan-out, pipeline runs) — it has no centralised orchestrator and
reuses building blocks already mandated by ADR-0022.

What ADR-0037 does **not** address is the *user-facing* product
primitive: analysts, investigators and power-users authoring,
versioning, monitoring and re-running named workflows as a first-class
artefact. Foundry-pattern choreography is invisible to those users by
design — the audit response in May 2026 surfaced this gap explicitly:
runtime-level orchestration is solved, product-level orchestration is
not.

The two layers must not be conflated:

|                          | Foundry-pattern (ADR-0037) | of-flow (this ADR) |
|--------------------------|----------------------------|--------------------|
| Audience                 | Platform engineers         | End-users (analysts, investigators) |
| Authored by              | Service owners (Go code)   | Users (declarative DSL, UI) |
| Visibility               | Implementation detail      | Product primitive |
| Substrate                | Kafka + outbox + Spark CR  | Postgres + workers + DSL |
| Naming / versioning      | None at user level         | Named, versioned `WorkflowDefinition` |
| Replay / point-in-time   | Per-event idempotency      | Run-level replay with snapshotted state |
| Human-in-the-loop steps  | Out of scope               | First-class task type |

## Decision

OpenFoundry will build **of-flow**, an in-house user-facing workflow
engine, as a new bounded context. Conductor OSS is the design
inspiration; Temporal is explicitly **excluded** (its determinism
contract leaks into business code authored by non-platform teams,
which is exactly the user we are designing for).

### Substrate and dependencies

- Persistence: Postgres (CNPG) — `workflow_definitions`,
  `workflow_runs`, `workflow_tasks`, `workflow_events`. No new datastore.
- Coordination: Kafka topics `flow.tasks.<type>.v1` for worker
  dispatch, `flow.events.v1` for run lifecycle, plus the
  transactional outbox from ADR-0022 for atomic state-machine commits.
- Authorization: Cedar (ADR-0027). New entities `WorkflowDefinition`,
  `WorkflowRun`, plus per-task-type actions (`flow.run`, `flow.read`,
  `flow.cancel`, `flow.approve`).
- Audit: Existing audit-compliance pipeline. Every state transition
  emits `flow.events.v1` envelopes consumed by `audit-sink`.
- Observability: `libs/observability` slog + OTel; trace spans are
  per-task, parent run is the trace root.

### Authoring surface

- **Declarative DSL** in YAML / JSON — workflows are data, not code.
  Versioned per `(name, major)`; minor versions are backwards-compatible
  edits; major bumps are explicit migrations.
- **Worker SDKs** in Go, Python and TypeScript that poll
  `flow.tasks.<type>.v1` and post outcomes back through a typed client.
  Workers do **not** implement determinism replay — outcomes are
  durable state writes, not event-sourced history.
- **UI authoring** in `apps/web` lands in a follow-up phase; the engine
  must be usable via API + DSL files from day one.

### Task taxonomy (initial set)

`SIMPLE` (worker-executed), `HTTP` (out-of-process call),
`DECISION` (switch), `FORK_JOIN` (parallel branches),
`SUB_WORKFLOW` (compose), `WAIT` (timer / signal),
`HUMAN` (approval gate, ties into `approvals.events.v1`),
`SCRIPT` (sandboxed JS/Python via `function_runtime`).

### Idempotency, retries, sagas

- Each task carries a deterministic `task_id` (UUID v5 over
  `(run_id, definition_step)`); workers ack with the same id, store
  dedupes via `libs/idempotency`.
- Retry policy is per task type with exponential backoff; cap configurable.
- Compensations are declared inline next to the forward step
  (`compensate: <task ref>`), executed LIFO on saga failure (mirrors
  `libs/saga`).

### What is **out** of scope (deliberately)

- Replacing ADR-0037 for any internal orchestration use case.
- Replacing the Spark CR contract for pipeline runs.
- A general-purpose actor framework. of-flow is a workflow engine, not
  a runtime.
- Polyglot determinism (Temporal-style replay).

## Consequences

**Positive**

- Users get a named, versioned, monitorable workflow primitive without
  paying the determinism tax that Temporal charges.
- Reuses existing platform components (Postgres, Kafka, outbox, Cedar,
  audit) — no new operational surface beyond the of-flow service
  itself and its worker fleet.
- Clear separation between platform-internal orchestration (ADR-0037)
  and product orchestration (this ADR) — neither leaks into the other.

**Negative / accepted costs**

- A new bounded context to own, monitor and version.
- DSL design is a long-tail commitment; we will iterate on schema
  versioning rules (see "authoring surface" above).
- No determinism replay means certain failure modes (e.g. partial
  external side-effects on retry) require explicit compensation
  modelling by the workflow author. This is a known trade-off and is
  documented up front.

**Migration path**

- Phase 1 (12 weeks): of-flow service skeleton, DSL parser,
  `SIMPLE`/`HTTP`/`DECISION`/`WAIT` task types, Go SDK, REST API.
- Phase 2 (next 12 weeks): `FORK_JOIN`, `SUB_WORKFLOW`, `HUMAN`,
  Python + TypeScript SDKs, audit + Cedar wiring.
- Phase 3: UI authoring, run replay, scripted tasks via
  `function_runtime`.

The full 28-section design doc, audit-response matrix and roadmap
detail live in
[`docs/archive/AUDIT-RESPONSE-AND-FLOW-ENGINE-DESIGN.md`](../../archive/AUDIT-RESPONSE-AND-FLOW-ENGINE-DESIGN.md).
That document is archived because it mixes audit-response (which is a
point-in-time snapshot) with the of-flow design (which is captured
here). Future revisions amend this ADR rather than the archive.
