# Foundry Model Integration and Model Studio 1:1 parity checklist

Date: 2026-05-11
Scope: public-docs-based parity plan for OpenFoundry's model connectivity,
model development, model management, and Model Studio surfaces: model resources,
model artifacts, model adapters, model APIs, model versions, model experiments,
training in Code Workspaces and Code Repositories, uploaded model files,
container-backed models, externally hosted models, language-model adapters,
Model Studio no-code training, trainer selection, dataset mapping, dataset
preview and filtering, trainer parameters, compute resources, training runs,
training-run history, output model versions, experiment metrics and plots,
modeling objectives, submissions, metadata, checks, review, releases, batch
deployments, live deployments, direct deployments, model functions, Functions on
models, Pipeline Builder trained-model nodes, Python transform model inputs,
Ontology operationalization, model inference history, automatic evaluation,
metric sets, evaluation dashboards, model evaluator libraries, deployment logs,
deployment metrics, compute usage, permissions, lineage, auditability, and
production-readiness guardrails for model-backed operational workflows.

This document is intentionally implementation-oriented. It does not attempt to
clone Palantir branding, private source code, proprietary assets, screenshots,
or any non-public behavior. The target is **functional parity based on public
Palantir Foundry documentation**: the same product concepts, comparable model
training/integration/management/operationalization workflows, compatible
resource models where useful, and OpenFoundry-native implementation details that
can be tested locally.

## Parity scope boundary

All checklist work is governed by the
[Foundry public-docs parity policy](../reference/foundry-public-docs-parity-policy.md).
OpenFoundry may implement behavior described in public Palantir documentation,
but contributors must not copy private source, decompile bundles, import
tenant-specific exports, use Palantir branding, or reuse proprietary assets.
The product target is functional parity in an OpenFoundry-native implementation,
not a pixel-perfect clone.

This checklist covers Model Integration, Manage Models, Evaluate Models, and
Model Studio as model-lifecycle surfaces. It should integrate with Data
Foundation for datasets, builds, schedules, transactions, lineage, and compute
usage; with Code Workspaces and Code Repositories for pro-code model training;
with Pipeline Builder for no-code batch inference; with Functions for model
functions and model API type bindings; with Ontology/Object Views for model
operationalization, Functions on objects, and Scenario/what-if workflows; with
AIP Logic/Evals for model-backed function evaluation where relevant; with Media
Sets for media-reference model inputs; and with Security/Governance for
permissions, markings, credentials, egress, audit, and retention. It should not
duplicate those underlying surfaces.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `todo` | Not implemented or not yet verified in OpenFoundry. |
| `partial` | Some surface exists, but behavior is incomplete or not wired end-to-end. |
| `blocked` | Requires a platform dependency, public documentation, or product decision. |
| `done` | Implemented, tested, documented, and verified through UI or API smoke tests. |

## Priority vocabulary

| Priority | Meaning |
| --- | --- |
| `P0` | Required for a credible workflow that trains or imports a model, versions it, deploys it for batch/live inference, and consumes it from a function or pipeline. |
| `P1` | Required for Foundry-style model lifecycle parity beyond simple artifact storage and ad hoc inference. |
| `P2` | Advanced, governance-heavy, high-scale, experiment/evaluation, marketplace, GPU, or operational-observability parity. |

## Official Palantir documentation library

These public docs should be treated as the external behavioral contract while
implementing this checklist.

### Model connectivity and core concepts

