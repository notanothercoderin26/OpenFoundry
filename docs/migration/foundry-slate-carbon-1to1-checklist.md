# Foundry Slate and Carbon 1:1 parity checklist

Date: 2026-05-11
Scope: public-docs-based parity plan for OpenFoundry's Slate and Carbon
application-building surfaces: Slate integrated applications, public
applications, application creation, pages, routes, versions, merge/import/export
and duplication, widgets, responsive layouts, CSS styling, custom fonts,
variables, tabular variables, URL parameters, Handlebars, Slate functions,
function libraries, events and actions, queries, Object Set Builder, Ontology
SDK access, Foundry Functions, Actions writeback, public data upload, Code
Sandbox widgets, iframe/file-import advanced widgets, dependencies, debugging,
performance guardrails, Marketplace packaging, Carbon workspaces, workspace
creation, home page, logo/subtitle/featured items, menu bar, navigation menu,
promoted workspaces, default workspaces, link-only visibility, module anchors,
module discovery, module input/output contracts, navigation framework, Object
View/Object Explorer/Search/Workshop/Quiver/Slate/Vertex/Notepad modules,
workspace-level and module-level navigation restrictions, dark/light theme,
notifications, YAML/code editing, permissions, organization administration,
Application Portal integration, auditability, usage attribution, and
production-readiness guardrails for curated operational applications.

This document is intentionally implementation-oriented. It does not attempt to
clone Palantir branding, private source code, proprietary assets, screenshots,
or any non-public behavior. The target is **functional parity based on public
Palantir Foundry documentation**: the same product concepts, comparable
application-builder and workspace-curation workflows, compatible resource models
where useful, and OpenFoundry-native implementation details that can be tested
locally.

## Parity scope boundary

All checklist work is governed by the
[Foundry public-docs parity policy](../reference/foundry-public-docs-parity-policy.md).
OpenFoundry may implement behavior described in public Palantir documentation,
but contributors must not copy private source, decompile bundles, import
tenant-specific exports, use Palantir branding, or reuse proprietary assets.
The product target is functional parity in an OpenFoundry-native implementation,
not a pixel-perfect clone.

This checklist covers Slate as a custom application builder and Carbon as a
curated workspace builder. It should integrate with Workshop for embedded and
standalone app workflows; with Ontology/Object Views and Object Explorer for
object and object-set navigation; with Functions, OSDK, and AIP Logic for typed
backend logic; with Action Types and Automate for writeback and operational
handoffs; with Data Foundation and Media Sets for query/upload/file resources;
with Analytics Suite for Quiver/Notepad modules and embedded dashboards; with
DevOps/Marketplace for packaging; with Security/Governance for public app,
organization, workspace, resource, action, egress, and audit controls; and with
Resource Management for usage and performance. It should not duplicate those
underlying surfaces.

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
| `P0` | Required for credible workflows that build a Slate app, publish it to users, create a Carbon workspace, add modules, navigate across modules, and enforce permissions. |
| `P1` | Required for Foundry-style Slate and Carbon parity beyond simple pages and links: public apps, custom logic, writeback, versioning, Marketplace, and workspace curation. |
| `P2` | Advanced, governance-heavy, performance, custom-code, Marketplace, public-internet, multi-organization, observability, or platform-hardening parity. |

## Official Palantir documentation library

These public docs should be treated as the external behavioral contract while
implementing this checklist.

### Slate overview and application management

