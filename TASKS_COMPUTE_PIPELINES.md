# Compute & Pipelines — Tasks for 1:1 parity with Palantir Foundry

> **Constraints:** Apache Iceberg + Apache Spark are mandatory. **No** DuckDB.
> **Target stack:** Go (orchestrator) + Scala/PySpark (distributed runtime) +
> Python sidecar (lightweight/notebook) + Spark-on-K8s Operator + Lakekeeper
> (Iceberg REST catalog) + S3 compatible (Rook/Ceph).
>
> **Current acknowledged state (do not redo):**
> - `services/pipeline-build-service/internal/spark/spark.go` already renders
>   `SparkApplication` CRs and delivers them to the Spark Operator via REST.
> - `services/pipeline-runner-spark/` (Scala) executes `--inline-sql` against the
>   Iceberg catalog and publishes with `df.writeTo(...).createOrReplace()`.
> - `services/pipeline-runner/` (Go) acts as a wrapper for `spark-submit`.
> - `services/pipeline-build-service/internal/handler/distributed_runtime.go`
>   already wires the `spark|pyspark` engine (Flink is stubbed).
> - `libs/pipeline-expression/` (~4.3k LoC) already has parser, evaluator,
>   type inference, and function catalog.
> - `services/notebook-runtime-service/internal/kernel/python.go` wires the
>   `libs/python-sidecar`.
> - `services/dataset-versioning-service/internal/` has `backingfs`,
>   `runtime`, `domain`, and 18 migrations.
>
> **What's missing for 1:1 parity** is in the tasks below. Each task is a
> self-contained prompt to hand off to a coding agent, with links to
> Palantir's official documentation.

---

## Block A — Pipeline Build Service: complete API and lifecycle

### Task A1. Close out the HTTP/gRPC surface of `pipeline-build-service`

**Context**: the service has 49+ handler files and a rich domain, but I don't
see a consolidated declaration of the REST endpoints that already exist nor a
mapping to `proto/pipeline/{builds,pipeline,schedules,schedule_runs}.proto`.
`proto/pipeline/transform.proto` and `proto/pipeline/schedule.proto` are 2-line
stubs.

**Prompt**:
> Audit `services/pipeline-build-service/internal/handler/handlers.go` and
> any route registration in `internal/server/`. List every endpoint already
> implemented (method + route + handler). Cross-reference the result with
> `proto/pipeline/builds.proto`, `proto/pipeline/pipeline.proto`,
> `proto/pipeline/schedules.proto`, `proto/pipeline/schedule_runs.proto`, and
> `proto/pipeline/lineage.proto`. For each proto RPC that has no HTTP route,
> implement the handler using the existing repositories and runners.
> Fill in `proto/pipeline/transform.proto` with the RPCs `CompileTransform`,
> `ValidateTransform`, `PreviewTransform`, `RegisterPythonTransform`,
> `RegisterSqlTransform`, `RegisterPipelineBuilderGraph`. Generate code with
> `make gen`. Ensure parity with the Foundry model: build = single execution
> with atomic transactions over output datasets; pipeline = compilable node
> graph; schedule = cron/event-based trigger that fires builds.
>
> **References**:
> - Builds overview: https://www.palantir.com/docs/foundry/data-integration/builds-overview
> - Schedules: https://www.palantir.com/docs/foundry/data-integration/schedules-overview
> - Build queue & resource management: https://www.palantir.com/docs/foundry/data-integration/build-queue

### Task A2. Full Build lifecycle (queued → running → succeeded/failed/cancelled/retrying)

**Context**: in `internal/handler/execution.go` I see `OpenPipelineRun`,
`MarkPipelineRunRunning`, `FinishPipelineRun`, `AbortPipelineRun`,
`ListBuildQueue`, `QueueSummary`, `UpdatePipelineNextRun`, `attemptNumber`,
`retryOfRunID`. This is the foundation, but we still need to verify forced
transitions, idempotency, and retries with exponential backoff.

