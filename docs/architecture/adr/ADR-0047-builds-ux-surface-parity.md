# ADR-0047 — Builds UX and surface parity

- **Status**: Proposed
- **Date**: 2026-05-22
- **Owners**: pipeline-build-service maintainers, apps/web maintainers
- **Supersedes**: none — extends [ADR-0036 Builds: Foundry parity](ADR-0036-builds-foundry-parity.md)
  which closed the orchestration / state-machine gap. This ADR closes the
  **user-facing surface** gap.
- **Related**:
  [ADR-0033 Branching parity](ADR-0033-branching-foundry-parity.md),
  [ADR-0034 Datasets parity](ADR-0034-datasets-foundry-parity.md),
  [ADR-0037 Foundry-pattern orchestration](ADR-0037-foundry-pattern-orchestration.md),
  [ADR-0045 Eliminate pipeline-runner-spark](ADR-0045-eliminate-pipeline-runner-spark-pure-go-runtime.md).
- **External references** (Palantir public docs):
  [Builds (core concept)](https://www.palantir.com/docs/foundry/data-integration/builds),
  [Application reference §Builds](https://www.palantir.com/docs/foundry/data-integration/application-reference),
  [Debug a failing job](https://www.palantir.com/docs/foundry/optimizing-pipelines/debug-job),
  [Debug a failing pipeline](https://www.palantir.com/docs/foundry/optimizing-pipelines/debug-pipeline),
  [Understand Spark details](https://www.palantir.com/docs/foundry/optimizing-pipelines/understand-spark-details),
  [Build timeline (Data Lineage)](https://www.palantir.com/docs/foundry/data-lineage/build-timeline),
  [Find and manage schedules](https://www.palantir.com/docs/foundry/building-pipelines/find-manage-schedules),
  [View and modify schedules](https://www.palantir.com/docs/foundry/building-pipelines/view-modify-schedules),
  [AIP features in Code Repositories §Builds](https://www.palantir.com/docs/foundry/code-repositories/aip-features).

## Context

ADR-0036 ratified the backend lifecycle of Builds: `BuildState` and
`JobState` enums, build resolution, queueing on input contention,
staleness signature, multi-output atomicity, abort cascade, the eight
canonical outbox events, and a SSE/WS live-log surface with the
intentional 10-second initialization delay.

A post-D1.1.5 audit shows the **orchestration core is ~80 %** of
Foundry parity, but the **user-facing surface is ~40 %**:

| Layer | Today | Gap |
|---|---|---|
| Build list (`/builds`) | List + abort + create-via-JSON modal | Filters limited to state/branch/pipeline; no Owner / Project / Job-type / Schedule filters; no Trigger / Retries / Queue-vs-Compute columns; no datasets pane |
| Build report (`/builds/:rid`) | Tabs Overview / Logs / Artifacts / Raw | No Gantt; no progress-details toggle; no schedule card; no datasets pane Compare; no AIP error enhancer; no Rerun / Force / Rerun-as-Debug |
| Job report | Folded into build detail | Not its own page; no per-job tabs (Overview / Logs / Spark / Compare / Inputs / Outputs); no log file tree (`_driver.log`, `executor_*`); no Download per file |
| Live logs | SSE + WS endpoints served | Not wired in UI; no level colour-coding (info=blue, warn=orange, error=red, debug=gray); no Format-as-JSON; no Pause/Resume |
| Spark details | None | No `/spark` route; no Overview tab (metrics, stage Gantt, task concurrency, stage details); no Executors tab; no Snapshot capture |
| Job Comparison Tool | None | Three-tab modal (Comparison Summary / Input Changes / Code Changes) absent; no compare endpoint |
| Launcher | Route exists | **No `Builds` tile registered in `apps/web/src/lib/launcher/catalog.ts`** |
| Build Schedules companion app | Empty folder | Foundry exposes a dedicated *Build Schedules* app; we have `apps/web/src/routes/schedules/` empty |
| Data Lineage ↔ Builds | Lineage events emitted | No build-timeline view; no "View build report" cross-link |

Closing this gap is what allows operators to actually **see and debug
the state of pipelines produced by Pipeline Builder and Code
Repositories** — which is the role Foundry assigns to Builds.

## Decisions

### 1 — Builds is a first-class launcher app, not a sub-tab

`Builds` is registered as a top-level tile under the
`data-integration` launcher category, peer to *Pipeline Builder*,
*Code Repositories*, *Data Lineage*, *Data Connection*, *Dataset
Preview* and *Data Health*. It is **not** a tab inside any of those
apps. Single registration site:
`apps/web/src/lib/launcher/catalog.ts`.

### 2 — Job report is its own page, not a tab on the build report

Foundry treats the job as the unit of debugging. We split the current
omnibus `BuildDetailPage.tsx` into:

- `routes/builds/BuildsPage.tsx` (list, already exists, extend)
- `routes/builds/BuildDetailPage.tsx` (build-level Gantt + jobs list +
  schedule card + global actions)
- `routes/builds/JobReportPage.tsx` *(new)* — tabs `Overview`,
  `Logs`, `Spark details`, `Compare`, `Inputs`, `Outputs`
- `routes/builds/SparkDetailsPage.tsx` *(new)* — sub-tabs `Overview`,
  `Executors`

Deep links: `/builds`, `/builds/:rid`,
`/builds/:rid/jobs/:jobRid`, `/builds/:rid/jobs/:jobRid/spark`.

### 3 — Gantt is the primary visualization of a build

Build report header is a Gantt of jobs (one row per job, X = time,
colour = `JobState`). Toggle in the top-right switches the X axis
between *wall clock* and *queue time vs compute time*, which requires
backend columns `jobs.queue_duration_ms` and `jobs.compute_duration_ms`
(migration **`20260523000100_jobs_progress_split.sql`**). The Gantt
reuses `apps/web/src/lib/lineage/buildTimeline.ts`, currently unused.

### 4 — Live logs are wired through the existing SSE/WS endpoints

The backend already exposes `/v1/jobs/{rid}/logs/stream` (SSE) and
`/v1/jobs/{rid}/logs/ws` (WebSocket). The `View live` button on the
log viewer toggles between paginated history and the stream. Colour
coding is fixed by Foundry's contract and is part of this ADR:

| Level | Token |
|---|---|
| `INFO` | blue |
| `WARN` | orange |
| `FATAL` / `ERROR` | red |
| `DEBUG` / `TRACE` | gray |

`Pause` freezes the viewport into an internal buffer without
cancelling the stream; `Resume` flushes and resumes auto-scroll.
JSON-shaped messages render as a collapsible `<pre>` block ("Format
as JSON"). The 10-second initialization heartbeat from ADR-0036 §2 is
preserved as a contractual badge.

### 5 — Spark details is sourced from a new domain package, not the
runtime directly

We introduce `services/pipeline-build-service/internal/domain/spark/`
which persists Spark execution reports per job into a new
`spark_reports` table (migration
**`20260523000200_spark_reports.sql`**). Sources of truth, in order
of preference:

1. OpenLineage Spark facets emitted by the pure-Go runtime per
   ADR-0045.
2. (Transitional) scrape of the Spark History Server while
   `pipeline-runner-spark` still exists.

The `Snapshot` action on the Executors tab issues
`POST /v1/jobs/{rid}/spark:snapshot`, which captures a Java stack
trace or memory histogram. The endpoint is only enabled when the job
is in `RUNNING`; it returns `409 CONFLICT` otherwise.

### 6 — Four new write endpoints close the action surface

| Method | Path | Purpose | Foundry doc |
|---|---|---|---|
| `POST` | `/v1/builds/{rid}:rerun` | Clone the build with identical JobSpecs, branch, trigger=`MANUAL`. | *Debug a failing pipeline §Mitigation* |
| `POST` | `/v1/builds:force` *(or `force=true` on `CreateBuild`)* | Skip staleness check. | *Builds §force build* |
| `POST` | `/v1/jobs/{rid}:rerun-as-debug` *(query `module_version`)* | Re-run a single job pinning a module version. | *Debug a failing job §Rerun as Debug job* |
| `GET`  | `/v1/jobs/{rid}/compare?baseline={prev_rid}` | Three-section diff (summary, inputs, code) used by the Job Comparison Tool. Default baseline is the most recent `COMPLETED` job for the same `jobspec_rid`. | *Debug a failing job §Compare jobs* |

All four are auth-gated through `libs/auth-middleware` and traced via
`libs/observability`. They emit the existing
`foundry.build.events.v1` events from ADR-0036 — no new event names.

### 7 — Build Schedules ships as a companion app, not folded into Builds

Foundry deliberately separates *Builds* (per-run state) from *Build
Schedules* (recurring trigger state). We mirror that split:

- New launcher tile `Build Schedules` under `data-integration`,
  routed to `/schedules` (the empty folder exists today).
- Schedule cards expose: configuration, the 10 most recent runs as
  coloured dots (clickable → build report), *Total compute*, *Median
  duration*, *Mean frequency*. Bulk actions: pause / enable / delete.
- A *Versions* tab diffs schedule versions
  (Foundry: *View and modify schedules §View schedule edit history*).
- *Auto-pause after N consecutive failures* is implemented as a
  control-plane rule, with email notification and one-click resume —
  matching Foundry's *Automatically paused schedules* behaviour.

### 8 — AIP error enhancer is opt-in and stays out of the hot path

When `AIP_ENABLED` is true and a job is `FAILED`, the build report
renders an AIP error enhancer widget that calls
`POST /v1/jobs/{rid}/error-enhancer`. The handler proxies stack +
context to the AIP service and caches the response in
`spark_reports.error_enhancement` (or a sibling table). It must never
block log rendering and must degrade silently when AIP is unavailable.

### 9 — Wizard replaces the JSON textarea on Create build (dev mode kept)

The current free-form JSON textarea is hidden behind a "Developer
mode" toggle. The default `Run build` action opens a wizard:
dataset/JobSpec selection → branch → force? → review. Targets the
existing `POST /v1/builds` endpoint.

### 10 — Contracts ride through `proto/` and `make gen`

All new endpoints are defined first in:

- `proto/pipeline/builds.proto` — `RerunBuildRequest`,
  `ForceBuildRequest`, queue/compute split fields on `Job`.
- `proto/pipeline/spark.proto` *(new)* — `SparkReport`, `Executor`,
  `Stage`, `Task`, `SnapshotRequest/Response`.
- `proto/pipeline/compare.proto` *(new)* — `JobCompareResponse` with
  three nested messages mirroring the three UI sub-tabs.

`make gen` regenerates `libs/proto-gen/`, OpenAPI and the TS / Python
/ Java SDKs. CI (`make contracts-check`) gates merges — see
`.github/workflows/proto-check.yml`.

## Foundry parity matrix (UX)

| Foundry feature | OpenFoundry artefact | Status |
|---|---|---|
| Launcher tile | `apps/web/src/lib/launcher/catalog.ts` (data-integration) | ❌ → 🟢 (Decision 1) |
| Build list filters & columns | `apps/web/src/routes/builds/BuildsPage.tsx` + `ListBuildsParams` | 🟡 (extend) |
| Datasets pane (Logs / Compare) | `apps/web/src/lib/components/builds/DatasetsPane.tsx` *(new)* | ❌ |
| Build report Gantt | `apps/web/src/lib/components/builds/JobGantt.tsx` *(new)* | ❌ |
| Progress-details toggle | Gantt + backend `queue/compute_duration_ms` | ❌ |
| Schedule card | `apps/web/src/lib/components/builds/ScheduleCard.tsx` *(new)*, `GET /v1/schedules/{rid}/recent-runs` | ❌ |
| Job report (own page, 6 tabs) | `routes/builds/JobReportPage.tsx` *(new)* | ❌ (Decision 2) |
| Live log colour / pause / JSON | `apps/web/src/lib/components/builds/BuildRunLogs.tsx` (rewire) | 🟡 (Decision 4) |
| Spark details (Overview, Executors, Snapshot) | `routes/builds/SparkDetailsPage.tsx` + `internal/domain/spark/` | ❌ (Decision 5) |
| Job Comparison Tool (3 tabs) | `apps/web/src/lib/components/builds/JobCompare/*` + compare endpoint | ❌ (Decision 6) |
| Rerun / Force / Rerun-as-Debug | Four new endpoints + UI | ❌ (Decision 6) |
| AIP error enhancer | `AipErrorEnhancer.tsx` + proxy endpoint | ❌ (Decision 8) |
| Build Schedules companion app | `routes/schedules/*` + cards | ❌ (Decision 7) |
| Build timeline in Data Lineage | `GET /v1/builds:timeline` + lineage UI | ❌ |

## Migration plan

Sequenced to minimize merge conflicts and let each PR ship value:

1. **Epic 0** — Launcher tile + route registration. *(1 PR)*
2. **Epic 1** — Build list filter / column extension. *(1 PR, includes one migration if Owner/Project denorm is needed)*
3. **Epic 2.1 / 2.2** — Gantt + progress-details toggle + jobs queue/compute migration. *(2 PRs)*
4. **Epic 3** — Job report page split. *(1 PR)*
5. **Epic 4** — Live logs wired with colour / Pause / JSON. *(1 PR)*
6. **Epic 7** — Rerun / Force / Rerun-as-Debug endpoints + UI. *(2 PRs)*
7. **Epic 2.3 – 2.6** — Schedule card, datasets pane, AIP enhancer, header actions. *(2 PRs)*
8. **Epic 5** — Spark details (backend persistence first, then UI). *(2 PRs)*
9. **Epic 6** — Job Comparison Tool. *(2 PRs)*
10. **Epic 9** — Data Lineage build-timeline cross-link. *(1 PR)*
11. **Epic 8** — Build Schedules companion app. *(2–3 PRs)*

Estimated total: **14–18 PRs**. Each PR carries proto changes
through `make gen`, a goose migration if applicable, unit +
integration (`-tags=integration`) tests, an e2e extension in
`apps/web/e2e/builds.spec.ts`, and updates to per-service `CLAUDE.md`.

## Consequences

- The Builds tile becomes the canonical entry point for pipeline
  observability — Pipeline Builder and Code Repositories link out to
  it instead of embedding their own job-state views.
- Two new proto files (`spark.proto`, `compare.proto`) enter the
  contract surface; SDK consumers will see additive changes only.
- Two new tables (`spark_reports`, optional `jobs.queue_duration_ms`
  /`compute_duration_ms` columns) extend the
  `pipeline-build-service` schema. Both are additive and reversible.
- The four new write endpoints emit the **existing**
  `foundry.build.events.v1` events from ADR-0036; downstream
  consumers (audit, lineage, dashboards) get richer payloads but no
  new topics to subscribe to.
- The AIP error enhancer adds an optional outbound dependency on the
  AIP service. It is gated by `AIP_ENABLED` and must degrade silently
  — explicitly **not** a hard dependency of Builds.
- The Build Schedules companion app introduces a second
  data-integration tile; it shares the `pipeline-build-service`
  backend (schedules already live there per ADR-0036) and does not
  spawn a new microservice.

## Out of scope

- Rewriting the orchestration core (covered by ADR-0036).
- Replacing `pipeline-runner-spark` (covered by ADR-0045).
- Schedule trigger semantics (event triggers, time triggers,
  composition) — Foundry parity for triggers is deferred to a
  future ADR once Decision 7 lands.
- Mobile / responsive layouts for Builds — desktop-only at launch.
