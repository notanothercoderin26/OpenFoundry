# Foundry Automate and Rules 1:1 parity checklist

Date: 2026-05-11
Scope: public-docs-based parity plan for OpenFoundry's business automation and
rules surfaces: Automate application overview, automation creation wizard,
conditions, time schedules, object set monitoring, streaming object conditions,
evaluation frequency, condition settings, cycles, dropped object handling,
effect inputs, action effects, AIP Logic effects, function effects,
notification effects, fallback effects, effect ordering/concurrency, muting,
pausing, expiry, third-party application ownership, integrations with AIP Logic,
Notepad, Object Explorer, Ontology Manager and time series, activity/history,
health, audit, and Foundry Rules workflows for low-code business rules,
rule-object model, rule logic, workflow configuration, Rule Editor, Proposal
Reviewer, rule proposals, rule execution pipelines, and legacy-rule migration.

This document is intentionally implementation-oriented. It does not attempt to
clone Palantir branding, private source code, proprietary assets, screenshots,
or any non-public behavior. The target is **functional parity based on public
Palantir Foundry documentation**: the same product concepts, comparable
automation/rule authoring workflows, compatible resource models where useful,
and OpenFoundry-native implementation details that can be tested locally.

## Parity scope boundary

All checklist work is governed by the
[Foundry public-docs parity policy](../reference/foundry-public-docs-parity-policy.md).
OpenFoundry may implement behavior described in public Palantir documentation,
but contributors must not copy private source, decompile bundles, import
tenant-specific exports, use Palantir branding, or reuse proprietary assets.
The product target is functional parity in an OpenFoundry-native implementation,
not a pixel-perfect clone.

This checklist covers business automation and point-and-click rules management.
It should integrate with the Ontology/Object Views checklist for object set,
object type, action type, and object permission semantics; with the Functions
and AIP Logic checklists for compute/effect execution; with the Workshop
checklist for Rule Editor and Proposal Reviewer applications; with the Data
Foundation checklist for generated rule-output datasets and lineage; with the
Streaming/Data Connection checklist for streaming object conditions; and with
security/governance for permissions, audit, checkpoints, and third-party service
ownership. It should not duplicate those underlying execution surfaces.

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
| `P0` | Required for credible demo workflows that trigger actions/notifications from time and object-set conditions. |
| `P1` | Required for Foundry-style Automate and Rules parity beyond simple action scheduling. |
| `P2` | Advanced, governance-heavy, scale-oriented, third-party ownership, or legacy-migration parity. |

## Official Palantir documentation library

These public docs should be treated as the external behavioral contract while
implementing this checklist.

### Automate overview and creation