**Prompt**:
> In `services/pipeline-build-service/internal/domain/`, formalize the build
> state machine using `libs/state-machine`. States: `QUEUED`,
> `WAITING_FOR_RESOURCES`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`,
> `TIMED_OUT`, `RETRYING`. Define legal transitions, the events that fire
> them (`submit`, `assigned`, `started`, `node_failed`, `all_nodes_done`,
> `user_aborted`, `deadline_exceeded`), and emit events to `libs/event-bus-data`
> on every transition. Implement automatic retries with exponential backoff
> (configurable: `max_attempts`, `initial_delay_ms`, `multiplier`, `jitter`)
> when the failure is transient (Spark Operator reports `FAILED_SUBMISSION`
> or a kube-client network error). Use `libs/idempotency` so that a
> `POST /pipelines/{id}/builds` with the same `idempotency-key` returns the
> same build. Tests: include a table-driven test covering every legal and
> forbidden transition.
>
> **References**:
> - Job statuses / retry: https://www.palantir.com/docs/foundry/data-integration/job-status
> - Retries: https://www.palantir.com/docs/foundry/data-integration/build-retries
> - Build cancellation: https://www.palantir.com/docs/foundry/data-integration/aborting-builds

### Task A3. Build queue with priorities, fairness, and resource pools

**Context**: `ListBuildQueue` and `QueueSummary` already exist. We still need
the engine that prioritizes, allocates resources, and respects per-project /
per-tenant quotas.

**Prompt**:
> Design and implement a dispatcher in
> `services/pipeline-build-service/internal/domain/dispatcher` that:
> 1. Reads builds in `QUEUED` state from `pipeline_runs`.
> 2. Applies a Foundry-style scheduling policy: priority (user-set),
>    project, round-robin fairness across projects in the same tenant, and
>    respect for `resource_pools` (CPU/RAM totals assigned to a compute
>    pool).
> 3. Before marking `RUNNING`, calls the Spark Client (`spark.SparkClient`)
>    to reserve capacity; if none is available, leaves the build in
>    `WAITING_FOR_RESOURCES` with the reason.
> 4. Exposes `GET /resource-pools`, `POST /resource-pools`,
>    `PATCH /resource-pools/{id}` to administer pools.
> 5. Emits Prometheus metrics: `pipeline_build_queue_depth{pool}`,
>    `pipeline_build_wait_seconds{pool,priority}`,
>    `pipeline_build_pool_utilization{pool}`.
>
> **References**:
> - Resource queues: https://www.palantir.com/docs/foundry/data-integration/resource-queues
> - Compute usage units: https://www.palantir.com/docs/foundry/resource-management/compute-usage

### Task A4. Live job logs (WebSocket + tail from Spark Operator)

**Context**: `job_logs_test.go` exists but I don't see an actual handler
exposed.

**Prompt**:
> Implement `GET /builds/{id}/logs?follow=true` as an SSE/WebSocket that
> connects to the Kubernetes API to do `kubectl logs -f` against the
> driver pod of the `SparkApplication`. Multiplex stdout/stderr and
> normalize to the `[pipeline-runner pipeline_id=… run_id=…] …` format
> that `pipeline-runner-spark/PipelineRunner.scala` already emits.
> Persist the full log to S3 when the build finishes (key:
> `s3://logs/builds/{build_id}/driver.log`) and store the reference in
> `pipeline_runs.log_uri`. Add a viewer in
> [apps/web/src/lib/components/pipeline/](apps/web/src/lib/components/pipeline/)
> that consumes the stream.
>
> **References**:
> - Job logs: https://www.palantir.com/docs/foundry/data-integration/job-logs
> - Build inspector: https://www.palantir.com/docs/foundry/data-integration/build-inspector

---

## Block B — Pipeline Builder: graph → Spark plan compiler

### Task B1. Canonical Pipeline Builder graph schema (JSON)

**Context**: `libs/pipeline-expression/catalog.go` already has a function
catalog. What's missing is the contract for the visual graph that the UI
saves.

**Prompt**:
> Define in `libs/pipeline-expression/graph.go` the canonical JSON schema
> of a "Pipeline Builder logic graph" with parity to Palantir:
> - Node types: `dataset_input`, `dataset_output`, `media_set_output`,
>   `virtual_table_output`, `ontology_object_output`, `filter`, `select`,
>   `join` (inner|left|right|outer|anti|semi|cross|knn|lookup),
>   `aggregate`, `aggregate_over_window`, `project_over_window`, `pivot`,
>   `unpivot`, `union`, `intersect`, `except`, `sort`, `rank`, `cast`,
>   `derived_column`, `geo_join`, `media_transform`, `checkpoint`,
>   `sample`, `expectation` (data quality assertion).
> - Connections with `from_node_id` / `from_output_port` / `to_node_id` /
>   `to_input_port` (multi-port per node, e.g. join has `left`/`right`).
> - Expressions as an embedded AST (the format already emitted by
>   `libs/pipeline-expression/parser.go`).
> - Graph versioning (each save generates a `graph_version`).
> - Metadata: `pipeline_id`, `branch_id`, `compiled_at`, `compiler_version`.
>
> Provide a validator `ValidateGraph(g Graph) []ValidationError` that
> verifies there are no cycles, that every node receives all its required
> ports, that expressions reference existing columns, and that types
> match (lean on `infer.go` and `node_check.go`).
>
> **References**:
> - Pipeline Builder nodes: https://www.palantir.com/docs/foundry/pipeline-builder/overview
> - Pipeline Builder transforms: https://www.palantir.com/docs/foundry/pipeline-builder/transforms
> - Pipeline Builder expressions: https://www.palantir.com/docs/foundry/pipeline-builder/expressions-overview

### Task B2. Graph → Spark SQL plan compiler

**Context**: today `distributed_runtime.go` ships `--inline-sql` with ONE
statement; the real Pipeline Builder compiles an entire graph into an
optimized Spark plan.