- [Model connectivity and development overview](https://www.palantir.com/docs/foundry/model-integration/overview/)
- [Getting started with model integration](https://www.palantir.com/docs/foundry/model-integration/getting-started/)
- [Core concepts: Models](https://www.palantir.com/docs/foundry/model-integration/models/)
- [Core concepts: Modeling Objectives](https://www.palantir.com/docs/foundry/model-integration/objectives/)
- [Core concepts: Modeling experiments](https://www.palantir.com/docs/foundry/model-integration/experiments/)
- [Core concepts: Functions on models](https://www.palantir.com/docs/foundry/model-integration/functions-on-models/)
- [Selecting the right modeling tool](https://www.palantir.com/docs/foundry/model-integration/what-to-use/)

### Model adapters and model sources

- [Models overview](https://www.palantir.com/docs/foundry/integrate-models/integrate-overview/)
- [Model adapter overview](https://www.palantir.com/docs/foundry/integrate-models/model-adapter-overview/)
- [Creating model adapters](https://www.palantir.com/docs/foundry/integrate-models/creating-model-adapters/)
- [Model serialization](https://www.palantir.com/docs/foundry/integrate-models/model-serialization/)
- [Model adapters in the Ontology](https://www.palantir.com/docs/foundry/integrate-models/model-adapters-ontology/)
- [Model API definition](https://www.palantir.com/docs/foundry/integrate-models/model-api-definition/)
- [Train in a Jupyter notebook](https://www.palantir.com/docs/foundry/integrate-models/model-asset-code-workspaces/)
- [Train in Code Repositories](https://www.palantir.com/docs/foundry/integrate-models/model-code-repositories/)
- [Upload a model from pre-trained files](https://www.palantir.com/docs/foundry/integrate-models/upload-pre-trained-model/)
- [Import a Hugging Face model](https://www.palantir.com/docs/foundry/integrate-models/import-hugging-face-model/)
- [Container model overview](https://www.palantir.com/docs/foundry/integrate-models/container-model-overview/)
- [Integrate an externally hosted model](https://www.palantir.com/docs/foundry/integrate-models/external-model-connection)
- [ModelAdapter API reference](https://www.palantir.com/docs/foundry/integrate-models/model-adapter-api/)
- [ModelInput in transforms](https://www.palantir.com/docs/foundry/integrate-models/model-input-transforms/)
- [Language model adapters](https://www.palantir.com/docs/foundry/integrate-models/language-model-adapters/)

### Model Studio

- [Model Studio overview](https://www.palantir.com/docs/foundry/model-studio/overview)
- [Model Studio core concepts](https://www.palantir.com/docs/foundry/model-studio/core-concepts/)
- [Model Studio navigation](https://www.palantir.com/docs/foundry/model-studio/navigation)
- [Time series forecasting trainer](https://www.palantir.com/docs/foundry/model-studio/trainers-timeseries-forecasting)
- [Regression trainer](https://www.palantir.com/docs/foundry/model-studio/trainers-regression)
- [Classification trainer](https://www.palantir.com/docs/foundry/model-studio/trainers-classification)
- [Model Studio inputs](https://www.palantir.com/docs/foundry/model-studio/configuration-inputs/)
- [Model Studio compute resources](https://www.palantir.com/docs/foundry/model-studio/configuration-compute-resources/)
- [Tutorial: Train a model in Model Studio](https://www.palantir.com/docs/foundry/model-integration/tutorial-train-model-studio)

### Manage, deploy, evaluate, and consume models

- [Create a modeling objective](https://www.palantir.com/docs/foundry/manage-models/create-a-modeling-objective/)
- [Create a direct model deployment](https://www.palantir.com/docs/foundry/manage-models/create-a-model-deployment/)
- [Query a live deployment API](https://www.palantir.com/docs/foundry/manage-models/live-deployment-reference)
- [Submit a model to an objective](https://www.palantir.com/docs/foundry/manage-models/submit-model/)
- [Configure objective metadata](https://www.palantir.com/docs/foundry/manage-models/configure-objective-metadata/)
- [Set up checks for all submissions](https://www.palantir.com/docs/foundry/manage-models/set-up-checks)
- [Review a model submission](https://www.palantir.com/docs/foundry/manage-models/review-model-submission/)
- [Release a model](https://www.palantir.com/docs/foundry/manage-models/release-model/)
- [Archive models in an objective](https://www.palantir.com/docs/foundry/manage-models/archive-model/)
- [Set up and use a Modeling Objective live deployment](https://www.palantir.com/docs/foundry/manage-models/set-up-live/)
- [Set up a batch deployment](https://www.palantir.com/docs/foundry/manage-models/set-up-batch/)
- [Define modeling objective API](https://www.palantir.com/docs/foundry/manage-models/define-modeling-objective-api/)
- [Modeling objective settings](https://www.palantir.com/docs/foundry/manage-models/modeling-objective-settings/)
- [Model inference history](https://www.palantir.com/docs/foundry/manage-models/model-inference-history/)
- [Models in the Ontology](https://www.palantir.com/docs/foundry/manage-models/models-in-the-ontology)
- [Modeling Objective live deployment FAQ](https://www.palantir.com/docs/foundry/manage-models/live-faq)
- [Live deployment compute usage](https://www.palantir.com/docs/foundry/manage-models/live-deployment-compute-usage/)
- [Automatically evaluate models](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-automatic/)
- [Evaluate model performance in code](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-code/)
- [Review model metrics in the evaluation dashboard](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-dashboard/)
- [MetricSet reference](https://www.palantir.com/docs/foundry/evaluate-models/metricset-reference/)
- [Model functions developer guide](https://www.palantir.com/docs/foundry/model-integration/model-functions-guide)

## Target OpenFoundry resource model

The implementation should define stable OpenFoundry-owned resources that can map
to public Foundry concepts without requiring Palantir RID formats. Compatibility
aliases may be accepted at service boundaries, but persisted state should use
OpenFoundry canonical IDs.

| Public Foundry concept | OpenFoundry resource target | Required notes |
| --- | --- | --- |
| Model | `model` | Project/folder-managed inference artifact with versions, adapters, API schema, lineage, permissions, branch metadata, and deployment references. |
| Model version | `model_version` | Immutable published version containing artifact pointer, adapter package/container/API proxy configuration, model API, environment, metrics, and changelog. |
| Model artifact | `model_artifact` | Files, weights, container image, checkpoint, credentials reference, or externally hosted endpoint metadata. |
| Model adapter | `model_adapter` | Load/initialize/predict interface with dependency environment, serialization rules, API declaration, runtime context, and safety metadata. |
| Model API | `model_api_schema` | Input/output contract for tabular, row-wise, object, object set, media, scalar, multi-I/O, Spark, or custom payload inference where supported. |
| Model experiment | `model_experiment` | Training/evaluation tracking object for parameters, metrics, plots, artifacts, source run, dataset versions, and model version links. |
| Model Studio | `model_studio` | No-code training workspace with trainer type, output model target, configuration versions, run history, and permissions. |
| Model Studio configuration | `model_studio_configuration` | Versioned trainer configuration with dataset mappings, filters, column mappings, parameters, compute resources, and changelog. |
| Model Studio training run | `model_studio_training_run` | Build-backed execution record with status, start/end time, configuration version, build link, output model version, experiment, logs, and compute usage. |
| Trainer | `model_trainer` | Built-in or extension trainer descriptor for regression, classification, time series forecasting, and future trainer families. |
| Trainer parameter schema | `trainer_parameter_schema` | UI-renderable parameter definitions, defaults, validation rules, advanced settings, and compatibility constraints. |
| Modeling objective | `modeling_objective` | Managed project around a modeling problem, with submissions, metadata, checks, releases, deployments, evaluation configuration, and permissions. |
| Model submission | `model_submission` | Immutable copy/reference of a model version submitted for review, metadata, checks, comments, evaluation status, and release eligibility. |
| Objective metadata field | `model_objective_metadata_field` | Configurable submission/objective metadata definition with required/optional state, type, allowed values, and display order. |
| Objective check | `model_objective_check` | Review gate or quality checklist attached to submissions, with status, discussion, owner, and release-blocking behavior. |
| Release | `model_release` | Versioned production-ready package tagged by environment such as staging/production, with release notes and source submission. |
| Deployment | `model_deployment` | Batch, live, or direct deployment binding a release/model version to an inference runtime or pipeline output. |
| Direct deployment | `model_direct_deployment` | Branch-scoped live endpoint that can auto-upgrade to new model versions and publish a wrapper function. |
| Modeling Objective live deployment | `model_live_deployment` | Objective-managed endpoint based on released model tags, runtime configuration, query UI/API, logs, metrics, and inference history. |
| Batch deployment | `model_batch_deployment` | Objective-managed inference pipeline that reads an input dataset and writes an output dataset on builds/schedules. |
| Model function | `model_function` | Generated function wrapping a live/direct deployment with the model API translated into function-compatible types. |
| Model inference request | `model_inference_request` | Single or batch query payload, caller context, resolved model version, response, error, latency, and audit metadata. |
| Model inference history | `model_inference_history` | Governed history dataset/log for live deployments where supported, subject to permission and retention rules. |
| Evaluation configuration | `model_evaluation_configuration` | Objective-level automatic inference/metrics pipeline settings, evaluation datasets, output folders, evaluator libraries, and subsets. |
| Evaluation dataset | `model_evaluation_dataset` | Dataset used to evaluate submissions, with column mappings, cadence, permissions, and output inference/metrics dataset destinations. |
| Model evaluator | `model_evaluator` | Built-in or custom evaluator library for classification, regression, fairness, robustness, explainability, or domain metrics. |
| Metric set | `model_metric_set` | Metrics, plots, images, charts, source model/version, input dataset transaction, subset, and evaluation run reference. |
| Evaluation dashboard | `model_evaluation_dashboard` | Comparison surface over submissions, datasets, subsets, metrics, metric sets, releases, and trends. |
| External model connection | `external_model_connection` | Proxy model configuration for externally hosted models, including egress policy, endpoint configuration, encrypted credentials reference, and adapter. |
| Model runtime log | `model_runtime_log` | Deployment startup/service/model logs with replica tags, retention policy, downloadable export, and redaction. |
| Model runtime metric | `model_runtime_metric` | Host, inference container, replica, queue, latency, request, error, and compute usage telemetry. |

## Milestone A: minimum viable Model Integration and Model Studio parity

### Model resource, adapter, and API basics

- [ ] `MIMS.1` Model CRUD and project placement (`P0`, `todo`)
  - Create, get, list, update metadata, move, duplicate where safe, archive/delete, and restore models.
  - Track project/folder path, owner, created/updated timestamps, current branch/version, latest published version, permissions, lineage, and tags.
  - Persist canonical OpenFoundry IDs while allowing importer-provided aliases for compatibility.
  - Docs: [Core concepts: Models](https://www.palantir.com/docs/foundry/model-integration/models/), [Models overview](https://www.palantir.com/docs/foundry/integrate-models/integrate-overview/).

- [ ] `MIMS.2` Model version history (`P0`, `todo`)
  - Store immutable model versions with artifact references, adapter references, API schema, environment metadata, source build, source commit, author, timestamps, and changelog.
  - Show version timeline with lineage to training inputs, uploaded files, container image digest, or external endpoint configuration.
  - Prevent mutation of published version payloads except for explicit metadata annotations.
  - Docs: [Core concepts: Models](https://www.palantir.com/docs/foundry/model-integration/models/), [Model serialization](https://www.palantir.com/docs/foundry/integrate-models/model-serialization/).

- [ ] `MIMS.3` Model adapter contract (`P0`, `todo`)
  - Define an OpenFoundry adapter interface for load/initialize, API declaration, predict/transform, save/load, dependency environment, and runtime context.
  - Support adapters produced from pro-code workspaces, code repositories, uploaded model files, containers, and external model proxies.
  - Validate adapter compatibility before publishing or deploying a model version.
  - Docs: [Model adapter overview](https://www.palantir.com/docs/foundry/integrate-models/model-adapter-overview/), [Creating model adapters](https://www.palantir.com/docs/foundry/integrate-models/creating-model-adapters/), [ModelAdapter API reference](https://www.palantir.com/docs/foundry/integrate-models/model-adapter-api/).

- [ ] `MIMS.4` Model API schema and type validation (`P0`, `todo`)
  - Represent model input/output types for single tabular I/O, row-wise flattening, multi-I/O, object/object set handoffs, scalar fields, timestamps, arrays, and media references where supported.
  - Validate inference requests against required fields, field types, date/timestamp formatting, and output schema.
  - Record API diffs between versions and mark breaking changes for functions, deployments, and downstream applications.
  - Docs: [Model API definition](https://www.palantir.com/docs/foundry/integrate-models/model-api-definition/), [Create a direct model deployment](https://www.palantir.com/docs/foundry/manage-models/create-a-model-deployment/), [Model functions developer guide](https://www.palantir.com/docs/foundry/model-integration/model-functions-guide).

- [ ] `MIMS.5` Model lineage and permissions (`P0`, `todo`)
  - Propagate lineage from input datasets, code commits, package dependencies, uploaded artifacts, container image digests, egress policies, and output models.
  - Enforce granular read/write/deploy/manage permissions on models, model versions, objectives, deployments, evaluation datasets, and metric sets.
  - Preserve markings/security labels from training inputs onto output models where local governance primitives support it.
  - Docs: [Model connectivity and development overview](https://www.palantir.com/docs/foundry/model-integration/overview/), [Model Studio core concepts](https://www.palantir.com/docs/foundry/model-studio/core-concepts/).

### Minimum viable Model Studio

- [ ] `MIMS.6` Model Studio CRUD and setup (`P0`, `todo`)
  - Create a Model Studio in a project/folder, choose a trainer, and select name/location for the output model.
  - Track current configuration version, recent training runs, output model path/status, data freshness, permissions, and lineage entry points.
  - Provide a home page with start-run, edit-configuration, output-model, experiment, and build links.
  - Docs: [Model Studio overview](https://www.palantir.com/docs/foundry/model-studio/overview), [Model Studio navigation](https://www.palantir.com/docs/foundry/model-studio/navigation), [Tutorial: Train a model in Model Studio](https://www.palantir.com/docs/foundry/model-integration/tutorial-train-model-studio).

- [ ] `MIMS.7` Configuration wizard (`P0`, `todo`)
  - Implement wizard steps for inputs, trainer parameters, compute resources, review, configuration name, and optional changelog.
  - Version configurations and increment configuration version whenever dataset mappings, parameters, filters, resources, or trainer options change.
  - Retain run-to-configuration links so historical runs can be reproduced or inspected.
  - Docs: [Model Studio navigation](https://www.palantir.com/docs/foundry/model-studio/navigation).

- [ ] `MIMS.8` Dataset input mapping (`P0`, `todo`)
  - Accept datasets as training and optional testing/static/evaluation inputs according to trainer requirements.
  - Map required and optional columns, enforce column type constraints, support ignored columns, and validate missing mappings before run launch.
  - Show dataset preview and per-column statistics during setup.
  - Docs: [Model Studio inputs](https://www.palantir.com/docs/foundry/model-studio/configuration-inputs/).

- [ ] `MIMS.9` Dataset filters and pushdown hints (`P0`, `todo`)
  - Allow filter conditions during Model Studio input configuration to remove null-heavy or irrelevant subsets.
  - Use pushdown filtering for compatible storage formats and warn when filters will be applied after download.
  - Estimate memory impact and suggest more resources for non-pushdown filters or large compressed datasets.
  - Docs: [Model Studio inputs](https://www.palantir.com/docs/foundry/model-studio/configuration-inputs/).

- [ ] `MIMS.10` Regression trainer (`P0`, `todo`)
  - Train tabular regression models with target-column mapping, evaluation metric selection, presets, training/inference time limits, prediction column name, excluded model types, stacking configuration, and optional hyperparameters.
  - Store selected best model, ensemble structure where available, validation metrics, parameters, plots, and output model version.
  - Make trainer implementation replaceable while preserving the public workflow and resource model.
  - Docs: [Regression trainer](https://www.palantir.com/docs/foundry/model-studio/trainers-regression), [Tutorial: Train a model in Model Studio](https://www.palantir.com/docs/foundry/model-integration/tutorial-train-model-studio).

- [ ] `MIMS.11` Classification trainer (`P0`, `todo`)
  - Train tabular classification models with target-column mapping, evaluation metric selection, presets, training/inference time limits, prediction column name, probability-output option, excluded model types, stacking configuration, and optional hyperparameters.
  - Support output columns for class predictions and class probabilities where enabled.
  - Store validation metrics, parameters, plots, and output model version.
  - Docs: [Classification trainer](https://www.palantir.com/docs/foundry/model-studio/trainers-classification).

- [ ] `MIMS.12` Time series forecasting trainer (`P0`, `todo`)
  - Train forecasting models with timestamp column, target column, optional item ID, known covariates, static dataset join, forecast horizon, evaluation metric, time limit, preset, quantile levels, resampling options, missing-value fill strategy, ensemble flag, excluded model types, and optional hyperparameters.
  - Validate static dataset cardinality against item IDs and reject ambiguous one-to-many static rows.
  - Store forecast schema, quantile outputs, validation metrics, parameters, plots, and output model version.
  - Docs: [Time series forecasting trainer](https://www.palantir.com/docs/foundry/model-studio/trainers-timeseries-forecasting).

- [ ] `MIMS.13` Compute resource configuration (`P0`, `todo`)
  - Configure vCPU and memory for Model Studio training jobs with local defaults and enforce maximums/quotas.
  - Calculate and display compute usage from configured resources and runtime duration.
  - Show memory/OOM guidance for compressed datasets and optional GPU availability only when the project has a GPU resource queue.
  - Docs: [Model Studio compute resources](https://www.palantir.com/docs/foundry/model-studio/configuration-compute-resources/), [Train models with GPUs](https://www.palantir.com/docs/foundry/model-integration/train-models-with-gpus/).

- [ ] `MIMS.14` Training run execution and monitoring (`P0`, `todo`)
  - Launch Model Studio training as build/transform jobs against the latest saved configuration.
  - Show recent training runs with name, started at, status, configuration version, build link, output model version, experiment link, inputs, parameters, resources, and changelog.
  - Support cancel, retry, view build logs, and view produced model version where local build primitives support them.
  - Docs: [Model Studio core concepts](https://www.palantir.com/docs/foundry/model-studio/core-concepts/), [Model Studio navigation](https://www.palantir.com/docs/foundry/model-studio/navigation).

- [ ] `MIMS.15` Experiments from training runs (`P0`, `todo`)
  - Create an experiment for each Model Studio output model version with metrics, parameters, plots, trainer-specific metadata, and source run links.
  - Show experiment details from the Model Studio run sidebar and model version page.
  - Preserve lineage to input dataset versions and training configuration.
  - Docs: [Model Studio core concepts](https://www.palantir.com/docs/foundry/model-studio/core-concepts/), [Core concepts: Modeling experiments](https://www.palantir.com/docs/foundry/model-integration/experiments/).

### Minimum viable model deployment and consumption

- [ ] `MIMS.16` Direct model deployments (`P0`, `todo`)
  - Create a branch-scoped direct deployment from a model page and start a live hosted endpoint.
  - Configure min/max replicas, scale-to-zero behavior, runtime resources, status, health, and no-downtime auto-upgrade to new branch versions.
  - Provide interactive run/query support and deployment health with logs and metrics.
  - Docs: [Create a direct model deployment](https://www.palantir.com/docs/foundry/manage-models/create-a-model-deployment/).

- [ ] `MIMS.17` Live inference API (`P0`, `todo`)
  - Expose authenticated HTTP inference endpoints for direct deployments and Modeling Objective live deployments.
  - Support single-I/O and multi-I/O request modes according to model API capabilities.
  - Record resolved deployment, resolved model version, status, response, latency, error, caller, and audit metadata.
  - Docs: [Query a live deployment API](https://www.palantir.com/docs/foundry/manage-models/live-deployment-reference), [Set up and use a Modeling Objective live deployment](https://www.palantir.com/docs/foundry/manage-models/set-up-live/).

- [ ] `MIMS.18` Model functions (`P0`, `todo`)
  - Publish generated functions from direct deployments and Modeling Objective live deployments.
  - Translate model APIs into function-compatible input/output types and validate row-wise function publishing for single tabular input/output models.
  - Create new function versions automatically or through guided workflow according to deployment type and API-change behavior.
  - Docs: [Model functions developer guide](https://www.palantir.com/docs/foundry/model-integration/model-functions-guide), [Core concepts: Functions on models](https://www.palantir.com/docs/foundry/model-integration/functions-on-models/).

- [ ] `MIMS.19` Pipeline Builder trained-model node (`P0`, `todo`)
  - Run no-code batch inference using a trained model in Pipeline Builder for supported single tabular input/output models.
  - Resolve latest model version or configured version, run inference sidecar, and write output dataset with lineage.
  - Validate unsupported streaming/lightweight or multi-output modes with actionable errors.
  - Docs: [Selecting the right modeling tool](https://www.palantir.com/docs/foundry/model-integration/what-to-use/).

- [ ] `MIMS.20` Python transform model input (`P0`, `todo`)
  - Allow Python transforms to consume model versions as typed inputs for batch inference.
  - Support version pinning, sidecar/runtime initialization, dependency resolution, and input/output schema checks.
  - Record model-version lineage in transform output datasets.
  - Docs: [ModelInput in transforms](https://www.palantir.com/docs/foundry/integrate-models/model-input-transforms/), [Selecting the right modeling tool](https://www.palantir.com/docs/foundry/model-integration/what-to-use/).

- [ ] `MIMS.21` Basic modeling objective (`P0`, `todo`)
  - Create a Modeling Objective with name, folder/project location, description, owners, contributors, associated data sources, submissions, releases, deployments, and permissions.
  - Use Markdown-compatible description as objective README/goals where local rendering supports it.
  - Provide objective home page sections for submissions, releases, deployments, evaluation dashboard, checks, and settings.
  - Docs: [Core concepts: Modeling Objectives](https://www.palantir.com/docs/foundry/model-integration/objectives/), [Create a modeling objective](https://www.palantir.com/docs/foundry/manage-models/create-a-modeling-objective/).

- [ ] `MIMS.22` Submit Model Studio output to objective (`P0`, `todo`)
  - Submit a Model Studio-produced model version to a Modeling Objective with submission name, owner, metadata, source model, source version, and changelog.
  - Create an immutable submission snapshot or immutable version reference for review.
  - Link submission back to Model Studio run, experiment, input datasets, and produced model version.
  - Docs: [Tutorial: Train a model in Model Studio](https://www.palantir.com/docs/foundry/model-integration/tutorial-train-model-studio), [Submit a model to an objective](https://www.palantir.com/docs/foundry/manage-models/submit-model/).

## Milestone B: credible Foundry-style model lifecycle parity

### Model source coverage

- [ ] `MIMS.23` Pro-code model publishing from Code Workspaces (`P1`, `todo`)
  - Let notebook users add model outputs, install/use model-adapter helpers, implement save/load/api/predict, and publish model versions from interactive workspaces.
  - Preserve notebook source, dependency environment, build/session metadata, experiment logs, and output model lineage.
  - Docs: [Train in a Jupyter notebook](https://www.palantir.com/docs/foundry/integrate-models/model-asset-code-workspaces/).

- [ ] `MIMS.24` Pro-code model publishing from Code Repositories (`P1`, `todo`)
  - Support repository-authored model adapters, CI/build-backed model publication, tests, package dependency capture, and release promotion.
  - Link model versions to repository commit, branch, build, author, dependency lockfile, and artifacts.
  - Docs: [Train in Code Repositories](https://www.palantir.com/docs/foundry/integrate-models/model-code-repositories/), [Selecting the right modeling tool](https://www.palantir.com/docs/foundry/model-integration/what-to-use/).

- [ ] `MIMS.25` Uploaded model files and checkpoints (`P1`, `todo`)
  - Register manually uploaded weights, checkpoints, serialized model files, and unstructured datasets as model artifacts with adapters.
  - Validate supported formats, artifact size, checksum, serialization method, dependency environment, and inference API.
  - Docs: [Upload a model from pre-trained files](https://www.palantir.com/docs/foundry/integrate-models/upload-pre-trained-model/), [Import a Hugging Face model](https://www.palantir.com/docs/foundry/integrate-models/import-hugging-face-model/).

- [ ] `MIMS.26` Container-backed models (`P1`, `todo`)
  - Register models from container images pushed to OpenFoundry's container registry or configured OCI registry.
  - Capture image digest, adapter endpoint contract, environment variables, telemetry enablement, health checks, and resource requirements.
  - Support live/direct deployment where model API compatibility and runtime isolation are available.
  - Docs: [Container model overview](https://www.palantir.com/docs/foundry/integrate-models/container-model-overview/), [Create a direct model deployment](https://www.palantir.com/docs/foundry/manage-models/create-a-model-deployment/).

- [ ] `MIMS.27` Externally hosted models (`P1`, `todo`)
  - Register external models as governed proxy models with egress policy, endpoint configuration, encrypted credentials, adapter code, and model metadata.
  - Support live deployment through Modeling Objectives and Python-transform usage with explicit network egress configuration.
  - Block batch deployments and automatic model evaluation for external models unless OpenFoundry intentionally implements compatible support and documents the divergence.
  - Docs: [Integrate an externally hosted model](https://www.palantir.com/docs/foundry/integrate-models/external-model-connection).

- [ ] `MIMS.28` Language model adapters (`P1`, `todo`)
  - Register language-model adapters with prompt/message schema, model/provider configuration, credentials or gateway reference, token/usage accounting, and safety metadata.
  - Integrate with AIP/model governance, AIP Logic, and model functions where local LLM infrastructure supports it.
  - Docs: [Language model adapters](https://www.palantir.com/docs/foundry/integrate-models/language-model-adapters/), [Model connectivity and development overview](https://www.palantir.com/docs/foundry/model-integration/overview/).

### Modeling Objective review and release management

- [ ] `MIMS.29` Objective metadata configuration (`P1`, `todo`)
  - Define custom metadata fields collected for each submission, with field types, required flags, default values, allowed values, and display order.
  - Enforce required metadata before review/release and support metadata-based filtering/comparison.
  - Docs: [Configure objective metadata](https://www.palantir.com/docs/foundry/manage-models/configure-objective-metadata/), [Core concepts: Modeling Objectives](https://www.palantir.com/docs/foundry/model-integration/objectives/).

- [ ] `MIMS.30` Submission checks and review workflow (`P1`, `todo`)
  - Configure objective checks for quality gates, review questions, owner approvals, discussion threads, and release-blocking statuses.
  - Show check status per submission and aggregate readiness on objective submission pages.
  - Docs: [Set up checks for all submissions](https://www.palantir.com/docs/foundry/manage-models/set-up-checks), [Review a model submission](https://www.palantir.com/docs/foundry/manage-models/review-model-submission/).

- [ ] `MIMS.31` Release management (`P1`, `todo`)
  - Release reviewed submissions with environment tags such as staging/production, user-defined version numbers, release notes, and source submission links.
  - Preserve auditable release history and prevent deployments from consuming unreviewed model versions when objective policy requires releases.
  - Surface API-change warnings before releases can break existing deployment/function consumers.
  - Docs: [Core concepts: Modeling Objectives](https://www.palantir.com/docs/foundry/model-integration/objectives/), [Release a model](https://www.palantir.com/docs/foundry/manage-models/release-model/), [Model functions developer guide](https://www.palantir.com/docs/foundry/model-integration/model-functions-guide).

- [ ] `MIMS.32` Archive model submissions (`P1`, `todo`)
  - Archive rejected or stale submissions without hard deletion from the objective system of record.
  - Remove release eligibility for archived submissions while retaining historical review, metrics, lineage, and audit references.
  - Support unarchive with permission checks.
  - Docs: [Archive models in an objective](https://www.palantir.com/docs/foundry/manage-models/archive-model/).

- [ ] `MIMS.33` Objective settings and permission model (`P1`, `todo`)
  - Manage objective-level settings for permissions, automatic submission subscriptions, evaluation configuration, metadata, checks, deployment defaults, and retention.
  - Require explicit project references/imports for datasets, models, egress policies, and output folders used by the objective.
  - Docs: [Modeling objective settings](https://www.palantir.com/docs/foundry/manage-models/modeling-objective-settings/), [Automatically evaluate models](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-automatic/).

### Modeling Objective deployments

- [ ] `MIMS.34` Modeling Objective live deployments (`P1`, `todo`)
  - Create live deployments from staging or production releases with name, description, environment tag, replica count, CPU/GPU configuration, and resource limits.
  - Update deployments when a tagged release changes, with no-downtime replacement where runtime supports it.
  - Support disable, enable, delete, and old-target invalidation semantics.
  - Docs: [Set up and use a Modeling Objective live deployment](https://www.palantir.com/docs/foundry/manage-models/set-up-live/), [Modeling Objective live deployment FAQ](https://www.palantir.com/docs/foundry/manage-models/live-faq).

- [ ] `MIMS.35` Live deployment query UI (`P1`, `todo`)
  - Provide a Query tab for authoring request payloads, sending single-I/O and multi-I/O requests, viewing responses, and copying API/curl examples.
  - Validate request shape against current deployment API before sending where possible.
  - Store debug traces and inference history only according to deployment type and retention policy.
  - Docs: [Set up and use a Modeling Objective live deployment](https://www.palantir.com/docs/foundry/manage-models/set-up-live/), [Query a live deployment API](https://www.palantir.com/docs/foundry/manage-models/live-deployment-reference).

- [ ] `MIMS.36` Batch deployments (`P1`, `todo`)
  - Create batch deployments from objective releases with input dataset, output dataset location/name, deployment environment, and build schedule.
  - Run inference over the selected dataset and publish consistent output datasets even as released models change.
  - Enforce documented limitations for direct setup compatibility, such as single tabular dataset input and unsupported external/multi-output models.
  - Docs: [Set up a batch deployment](https://www.palantir.com/docs/foundry/manage-models/set-up-batch/), [Selecting the right modeling tool](https://www.palantir.com/docs/foundry/model-integration/what-to-use/).

- [ ] `MIMS.37` Deployment logs and runtime metrics (`P1`, `todo`)
  - Show startup/service/model logs with time filters, field filters, selected columns, replica/node tags, and downloadable log exports.
  - Surface host metrics and inference-container metrics for CPU, memory, replica status, request volume, error rate, and latency where runtime supports them.
  - Apply retention rules and redact credentials/secrets from logs.
  - Docs: [Set up and use a Modeling Objective live deployment](https://www.palantir.com/docs/foundry/manage-models/set-up-live/), [Live deployment compute usage](https://www.palantir.com/docs/foundry/manage-models/live-deployment-compute-usage/).

- [ ] `MIMS.38` Model inference history (`P1`, `todo`)
  - Record live deployment inference history for objective-managed live deployments when enabled.
  - Include request metadata, caller, timestamp, model/release/deployment IDs, input/output summaries, status, latency, and errors subject to privacy/security filtering.
  - Expose history for debugging, monitoring, feedback loops, and evaluation dataset creation.
  - Docs: [Model inference history](https://www.palantir.com/docs/foundry/manage-models/model-inference-history/), [Core concepts: Modeling Objectives](https://www.palantir.com/docs/foundry/model-integration/objectives/).

### Automatic model evaluation

- [ ] `MIMS.39` Evaluation configuration (`P1`, `todo`)
  - Configure an objective to generate inference pipelines only or inference plus metrics pipelines for submissions.
  - Decide whether new submissions automatically build evaluation artifacts and allow manual builds for existing submissions.
  - Store output folders for generated inference and metric datasets.
  - Docs: [Automatically evaluate models](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-automatic/).

- [ ] `MIMS.40` Evaluation datasets (`P1`, `todo`)
  - Add evaluation datasets with input field mappings, cadence metadata, output inference folder, output metrics folder, and project-reference validation.
  - Support multiple evaluation datasets with separate permissions and update cadences.
  - Require models, evaluation datasets, output folders, and objective to be in the same project or explicitly referenced where local project semantics require it.
  - Docs: [Automatically evaluate models](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-automatic/).

- [ ] `MIMS.41` Evaluation libraries and built-in evaluators (`P1`, `todo`)
  - Configure evaluator libraries for binary classification, regression, and custom model evaluators.
  - Map evaluator inputs to evaluation dataset columns and expected model outputs such as prediction, probability, confidence score, and label columns.
  - Compute metrics for each configured model submission and evaluation dataset.
  - Docs: [Automatically evaluate models](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-automatic/), [Binary classification evaluator](https://www.palantir.com/docs/foundry/evaluate-models/binary-classification/), [Regression evaluator](https://www.palantir.com/docs/foundry/evaluate-models/regression/), [Custom model evaluator](https://www.palantir.com/docs/foundry/evaluate-models/custom-model-evaluator/).

- [ ] `MIMS.42` Evaluation subsets (`P1`, `todo`)
  - Configure subsets over dataset columns or expected model outputs using string categories, numeric fixed-width buckets, numeric range cutoffs, and multi-field combinations.
  - Generate overall metrics plus subset-level metrics for interpretability, robustness, and fairness analysis.
  - Warn when subset cardinality will significantly increase build time or metric-set volume.
  - Docs: [Automatically evaluate models](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-automatic/).

- [ ] `MIMS.43` Metric sets and evaluation dashboard (`P1`, `todo`)
  - Persist metric sets containing numerical metrics, plots, images/charts, model/version reference, input dataset transaction, subset, and evaluator library reference.
  - Show evaluation dashboard comparisons across submissions, releases, datasets, subsets, metrics, and time.
  - Support custom metric views and metric drilldowns.
  - Docs: [MetricSet reference](https://www.palantir.com/docs/foundry/evaluate-models/metricset-reference/), [Review model metrics in the evaluation dashboard](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-dashboard/), [Customize modeling objective metric views](https://www.palantir.com/docs/foundry/evaluate-models/customize-metric-views/).

- [ ] `MIMS.44` Evaluate model performance in code (`P1`, `todo`)
  - Let code-authored evaluation jobs generate metrics/metric sets for a model version using local evaluator APIs.
  - Link code-generated metrics to objectives and dashboards when schemas are compatible.
  - Preserve dataset transaction, model version, evaluator package version, and source commit in metric lineage.
  - Docs: [Evaluate model performance in code](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-code/).

## Milestone C: advanced, scale, governance, and operational parity

### Advanced training, runtime, and deployment

- [ ] `MIMS.45` GPU model training (`P2`, `todo`)
  - Support GPU resource queues for Model Studio, Code Workspaces, Code Repositories, and eligible trainer/runtime jobs.
  - Validate project queue assignment, GPU count/type, memory, and scheduler availability.
  - Meter GPU compute usage separately from CPU-only usage where local billing/usage models support it.
  - Docs: [Train models with GPUs](https://www.palantir.com/docs/foundry/model-integration/train-models-with-gpus/), [Model Studio compute resources](https://www.palantir.com/docs/foundry/model-studio/configuration-compute-resources/).

- [ ] `MIMS.46` Spark model support (`P2`, `todo`)
  - Support Spark model adapters for batch and live contexts where local runtime can initialize compatible Spark/JDK distributions.
  - Handle Pandas-to-Spark conversion for JSON live requests or require explicit preprocessing in adapter code.
  - Document runtime/version compatibility and back-compatibility limits.
  - Docs: [Set up and use a Modeling Objective live deployment](https://www.palantir.com/docs/foundry/manage-models/set-up-live/), [Spark ML models](https://www.palantir.com/docs/foundry/integrate-models/spark-ml-models/).

- [ ] `MIMS.47` Model adapter upgrades without retraining (`P2`, `todo`)
  - Allow adapter/environment/API wrapper updates to an existing artifact when retraining is unnecessary.
  - Preserve version history, compatibility checks, and rollback across adapter-only upgrades.
  - Require review when adapter API changes can break functions or deployments.
  - Docs: [Upgrade Model Adapter Without Retraining](https://www.palantir.com/docs/foundry/integrate-models/upgrade-model-adapter-without-retraining/).

- [ ] `MIMS.48` DevOps and Marketplace deployment constraints (`P2`, `blocked`)
  - Evaluate which model deployments can be promoted through OpenFoundry DevOps, environments, or marketplace-like packaging.
  - Preserve documented limitations where public docs say a deployment path is unsupported.
  - Require explicit product decision before implementing marketplace distribution of model artifacts or deployments.
  - Docs: [Deploy models with DevOps and Marketplace](https://www.palantir.com/docs/foundry/model-integration/deploy-models-devops-marketplace/), [Selecting the right modeling tool](https://www.palantir.com/docs/foundry/model-integration/what-to-use/).

- [ ] `MIMS.49` Branch-aware model lifecycle (`P2`, `todo`)
  - Support branch-scoped model versions, direct deployments, model functions, and API bindings.
  - Ensure one direct deployment/function per model branch where mirroring documented behavior.
  - Prevent branch-only versions from leaking into mainline production consumers unless explicitly merged/released.
  - Docs: [Create a direct model deployment](https://www.palantir.com/docs/foundry/manage-models/create-a-model-deployment/), [Model functions developer guide](https://www.palantir.com/docs/foundry/model-integration/model-functions-guide).

- [ ] `MIMS.50` Model API migration assistant (`P2`, `todo`)
  - Detect breaking API changes between model versions and identify impacted deployments, functions, code repositories, Workshop apps, actions, and Ontology registrations.
  - Offer guided function-version republishing and dependency updates for TypeScript v1, TypeScript v2, and Python consumers.
  - Generate migration reports and block unsafe automatic deployment upgrades when API changes are incompatible.
  - Docs: [Model functions developer guide](https://www.palantir.com/docs/foundry/model-integration/model-functions-guide).

### Operationalization in Ontology, applications, and feedback loops

- [ ] `MIMS.51` Models in the Ontology (`P2`, `todo`)
  - Register live deployments and model functions for use in ontology-backed workflows, Functions on objects, and what-if/scenario analyses.
  - Support object/object set inputs in model APIs where local Functions/Ontology type systems support them.
  - Enforce object security, action permissions, and function access during model-backed operational use.
  - Docs: [Models in the Ontology](https://www.palantir.com/docs/foundry/manage-models/models-in-the-ontology), [Model adapters in the Ontology](https://www.palantir.com/docs/foundry/integrate-models/model-adapters-ontology/).

- [ ] `MIMS.52` Workshop, Slate, and application consumption (`P2`, `todo`)
  - Use model functions and Functions on models in Workshop, Slate-compatible surfaces, actions, and custom applications.
  - Provide example snippets, resource import UX, row-wise invocation helpers, and errors for outdated function versions.
  - Docs: [Model functions developer guide](https://www.palantir.com/docs/foundry/model-integration/model-functions-guide), [Selecting the right modeling tool](https://www.palantir.com/docs/foundry/model-integration/what-to-use/).

- [ ] `MIMS.53` Production feedback loop datasets (`P2`, `todo`)
  - Convert inference history, application decisions, user corrections, outcomes, and action results into curated feedback datasets.
  - Link feedback datasets to modeling objectives and evaluation configurations for future retraining/evaluation.
  - Apply privacy/security filtering and retention policies.
  - Docs: [Model connectivity and development overview](https://www.palantir.com/docs/foundry/model-integration/overview/), [Model inference history](https://www.palantir.com/docs/foundry/manage-models/model-inference-history/).

- [ ] `MIMS.54` Scheduled retraining and continuous evaluation (`P2`, `todo`)
  - Connect Model Studio training jobs and batch/evaluation deployments to build schedules.
  - Automatically retrain models when input data changes and optionally submit new versions to objectives.
  - Compare new submissions against current releases using automatic evaluation before promotion.
  - Docs: [Model Studio overview](https://www.palantir.com/docs/foundry/model-studio/overview), [Automatically evaluate models](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-automatic/).

- [ ] `MIMS.55` Model health and Data Health integration (`P2`, `todo`)
  - Surface health for training failures, stale Model Studio outputs, broken model artifacts, deployment startup failures, live endpoint errors, batch inference failures, metric pipeline failures, and objective release drift.
  - Alert owners on threshold breaches for latency, error rate, missing metric sets, stale evaluation datasets, and failed scheduled retraining.
  - Connect health events to lineage nodes and remediation links.
  - Docs: [Set up and use a Modeling Objective live deployment](https://www.palantir.com/docs/foundry/manage-models/set-up-live/), [Automatically evaluate models](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-automatic/).

### Governance, credentials, audit, and safety

- [ ] `MIMS.56` External model egress and credentials governance (`P2`, `todo`)
  - Require explicit egress policy for external model connections and Python transforms calling external models.
  - Store credentials encrypted with rotation metadata; pass credentials only at model load/runtime; never expose raw secrets in logs or UI.
  - Make it clear that users with model inference access may indirectly use external provider credentials even if they lack direct provider access.
  - Docs: [Integrate an externally hosted model](https://www.palantir.com/docs/foundry/integrate-models/external-model-connection).

- [ ] `MIMS.57` Model audit log (`P2`, `todo`)
  - Audit model creation, version publication, adapter change, objective submission, metadata edits, checks, release, deployment update, function publication, inference query, credential update, and archive/delete actions.
  - Include actor, time, resource IDs, before/after metadata, source IP/service account where available, and policy decision.
  - Provide export for compliance review without leaking protected input/output payloads.
  - Docs: [Model connectivity and development overview](https://www.palantir.com/docs/foundry/model-integration/overview/), [Core concepts: Modeling Objectives](https://www.palantir.com/docs/foundry/model-integration/objectives/).

- [ ] `MIMS.58` Safe model payload logging (`P2`, `todo`)
  - Redact or summarize inference inputs/outputs in logs, inference history, metric artifacts, and debug traces based on data markings and policy.
  - Provide opt-in payload capture with retention and access controls for debugging.
  - Enforce per-deployment and per-objective retention windows.
  - Docs: [Model inference history](https://www.palantir.com/docs/foundry/manage-models/model-inference-history/), [Set up and use a Modeling Objective live deployment](https://www.palantir.com/docs/foundry/manage-models/set-up-live/).

- [ ] `MIMS.59` Model usage metering and quotas (`P2`, `todo`)
  - Meter Model Studio training, pro-code training, direct deployments, live deployments, batch inference, metric pipelines, GPU usage, and external model requests.
  - Attribute usage to project, model, objective, deployment, run, user/service, and resource queue.
  - Enforce quotas and provide cost previews before expensive training/evaluation/deployment runs.
  - Docs: [Model Studio compute resources](https://www.palantir.com/docs/foundry/model-studio/configuration-compute-resources/), [Live deployment compute usage](https://www.palantir.com/docs/foundry/manage-models/live-deployment-compute-usage/).

- [ ] `MIMS.60` Production promotion guardrails (`P2`, `todo`)
  - Require release review, objective checks, passing evaluation thresholds, API compatibility, security approval, and owner signoff before production-tagged deployments update.
  - Support emergency rollback to prior release/deployment target.
  - Block deployments for missing lineage, missing evaluation metrics, missing credentials/egress imports, or failed policy checks.
  - Docs: [Core concepts: Modeling Objectives](https://www.palantir.com/docs/foundry/model-integration/objectives/), [Release a model](https://www.palantir.com/docs/foundry/manage-models/release-model/), [Automatically evaluate models](https://www.palantir.com/docs/foundry/evaluate-models/model-evaluation-automatic/).

## Implementation inventory checklist

- [ ] `INV.1` Identify existing OpenFoundry model, artifact, ML runtime, experiment, deployment, function, and dataset-lineage primitives.
- [ ] `INV.2` Inventory current Python/TypeScript SDK support for model APIs, model inputs, generated functions, and model runtime clients.
- [ ] `INV.3` Inventory existing Pipeline Builder trained-model node support, Python transform model sidecars, and batch inference execution modes.
- [ ] `INV.4` Inventory Code Workspaces and Code Repositories support for publishing artifacts, packages, dependency environments, commits, and build outputs.
- [ ] `INV.5` Inventory current build service, scheduler, compute resource, GPU queue, and usage-metering support for Model Studio training jobs.
- [ ] `INV.6` Inventory existing Ontology, Object Views, Workshop, Slate-compatible, Functions on objects, and Scenario/what-if handoffs.
- [ ] `INV.7` Inventory existing credential vault, egress policy, network isolation, container registry, OCI image scanning, and secret-redaction support.
- [ ] `INV.8` Inventory existing metrics/experiment storage, plot/image artifact support, evaluation dashboard primitives, and evaluator plugin APIs.
- [ ] `INV.9` Inventory existing audit, retention, security marking, object security, restricted-view, and permission propagation primitives.
- [ ] `INV.10` Inventory existing live endpoint hosting, autoscaling, scale-to-zero, service logs, replica metrics, inference history, and health-alerting support.
- [ ] `INV.11` Identify public-doc limitations that OpenFoundry should mirror exactly versus intentionally diverge from, such as external-model batch limitations and direct-deployment feature differences.
- [ ] `INV.12` Produce a machine-readable parity matrix sibling JSON after inventory, following the pattern of [foundry-feature-parity-matrix.json](./foundry-feature-parity-matrix.json).

## Suggested service boundaries

> **Reader note (2026-05-14)** — The services in the table below are
> *target* decomposition proposals, not a current inventory of
> binaries. Some have been built under consolidated names after S8
> (`marketplace-service` → `federation-product-exchange-service`;
> `approvals-service` → `workflow-automation-service/internal/approvals`;
> `ontology-security-service` → `authorization-policy-service`;
> `ai-service` → `agent-runtime-service` + `llm-catalog-service`).
> Others are not yet implemented. For the canonical list of binaries
> on disk today, see
> [`docs/architecture/services-and-ports.md`](../architecture/services-and-ports.md).

| Surface | Responsibilities |
| --- | --- |
| `model-registry-service` | Model CRUD, model versions, artifacts, adapter metadata, API schemas, lineage, permissions, branch metadata, archive/restore. |
| `model-adapter-runtime` | Adapter loading, dependency environments, predict/transform execution, serialization, model API validation, sidecar/container runtime contracts. |
| `model-studio-service` | Model Studio workspaces, trainer registry, configuration wizard, dataset mapping, trainer parameters, compute resources, training-run orchestration. |
| `model-training-service` | Build-backed training execution for Model Studio and pro-code outputs, experiment creation, output model publication, logs, compute usage. |
| `experiment-service` | Experiment metrics, parameters, plots, artifacts, model-version links, run lineage, metric visualization APIs. |
| `modeling-objective-service` | Objectives, submissions, metadata fields, checks, review, releases, archive state, evaluation configuration, objective settings. |
| `model-deployment-service` | Direct deployments, Modeling Objective live deployments, batch deployments, endpoint lifecycle, replica/resource configuration, disable/delete/update. |
| `model-inference-gateway` | Authenticated inference API, request validation, response handling, latency/error tracking, audit, inference history handoff. |
| `model-function-service` | Generated model functions, row-wise publishing, API-to-function type translation, function version updates, dependency import metadata. |
| `pipeline-build-service` | Pipeline Builder trained-model node, batch deployment pipelines, scheduled inference, output datasets, build/run history. |
| `code-workspaces service` | Notebook model outputs, interactive adapter development, experiment logging, model publication from workspaces. |
| `code-repositories service` | Repository-authored adapters, CI-backed model publication, dependency lockfiles, tests, package builds. |
| `credential-egress service` | External model egress policies, encrypted credentials, credential rotation, runtime secret delivery, network policy enforcement. |
| `evaluation-service` | Automatic inference/metrics pipelines, evaluator libraries, evaluation datasets, subsets, metric sets, dashboards. |
| `ontology-definition-service` | Model function/object/object-set type compatibility, model-backed object workflows, ontology registration metadata. |
| `functions service` | Function imports, model function invocation, TypeScript/Python bindings, application/action handoffs. |
| `security/governance service` | Permissions, markings, audit logs, retention, payload redaction, production promotion policies. |
| `data-health service` | Model/training/deployment/evaluation health signals, stale model alerts, evaluation drift, deployment error alerts. |
| `apps/web` | Model pages, Model Studio UI, objective UI, deployment UI, query/debug UI, evaluation dashboards, logs/metrics, setup wizards. |

## Acceptance criteria for first complete Model Integration and Model Studio milestone

- [ ] A user can create a model resource in a project folder, publish immutable model versions, inspect lineage, and view adapter/API metadata.
- [ ] A user can create a Model Studio, select regression/classification/time-series trainer, map datasets and columns, configure trainer parameters, configure compute resources, and launch a training run.
- [ ] Model Studio run history shows status, configuration version, build link, inputs, parameters, resources, changelog, output model version, and experiment link.
- [ ] Training runs produce model versions and experiments containing representative parameters, metrics, plots, source dataset versions, and trainer metadata.
- [ ] A user can deploy a supported model as a direct live deployment, query it interactively, view health/logs/metrics, and publish a model function.
- [ ] Model API validation rejects malformed live inference requests and records errors with safe debug metadata.
- [ ] Model functions can be called from Functions or application surfaces with function-compatible input/output types and row-wise publishing for eligible tabular models.
- [ ] Pipeline Builder and Python transforms can run batch inference with supported model inputs and produce output datasets with model-version lineage.
- [ ] A user can create a Modeling Objective, submit a Model Studio-produced model version, configure metadata/checks, review the submission, and release it to a staging or production tag.
- [ ] A user can create a Modeling Objective live deployment from a release and query it through a live endpoint or generated function.
- [ ] A user can create a batch deployment from a release, run inference over an input dataset, and publish an output dataset on schedule.
- [ ] Automatic evaluation can be configured with evaluation datasets, evaluator libraries, expected model outputs, optional subsets, generated inference datasets, metric sets, and an evaluation dashboard.
- [ ] External model connections require egress policy and encrypted credentials, and documented unsupported batch/evaluation modes are either blocked or clearly documented as OpenFoundry-specific extensions.
- [ ] All OpenFoundry runtime UI is OpenFoundry-native and does not use Palantir branding, screenshots, icons, fonts, or proprietary assets.

## Test plan expectations

- Unit tests for model API schema validation, adapter contract validation, version immutability, API diffing, row-wise flattening, dataset column mapping, trainer parameter validation, filter validation, compute quota enforcement, permission checks, and release eligibility rules.
- Unit tests for regression/classification/time-series trainer configuration translation, static dataset cardinality validation, probability output schema, quantile output schema, hyperparameter allow/deny validation, and experiment metadata generation.
- API tests for model CRUD, model version publication, artifact upload, adapter metadata, Model Studio CRUD, configuration versioning, training run launch/cancel/retry, experiment retrieval, objective CRUD, submissions, metadata fields, checks, releases, deployments, model functions, inference queries, evaluation configuration, metric sets, and archive/restore flows.
- Integration tests for Model Studio training over sample datasets, output model publication, experiment creation, direct deployment query, model function invocation, Pipeline Builder batch inference, Python transform model input, objective submission/release, live deployment from release, batch deployment output, and automatic evaluation pipelines.
- Integration tests for external model proxy registration with egress policy, encrypted credential update, live deployment query, Python transform egress use, and documented blocking of unsupported batch/evaluation modes.
- E2E tests for no-code Model Studio regression/classification/time-series workflows, training-run monitoring, output model inspection, submit-to-objective, review/check/release, direct deployment, live deployment query, model function usage in Workshop/Functions, batch deployment, and evaluation dashboard comparison.
- Observability tests for deployment startup logs, replica log filtering, model-emitted logs, host metrics, inference-container metrics, inference history, compute usage attribution, stale model health, training failure health, and evaluation pipeline health.
- Regression tests proving unauthorized users cannot read protected models, datasets, metrics, or inference history; external credentials are never displayed in logs/UI; API-breaking model versions require downstream function/application updates; direct deployments auto-upgrade only within their branch; objective deployments consume only released tags; and branch-only model versions cannot leak into main runtime use.