- [Automate overview](https://www.palantir.com/docs/foundry/automate/overview/)
- [Getting started with Automate](https://www.palantir.com/docs/foundry/automate/getting-started)
- [Automate integrations](https://www.palantir.com/docs/foundry/automate/integrations/)
- [Muting, pausing, and expiry](https://www.palantir.com/docs/foundry/automate/muting-pausing-expiry/)
- [Third-party application ownership](https://www.palantir.com/docs/foundry/automate/third-party-app-ownership/)

### Automate conditions and evaluation

- [Time condition](https://www.palantir.com/docs/foundry/automate/condition-time)
- [Object set conditions](https://www.palantir.com/docs/foundry/automate/condition-objects)
- [Streaming conditions](https://www.palantir.com/docs/foundry/automate/streaming/)
- [Condition settings](https://www.palantir.com/docs/foundry/automate/condition-settings/)
- [Evaluation frequency](https://www.palantir.com/docs/foundry/automate/evaluation-frequency/)

### Automate effects

- [Effects overview](https://www.palantir.com/docs/foundry/automate/effects/)
- [Effect settings](https://www.palantir.com/docs/foundry/automate/effect-settings)
- [Action effects](https://www.palantir.com/docs/foundry/automate/effect-actions)
- [Notification effects](https://www.palantir.com/docs/foundry/automate/effect-notification/)
- [Function effects](https://www.palantir.com/docs/foundry/automate/effect-function/)
- [Fallback effects](https://www.palantir.com/docs/foundry/automate/effect-fallback/)
- [AIP Logic integration with Automate](https://www.palantir.com/docs/foundry/logic/aip-logic-integration-automate/)

### Foundry Rules

- [Foundry Rules overview](https://www.palantir.com/docs/foundry/foundry-rules/overview/)
- [Foundry Rules core concepts](https://www.palantir.com/docs/foundry/foundry-rules/core-concepts/)
- [Foundry Rules Workshop application](https://www.palantir.com/docs/foundry/foundry-rules/workshop-application/)
- [Foundry Rules workflow configuration](https://www.palantir.com/docs/foundry/foundry-rules/foundry-rules-workflow-configuration/)
- [Legacy Foundry Rules setup](https://www.palantir.com/docs/foundry/foundry-rules/legacy-foundry-rules-setup-taurus/)
- [Foundry Rules troubleshooting](https://www.palantir.com/docs/foundry/foundry-rules/common-issues/)

### Integrated resource docs

- [Actions on interfaces](https://www.palantir.com/docs/foundry/action-types/actions-on-interfaces/)
- [Action notifications](https://www.palantir.com/docs/foundry/action-types/notifications/)
- [Functions getting started](https://www.palantir.com/docs/foundry/functions/getting-started/)
- [Object Explorer overview](https://www.palantir.com/docs/foundry/object-explorer/overview)
- [Ontology Manager overview](https://www.palantir.com/docs/foundry/ontology-manager/overview/index.html)
- [Schedules core concepts](https://www.palantir.com/docs/foundry/data-integration/schedules/)

## Target OpenFoundry resource model

The implementation should define stable OpenFoundry-owned resources that can map
to public Foundry concepts without requiring Palantir RID formats. Compatibility
aliases may be accepted at service boundaries, but persisted state should use
OpenFoundry canonical IDs.

| Public Foundry concept | OpenFoundry resource target | Required notes |
| --- | --- | --- |
| Automation | `automation` | Project/folder-managed business automation with conditions, effects, owner, recipients, status, expiry, permissions, activity, and audit. |
| Automation condition | `automation_condition` | Time, object set, streaming object, metric changed, threshold crossed, run-on-all, or composite condition. |
| Time condition | `automation_time_condition` | Hourly/daily/weekly/monthly/custom cron condition with schedule preview and minimum-frequency validation. |
| Object set condition | `automation_object_set_condition` | Monitored object set with condition type, object type, filter, saved object set/function source, evaluation frequency, and effect inputs. |
| Streaming condition | `automation_streaming_condition` | Stream-backed object condition with high-volume trigger state, object mapping, stream dataset reference, and checkpoint-like state. |
| Evaluation frequency | `automation_evaluation_frequency` | Live, scheduled, or automation-dependent evaluation mode with support matrix and scheduling metadata. |
| Condition settings | `automation_condition_settings` | Cycle allowance, live-scale dropped-object handling, execution queuing, batching, and partition controls. |
| Effect | `automation_effect` | Action, Logic, Function, Notification, or fallback effect with parameter mappings, execution settings, status, and result. |
| Effect input | `automation_effect_input` | Typed values exposed by a condition such as added/removed/modified object, object set, metric value, error metadata, or schedule timestamp. |
| Action effect | `automation_action_effect` | Action type invocation with parameter mappings, object edit behavior, branch/permission context, and action log reference. |
| Logic effect | `automation_logic_effect` | AIP Logic function execution with version, inputs, staged/apply-edits mode, and run history. |
| Function effect | `automation_function_effect` | Foundry/OpenFoundry function invocation with version target, compatible-version upgrade setting, inputs, outputs, and beta/availability metadata. |
| Notification effect | `automation_notification_effect` | Platform/email notification with recipients, heading, body, attachments, templates, dynamic recipient mappings, and delivery status. |
| Fallback effect | `automation_fallback_effect` | Failure path attached to an action/logic/function effect with access to error metadata and original trigger inputs. |
| Automation run | `automation_run` | Triggered evaluation/execution instance with status, trigger metadata, effect results, retries, object batches, logs, and audit. |
| Automation activity | `automation_activity_event` | Timeline event for created, triggered, recovered, failed, muted, paused, resumed, expired, edited, and ownership changes. |
| Automation ownership | `automation_owner` | User, group, or third-party application service user ownership model with handoff and token isolation. |
| Foundry Rules workflow | `rules_workflow` | Project/folder-managed low-code rule workflow with inputs, outputs, rule-object model, transform config, Workshop app, and permissions. |
| Rule | `business_rule` | Object-backed rule with condition tree, metadata, authoring state, proposal state, and output references. |
| Rule proposal | `rule_proposal` | Proposed create/edit/delete operation for one or more rules with diff, reviewer decision, action references, and applied/rejected state. |
| Rule logic | `rule_logic` | Point-and-click expression model over datasets/objects/time series with filters, aggregations, joins, operators, and output mapping. |
| Workflow input | `rules_workflow_input` | Dataset/object/time-series input exposed to rule authors with allowed properties, links, aliases, and configuration owner. |
| Workflow output | `rules_workflow_output` | Dataset/object output definition for rule execution with columns/properties, constraints, defaults, and writeback behavior. |
| Rule execution pipeline | `rules_execution_pipeline` | Generated or configured transform pipeline that applies approved rules to inputs and materializes outputs. |
| Rule Editor app | `rule_editor_workshop_app` | Workshop application page/module for creating, editing, deleting, filtering, selecting, and submitting rule proposals. |
| Proposal Reviewer app | `rule_proposal_reviewer_app` | Workshop application page/module for reviewing proposal diffs and applying approve/reject actions. |

## Milestone A: minimum viable Automate and Rules parity

### Automate application shell and lifecycle

- [ ] `AR.1` Automate application overview (`P0`, `todo`)
  - Provide overview cards for total visible automations, owned automations, recipient automations, paused automations, recent activity, failures in the last four weeks, recently triggered automations, and recently viewed automations.
  - Add tabs for Overview, Automations, Activity, Failures, Recipients, Owned by me, Integrations, and Health.
  - Support create automation from the Automate app, sidebar shortcut, and project/folder new-resource menu.
  - Docs: [Automate overview](https://www.palantir.com/docs/foundry/automate/overview/), [Getting started with Automate](https://www.palantir.com/docs/foundry/automate/getting-started).

- [ ] `AR.2` Automation resource CRUD and metadata (`P0`, `todo`)
  - Create, get, list, update metadata, move, duplicate, archive/delete, and restore automations.
  - Track name, description, save location, owner, creator, created/updated time, condition summary, effect summary, active/paused/muted/expired state, expiration policy, permissions, and health.
  - Provide automation detail pages with Summary, Conditions, Effects, Activity, Failures, Permissions, Integrations, and Settings tabs.
  - Docs: [Getting started with Automate](https://www.palantir.com/docs/foundry/automate/getting-started), [Muting, pausing, and expiry](https://www.palantir.com/docs/foundry/automate/muting-pausing-expiry/).

- [ ] `AR.3` Automation creation wizard (`P0`, `todo`)
  - Implement a stepper with Condition, Effect, Summary, Save location, Expiration, and Permissions pages.
  - Show condition/effect previews, validation errors, missing permission warnings, and final summary before creation.
  - Redirect to the new automation detail page and show a success banner after creation.
  - Docs: [Getting started with Automate](https://www.palantir.com/docs/foundry/automate/getting-started).

- [ ] `AR.4` Automation table and filters (`P0`, `todo`)
  - List automations visible to the current user with name, state, owner, location, last triggered, last failure, condition type, effect types, recipients, and expiration.
  - Provide filter pane for active/paused/muted/expired, owner, recipient, condition type, effect type, object type, action type, function, folder/project, and failure state.
  - Docs: [Getting started with Automate](https://www.palantir.com/docs/foundry/automate/getting-started), [Automate overview](https://www.palantir.com/docs/foundry/automate/overview/).

### Conditions and evaluation basics

- [ ] `AR.5` Time condition (`P0`, `todo`)
  - Support hourly, daily, weekly, monthly, and custom five-field cron expressions.
  - Enforce minimum frequency and unsupported seconds/year fields.
  - Generate natural-language previews and next-run timestamps.
  - Docs: [Time condition](https://www.palantir.com/docs/foundry/automate/condition-time).

- [ ] `AR.6` Object set condition definition (`P0`, `todo`)
  - Define monitored object sets dynamically by object type/filter, from a saved object set, or from a function returning an object set.
  - Provide preview to validate the object set before saving.
  - Track whether the object set is eligible for live, scheduled, or automation-dependent evaluation.
  - Docs: [Object set conditions](https://www.palantir.com/docs/foundry/automate/condition-objects), [Evaluation frequency](https://www.palantir.com/docs/foundry/automate/evaluation-frequency/).

- [ ] `AR.7` Objects added/removed/modified conditions (`P0`, `todo`)
  - Trigger when objects enter, leave, or are modified inside a monitored object set.
  - For modified-in-set, support selected watched properties plus include-added and include-removed settings.
  - Expose added/removed/modified object inputs to downstream effects.
  - Docs: [Object set conditions](https://www.palantir.com/docs/foundry/automate/condition-objects).

- [ ] `AR.8` Run on all objects condition (`P0`, `todo`)
  - Periodically run effects on every object in a selected object set.
  - Support batch size and parallelization settings to avoid action/function timeout patterns.
  - Expose object/object-set batches to effect parameters.
  - Docs: [Object set conditions](https://www.palantir.com/docs/foundry/automate/condition-objects), [Effect settings](https://www.palantir.com/docs/foundry/automate/effect-settings).

- [ ] `AR.9` Metric changed and threshold crossed conditions (`P0`, `todo`)
  - Support count metrics and numeric aggregations such as average, max, min, and sum over object sets.
  - Support metric increase/decrease triggers and threshold comparisons to static values or other metrics.
  - Support function-backed Boolean threshold checks.
  - Docs: [Object set conditions](https://www.palantir.com/docs/foundry/automate/condition-objects).

- [ ] `AR.10` Evaluation frequency support matrix (`P0`, `todo`)
  - Implement live monitoring, scheduled monitoring, and automation-dependent modes according to condition compatibility.
  - Explain why some conditions require scheduled evaluation.
  - Record effective evaluation frequency and source of object changes for each trigger.
  - Docs: [Evaluation frequency](https://www.palantir.com/docs/foundry/automate/evaluation-frequency/).

### Effects and execution basics

- [ ] `AR.11` Effect model and parameter mapping (`P0`, `todo`)
  - Support one or more effects per automation.
  - Map static values, condition effect inputs, object properties, object sets, metrics, timestamps, and error metadata into effect parameters.
  - Validate parameter type compatibility before saving.
  - Docs: [Effects overview](https://www.palantir.com/docs/foundry/automate/effects/), [Action effects](https://www.palantir.com/docs/foundry/automate/effect-actions).

- [ ] `AR.12` Action effects (`P0`, `todo`)
  - Search/select action types, configure one or more actions, map parameters, and validate action eligibility.
  - Allow action effects to execute on objects, object sets, or batches supplied by the condition.
  - Record action execution results and action log references on automation runs.
  - Docs: [Action effects](https://www.palantir.com/docs/foundry/automate/effect-actions), [Automate overview](https://www.palantir.com/docs/foundry/automate/overview/).

- [ ] `AR.13` Notification effects (`P0`, `todo`)
  - Send platform and email notifications to static users/groups or dynamic recipients from object properties/functions where supported.
  - Configure heading, message body, preview, attachments, and Notepad/Notepad template attachment inputs.
  - Record delivery status and recipient expansion results.
  - Docs: [Notification effects](https://www.palantir.com/docs/foundry/automate/effect-notification/), [Action notifications](https://www.palantir.com/docs/foundry/action-types/notifications/), [Automate integrations](https://www.palantir.com/docs/foundry/automate/integrations/).

- [ ] `AR.14` Fallback effects (`P0`, `todo`)
  - Attach failure effects to action, Logic, or function effects.
  - Expose error message, failed effect metadata, original condition inputs, and attempted object/object set to fallback parameter mappings.
  - Execute fallback effects only after the primary effect fails and record both results.
  - Docs: [Fallback effects](https://www.palantir.com/docs/foundry/automate/effect-fallback/), [Effects overview](https://www.palantir.com/docs/foundry/automate/effects/).

- [ ] `AR.15` Effect settings: ordering, concurrency, and guarantees (`P0`, `todo`)
  - Support parallel and sequential execution for action, Logic, and function effects.
  - Support partitioning/batching settings and queueing settings where available.
  - Document at-least-once execution semantics and encourage idempotent actions/functions.
  - Docs: [Effect settings](https://www.palantir.com/docs/foundry/automate/effect-settings), [Effects overview](https://www.palantir.com/docs/foundry/automate/effects/).

### Foundry Rules minimum viable workflow

- [ ] `AR.16` Rules workflow resource (`P0`, `todo`)
  - Create a rules workflow resource in a project/folder with name, description, owner, object model, inputs, outputs, transform configuration, Workshop app links, and permissions.
  - Show workflow overview, rules, proposals, configuration, generated pipeline, output datasets, health, and history.
  - Docs: [Foundry Rules overview](https://www.palantir.com/docs/foundry/foundry-rules/overview/), [Foundry Rules core concepts](https://www.palantir.com/docs/foundry/foundry-rules/core-concepts/).

- [ ] `AR.17` Rule object model (`P0`, `todo`)
  - Model rules as objects with properties managed by rule proposals.
  - Support rule status, title/name, description, author, created/updated timestamps, condition logic, output target, effective date, and activation state.
  - Docs: [Foundry Rules core concepts](https://www.palantir.com/docs/foundry/foundry-rules/core-concepts/).

- [ ] `AR.18` Basic rule logic builder (`P0`, `todo`)
  - Build rule conditions over dataset/object columns with simple filters, comparison operators, Boolean groups, and output assignments.
  - Provide validation and preview over sample rows/objects.
  - Store rule logic as OpenFoundry-owned expression JSON with versioning.
  - Docs: [Foundry Rules overview](https://www.palantir.com/docs/foundry/foundry-rules/overview/), [Foundry Rules core concepts](https://www.palantir.com/docs/foundry/foundry-rules/core-concepts/).

- [ ] `AR.19` Rule Editor Workshop page (`P0`, `todo`)
  - Build a Workshop-backed Rule Editor with filter list, object list, and rule editor widget/panel.
  - Let users create, edit, and delete rules by submitting an action that creates a proposal.
  - Auto-generate editor fields from configured action parameters where supported.
  - Docs: [Foundry Rules Workshop application](https://www.palantir.com/docs/foundry/foundry-rules/workshop-application/).

- [ ] `AR.20` Proposal Reviewer Workshop page (`P0`, `todo`)
  - Build a Workshop-backed Proposal Reviewer with filter list, proposal list, and proposal reviewer widget/panel.
  - Show create/edit/delete proposal diffs with changed values and prior values.
  - Support approve and reject actions that apply or discard proposed rule changes.
  - Docs: [Foundry Rules Workshop application](https://www.palantir.com/docs/foundry/foundry-rules/workshop-application/).

## Milestone B: credible Foundry-style Automate and Rules parity

### Advanced Automate conditions and runtime

- [ ] `AR.21` Advanced condition settings (`P1`, `todo`)
  - Configure cycle detection override for live monitoring with a documented maximum cycle count.
  - Configure dropped-object behavior when live automation scale limits are reached.
  - Configure execution queueing so events execute one at a time in trigger order when needed.
  - Docs: [Condition settings](https://www.palantir.com/docs/foundry/automate/condition-settings/).

- [ ] `AR.22` Streaming object conditions (`P1`, `todo`)
  - Support conditions over stream-backed objects for high-volume real-time detections.
  - Track stream dataset, object mapping, watched properties, checkpoint/offset state, and stream-lag diagnostics.
  - Connect streaming conditions to object modified or stream-specific condition builders where supported.
  - Docs: [Streaming conditions](https://www.palantir.com/docs/foundry/automate/streaming/), [Evaluation frequency](https://www.palantir.com/docs/foundry/automate/evaluation-frequency/).

- [ ] `AR.23` Combined time and object-data conditions (`P1`, `todo`)
  - Support automations that evaluate object data on a recurring time schedule.
  - Ensure object set metrics and threshold checks can be evaluated on schedule even when live monitoring is unsupported.
  - Display combined condition summaries and next evaluation times.
  - Docs: [Automate overview](https://www.palantir.com/docs/foundry/automate/overview/), [Time condition](https://www.palantir.com/docs/foundry/automate/condition-time), [Object set conditions](https://www.palantir.com/docs/foundry/automate/condition-objects).

- [ ] `AR.24` Trigger de-duplication and recovery detection (`P1`, `todo`)
  - Avoid duplicate triggers for the same object/condition transition within an evaluation window.
  - Detect recovery transitions for threshold/failure conditions and execute recovery effects where configured.
  - Persist previous condition state for scheduled and live evaluations.
  - Docs: [Object set conditions](https://www.palantir.com/docs/foundry/automate/condition-objects), [Fallback effects](https://www.palantir.com/docs/foundry/automate/effect-fallback/), [Muting, pausing, and expiry](https://www.palantir.com/docs/foundry/automate/muting-pausing-expiry/).

- [ ] `AR.25` Run activity and failure history (`P1`, `todo`)
  - Record every evaluation, trigger, effect execution, fallback execution, recovery, skip, failure, mute, pause, resume, expiry, and owner change.
  - Provide run detail with condition snapshot, effect inputs, effect outputs, errors, retries, object batches, logs, and action/function/logic run references.
  - Docs: [Getting started with Automate](https://www.palantir.com/docs/foundry/automate/getting-started), [Automate overview](https://www.palantir.com/docs/foundry/automate/overview/).

### Logic and function effects

- [ ] `AR.26` AIP Logic effects (`P1`, `todo`)
  - Select AIP Logic functions, configure version, map condition inputs, choose auto-apply versus staged-human-review behavior where supported, and record Logic run outputs.
  - Allow creating a pre-populated automation from an AIP Logic file uses panel equivalent.
  - Docs: [AIP Logic integration with Automate](https://www.palantir.com/docs/foundry/logic/aip-logic-integration-automate/), [Effects overview](https://www.palantir.com/docs/foundry/automate/effects/).

- [ ] `AR.27` Function effects (`P1`, `todo`)
  - Select Foundry/OpenFoundry functions, configure stable version or compatible auto-upgrade, map inputs, and record outputs.
  - Block applying ontology edits from function effects directly and route edit workflows through function-backed actions.
  - Surface beta/availability warnings in environments where function effects are not product-ready.
  - Docs: [Function effects](https://www.palantir.com/docs/foundry/automate/effect-function/), [Functions getting started](https://www.palantir.com/docs/foundry/functions/getting-started/).

- [ ] `AR.28` Effect input type system (`P1`, `todo`)
  - Support primitive, object, object set, list, struct, metric, user/group, timestamp, attachment, error, and Notepad template input mappings where local services exist.
  - Validate object type compatibility and object-set cardinality before execution.
  - Provide preview values from condition preview or sample trigger data.
  - Docs: [Object set conditions](https://www.palantir.com/docs/foundry/automate/condition-objects), [Notification effects](https://www.palantir.com/docs/foundry/automate/effect-notification/), [Action effects](https://www.palantir.com/docs/foundry/automate/effect-actions).

- [ ] `AR.29` Effect retry and idempotency guidance (`P1`, `todo`)
  - Retry transient failures with backoff while preserving at-least-once semantics.
  - Warn action/function authors when selected effects are likely non-idempotent.
  - Record retry attempts and final status on automation runs.
  - Docs: [Effect settings](https://www.palantir.com/docs/foundry/automate/effect-settings), [Fallback effects](https://www.palantir.com/docs/foundry/automate/effect-fallback/).

### State, permissions, ownership, and integrations

- [ ] `AR.30` Muting, pausing, and expiry (`P1`, `todo`)
  - Implement muted state where conditions continue to evaluate and activity is recorded but effects do not execute.
  - Implement paused state where the automation does not execute, with clear resume behavior.
  - Implement expiry options: indefinitely, immediately, and until a configured date/time.
  - Docs: [Muting, pausing, and expiry](https://www.palantir.com/docs/foundry/automate/muting-pausing-expiry/).

- [ ] `AR.31` Automation permissions (`P1`, `todo`)
  - Enforce viewer/editor/owner-like permissions on automations and resource-level permissions on underlying object types, object sets, actions, functions, Logic files, Notepad documents, and attachments.
  - Do not grant access to objects or actions merely because a user can view an automation.
  - Revalidate permissions at execution time for run-as or service-user contexts.
  - Docs: [Getting started with Automate](https://www.palantir.com/docs/foundry/automate/getting-started), [Third-party application ownership](https://www.palantir.com/docs/foundry/automate/third-party-app-ownership/).

- [ ] `AR.32` Third-party application ownership (`P1`, `todo`)
  - Allow trusted third-party applications or service users to own automations independently from individual users.
  - Provide ownership transfer, creator attribution, service-user status, token isolation, and app uninstall/disable behavior.
  - Docs: [Third-party application ownership](https://www.palantir.com/docs/foundry/automate/third-party-app-ownership/).

- [ ] `AR.33` Ontology Manager integrations (`P1`, `todo`)
  - Add Automations tabs to object type and action type detail pages.
  - Show automations triggered by the object type or using the action type as an effect.
  - Add create automation shortcuts that pre-fill object type conditions or action effects.
  - Docs: [Automate integrations](https://www.palantir.com/docs/foundry/automate/integrations/), [Ontology Manager overview](https://www.palantir.com/docs/foundry/ontology-manager/overview/index.html).

- [ ] `AR.34` Object Explorer and watched search integrations (`P1`, `todo`)
  - Create automations from saved object explorations and watched searches.
  - Trigger notifications/effects when saved search result sets change or aggregate criteria are met.
  - Preserve saved exploration permissions and object visibility constraints.
  - Docs: [Automate overview](https://www.palantir.com/docs/foundry/automate/overview/), [Object Explorer overview](https://www.palantir.com/docs/foundry/object-explorer/overview), [Automate integrations](https://www.palantir.com/docs/foundry/automate/integrations/).

- [ ] `AR.35` Notepad and time series integrations (`P1`, `todo`)
  - Allow Notepad documents and templates to be notification attachments with static or dynamic template inputs.
  - Add Notepad entry points for automation creation with document/template pre-filled.
  - Add time-series search automation handoff to save periods of interest as Ontology events where local time-series support exists.
  - Docs: [Automate integrations](https://www.palantir.com/docs/foundry/automate/integrations/), [Notification effects](https://www.palantir.com/docs/foundry/automate/effect-notification/).

### Foundry Rules workflow configuration and execution

- [ ] `AR.36` Rules workflow configuration editor (`P1`, `todo`)
  - Add editor pages for workflow inputs, workflow outputs, transform configuration, rule execution, generated resources, and permissions.
  - Allow workflow owners to add object/dataset/time-series inputs and expose selected link types or properties to rule authors.
  - Docs: [Foundry Rules workflow configuration](https://www.palantir.com/docs/foundry/foundry-rules/foundry-rules-workflow-configuration/).

- [ ] `AR.37` Rule workflow inputs (`P1`, `todo`)
  - Define dataset, object, and time-series inputs with aliases, allowed columns/properties, allowed linked object traversals, and sample preview.
  - Validate input schema changes and downstream rule impacts.
  - Docs: [Foundry Rules workflow configuration](https://www.palantir.com/docs/foundry/foundry-rules/foundry-rules-workflow-configuration/), [Foundry Rules overview](https://www.palantir.com/docs/foundry/foundry-rules/overview/).

- [ ] `AR.38` Rule workflow outputs (`P1`, `todo`)
  - Define output datasets or object writeback destinations, output columns/properties, types, permitted values, defaults, and validation rules.
  - Show which rules reference each output and how outputs are materialized by the execution pipeline.
  - Docs: [Foundry Rules workflow configuration](https://www.palantir.com/docs/foundry/foundry-rules/foundry-rules-workflow-configuration/).

- [ ] `AR.39` Advanced rule logic operators (`P1`, `todo`)
  - Support simple filters, nested Boolean groups, aggregations, joins, object traversals, time-series windows, and other configured operators as local services allow.
  - Provide SQL/expression preview or generated plan view for debugging.
  - Docs: [Foundry Rules overview](https://www.palantir.com/docs/foundry/foundry-rules/overview/), [Foundry Rules core concepts](https://www.palantir.com/docs/foundry/foundry-rules/core-concepts/).

- [ ] `AR.40` Rule proposal lifecycle (`P1`, `todo`)
  - Create proposals for rule create, edit, and delete operations.
  - Track author, submitted time, target rule, diff, validation status, reviewer, approve/reject decision, applied time, and resulting rule status.
  - Ensure approval applies the corresponding create/edit/delete change and rejection leaves the active rule unchanged.
  - Docs: [Foundry Rules Workshop application](https://www.palantir.com/docs/foundry/foundry-rules/workshop-application/), [Foundry Rules core concepts](https://www.palantir.com/docs/foundry/foundry-rules/core-concepts/).

- [ ] `AR.41` Rule execution pipeline generation (`P1`, `todo`)
  - Generate or configure a transform pipeline that reads rule inputs and rule writeback objects/datasets, applies approved rules, and writes configured outputs.
  - Expose generated pipeline in Data Lineage and link build results back to the rules workflow.
  - Docs: [Foundry Rules workflow configuration](https://www.palantir.com/docs/foundry/foundry-rules/foundry-rules-workflow-configuration/).

- [ ] `AR.42` Rule status dataset and health (`P1`, `todo`)
  - Track rule execution status, invalid rules, output row counts, failed validations, and last successful execution.
  - Surface common workflow configuration errors and troubleshooting hints.
  - Docs: [Foundry Rules workflow configuration](https://www.palantir.com/docs/foundry/foundry-rules/foundry-rules-workflow-configuration/), [Foundry Rules troubleshooting](https://www.palantir.com/docs/foundry/foundry-rules/common-issues/).

## Milestone C: advanced automation/rules governance and scale

### Automation scale, health, and audit

- [ ] `AR.43` Automation health checks (`P2`, `todo`)
  - Monitor failing automations, stale scheduled evaluations, live-monitoring lag, disabled actions/functions, missing permissions, expired owners, recipient expansion failures, and repeated fallback execution.
  - Surface health in Automate overview, Data Health, object type Automations tabs, and project dashboards.
  - Docs: [Automate overview](https://www.palantir.com/docs/foundry/automate/overview/), [Getting started with Automate](https://www.palantir.com/docs/foundry/automate/getting-started).

- [ ] `AR.44` Large-scale batching and partitioning (`P2`, `todo`)
  - Support object batches, partition sizes, parallel effect partitions, dropped-object reporting, and run-on-all progress for large object sets.
  - Provide deterministic batch IDs and restart from failed batch where possible.
  - Docs: [Object set conditions](https://www.palantir.com/docs/foundry/automate/condition-objects), [Condition settings](https://www.palantir.com/docs/foundry/automate/condition-settings/), [Effect settings](https://www.palantir.com/docs/foundry/automate/effect-settings).

- [ ] `AR.45` Automation audit event stream (`P2`, `todo`)
  - Emit immutable audit events for automation create/edit/delete, permission changes, owner changes, condition evaluations, triggers, effect executions, fallback executions, pause/mute/expiry changes, and integration-created automations.
  - Filter audit by automation, user, owner, object type, action type, function, Logic file, recipient, status, and time window.
  - Docs: [Automate overview](https://www.palantir.com/docs/foundry/automate/overview/), [Third-party application ownership](https://www.palantir.com/docs/foundry/automate/third-party-app-ownership/).

- [ ] `AR.46` Automation governance and checkpoints (`P2`, `blocked`)
  - Require justification, approval, or checkpoint review for automations that execute high-impact actions, external webhooks, bulk object edits, or sensitive notifications.
  - Integrate with OpenFoundry security/governance checklist once checkpoint and policy primitives exist.
  - Docs: [Action effects](https://www.palantir.com/docs/foundry/automate/effect-actions), [Automate overview](https://www.palantir.com/docs/foundry/automate/overview/).

- [ ] `AR.47` Branch-aware automation editing (`P2`, `blocked`)
  - Allow automation resources and rule workflows to participate in Global Branching proposals if local product policy allows it.
  - Prevent branch-only automations from executing against main objects unless explicitly enabled.
  - Mark blocked until OpenFoundry defines branch semantics for automations and scheduled jobs.
  - Docs: [Automate integrations](https://www.palantir.com/docs/foundry/automate/integrations/), [Foundry Rules workflow configuration](https://www.palantir.com/docs/foundry/foundry-rules/foundry-rules-workflow-configuration/).

### Advanced Rules customization and migration

- [ ] `AR.48` Rules workflow deployment template (`P2`, `todo`)
  - Provide deployment scaffolding for object model, Workshop application, actions, rule proposal object types, workflow configuration resource, generated transform pipeline, and output datasets.
  - Support local templates for alert generation, categorization/cohorting, transaction monitoring, equipment monitoring, and time-series event detection.
  - Docs: [Foundry Rules overview](https://www.palantir.com/docs/foundry/foundry-rules/overview/), [Foundry Rules core concepts](https://www.palantir.com/docs/foundry/foundry-rules/core-concepts/).

- [ ] `AR.49` Rule Viewer widget (`P2`, `todo`)
  - Provide a read-only Rule Viewer widget for Workshop apps and Object Views.
  - Render active rule logic, inputs, outputs, status, owner, last edited, and last execution result without allowing edits.
  - Docs: [Foundry Rules Workshop application](https://www.palantir.com/docs/foundry/foundry-rules/workshop-application/).

- [ ] `AR.50` Legacy Foundry Rules migration (`P2`, `todo`)
  - Detect legacy Taurus-style rule workflows that use separate Workshop, transform repository, and Ontology Manager configuration.
  - Provide migration inventory, compatibility warnings, read-only legacy views, and migration-to-workflow-configuration plan.
  - Docs: [Legacy Foundry Rules setup](https://www.palantir.com/docs/foundry/foundry-rules/legacy-foundry-rules-setup-taurus/).

- [ ] `AR.51` Rule workflow import/export (`P2`, `todo`)
  - Export workflow configuration, rule object schema, action definitions, Workshop page/module configuration, and transform configuration as OpenFoundry-native bundles.
  - Import bundles as draft resources with validation and dependency mapping.
  - Docs: [Foundry Rules workflow configuration](https://www.palantir.com/docs/foundry/foundry-rules/foundry-rules-workflow-configuration/), [Foundry Rules Workshop application](https://www.palantir.com/docs/foundry/foundry-rules/workshop-application/).

- [ ] `AR.52` Rule execution performance and explainability (`P2`, `todo`)
  - Track rule evaluation counts, matched rows/objects, output counts, skipped rules, invalid rules, execution duration, and generated query/plan for each build.
  - Provide per-rule explainability for why a row/object matched or did not match.
  - Docs: [Foundry Rules overview](https://www.palantir.com/docs/foundry/foundry-rules/overview/), [Foundry Rules workflow configuration](https://www.palantir.com/docs/foundry/foundry-rules/foundry-rules-workflow-configuration/).

- [ ] `AR.53` Rule workflow audit and approvals (`P2`, `todo`)
  - Emit audit events for rule workflow configuration changes, rule proposal submission, approval, rejection, applied changes, generated pipeline builds, and output materialization.
  - Support optional multi-reviewer policies and segregation-of-duties rules for high-impact workflows.
  - Docs: [Foundry Rules Workshop application](https://www.palantir.com/docs/foundry/foundry-rules/workshop-application/), [Foundry Rules workflow configuration](https://www.palantir.com/docs/foundry/foundry-rules/foundry-rules-workflow-configuration/).

## Implementation inventory to collect before coding

- [ ] `INV.1` Identify existing OpenFoundry automation, workflow, schedule, job, trigger, and activity/event models.
- [ ] `INV.2` Identify existing object set, object search, saved exploration, object set filter, stream-backed object, and aggregation primitives.
- [ ] `INV.3` Identify existing Ontology Actions execution, action logs, function-backed action, action notification, webhook side effect, and revert primitives.
- [ ] `INV.4` Identify existing Functions, AIP Logic-like, Python/TypeScript runtime, function versioning, compatible-upgrade, and run history primitives.
- [ ] `INV.5` Identify existing notification, email, recipient expansion, group/user lookup, attachment, Notepad, and template-rendering primitives.
- [ ] `INV.6` Identify existing permission, ownership, service-user, third-party app, token, audit, checkpoint, and governance primitives.
- [ ] `INV.7` Identify existing Automate frontend routes or workflow-automation-service APIs that can support automation overview, wizard, detail, runs, and health.
- [ ] `INV.8` Identify existing Workshop widgets and app/page/module patterns for Rule Editor, Proposal Reviewer, Rule Viewer, filters, object lists, and diff panels.
- [ ] `INV.9` Identify existing rule/business-logic expression builders, Pipeline Builder expression catalogs, SQL/aggregation engines, and rule output dataset primitives.
- [ ] `INV.10` Identify existing rule proposal/action models and whether approve/reject can apply create/edit/delete rule changes transactionally.
- [ ] `INV.11` Identify existing generated transform pipeline, build, schedule, Data Lineage, Data Health, and status dataset support for rule execution.
- [ ] `INV.12` Identify existing legacy rules/Taurus imports or customer-specific rule app patterns that need read-only or migration support.
- [ ] `INV.13` Produce a machine-readable parity matrix sibling JSON after inventory, following the pattern of [foundry-feature-parity-matrix.json](./foundry-feature-parity-matrix.json).

## Suggested service boundaries

| Surface | Responsibilities |
| --- | --- |
| `workflow-automation-service` | Automation CRUD, conditions, evaluation scheduling, live monitoring, effect orchestration, run history, activity timeline, muting/pausing/expiry, ownership. |
| `automation-effects service` | Action/Logic/function/notification/fallback effect adapters, parameter mapping, execution ordering, retries, effect result storage. |
| `ontology-query-service` | Object set definition, saved object set loading, object search, object set changes, metrics, aggregations, threshold evaluation. |
| `streaming-service` | Stream-backed object conditions, stream offsets/checkpoints, high-volume detection, lag metrics, dropped-object handling. |
| `ontology-actions-service` | Action effect execution, action logs, function-backed actions, action notification/webhook handoffs, object edit validation. |
| `functions service` | Function effects, function-backed threshold checks, object set functions, version resolution, auto-upgrade compatibility, run history. |
| `logic service` | AIP Logic effect execution, staged/apply-edits behavior, proposal review handoff, integration-created automations. |
| `notification service` | Platform/email notifications, recipient expansion, dynamic recipients, attachments, Notepad template rendering, delivery status. |
| `rules-workflow-service` | Rules workflow CRUD, workflow inputs/outputs/config, rule logic schema, rule proposal state, generated pipeline metadata, troubleshooting. |
| `pipeline-build-service` | Rule execution transform generation, scheduled builds, output datasets, rule status dataset, Data Lineage edges, build logs. |
| `workshop service` | Rule Editor, Proposal Reviewer, Rule Viewer widgets/apps, filters, object lists, diff viewer, action-backed proposal submission/review. |
| `security/governance service` | Automation permissions, service-user ownership, checkpoints, audit policy, sensitive action governance, recipient/data visibility controls. |
| `data-health service` | Automation failure health, stale evaluation health, rule workflow health, generated pipeline health, repeated fallback and dropped-object alerts. |
| `apps/web` | Automate app, automation wizard/detail, activity/failure tables, integration tabs, Rules workflow configuration, Rule Editor/Reviewer UI. |

## Acceptance criteria for first complete Automate and Rules milestone

- [ ] A user can create an automation from Automate with a time condition and notification effect, save it in a project/folder, and inspect it on the detail page.
- [ ] A user can create an object-set automation for objects added/removed/modified, preview the monitored object set, and map trigger objects into an action effect.
- [ ] A user can configure metric changed and threshold crossed conditions over object set aggregations and see scheduled evaluation history.
- [ ] A user can add multiple effects, configure sequential versus parallel execution, and see run history with effect inputs, outputs, failures, and fallback execution.
- [ ] Muting, pausing, resuming, and expiry behave distinctly and are reflected in activity history.
- [ ] Automations created from Ontology Manager object type/action type pages pre-fill the correct condition or action effect.
- [ ] Permission checks prevent unauthorized users from viewing protected object data, invoking actions/functions, or editing automations they do not own.
- [ ] A user can deploy a Rules workflow with inputs, outputs, generated Workshop Rule Editor/Proposal Reviewer pages, and a generated execution pipeline.
- [ ] A user can create/edit/delete a rule through Rule Editor, submit a proposal, review diff, approve/reject it, and see the resulting active rule state.
- [ ] Rule execution produces output datasets or objects and records rule status, output counts, failures, and lineage to the generated pipeline.
- [ ] Data Health surfaces failing automations, repeated effect failures, stale evaluations, invalid rules, and failed rule execution builds.
- [ ] All OpenFoundry runtime UI is OpenFoundry-native and does not use Palantir branding, screenshots, icons, fonts, or proprietary assets.

## Test plan expectations

- Unit tests for cron validation, object set condition transitions, evaluation frequency compatibility, cycle/dropped-object settings, effect parameter mapping, sequential/parallel effect planning, fallback routing, muting/pausing/expiry state, and ownership permissions.
- API tests for automation CRUD, wizard save payloads, condition preview, effect validation, run history, activity events, failures table, integrations, third-party ownership, rule workflow CRUD, rule proposal lifecycle, workflow config, and rule status.
- Integration tests for object-set automation executing actions, scheduled metric threshold notifications, function-backed threshold checks, Logic effect staging, notification attachments, fallback action execution, stream-backed object triggers, and service-user-owned automation execution.
- Rules integration tests for Rule Editor proposal submission, Proposal Reviewer approval/rejection, generated execution pipeline, output dataset materialization, rule status dataset updates, workflow configuration changes, and legacy workflow import warnings.
- E2E tests for Automate overview, automation creation wizard, object-set condition preview, action effect parameter mapping, notification preview, run detail/failure detail, muting/pausing/expiry flows, Ontology Manager integration shortcuts, Rule Editor, Proposal Reviewer, and Rules workflow configuration editor.
- Regression tests proving automations do not execute while paused/expired, muted automations record activity without effects, dropped objects are reported, fallback effects receive error context, unauthorized users cannot infer protected objects/recipients, and rejected rule proposals do not alter active rules.