**Prompt**:
> Create `libs/pipeline-expression/compiler/` with a graph → Spark SQL
> compiler that runs in a single `SparkApplication`. The compiler:
> 1. Topologically sorts the nodes.
> 2. Assigns each intermediate node a `TEMP VIEW` with a stable name
>    (`node_<short_hash_id>`).
> 3. For each node, emits a `CREATE OR REPLACE TEMP VIEW node_x AS …`
>    in SparkSQL, translated from the node type (join → `JOIN`,
>    aggregate → `GROUP BY` with aggregators from the catalog,
>    window → `OVER(PARTITION BY …)`, pivot → `PIVOT` function,
>    media_transform → UDF call to `OF_MEDIA_TRANSFORM(...)`).
> 4. For each `dataset_output`, emits the final statement as
>    `INSERT INTO <iceberg_table>` for `APPEND` /
>    `INSERT OVERWRITE <iceberg_table>` for `SNAPSHOT` /
>    `MERGE INTO` for `UPDATE` (with `MATCHED`/`NOT MATCHED` keyed on
>    `merge_keys`).
> 5. Returns `CompiledPlan { Statements []string, Inputs []DatasetRef,
>    Outputs []OutputBinding, EstimatedShuffle int64 }`.
>
> Generate plans identical to the pattern `pipeline-runner-spark` already
> expects (statements separated by `;`, last statement is the writer).
> Cover with golden tests under `libs/pipeline-expression/compiler/testdata/`.
>
> **References**:
> - Pipeline Builder compilation model: https://www.palantir.com/docs/foundry/pipeline-builder/pipeline-builder-architecture
> - Joins: https://www.palantir.com/docs/foundry/pipeline-builder/joins
> - Aggregations: https://www.palantir.com/docs/foundry/pipeline-builder/aggregations
> - Windows: https://www.palantir.com/docs/foundry/pipeline-builder/window-functions

### Task B3. Endpoints `POST /pipelines/{id}/compile` and `POST /pipelines/{id}/preview`

**Context**: `preview.go` exists, but its current contract is for in-memory
node-by-node preview. End-to-end preview from a full graph is missing.

**Prompt**:
> In `pipeline-build-service`, add two endpoints:
> - `POST /pipelines/{id}/compile` that validates + compiles the graph into
>   a `CompiledPlan` and persists it as `pipeline_plans` with a
>   deterministic hash of the graph. Returns the plan and a `plan_id`.
> - `POST /pipelines/{id}/preview` with body `{node_id, sample_rows: 100,
>   sampling_strategy: "head"|"random"|"stratified", branch_id?}`. The
>   handler:
>   - Compiles only the subgraph upstream of `node_id`.
>   - Injects `LIMIT 100 SAMPLE 5 PERCENT` so it doesn't read everything.
>   - Submits the plan to a Spark "preview pool" with a short timeout (90s).
>   - Returns rows + inferred schema + warnings.
> Ensure UX parity with Pipeline Builder Preview: 15-minute cache keyed on
> (graph_version, node_id, sampling).
>
> **References**:
> - Pipeline Builder preview: https://www.palantir.com/docs/foundry/pipeline-builder/preview
> - Sampling strategies: https://www.palantir.com/docs/foundry/pipeline-builder/sampling

### Task B4. Checkpoints and data expectations

**Prompt**:
> Implement `checkpoint` and `expectation` nodes in the compiler.
> - `checkpoint`: after compilation, emits a `CACHE TABLE node_x` before
>   expensive nodes; optionally persists the TEMP VIEW as an intermediate
>   Iceberg table under `s3://intermediates/{pipeline_id}/{build_id}/{node_id}/`.
> - `expectation`: emits post-execution asserts (`SELECT COUNT(*) FROM
>   node_x WHERE NOT (<predicate>)`); if > 0 it fails the build with
>   `expectation_violated` and saves a sample of violating rows in
>   `build_expectation_violations`. The UI must display the violations.
>
> **References**:
> - Checkpoints: https://www.palantir.com/docs/foundry/pipeline-builder/checkpoints
> - Data expectations: https://www.palantir.com/docs/foundry/data-quality/data-expectations
> - Health checks: https://www.palantir.com/docs/foundry/data-health/overview

---

## Block C — Code-first transforms (Python/Java/SQL repos)

### Task C1. PySpark `@transform_df` / `@transform` and Code Repository code

**Context**: today `pipeline-runner-spark` is Scala with `--inline-sql`. Foundry
supports PySpark as a first-class citizen with decorators
`@transform_df`, `@transform`, `@incremental`, `@configure(profile=...)`.