- [Slate overview](https://www.palantir.com/docs/foundry/slate/overview)
- [Slate navigation](https://www.palantir.com/docs/foundry/slate/navigation)
- [Slate FAQ](https://www.palantir.com/docs/foundry/slate/faq/)
- [Application types](https://www.palantir.com/docs/foundry/slate/applications-types)
- [Create applications](https://www.palantir.com/docs/foundry/slate/applications-create/)
- [Pages](https://www.palantir.com/docs/foundry/slate/applications-pages/)
- [Manage application versions](https://www.palantir.com/docs/foundry/slate/applications-versions/)
- [Merge application changes](https://www.palantir.com/docs/foundry/slate/applications-merge/)
- [Import, export, and duplicate applications](https://www.palantir.com/docs/foundry/slate/applications-import-export-duplicate/)
- [Enable user interaction](https://www.palantir.com/docs/foundry/slate/applications-enable-user-interaction/)
- [Add Slate application to a Marketplace product](https://www.palantir.com/docs/foundry/slate/marketplace-slate/)

### Slate read/write data and logic

- [Read and write data overview](https://www.palantir.com/docs/foundry/slate/read-write-overview/)
- [Write back data with Actions](https://www.palantir.com/docs/foundry/slate/concepts-actions/)
- [Read and write to data systems](https://www.palantir.com/docs/foundry/slate/concepts-queries/)
- [Create or retrieve object sets](https://www.palantir.com/docs/foundry/slate/concepts-object-sets/)
- [Retrieve individual objects](https://www.palantir.com/docs/foundry/slate/concepts-objects/)
- [Use the Ontology SDK in Slate](https://www.palantir.com/docs/foundry/slate/concepts-osdk/)
- [Use Foundry Functions in Slate](https://www.palantir.com/docs/foundry/slate/concepts-foundry-functions)
- [Upload data for public applications](https://www.palantir.com/docs/foundry/slate/concepts-public-upload/)
- [Logic overview](https://www.palantir.com/docs/foundry/slate/logic-overview/)
- [View application dependencies](https://www.palantir.com/docs/foundry/slate/concepts-dependencies/)
- [Understand dependencies](https://www.palantir.com/docs/foundry/slate/best-practices-app-functionality)
- [Define and run Slate functions](https://www.palantir.com/docs/foundry/slate/concepts-functions/)
- [Store values in variables](https://www.palantir.com/docs/foundry/slate/concepts-variables/)
- [Configure Events and Actions](https://www.palantir.com/docs/foundry/slate/concepts-events/)
- [Handlebar helpers](https://www.palantir.com/docs/foundry/slate/references-helpers/)

### Slate widgets and styling

- [Widgets overview](https://www.palantir.com/docs/foundry/slate/widgets-overview/)
- [Basic widgets](https://www.palantir.com/docs/foundry/slate/widgets-basic/)
- [Charts widgets](https://www.palantir.com/docs/foundry/slate/widgets-charts/)
- [Controls widgets](https://www.palantir.com/docs/foundry/slate/widgets-controls/)
- [Tables widgets](https://www.palantir.com/docs/foundry/slate/widgets-tables/)
- [Maps widgets](https://www.palantir.com/docs/foundry/slate/widgets-maps/)
- [Advanced widgets](https://www.palantir.com/docs/foundry/slate/widgets-advanced/)
- [Styles overview](https://www.palantir.com/docs/foundry/slate/style-overview)
- [Configure and apply styles](https://www.palantir.com/docs/foundry/slate/concepts-styles)
- [Embed Slate in Workshop iframe widgets](https://www.palantir.com/docs/foundry/workshop/widgets-iframe)

### Carbon overview, workspaces, and configuration

- [Carbon overview](https://www.palantir.com/docs/foundry/carbon/overview/)
- [Carbon getting started](https://www.palantir.com/docs/foundry/carbon/getting-started/)
- [Workspaces overview](https://www.palantir.com/docs/foundry/carbon/workspaces-overview/)
- [Create a workspace](https://www.palantir.com/docs/foundry/carbon/workspaces-create/)
- [Configure navigation between workspaces](https://www.palantir.com/docs/foundry/carbon/workspaces-navigation/)
- [Set a default workspace](https://www.palantir.com/docs/foundry/carbon/workspaces-default/)
- [General configuration](https://www.palantir.com/docs/foundry/carbon/configuration-general/)
- [Home configuration](https://www.palantir.com/docs/foundry/carbon/configuration-home)
- [Menu bar configuration](https://www.palantir.com/docs/foundry/carbon/configuration-menu-bar/)
- [Access configuration](https://www.palantir.com/docs/foundry/carbon/configuration-access/)
- [Restrict navigation out of a workspace](https://www.palantir.com/docs/foundry/carbon/restrict-workspace-nav/)
- [YAML configuration reference](https://www.palantir.com/docs/foundry/carbon/code-reference/)

### Carbon modules, navigation, and permissions

- [Modules overview](https://www.palantir.com/docs/foundry/carbon/modules-overview/)
- [Configure module discovery](https://www.palantir.com/docs/foundry/carbon/modules-discovery/)
- [Configure navigation between modules](https://www.palantir.com/docs/foundry/carbon/modules-navigation)
- [Configure permissions](https://www.palantir.com/docs/foundry/carbon/permissions-configure)
- [Orientation and navigation: Carbon workspaces](https://www.palantir.com/docs/foundry/getting-started/orientation-and-nav)
- [Object Views in platform applications](https://www.palantir.com/docs/foundry/object-views/use-full-views-in-platform)
- [Analytical dashboards](https://www.palantir.com/docs/foundry/analytics/dashboards/)
- [Quiver dashboards in Marketplace](https://www.palantir.com/docs/foundry/quiver/dashboards-marketplace)

## Target OpenFoundry resource model

The implementation should define stable OpenFoundry-owned resources that can map
to public Foundry concepts without requiring Palantir RID formats. Compatibility
aliases may be accepted at service boundaries, but persisted state should use
OpenFoundry canonical IDs.

| Public Foundry concept | OpenFoundry resource target | Required notes |
| --- | --- | --- |
| Slate application | `slate_application` | Project/folder-managed app with type, pages, routes, widgets, variables, queries, functions, events, styles, versions, publish state, and permissions. |
| Slate application type | `slate_application_type` | Integrated or public application behavior controlling data access, publish target, public link, and permission requirements. |
| Slate page | `slate_page` | Routeable page with layout, widgets, local variables, route parameters, permissions, and navigation metadata. |
| Slate version | `slate_version` | Saved/published/imported version snapshot with author, timestamp, changelog, diff, merge base, and rollback/export metadata. |
| Slate widget | `slate_widget` | Typed visual/control/table/chart/map/advanced component with state, styles, events, data bindings, and output handles. |
| Slate query | `slate_query` | Foundry/API/SQL/HTTP/Object Set Builder query with inputs, outputs, security context, dependencies, caching, and execution policy. |
| Slate variable | `slate_variable` | Shared or page-local state value with type, default value, current value, URL parameter binding, and tabular-data support. |
| Slate function | `slate_function` | Application-local JavaScript transform with inputs from Handlebars, async support, no DOM access, library refs, and diagnostics. |
| Slate Foundry Function binding | `slate_foundry_function_binding` | Typed call to published Foundry Function with version, inputs, object set bindings, outputs, and error state. |
| Slate event action | `slate_event_action` | Event/action pair for user interactions or loading states, with conditional JavaScript, target action, and audit/debug metadata. |
| Slate style resource | `slate_style_resource` | CSS overrides, font refs, widget classes, theme settings, custom font files, and style validation diagnostics. |
| Code Sandbox widget | `slate_code_sandbox_widget` | Iframe/sandbox-backed custom widget with JS/CSS/HTML, libraries, state bridge, actions bridge, CSP/CORS policy, and warnings. |
| Public app upload | `slate_public_upload` | Data/file upload submission from public apps with validation, target dataset/media/action, rate limits, provenance, and retention. |
| Slate dependency graph | `slate_dependency_graph` | Graph over widgets, variables, queries, functions, events, pages, resources, and Foundry dependencies for debugging/performance. |
| Carbon workspace | `carbon_workspace` | Project/folder-managed curated workspace with home page, menu bar, modules, promoted/default visibility, navigation restrictions, and permissions. |
| Carbon home page | `carbon_home_page` | Default or replacement home module with logo, subtitle, search bar, featured sections, links, object types, and saved explorations. |
| Carbon menu bar | `carbon_menu_bar` | Navigation menu, anchored module tabs, add-module button, utility buttons, notifications option, profile/logout, and external links. |
| Carbon module | `carbon_module` | Parameterized application/resource opened in Carbon tabs, including built-in and dynamic module types. |
| Carbon module interface | `carbon_module_interface` | Input/output contract for module navigation, object/object-set parameters, variables, constraints, and discoverability. |
| Carbon navigation action | `carbon_navigation_action` | Runtime action opening a module in a new tab with encoded parameters and source-module output provenance. |
| Carbon discoverable module | `carbon_discoverable_module` | Dynamic module configured to appear in Open in menus when input/output constraints are satisfied. |
| Carbon promoted workspace | `carbon_promoted_workspace` | Organization-level allowlist entry that shows workspace in the Navigation Menu and enables discoverability outside Carbon. |
| Carbon default workspace | `carbon_default_workspace` | User/group/organization default workspace selection with precedence and access validation. |
| Carbon organization settings | `carbon_organization_settings` | Organization-level navigation menu, external links, dark-mode/theme defaults, promoted workspaces, and admin permissions. |
| Carbon access policy | `carbon_access_policy` | Resource viewer/editor/admin requirements, organization promotion requirements, navigation-out restrictions, and module-resource access checks. |
| Carbon YAML config | `carbon_yaml_config` | Code-editable workspace configuration representation with schema validation, import/export, and drift detection. |
| Slate/Carbon Marketplace package | `slate_carbon_marketplace_package` | Product packaging manifest for Slate apps and Carbon-compatible resources with parameters, dependencies, and install-time mappings. |
| Application usage metric | `app_builder_usage_metric` | Load time, query/function execution, widget render, public submission, module navigation, Carbon workspace access, and error usage telemetry. |
| Application audit event | `app_builder_audit_event` | Normalized audit record for app/workspace creation, edit, publish, access, public submission, writeback, navigation, export, and packaging. |

## Milestone A: minimum viable Slate and Carbon parity

### Slate application basics

- [ ] `SC.1` Slate application CRUD and project placement (`P0`, `todo`)
  - Create, get, list, update metadata, move, duplicate, archive/delete, restore, import, and export Slate applications.
  - Store applications as project/folder resources with name, description, type, owner, created/updated timestamps, current version, published version, and permissions.
  - Support integrated applications first and model public applications as a separate application type with stricter permissions.
  - Docs: [Slate overview](https://www.palantir.com/docs/foundry/slate/overview), [Application types](https://www.palantir.com/docs/foundry/slate/applications-types), [Create applications](https://www.palantir.com/docs/foundry/slate/applications-create/).

- [ ] `SC.2` Slate editor shell and navigation (`P0`, `todo`)
  - Provide a drag-and-drop editor with canvas, page tree, widgets palette, platform/data panels, variables panel, functions panel, events panel, styles panel, and preview/publish controls.
  - Include application-level settings for app type, routes, interaction enablement, dependencies, imports/exports, versions, and permissions.
  - Preserve OpenFoundry-native UI styling and avoid Palantir screenshots or visual assets.
  - Docs: [Slate navigation](https://www.palantir.com/docs/foundry/slate/navigation), [Create applications](https://www.palantir.com/docs/foundry/slate/applications-create/).

- [ ] `SC.3` Pages, routes, and application structure (`P0`, `todo`)
  - Create, rename, duplicate, delete, reorder, and route pages with shared and local state.
  - Support page-level widgets, page-local variables, URL parameters, and route navigation events.
  - Validate route uniqueness, broken links, missing pages, and page-level dependency cycles.
  - Docs: [Pages](https://www.palantir.com/docs/foundry/slate/applications-pages/), [Store values in variables](https://www.palantir.com/docs/foundry/slate/concepts-variables/).

- [ ] `SC.4` Slate widgets and layout (`P0`, `todo`)
  - Add, configure, move, resize, duplicate, delete, hide/show, and style basic, control, chart, table, map, and advanced widgets.
  - Persist widget state, input/output handles, layout breakpoints, responsive behavior, and display configuration.
  - Validate missing bindings, invalid handles, unrenderable states, and excessive widget count.
  - Docs: [Widgets overview](https://www.palantir.com/docs/foundry/slate/widgets-overview/), [Basic widgets](https://www.palantir.com/docs/foundry/slate/widgets-basic/), [Charts widgets](https://www.palantir.com/docs/foundry/slate/widgets-charts/), [Advanced widgets](https://www.palantir.com/docs/foundry/slate/widgets-advanced/).

- [ ] `SC.5` Styling, themes, and custom fonts (`P0`, `todo`)
  - Support app-level CSS, widget additional classes, widget custom styles, light/dark mode compatibility, and uploaded custom font references.
  - Provide CSS validation, style preview, safe sanitizer rules, and warnings for fragile selectors.
  - Ensure custom styling is OpenFoundry-native and does not reuse Palantir proprietary branding or fonts.
  - Docs: [Styles overview](https://www.palantir.com/docs/foundry/slate/style-overview), [Configure and apply styles](https://www.palantir.com/docs/foundry/slate/concepts-styles).

### Slate state, logic, and data access

- [ ] `SC.6` Variables and tabular variables (`P0`, `todo`)
  - Support shared and page-local variables with Number, String, Boolean, Array, Object, Null, and tabular/spreadsheet-like values.
  - Validate naming rules, default values, type inference, page scope, current-value preview, CSV upload, and URL parameter binding.
  - Make it clear that normal variable values reset on page reload unless persisted through supported user-storage mechanisms.
  - Docs: [Store values in variables](https://www.palantir.com/docs/foundry/slate/concepts-variables/), [Logic overview](https://www.palantir.com/docs/foundry/slate/logic-overview/).

- [ ] `SC.7` Handlebars and helper references (`P0`, `todo`)
  - Implement Handlebars references for widgets, variables, queries, functions, Foundry Functions, route parameters, and event payloads.
  - Support documented helpers such as number/date formatting and lookup behavior where local helper semantics are compatible.
  - Provide dependency discovery, broken-reference diagnostics, and safe error messages.
  - Docs: [Handlebar helpers](https://www.palantir.com/docs/foundry/slate/references-helpers/), [Understand dependencies](https://www.palantir.com/docs/foundry/slate/best-practices-app-functionality).

- [ ] `SC.8` Slate functions (`P0`, `todo`)
  - Define JavaScript functions that read Handlebars-accessible values and return transformed values for widgets, queries, or events.
  - Enforce no DOM access and no saved state for Slate functions, while allowing asynchronous syntax where the local sandbox supports it.
  - Support per-document function libraries, parameters, syntax/runtime diagnostics, and execution traces.
  - Docs: [Define and run Slate functions](https://www.palantir.com/docs/foundry/slate/concepts-functions/), [Logic overview](https://www.palantir.com/docs/foundry/slate/logic-overview/).

- [ ] `SC.9` Events and Actions (`P0`, `todo`)
  - Configure event/action pairs for user interactions, dialog/toast lifecycle, variable updates, query execution, page navigation, and loading states.
  - Support conditional event JavaScript, action disabling, parameter mapping, and event debugging without DOM access or saved state.
  - Detect cycles, stale references, missing targets, and order-of-execution hazards.
  - Docs: [Configure Events and Actions](https://www.palantir.com/docs/foundry/slate/concepts-events/), [Logic overview](https://www.palantir.com/docs/foundry/slate/logic-overview/).

- [ ] `SC.10` Slate data queries (`P0`, `todo`)
  - Support Object Set Builder queries, Foundry/API queries, SQL queries, HTTP JSON queries where egress/governance allows, query partials, and conditional queries.
  - Enforce query permissions, restricted views, object security, scoped sessions, egress policies, and rate limits.
  - Provide query run states, loading/error outputs, samples/previews, timeout handling, and truncation warnings.
  - Docs: [Read and write to data systems](https://www.palantir.com/docs/foundry/slate/concepts-queries/), [Create or retrieve object sets](https://www.palantir.com/docs/foundry/slate/concepts-object-sets/).

- [ ] `SC.11` Foundry Functions and OSDK in Slate (`P0`, `todo`)
  - Bind Slate to published Foundry Functions with version selection, typed input mapping, object set inputs, and typed output handles.
  - Support OSDK/Ontology access patterns for object sets and individual objects where local SDK/runtime support exists.
  - Encourage thin/thick backend patterns by documenting when logic belongs in reusable Functions versus app-local JavaScript.
  - Docs: [Use Foundry Functions in Slate](https://www.palantir.com/docs/foundry/slate/concepts-foundry-functions), [Use the Ontology SDK in Slate](https://www.palantir.com/docs/foundry/slate/concepts-osdk/), [Retrieve individual objects](https://www.palantir.com/docs/foundry/slate/concepts-objects/).

- [ ] `SC.12` Slate writeback with Actions (`P0`, `todo`)
  - Invoke Ontology Actions from Slate widgets/events with typed parameter mapping, validation, confirmation UI, and result handling.
  - Enforce action permissions, object security, marking checks, public-app restrictions, and audit logging.
  - Prevent direct unsupported writeback paths unless intentionally implemented and documented as OpenFoundry-specific.
  - Docs: [Write back data with Actions](https://www.palantir.com/docs/foundry/slate/concepts-actions/), [Enable user interaction](https://www.palantir.com/docs/foundry/slate/applications-enable-user-interaction/).

### Minimum viable Carbon

- [ ] `SC.13` Carbon workspace CRUD and storage (`P0`, `todo`)
  - Create, get, list, update metadata, move, duplicate, archive/delete, and restore Carbon workspaces as project/folder resources.
  - Track workspace location, owner, edit/view permissions, organization visibility, promoted status, default status, and modified timestamps.
  - Create new workspaces with a default home page and redirect users into the newly created workspace.
  - Docs: [Carbon overview](https://www.palantir.com/docs/foundry/carbon/overview/), [Create a workspace](https://www.palantir.com/docs/foundry/carbon/workspaces-create/), [Getting started](https://www.palantir.com/docs/foundry/carbon/getting-started/).

- [ ] `SC.14` Carbon editor shell (`P0`, `todo`)
  - Provide edit mode with General, Home, Menu, and Access configuration sections.
  - Let editors update workspace name/description, appearance, discoverable modules, navigation-out setting, logo, subtitle, featured items, menu modules, access state, and location links.
  - Gate organization-level settings to Carbon administrators and resource-level settings to workspace editors.
  - Docs: [Carbon getting started](https://www.palantir.com/docs/foundry/carbon/getting-started/), [General configuration](https://www.palantir.com/docs/foundry/carbon/configuration-general/), [Access configuration](https://www.palantir.com/docs/foundry/carbon/configuration-access/).

- [ ] `SC.15` Carbon home page (`P0`, `todo`)
  - Configure home page logo, dimensions, subtitle, search bar, columns/sections, links to modules, object types, saved explorations, and Foundry resources.
  - Allow replacing the home page with a selected module/resource and parameters where local module support exists.
  - Ensure default home search opens Carbon search/Object Explorer flows with correct parameters.
  - Docs: [Workspaces overview](https://www.palantir.com/docs/foundry/carbon/workspaces-overview/), [Home configuration](https://www.palantir.com/docs/foundry/carbon/configuration-home).

- [ ] `SC.16` Carbon menu bar and workspace navigation (`P0`, `todo`)
  - Configure navigation menu, promoted workspace list, external links, anchored module tabs, add-module button, help links, notifications, profile/logout utilities, and menu ordering.
  - Support organization-level promoted workspace configuration plus workspace-level external link overrides.
  - Hide workspaces from navigation when the user lacks view permission or organization promotion.
  - Docs: [Configure navigation between workspaces](https://www.palantir.com/docs/foundry/carbon/workspaces-navigation/), [Menu bar configuration](https://www.palantir.com/docs/foundry/carbon/configuration-menu-bar/).

- [ ] `SC.17` Carbon modules (`P0`, `todo`)
  - Add built-in and dynamic modules for Object View, Object Explorer/Search, Workshop, Quiver dashboards, Slate applications, Vertex graphs, and read-only Notepad documents where supported.
  - Store module type, resource reference, title, icon, parameters, anchor status, discoverability, and access requirements.
  - Validate module resource access independently from Carbon workspace access.
  - Docs: [Modules overview](https://www.palantir.com/docs/foundry/carbon/modules-overview/), [Configure navigation between modules](https://www.palantir.com/docs/foundry/carbon/modules-navigation).

- [ ] `SC.18` Carbon permissions and access (`P0`, `todo`)
  - Implement Carbon administrator permissions, workspace editor permissions, and workspace viewer permissions.
  - Require view access to the workspace resource and promoted workspace status for Navigation Menu visibility, while allowing direct-link access to unpromoted workspaces when users have view access.
  - Make clear that workspace access does not grant access to embedded modules/resources.
  - Docs: [Configure permissions](https://www.palantir.com/docs/foundry/carbon/permissions-configure), [Access configuration](https://www.palantir.com/docs/foundry/carbon/configuration-access/).

- [ ] `SC.19` Carbon module navigation framework (`P0`, `todo`)
  - Define module input/output contracts and open modules in new tabs with object/object-set or parameter values from source modules.
  - Support built-in Object View/Object Explorer/Search outputs and dynamic Workshop/Slate/Quiver module parameters where local resource types support them.
  - Preserve source module state while opening receiving modules in new tabs for step-by-step workflows.
  - Docs: [Configure navigation between modules](https://www.palantir.com/docs/foundry/carbon/modules-navigation), [Modules overview](https://www.palantir.com/docs/foundry/carbon/modules-overview/).

- [ ] `SC.20` Application Portal and workspace discovery (`P0`, `todo`)
  - Expose Carbon workspaces through the Application Portal and Open other workspaces flow.
  - Show promoted workspaces under promoted apps/search only when visible to the user.
  - Preserve direct project/file links and resource search results for non-promoted workspaces.
  - Docs: [Carbon overview](https://www.palantir.com/docs/foundry/carbon/overview/), [Orientation and navigation](https://www.palantir.com/docs/foundry/getting-started/orientation-and-nav), [Workspaces overview](https://www.palantir.com/docs/foundry/carbon/workspaces-overview/).

## Milestone B: credible Foundry-style Slate and Carbon parity

### Advanced Slate applications

- [ ] `SC.21` Public Slate applications (`P1`, `todo`)
  - Create public Slate applications that can be used by non-Foundry users through a public link, subject to validation and safety controls.
  - Enforce public-app limitations, including no read access to data/resources outside the application itself unless OpenFoundry intentionally diverges.
  - Require additional organization workflow permission to create/edit public applications and account for network-restricted deployments that cannot expose public apps.
  - Docs: [Application types](https://www.palantir.com/docs/foundry/slate/applications-types), [Upload data for public applications](https://www.palantir.com/docs/foundry/slate/concepts-public-upload/).

- [ ] `SC.22` Public data and file uploads (`P1`, `todo`)
  - Accept public app data/file uploads into governed datasets, media sets, or action-backed staging resources.
  - Validate schema, file type, size, malware scanning, rate limits, bot protection, retention, provenance, and public submission audit records.
  - Feed validated uploads into pipelines without additional external data connection setup where local Data Foundation supports it.
  - Docs: [Application types](https://www.palantir.com/docs/foundry/slate/applications-types), [Upload data for public applications](https://www.palantir.com/docs/foundry/slate/concepts-public-upload/).

- [ ] `SC.23` Slate versions, merge, and collaboration (`P1`, `todo`)
  - Manage application versions, publish versions, view history, rollback, diff changes, merge application changes, and resolve merge conflicts.
  - Track editor, timestamp, base version, changed widgets/pages/variables/queries/functions/events/styles, and publish state.
  - Provide collaboration warnings for simultaneous edits and stale versions.
  - Docs: [Manage application versions](https://www.palantir.com/docs/foundry/slate/applications-versions/), [Merge application changes](https://www.palantir.com/docs/foundry/slate/applications-merge/).

- [ ] `SC.24` Import, export, duplicate, and package Slate apps (`P1`, `todo`)
  - Import/export Slate app bundles, duplicate apps across folders/projects, and preserve dependencies where user permissions allow.
  - Include Slate apps in Marketplace products with pages, routes, page structure, static/no-data apps, and local variables marked as Marketplace parameters.
  - Validate sensitive data, embedded resource references, and unsupported public-app/package combinations.
  - Docs: [Import, export, and duplicate applications](https://www.palantir.com/docs/foundry/slate/applications-import-export-duplicate/), [Add Slate application to a Marketplace product](https://www.palantir.com/docs/foundry/slate/marketplace-slate/).

- [ ] `SC.25` Code Sandbox advanced widget (`P1`, `todo`)
  - Provide secure Code Sandbox support for custom HTML, CSS, JavaScript, library references, state bridge, action bridge, and SlateFunctions APIs.
  - Enforce iframe sandboxing, CSP/CORS policy, no direct network requests except via configured queries, and no unsupported script tags in HTML.
  - Warn that custom sandbox code is advanced and requires owner maintenance.
  - Docs: [Advanced widgets](https://www.palantir.com/docs/foundry/slate/widgets-advanced/), [Slate FAQ](https://www.palantir.com/docs/foundry/slate/faq/).

- [ ] `SC.26` Slate dependency graph and diagnostics (`P1`, `todo`)
  - Build a dependency graph over pages, widgets, variables, queries, functions, events, Foundry Functions, object sets, and resources.
  - Show dependency paths, anti-pattern warnings, failed queries, slow loads, missing resources, stale handles, and save-size warnings.
  - Provide debug panels for query/function/event execution and widget rendering failures.
  - Docs: [View application dependencies](https://www.palantir.com/docs/foundry/slate/concepts-dependencies/), [Understand dependencies](https://www.palantir.com/docs/foundry/slate/best-practices-app-functionality), [Slate FAQ](https://www.palantir.com/docs/foundry/slate/faq/).

- [ ] `SC.27` Workshop and external embedding (`P1`, `todo`)
  - Embed Slate applications in Workshop iframe widgets by Compass/reference or URL and pass URL parameters into Slate variables.
  - Support safe iframe policies, parameter validation, height/width layout, same-origin/session behavior, and permission checks.
  - Document when Slate is better suited than Workshop and vice versa for operational apps.
  - Docs: [Embed Slate in Workshop iframe widgets](https://www.palantir.com/docs/foundry/workshop/widgets-iframe), [Slate overview](https://www.palantir.com/docs/foundry/slate/overview).

### Advanced Carbon workspace curation

- [ ] `SC.28` Module discovery and Open in menus (`P1`, `todo`)
  - Configure dynamic modules as discoverable so Open in actions appear in Object Explorer/Object View and other compatible menus.
  - Make discoverable modules available outside Carbon only when the workspace is promoted and users can access the workspace/module.
  - Keep built-in module discovery behavior fixed for Object View/Object Explorer/Search where documented.
  - Docs: [Configure module discovery](https://www.palantir.com/docs/foundry/carbon/modules-discovery/), [Configure navigation between modules](https://www.palantir.com/docs/foundry/carbon/modules-navigation).

- [ ] `SC.29` Workshop module integration (`P1`, `todo`)
  - Support Workshop module interface variables with external IDs and values passed via Carbon parameters or URL parameters.
  - Open Workshop modules from Workshop events, Slate links, Object Explorer actions, and Carbon menu shortcuts with object set inputs.
  - Validate unsupported variable types and link users to remediation options.
  - Docs: [Configure navigation between modules](https://www.palantir.com/docs/foundry/carbon/modules-navigation), [Modules overview](https://www.palantir.com/docs/foundry/carbon/modules-overview/).

- [ ] `SC.30` Slate module integration (`P1`, `todo`)
  - Open Slate applications as Carbon modules and pass parameters from Object View, Object Explorer, Search, Workshop, or other modules.
  - Intercept links to standalone Object View/Object Explorer/Workshop applications from Slate when running inside Carbon and open the corresponding Carbon module tab.
  - Preserve Slate app state while allowing Carbon tab navigation and module history.
  - Docs: [Configure navigation between modules](https://www.palantir.com/docs/foundry/carbon/modules-navigation), [Slate overview](https://www.palantir.com/docs/foundry/slate/overview).

- [ ] `SC.31` Quiver, Object View, Object Explorer, Search, Vertex, and Notepad modules (`P1`, `todo`)
  - Support module-specific input/output behavior for Object View, Object Explorer, Search, Quiver dashboards, Vertex graphs, and read-only Notepad documents.
  - Enforce read-only Notepad semantics and application/resource-specific permissions.
  - Validate object set, object, keyword, and comparison/list/exploration inputs according to module constraints.
  - Docs: [Modules overview](https://www.palantir.com/docs/foundry/carbon/modules-overview/), [Configure navigation between modules](https://www.palantir.com/docs/foundry/carbon/modules-navigation), [Object Views in platform applications](https://www.palantir.com/docs/foundry/object-views/use-full-views-in-platform).

- [ ] `SC.32` Navigation restrictions (`P1`, `todo`)
  - Disable navigation out of Carbon at workspace level and module level where configured.
  - Hide external Foundry links and block module/resource links that would leave the curated workspace while preserving Carbon navigation links.
  - Explain that navigation restriction curates UX and does not replace server-side permissions.
  - Docs: [Restrict navigation out of a workspace](https://www.palantir.com/docs/foundry/carbon/restrict-workspace-nav/), [Configure permissions](https://www.palantir.com/docs/foundry/carbon/permissions-configure).

- [ ] `SC.33` Default workspace and organization navigation (`P1`, `todo`)
  - Configure default workspaces for user groups and resolve conflicts when users match multiple groups.
  - Manage organization-level promoted workspaces and external links with immediate effect and audit history.
  - Support multi-organization administrators choosing the organization whose navigation they edit.
  - Docs: [Set a default workspace](https://www.palantir.com/docs/foundry/carbon/workspaces-default/), [Configure navigation between workspaces](https://www.palantir.com/docs/foundry/carbon/workspaces-navigation/), [Access configuration](https://www.palantir.com/docs/foundry/carbon/configuration-access/).

- [ ] `SC.34` Carbon code/YAML editing (`P1`, `todo`)
  - Provide optional YAML/code editing for Carbon workspace configuration with schema validation, autocomplete, diff preview, and safe save.
  - Round-trip UI edits and YAML edits without losing unsupported fields.
  - Gate code editing to workspace editors and audit changes.
  - Docs: [YAML configuration reference](https://www.palantir.com/docs/foundry/carbon/code-reference/), [General configuration](https://www.palantir.com/docs/foundry/carbon/configuration-general/).

## Milestone C: advanced, governance, scale, and operational parity

### Public app, custom-code, and security hardening

- [ ] `SC.35` Public app security and abuse prevention (`P2`, `todo`)
  - Add bot protection, rate limits, file scanning, anonymous session correlation, abuse monitoring, submission quotas, and takedown controls for public Slate apps.
  - Enforce no unauthorized read access for public apps and restrict write targets to explicitly configured public upload/action paths.
  - Support public app disable/enable and emergency revocation.
  - Docs: [Application types](https://www.palantir.com/docs/foundry/slate/applications-types), [Upload data for public applications](https://www.palantir.com/docs/foundry/slate/concepts-public-upload/).

- [ ] `SC.36` Code Sandbox security review (`P2`, `todo`)
  - Scan Code Sandbox JavaScript/CSS/HTML and library references for forbidden APIs, secrets, unapproved URLs, malicious patterns, and oversized payloads.
  - Enforce CSP/CORS and project-hosted library provenance with explicit egress governance for external URLs.
  - Require approvals for sandbox widgets in high-risk applications.
  - Docs: [Advanced widgets](https://www.palantir.com/docs/foundry/slate/widgets-advanced/), [Configure and apply styles](https://www.palantir.com/docs/foundry/slate/concepts-styles).

- [ ] `SC.37` Query and writeback governance (`P2`, `todo`)
  - Apply restricted views, object security, scoped sessions, marking checks, action policy, egress policy, export controls, and audit logging to every Slate query/writeback path.
  - Prevent client-side query manipulations from expanding access beyond server-side permission checks.
  - Provide per-query and per-action effective-permission explanations for builders.
  - Docs: [Read and write to data systems](https://www.palantir.com/docs/foundry/slate/concepts-queries/), [Write back data with Actions](https://www.palantir.com/docs/foundry/slate/concepts-actions/).

- [ ] `SC.38` Safe application exports and Marketplace packaging (`P2`, `todo`)
  - Scan Slate/Carbon packages for sensitive variables, hardcoded URLs, embedded resource IDs, uploaded fonts/assets, screenshots, and public upload endpoints.
  - Support Marketplace parameters for Slate local variables and Carbon module/resource mappings where product delivery supports them.
  - Preserve pages/routes/workspaces/modules while validating unsupported resources and target-environment conflicts.
  - Docs: [Add Slate application to a Marketplace product](https://www.palantir.com/docs/foundry/slate/marketplace-slate/), [Quiver dashboards in Marketplace](https://www.palantir.com/docs/foundry/quiver/dashboards-marketplace).

### Performance, observability, and reliability

- [ ] `SC.39` Slate performance guardrails (`P2`, `todo`)
  - Detect slow queries, excessive widget renders, dependency thrashing, large tabular variables, oversized documents, expensive Handlebars references, and reload-heavy Code Sandbox patterns.
  - Provide load-time profiling, query batching guidance, caching hints, and anti-pattern remediation.
  - Block or warn before publishing apps that exceed configurable performance thresholds.
  - Docs: [Slate FAQ](https://www.palantir.com/docs/foundry/slate/faq/), [Understand dependencies](https://www.palantir.com/docs/foundry/slate/best-practices-app-functionality), [Advanced widgets](https://www.palantir.com/docs/foundry/slate/widgets-advanced/).

- [ ] `SC.40` Carbon workspace performance guardrails (`P2`, `todo`)
  - Detect workspaces with too many anchored modules, slow home page links/search, expensive module preload behavior, and navigation loops.
  - Provide module lazy-loading, state preservation limits, stale-tab cleanup, and performance dashboards.
  - Warn administrators when organization-level promoted workspace lists become confusing or slow.
  - Docs: [Workspaces overview](https://www.palantir.com/docs/foundry/carbon/workspaces-overview/), [Menu bar configuration](https://www.palantir.com/docs/foundry/carbon/configuration-menu-bar/).

- [ ] `SC.41` Application usage metrics (`P2`, `todo`)
  - Track app loads, page views, widget render times, query/function/event runtimes, errors, public submissions, action writebacks, Carbon workspace opens, module navigation, and tab counts.
  - Attribute usage to user/anonymous session, app/workspace, project, module/resource, organization, and action/query/function.
  - Surface usage in Resource Management and app-builder dashboards.
  - Docs: [Resource Management usage types](https://www.palantir.com/docs/foundry/resource-management/usage-types), [Slate FAQ](https://www.palantir.com/docs/foundry/slate/faq/).

- [ ] `SC.42` App and workspace audit logs (`P2`, `todo`)
  - Audit create/edit/publish/version/merge/import/export/duplicate/open/public-submit/query/writeback/navigation/package/delete events.
  - Include actor, application/workspace, page/module, source/target resources, query/action/function identifiers, public session metadata, and outcome.
  - Redact user input and public submissions according to markings, policy, and public-app privacy requirements.
  - Docs: [Audit logs overview](https://www.palantir.com/docs/foundry/security/audit-logs-overview), [Application types](https://www.palantir.com/docs/foundry/slate/applications-types).

### Platform integration and lifecycle

- [ ] `SC.43` Carbon and Slate dependency impact analysis (`P2`, `todo`)
  - Show downstream impact when datasets, object types, actions, functions, Workshop apps, Quiver dashboards, Slate apps, or Carbon workspaces change.
  - Integrate with Workflow Lineage and application dependency graphs.
  - Notify owners of broken references, removed modules, changed object APIs, or incompatible function versions.
  - Docs: [View application dependencies](https://www.palantir.com/docs/foundry/slate/concepts-dependencies/), [Workflow Lineage getting started](https://www.palantir.com/docs/foundry/workflow-lineage/getting-started).

- [ ] `SC.44` Branching and environment promotion (`P2`, `todo`)
  - Define how Slate apps and Carbon workspaces behave in branch-aware projects, release environments, and Marketplace installations.
  - Prevent branch-only application/workspace changes from leaking into main runtime use before merge/publish.
  - Provide environment-specific resource/input remapping for installed apps and curated workspaces.
  - Docs: [Manage application versions](https://www.palantir.com/docs/foundry/slate/applications-versions/), [Foundry Branching overview](https://www.palantir.com/docs/foundry/foundry-branching/overview), [Add Slate application to a Marketplace product](https://www.palantir.com/docs/foundry/slate/marketplace-slate/).

- [ ] `SC.45` Mobile/responsive and accessibility support (`P2`, `todo`)
  - Validate responsive Slate layouts and Carbon workspace/module layouts for common device sizes, keyboard navigation, focus order, color contrast, and screen-reader labels.
  - Provide builder linting for inaccessible widgets, missing labels, small hit targets, and hidden navigation traps.
  - Preserve accessibility metadata through versions, imports, and Marketplace packaging.
  - Docs: [Slate overview](https://www.palantir.com/docs/foundry/slate/overview), [Carbon overview](https://www.palantir.com/docs/foundry/carbon/overview/).

- [ ] `SC.46` Multi-organization Carbon governance (`P2`, `todo`)
  - Support promoted/default workspaces, external links, visibility, and admin permissions independently for each organization.
  - Validate guest user access and ensure organization-level navigation settings do not expose inaccessible resources.
  - Provide audit and review workflows for Carbon administrators across organizations.
  - Docs: [Configure navigation between workspaces](https://www.palantir.com/docs/foundry/carbon/workspaces-navigation/), [Configure permissions](https://www.palantir.com/docs/foundry/carbon/permissions-configure).

- [ ] `SC.47` Operational workspace policy (`P2`, `todo`)
  - Support policies requiring certain users/groups to launch into Carbon, limiting Application Portal exposure, or showing curated workspaces first.
  - Integrate with application access controls and user/group discovery controls without replacing server-side authorization.
  - Provide emergency escape/admin routes for support and debugging.
  - Docs: [Carbon overview](https://www.palantir.com/docs/foundry/carbon/overview/), [Configure application access](https://www.palantir.com/docs/foundry/administration/configure-application-access/), [Configure user and group visibility](https://www.palantir.com/docs/foundry/administration/configure-user-and-group-visibility).

- [ ] `SC.48` App-builder lifecycle and ownership (`P2`, `todo`)
  - Track owners, maintainers, last editor, last published version, broken dependencies, stale queries/functions, public-app risk, and Carbon promotion state.
  - Provide ownership transfer, stale app archival, app certification, and operational readiness review workflows.
  - Surface support/debug contacts to end users in apps and workspaces.
  - Docs: [Slate FAQ](https://www.palantir.com/docs/foundry/slate/faq/), [Configure permissions](https://www.palantir.com/docs/foundry/carbon/permissions-configure).

## Implementation inventory checklist

- [ ] `INV.1` Identify existing OpenFoundry app-builder primitives for pages, routes, widgets, layout, variables, state, Handlebars/template references, JavaScript execution, and CSS customization.
- [ ] `INV.2` Inventory existing query execution, Object Set Builder, OSDK, Foundry Functions/AIP Logic calls, Ontology Actions, HTTP/egress, public upload, and media/file upload support.
- [ ] `INV.3` Inventory available Slate-equivalent widgets for text, forms, controls, charts, tables, maps, iframes, code sandbox, file import, object views, and custom widgets.
- [ ] `INV.4` Inventory current project/folder resource CRUD, version history, merge/diff, import/export, Marketplace packaging, branch, and release-environment support for application resources.
- [ ] `INV.5` Inventory Carbon-like workspace, Application Portal, promoted apps, module/tab shell, navigation sidebar, default workspace, and organization settings capabilities.
- [ ] `INV.6` Inventory Object View, Object Explorer, Search, Workshop, Quiver, Slate, Vertex, Map, and Notepad module resources and their input/output parameter models.
- [ ] `INV.7` Inventory permissions, organization admin workflows, public-app workflow permissions, resource-level editor/viewer roles, application access controls, and audit primitives.
- [ ] `INV.8` Inventory sandboxing, CSP/CORS, iframe policy, JavaScript library hosting, secret scanning, public endpoint protections, and egress governance.
- [ ] `INV.9` Inventory performance telemetry, dependency graph, error reporting, browser logs, query/function trace, usage metrics, and Resource Management attribution.
- [ ] `INV.10` Identify public-doc limitations OpenFoundry should mirror exactly versus intentionally diverge from, such as public-app no-read limits, Code Sandbox network limits, Carbon navigation variable limitations, and non-promoted workspace direct-link behavior.
- [ ] `INV.11` Produce a machine-readable parity matrix sibling JSON after inventory, following the pattern of [foundry-feature-parity-matrix.json](./foundry-feature-parity-matrix.json).

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
| `slate-app-service` | Slate app CRUD, app types, pages/routes, versions, merge/import/export/duplicate, publish state, permissions, Marketplace metadata. |
| `slate-runtime-service` | Runtime rendering manifest, widget state resolution, Handlebars evaluation, variables, events/actions, route navigation, dependency execution order. |
| `slate-query-service` | Object set, Foundry/API, SQL, HTTP JSON, query partials, conditional query execution, permissions, caching, timeouts, and diagnostics. |
| `slate-function-service` | App-local JavaScript function sandbox, function libraries, async support, no-DOM enforcement, traces, dependency discovery. |
| `slate-widget-service` | Widget registry, widget schemas, chart/table/map/control/basic/advanced widgets, layout validation, style hooks, custom widget manifests. |
| `slate-public-app-service` | Public app publishing, anonymous sessions, upload validation, public links, bot/rate protection, public submission audit, takedown controls. |
| `carbon-workspace-service` | Carbon workspace CRUD, General/Home/Menu/Access configuration, promotion/default state, YAML config, project location, permissions. |
| `carbon-navigation-service` | Module input/output contracts, discoverable modules, navigation actions, Open in menus, tab state, URL parameter encoding, navigation restrictions. |
| `carbon-module-service` | Built-in and dynamic module registry for Object View, Object Explorer, Search, Workshop, Quiver, Slate, Vertex, Map, and Notepad. |
| `application-portal-service` | Carbon workspace discovery, promoted apps, Open other workspaces, workspace search, direct links, app access integration. |
| `ontology-query-service` | Object set queries, object reads, link traversal, object security, restricted views, time-series/object module inputs and outputs. |
| `functions/actions service` | Foundry Functions bindings, AIP Logic/function calls, Ontology Action writeback, validation, action audit, typed inputs/outputs. |
| `security/governance service` | App/workspace permissions, public app admin permission, action/object security, audit logs, export controls, CSP/egress policy, payload redaction. |
| `marketplace/product service` | Slate app packaging, Marketplace parameters, app/workspace install mappings, environment remapping, package validation. |
| `resource-management service` | App load, query/function/widget, public submission, Carbon navigation, module load, and workspace usage attribution. |
| `apps/web` | Slate editor/runtime, Carbon editor/runtime, Application Portal entry points, dashboards, debug panels, permission and publish dialogs. |

## Acceptance criteria for first complete Slate and Carbon milestone

- [ ] A user can create an integrated Slate application in a project folder, add pages/routes, add widgets, define variables, bind Handlebars, create Slate functions, configure events/actions, run queries, and publish a version.
- [ ] Slate widgets can display data from Object Set Builder or Foundry Function outputs, react to user input through variables/events, and invoke an Ontology Action with permissions/audit enforced.
- [ ] Slate styling supports app CSS, widget classes/custom styles, uploaded custom fonts, dark/light compatibility, and safe validation without using Palantir branding or proprietary assets.
- [ ] A user can manage Slate versions, view diffs, rollback, duplicate/import/export an application, and package a Slate app with Marketplace parameters.
- [ ] A public Slate application can be created only by authorized users and can accept validated data/file uploads without reading protected Foundry resources.
- [ ] A user can create a Carbon workspace as a project resource, edit General/Home/Menu/Access settings, configure a home page, add menu modules, and open the workspace from Application Portal or a direct link.
- [ ] Carbon administrators can promote workspaces, configure organization navigation/default workspace settings, and hide or show external links according to organization settings.
- [ ] Carbon viewers can see promoted workspaces only when they have workspace view access, and module/resource access is enforced independently from workspace access.
- [ ] Carbon modules can open Object View, Object Explorer/Search, Workshop, Quiver dashboard, Slate app, Vertex/Map where supported, and read-only Notepad document modules.
- [ ] Carbon navigation can pass a single object, object set, or supported parameter from one module to another, opening the target module in a new tab while preserving the source module state.
- [ ] Carbon workspace navigation-out restrictions can hide/disable links that leave the curated workspace while preserving Carbon internal navigation.
- [ ] Application dependency graphs, runtime errors, query failures, public submissions, action writebacks, and Carbon navigation events are traceable for debugging and audit.
- [ ] Usage metrics cover Slate loads/widgets/queries/functions/events/public uploads and Carbon workspace/module/navigation activity.
- [ ] All OpenFoundry runtime UI is OpenFoundry-native and does not use Palantir branding, screenshots, icons, fonts, or proprietary assets.

## Test plan expectations

- Unit tests for Slate app/page/route/widget CRUD, variable scope/type validation, Handlebars resolution, helper validation, Slate function sandboxing, event/action cycles, query dependency ordering, style sanitization, version diffing, and Marketplace parameter marking.
- Unit tests for public app permission checks, upload schema/file validation, rate limits, Code Sandbox CSP/CORS restrictions, no-DOM/no-state function restrictions, Foundry Function type mapping, and Ontology Action parameter validation.
- Unit tests for Carbon workspace CRUD, General/Home/Menu/Access config validation, promoted/default workspace resolution, organization navigation overrides, module input/output constraints, discoverable module matching, navigation restriction enforcement, and YAML schema round-tripping.
- API tests for Slate applications, pages, widgets, variables, queries, functions, events, versions, publish/import/export, public uploads, Carbon workspaces, modules, navigation actions, promoted workspaces, defaults, and audit/usage endpoints.
- Integration tests for Slate Object Set Builder queries, Foundry Functions calls, Ontology Action writeback, Workshop iframe embedding, public upload to dataset/media/action staging, Marketplace packaging, Carbon module navigation from Object Explorer to Workshop/Quiver/Slate/Object View, and Application Portal discovery.
- E2E tests for building and publishing a Slate app, adding custom styles/widgets, running query/function/event flows, creating a public submission app, creating a Carbon workspace, configuring home/menu/access, promoting workspace, navigating across modules, restricting navigation out, and using a Slate app inside Carbon.
- Observability tests for Slate app load time, widget render errors, query/function/event traces, public submission audit, Code Sandbox errors, Carbon workspace opens, module-tab counts, navigation actions, permission denials, and Resource Management usage attribution.
- Regression tests proving unauthorized users cannot edit/view protected Slate apps or Carbon workspaces, public apps cannot read protected resources, Slate writeback obeys action/object permissions, Code Sandbox cannot make forbidden network requests, Carbon workspace access does not grant module resource access, unpromoted workspaces are hidden from navigation, navigation restrictions do not replace server-side permissions, and branch-only app/workspace versions cannot leak into main runtime use.