**Prompt**:
> Create a Python package `sdks/python/foundry-transforms/` that reproduces
> Foundry's `transforms.api`:
> - `@transform(my_output=Output('rid'), my_input=Input('rid'))` with a
>   function that receives `ctx`, `my_input` (TransformInput), and
>   `my_output` (TransformOutput). `my_input.dataframe()` returns a Spark
>   DataFrame read from the Iceberg catalog.
>   `my_output.write_dataframe(df)` or
>   `set_mode("snapshot"|"append"|"update"|"delete")`.
> - `@transform_df(Output(...), Input(...))` sugar for 1 output, 1+ inputs.
> - `@transform_pandas(...)` for small datasets.
> - `@configure(profile_name="...")` for resource profile selection.
> - `@incremental(snapshot_inputs=[...], require_incremental=False,
>    semantic_version=1)` with Foundry's semantics.
> - `TransformContext` with `ctx.is_incremental`, `ctx.fallback_branches`,
>   `ctx.spark_session`, `ctx.auth_header`, `ctx.parameters`.
>
> Build a runner equivalent to today's Scala one at
> `services/pipeline-runner-spark-python/` (PySpark, with a `Dockerfile`
> that installs the SDK) that receives `--module-zip` (a .zip of the code
> repo), `--entrypoint module:function`, and the standard args from
> `pipeline-runner-spark/PipelineRunner.scala`. It invokes the decorated
> function and reads/writes against the Iceberg catalog.
>
> Modify `services/pipeline-build-service/internal/handler/distributed_runtime.go`
> to use `ApplicationType: "Python"` when the node is `python_transform`
> and to mount the repo zip into the pod.
>
> **References**:
> - Python transforms API: https://www.palantir.com/docs/foundry/transforms-python/transforms-python-api
> - `@transform`, `@transform_df`: https://www.palantir.com/docs/foundry/transforms-python/transforms-python-overview
> - `@incremental` reference: https://www.palantir.com/docs/foundry/transforms-python/incremental-reference/index.html
> - Profile / @configure: https://www.palantir.com/docs/foundry/transforms-python/profiles
> - Incremental usage: https://www.palantir.com/docs/foundry/transforms-python/incremental-usage

### Task C2. Java/Scala transforms

**Prompt**:
> Create `sdks/java/foundry-transforms/` with the Java/Scala equivalent:
> `@Compute`, `Input<Dataset>`, `Output<Dataset>`, `IncrementalTransform`,
> `RetryStrategy`, `BuildContext`. The resulting JAR is used by
> `pipeline-runner-spark` (which is already Scala) by loading the user's
> class reflectively from the uploaded JAR. The code-repo compiler
> (Task C5) must publish a single uber-JAR per commit, mounted as an
> additional dependency on the `SparkApplication`.
>
> **References**:
> - Java transforms: https://www.palantir.com/docs/foundry/transforms-java/overview

### Task C3. SQL transforms

**Prompt**:
> Support pure `*.sql` repos with a tiny YAML header:
> ```sql
> -- @output: ri.foundry.main.dataset.abc123
> -- @inputs: { sales: ri.foundry.main.dataset.def456 }
> -- @mode: snapshot
> SELECT … FROM ${sales} …
> ```
> In `libs/pipeline-expression/sql/`, parse that header, substitute
> placeholders with fully qualified Iceberg names
> (`catalog.namespace.table`), and emit the statement as `inline_sql` for
> the Scala runner (which already supports this). Add a validator that
> rejects SQL with direct `INSERT`/`UPDATE`/`DELETE` when the declared
> `@mode` does not allow it.
>
> **References**:
> - SQL transforms: https://www.palantir.com/docs/foundry/transforms-sql/overview

### Task C4. Resource profiles

**Prompt**:
> Create a `pipeline_profiles` table + endpoints `GET/POST /pipeline-profiles`.
> Each profile defines `{driver_cores, driver_memory, executor_cores,
> executor_instances, executor_memory, spark_conf: map<string,string>,
> spark_packages: [], allowed_for: ["python","java","sql","pipeline-builder"]}`.
> Transforms reference a profile by name. The renderer in
> `internal/spark/spark.go` already has `SparkResourceOverrides`; wire it
> so it first resolves the profile and then applies per-node overrides.
>
> Replicate Foundry's default profiles: `KUBERNETES_MEMORY_LARGE`,
> `KUBERNETES_MEMORY_EXTRA_LARGE`, `DRIVER_MEMORY_LARGE`, `EXECUTOR_CORES_MEDIUM`,
> `EXECUTOR_MEMORY_LARGE`, `DYNAMIC_ALLOCATION_ENABLED`, `NUM_EXECUTORS_8`.
>
> **References**:
> - Profiles: https://www.palantir.com/docs/foundry/transforms-python/profiles
> - Compute usage / resource units: https://www.palantir.com/docs/foundry/resource-management/compute-usage

### Task C5. Code Repository → CI build → deployable artifact

**Context**: `services/code-repository-review-service` exists with 2 handlers
and the `code_repo/*.proto` is a stub. Foundry compiles each commit of a
transforms repo into a frozen artifact.

**Prompt**:
> Implement the Code Repositories CI cycle:
> 1. Complete `proto/code_repo/{repository,branch,review}.proto` with CRUD
>    for repos, branches, commits, and PRs.
> 2. In a new service `services/code-repository-ci-service/`, implement
>    a webhook `POST /webhook/git` that triggers a build:
>    - Python: runs `pip install -r requirements.txt`, runs `pytest`,
>      packages `module.zip` with the commit SHA.
>    - Java/Scala: invokes `sbt clean assembly` to produce an uber-jar.
>    - SQL: validates each file with Task C3.
> 3. Publishes the artifact to `s3://code-artifacts/{repo_id}/{commit_sha}/…`
>    and records a row in `code_repo_builds`.
> 4. Every transform declared in the repo (`@transform` or SQL `@output`)
>    is automatically registered in `pipeline_transforms` with `repo_id`,
>    `commit_sha`, `entrypoint`, `profile`.
> 5. When `pipeline-build-service` resolves a build, it looks up the
>    transform in `pipeline_transforms`, downloads the artifact, and
>    hands it to the Spark runner.
>
> **References**:
> - Code Repositories: https://www.palantir.com/docs/foundry/code-repositories/overview
> - Checks (CI): https://www.palantir.com/docs/foundry/code-repositories/checks
> - Tags and artifacts: https://www.palantir.com/docs/foundry/code-repositories/tags

---

## Block D — Incremental & Streaming

### Task D1. Real `@incremental` runtime

**Context**: the Python SDK (Task C1) declares `@incremental`, but the runtime
needs to translate it into Iceberg "since snapshot X" reads.

**Prompt**:
> Extend `pipeline-runner-spark` (Scala) and the Python SDK for incremental:
> 1. Before executing, read `pipeline_runs` to find the last SUCCEEDED run
>    of the same transform and pull `last_input_snapshots` (map
>    dataset_rid → Iceberg snapshot_id used).
> 2. For every non-snapshot input, expose to the user:
>    - `my_input.dataframe()` → full snapshot.
>    - `my_input.dataframe("added")` → `SELECT * FROM table.changes
>      WHERE snapshot_id > last_seen`.
>    - `my_input.dataframe("modified")` and `dataframe("removed")` for
>      tables with CDC enabled.
> 3. For outputs, expose:
>    - `my_output.write_dataframe(df, mode="snapshot"|"append"|"update")`.
>    - `my_output.previous_dataframe()` to read the previous output.
> 4. After success, persist `last_input_snapshots` and the output's own
>    snapshot. If the graph changes (`semantic_version` bump), discard
>    history and force a snapshot.
> 5. Cover `require_incremental=True` with an explicit failure.
>
> Use the Iceberg "Incremental reads" API
> (`spark.read.format("iceberg").option("start-snapshot-id", X)`).
>
> **References**:
> - Incremental overview: https://www.palantir.com/docs/foundry/transforms-python/incremental-overview
> - Incremental reference: https://www.palantir.com/docs/foundry/transforms-python/incremental-reference/index.html
> - Iceberg incremental reads: https://iceberg.apache.org/docs/latest/spark-queries/#incremental-read
> - Historical dataset from snapshots: https://www.palantir.com/docs/foundry/transforms-python/create-historical-dataset

### Task D2. Streaming pipelines (Spark Structured Streaming)

**Context**: `distributed_runtime.go` has a `flink` branch that returns
`flink_runtime_not_configured`. Foundry uses Flink, but since the stack is
Spark, use Spark Structured Streaming first (without Flink).

**Prompt**:
> Add `mode: "streaming"` to `pipeline_runs` and to the pipeline definitions.
> In `pipeline-runner-spark`, support `--stream-trigger`
> (`once|continuous|processing-time:5s`) and `--checkpoint-location`
> (`s3://checkpoints/{pipeline_id}/`). The runner:
> 1. Creates `spark.readStream.format("iceberg")...load(input)`.
> 2. Applies the compiled plan (B2), which for streaming requires
>    compatible nodes (no `pivot`, no `aggregate_over_window` without a
>    watermark).
> 3. Writes with `.writeStream.format("iceberg").outputMode("append")
>    .option("checkpointLocation", ...).toTable(output)`.
> 4. The SparkApplication CR switches to `restartPolicy: Always` and lives
>    as a `Deployment`. Create a new CR-type renderer in
>    `internal/spark/spark.go` for this case.
>
> Add endpoints `POST /pipelines/{id}/streams/start` and
> `POST /pipelines/{id}/streams/stop` with Prometheus metrics
> (`stream_events_per_sec`, `stream_lag_ms`).
>
> **References**:
> - Streaming pipelines overview: https://www.palantir.com/docs/foundry/data-integration/streaming-overview
> - Streaming transforms: https://www.palantir.com/docs/foundry/streaming/overview
> - Iceberg streaming reads: https://iceberg.apache.org/docs/latest/spark-structured-streaming/

### Task D3. CDC ingest → streaming pipeline

**Prompt**:
> Integrate `services/ingestion-replication-service` (which already has 12
> handlers + 11 migrations) with the pipeline's streaming mode. The
> connector publishes to a Kafka topic `cdc.<source>.<table>`; a streaming
> pipeline consumes the topic with `spark.readStream.format("kafka")` and
> materializes to Iceberg with MERGE INTO on the `merge_keys` declared in
> the dataset.
>
> **References**:
> - Streaming source connectors: https://www.palantir.com/docs/foundry/data-connection/streaming
> - CDC patterns: https://www.palantir.com/docs/foundry/data-connection/cdc-overview

---

## Block E — Complete dataset transactions

### Task E1. End-to-end SNAPSHOT/UPDATE/APPEND/DELETE transactions

**Context**: `dataset_output_committer.go` and `internal/iceberg/` exist.
Verify and complete.

**Prompt**:
> In `services/dataset-versioning-service/`, formalize the transactions API:
> - `POST /datasets/{rid}/transactions {type: SNAPSHOT|UPDATE|APPEND|DELETE,
>   branch: "master"}` → returns `transaction_rid` in state `OPEN`.
> - `POST /datasets/{rid}/transactions/{tx}/files` to upload raw files
>   (streaming multipart) landing under `s3://datasets/{rid}/{tx}/…`.
> - `POST /datasets/{rid}/transactions/{tx}/commit` → validates schema,
>   calls Iceberg via `iceberg-catalog-service` to create the
>   corresponding snapshot:
>   - `SNAPSHOT` → `INSERT OVERWRITE`.
>   - `APPEND` → `INSERT INTO`.
>   - `UPDATE` → `MERGE INTO ... WHEN MATCHED UPDATE SET ... WHEN NOT
>     MATCHED INSERT ...` over the `primary_key` declared in the schema.
>   - `DELETE` → `DELETE FROM ... WHERE <predicate>`.
> - `POST /datasets/{rid}/transactions/{tx}/abort` → frees raw space and
>   marks `ABORTED`.
> - `GET /datasets/{rid}/transactions?branch=master` lists history.
> - When a build calls the committer: open tx → write via Spark → commit
>   atomically. Use `libs/saga` to guarantee rollback if Iceberg fails
>   partially.
>
> **References**:
> - Dataset transactions: https://www.palantir.com/docs/foundry/data-integration/datasets-overview
> - Transaction types: https://www.palantir.com/docs/foundry/data-integration/datasets-views
> - Iceberg MERGE: https://iceberg.apache.org/docs/latest/spark-writes/#merge-into

### Task E2. Dataset branches

**Context**: `proto/dataset/branch.proto` has 59 lines. Verify whether the
logic is executed.

**Prompt**:
> Implement dataset branches on top of Iceberg `branches` (an Iceberg 1.2+
> feature):
> - `POST /datasets/{rid}/branches {name, from_branch}` → creates an
>   Iceberg branch with `ALTER TABLE … CREATE BRANCH <name>`.
> - `GET /datasets/{rid}/branches` lists them.
> - `POST /datasets/{rid}/branches/{name}/merge {into}` → fast-forward.
> - `POST /datasets/{rid}/branches/{name}/delete`.
> Each build writes to the branch it receives in its context
> (`ctx.branch_id`). The compiled plan must inject
> `... VERSION AS OF BRANCH '<name>'` for reads.
>
> **References**:
> - Branches in Foundry: https://www.palantir.com/docs/foundry/data-integration/branching-overview
> - Iceberg branching: https://iceberg.apache.org/docs/latest/branching/

### Task E3. Schema evolution and schema validation

**Context**: `schema_validation.go` and `schema_guidance.go` exist.

**Prompt**:
> Formalize the schema evolution policy:
> - Backwards-compatible (add column, widen type, make nullable) → allow
>   without intervention.
> - Breaking (drop column, narrow type, rename) → require
>   `?allow_schema_break=true` and save `schema_break_audit` with the user
>   who approved it.
> The validator runs **before** executing the Spark plan; if it rejects,
> the build moves to `FAILED` with `schema_incompatible` and the UI shows
> the diff. Lean on Iceberg `UPDATE SCHEMA` to apply the change on commit.
>
> **References**:
> - Schema evolution: https://www.palantir.com/docs/foundry/data-integration/schema-overview
> - Iceberg schema evolution: https://iceberg.apache.org/docs/latest/evolution/

### Task E4. Dataset views (filtered/projected views without copy)

**Prompt**:
> Implement `dataset_views` as Iceberg `CREATE VIEW`:
> `POST /datasets/views {name, query, parent_dataset_rids}`. The view
> appears as a normal dataset in the UI, but its backing is an Iceberg
> view. When a build reads it, Spark resolves the view without
> materializing.
>
> **References**:
> - Foundry views: https://www.palantir.com/docs/foundry/data-integration/datasets-views
> - Iceberg views: https://iceberg.apache.org/docs/latest/sql-views/

---

## Block F — Schedules

### Task F1. Cron + event-based schedules

**Context**: `proto/pipeline/schedules.proto` is 205 lines;
`libs/scheduling-cron/` is implemented with DST tests. Exposure is missing.

**Prompt**:
> Implement the schedules domain:
> - `POST /pipelines/{id}/schedules {cron: "0 */4 * * *",
>   timezone: "America/New_York", trigger: "cron"|"on_data_change"|
>   "on_upstream_success", upstream_dataset_rids: [], retry_policy: {…}}`.
> - A worker in `pipeline-build-service` queries `ListDuePipelines`
>   (already exists) every 30s and creates builds.
> - For `on_data_change`, subscribe to the Kafka topic
>   `dataset.{rid}.transaction.committed` and fire a build with dataset
>   inputs pinned to the snapshot just published.
> - For `on_upstream_success`, hook into the `build.succeeded` event from
>   `pipeline-build-service`.
> - Pause/resume schedule, run history (`schedule_runs.proto` already
>   exists, 66 lines).
>
> **References**:
> - Schedules: https://www.palantir.com/docs/foundry/data-integration/schedules-overview
> - Event-based schedules: https://www.palantir.com/docs/foundry/data-integration/schedules-events

### Task F2. Dependency-driven builds (multi-pipeline DAG)

**Prompt**:
> Implement Foundry-style "force builds": the user selects a final
> dataset/pipeline and the platform computes and fires every required
> upstream build. Use `lineage-service` to resolve the DAG.
> Endpoint: `POST /builds/force {target_dataset_rids: [...],
> branch: "...", ignore_recent: true}`. Create builds in topological
> order with `depends_on_build_id` so each one waits on the previous.
>
> **References**:
> - Force build / build target: https://www.palantir.com/docs/foundry/data-integration/build-target

---

## Block G — Code Workbook (notebook with datasets as variables)

### Task G1. Code Workbook backend

**Context**: `notebook-runtime-service` already wires `libs/python-sidecar`;
`notebook.proto`/`cell.proto`/`kernel.proto` are in place. But the
"dataset-as-variable + cells produce datasets" model isn't wired up that I
can see.

**Prompt**:
> In `services/notebook-runtime-service`, add:
> - `POST /workbooks` with `kernel_type: "pyspark"|"python"|"r"`.
> - Each cell has `{kind: "code"|"markdown"|"visualization",
>   language: "python"|"r"|"sql", output_dataset_rid?: string,
>   input_dataset_rids: [], depends_on_cells: []}`.
> - When a cell with `output_dataset_rid` executes, the code output (a
>   Spark DataFrame in the `result` variable) is persisted as a SNAPSHOT
>   transaction (Task E1) on the dataset; subsequent cells can import
>   `from foundry import datasets;
>   df = datasets.dataset('rid').dataframe()`.
> - Support PySpark kernels with a `SparkSession` already configured
>   against the Lakekeeper catalog (clone the logic from the CR template).
> - `POST /workbooks/{id}/run-all` executes cells in topological order.
> - "Productionize": `POST /workbooks/{id}/promote` generates a
>   Code Repository with one transform per `output_dataset_rid`
>   (Task C5).
>
> **References**:
> - Code Workbook overview: https://www.palantir.com/docs/foundry/code-workbook/overview
> - Concepts: https://www.palantir.com/docs/foundry/code-workbook/concepts
> - Productionize: https://www.palantir.com/docs/foundry/code-workbook/productionizing
> - Visualizations: https://www.palantir.com/docs/foundry/code-workbook/visualizations

### Task G2. Code Workbook kernel sessions

**Prompt**:
> Modify `libs/python-sidecar` (or create a new sidecar
> `libs/pyspark-sidecar`) that launches a local Spark driver
> (`local[*]` mode for small workbooks) or a remote driver on K8s for
> heavier workbooks. Per-workbook persistent session, with TTL and
> hibernation after inactivity. Automatically inject
> `dataset('rid').dataframe()` and `dataset('rid').write_dataframe(df)`
> into the kernel namespace.
>
> **References**:
> - Spark profile selection in Workbook: https://www.palantir.com/docs/foundry/code-workbook/spark-profiles

---

## Block H — Code Workspaces (JupyterLab + VS Code in the browser)

### Task H1. Code Workspaces service

**Context**: I don't see a dedicated service. This is a large Foundry module.

**Prompt**:
> Create `services/code-workspaces-service/` (cloning
> `services/template/`). Endpoints:
> - `POST /workspaces {type: "jupyterlab"|"vscode"|"rstudio", profile_id,
>    repo_id?, branch?, environment_id}`.
> - `GET /workspaces/{id}` returns `{state, url, last_active_at, idle_ttl}`.
> - `POST /workspaces/{id}/start`, `/stop`, `/hibernate`.
> - Each workspace is provisioned as a Kubernetes `StatefulSet` with a
>   personal PVC per user:
>   - JupyterLab: image `jupyter/pyspark-notebook` + OpenFoundry client
>     library preinstalled.
>   - VS Code: image `codercom/code-server` with default extensions.
>   - RStudio: image `rocker/rstudio`.
> - Per-workspace ingress at `workspace-{id}.<host>` with an auth proxy
>   against `identity-federation-service` (already exists).
> - Hibernation: if the workspace is `idle_ttl` minutes without traffic,
>   run `kubectl scale --replicas=0`. Wake-on-request: the ingress has
>   middleware that scales to 1 on the first request.
> - Volume mounted at `/home/user/workspace`, persistent.
>
> **References**:
> - Code Workspaces overview: https://www.palantir.com/docs/foundry/code-workspaces/overview
> - Getting started: https://www.palantir.com/docs/foundry/code-workspaces/getting-started
> - JupyterLab: https://www.palantir.com/docs/foundry/code-workspaces/jupyterlab
> - VS Code workspaces: https://www.palantir.com/docs/foundry/vs-code/overview
> - Lifecycle/FAQ: https://www.palantir.com/docs/foundry/code-workspaces/code-workspaces-faq

### Task H2. Dataset mounting inside the workspace

**Prompt**:
> Preinstall a `foundry-fs` client (preferably FUSE or sidecar process)
> in the Jupyter/VS Code image that lazily mounts
> `/datasets/<dataset_rid>/<branch>/<files>` from S3 using delegated
> access tokens for the current user. Honor
> `authorization-policy-service` to restrict access.
> Parity: `import foundry; df = foundry.datasets.dataset('rid').dataframe()`
> must work identically to the Python SDK (Task C1).
>
> **References**:
> - Interact with data in Code Workspaces: https://www.palantir.com/docs/foundry/code-workspaces/data

### Task H3. Library/environment manager (parity with Maestro)

**Prompt**:
> Create `services/library-environment-service/` that manages "managed
> environments":
> - `POST /environments {name, kind: "conda"|"pip"|"r-cran",
>   spec: <yaml or requirements.txt>}` → resolves dependencies in a build
>   job (base image + `conda env create` or `pip install`), publishes the
>   resulting image to the internal registry.
> - Every Code Workspace and Code Workbook can reference an
>   `environment_id` mounted at startup.
> - The same reference is valid in transforms (Task C1) for
>   reproducibility.
> - Versioning: each `spec` creates a new immutable revision.
>
> **References**:
> - Maestro / managed envs: https://www.palantir.com/docs/foundry/code-workspaces/managed-environments

---

## Block I — Worker pool and isolation

### Task I1. Worker pool / Spark namespace per tenant

**Prompt**:
> Each tenant (or resource pool from Task A3) runs `SparkApplication`s
> in a dedicated Kubernetes namespace with a NetworkPolicy that only
> allows traffic to `iceberg-catalog-service` and the internal S3
> endpoint. Wire the dynamic namespace into
> `pipeline-build-service/internal/spark/spark.go::PipelineRunInput`.
> Implement a job in `services/tenancy-organizations-service` that
> creates the namespaces and ServiceAccounts via a K8s operator when a
> tenant is provisioned.
>
> **References**:
> - Compute isolation: https://www.palantir.com/docs/foundry/security/network-isolation
> - Projects: https://www.palantir.com/docs/foundry/projects/overview

### Task I2. Spot/preemptible execution

**Prompt**:
> Add `profile.spot_enabled: bool` and `profile.spot_max_price`. The CR
> renderer applies tolerations + nodeSelector
> `cloud.google.com/gke-spot: "true"` or the AWS/Azure equivalent. If
> the driver is evicted, mark the build as `RETRYING` with
> `failure_reason: "preempted"` and requeue (respecting max_attempts).
>
> **References**:
> - Spot instances in Foundry: https://www.palantir.com/docs/foundry/resource-management/spot-execution

---

## Block J — Build observability

### Task J1. Build inspector / metric ingestion

**Prompt**:
> Enable the Spark `metricsServlet` and a Prometheus sink in the CR
> template; expose `GET /builds/{id}/metrics` that aggregates:
> - rows read/written per node (via Iceberg `snapshot.summary`).
> - duration per stage, GC time, shuffle bytes.
> - skew histogram (max/min/median task duration).
> - estimated costs (CPU·s · €/CPU·s · executor count).
> Store in `pipeline_run_metrics` and draw in a "Build Inspector"-style UI.
>
> **References**:
> - Build inspector: https://www.palantir.com/docs/foundry/data-integration/build-inspector
> - Spark metrics & monitoring: https://spark.apache.org/docs/latest/monitoring.html

### Task J2. Automatic data lineage from builds

**Prompt**:
> Each `SUCCEEDED` build emits an OpenLineage event to
> `services/lineage-service` with `inputs`, `outputs`, `job_facets`
> (graph_version, plan_id), and `dataset_facets` (schema, row_count,
> snapshot_id). The sink already exists in `lineage-service`. The
> automatic producer inside the executor is what's missing.
>
> **References**:
> - Lineage in Foundry: https://www.palantir.com/docs/foundry/data-lineage/overview
> - OpenLineage spec: https://openlineage.io/docs/spec/0-overview

---

## Block K — Parity validation

### Task K1. End-to-end "Foundry parity" smoke tests

**Prompt**:
> Under `tests/parity/compute/`, create a Go suite that runs end to end
> against a local k3s/kind cluster:
> 1. Creates a CSV dataset → registers it as Iceberg.
> 2. Creates a Code Repository with a Python `@transform`.
> 3. Creates a pipeline in Pipeline Builder (graph JSON) with join+aggregate.
> 4. Creates a cron-every-minute schedule.
> 5. Waits for three builds: the `Build Inspector` must show
>    Iceberg-level metrics.
> 6. Modifies the graph → new branch → preview → merge.
> 7. Converts the pipeline to streaming → publishes Kafka events →
>    verifies rows in Iceberg with `processing_time_lag < 30s`.
> Run as part of `make test-integration`.
>
> **References**:
> - Tutorials: https://www.palantir.com/docs/foundry/tutorials/build-an-ontology
> - Reference architectures: https://www.palantir.com/docs/foundry/reference-architecture/overview

---

## Recommended execution order

1. **A1, A2, E1** — foundation: API + lifecycle + real transactions.
2. **B1, B2, B3** — compilable Pipeline Builder.
3. **C1, C4, C5** — Python transforms + repos + profiles.
4. **E2, E3, F1, F2** — branches + schedules + dep-driven.
5. **D1** — incremental.
6. **A3, I1, J1** — queue, multi-tenancy, observability.
7. **G1, G2** — Code Workbook.
8. **H1, H2, H3** — Code Workspaces.
9. **D2, D3** — Streaming.
10. **C2, C3** — Java/SQL transforms.
11. **B4, J2, K1** — checkpoints, lineage, smoke E2E.

Each block produces a deliverable slice that can be tested independently.
