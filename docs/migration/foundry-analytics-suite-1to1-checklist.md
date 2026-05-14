# Foundry Analytics Suite 1:1 parity checklist

Date: 2026-05-11
Scope: public-docs-based parity plan for OpenFoundry's Analytics Suite: Analytics
landing pages, analysis resource CRUD, Contour tabular analysis, Contour paths,
boards, expressions, parameters, dashboards, dataset outputs, compute usage,
Quiver object/time-series analysis, Quiver cards, canvases, graph dataflow,
materializations, object-set path analyses, time-series analyses, visual
functions, Quiver dashboards, Quiver writeback cards, Insight ontology analysis,
analysis paths, link traversal, maps, SQL scratchpads, object set outputs,
Insight writeback, Code Workbook legacy code-based analysis, workbook graphs,
Python/R/SQL transforms, interactive consoles, templates, branch-aware workbook
execution, Notepad analytical reporting, embedded widgets, linked documents,
AIP-assisted editing, version history, PDF/print export, Fusion spreadsheet
analysis, spreadsheet formulas, table regions, spreadsheet writeback, XLS import,
presentation view, SQL/BI connectivity, ODBC/JDBC drivers, Tableau/Power BI /
Excel / Qlik / MicroStrategy / Microsoft Report Builder integrations, sharing,
permissions, lineage, usage metering, audit, export checkpoints, and
production-readiness guardrails for analytical artifacts.

This document is intentionally implementation-oriented. It does not attempt to
clone Palantir branding, private source code, proprietary assets, screenshots,
or any non-public behavior. The target is **functional parity based on public
Palantir Foundry documentation**: the same product concepts, comparable
analysis/dashboard/reporting/connectivity workflows, compatible resource models
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

This checklist covers the Analytics Suite as the user-facing analysis,
dashboard, report, spreadsheet, and analytical-connectivity layer. It should
integrate with Data Foundation for datasets, builds, saved outputs, schedules,
lineage, storage, and compute usage; with Ontology/Object Views for object
sets, object links, object security, maps, actions, and writeback; with Media
Sets for object media embeds and report artifacts; with Functions/AIP Logic for
function widgets and AIP-assisted document editing; with Global Branching for
branch-aware workbook and embedded-resource semantics; with Workshop/Slate/
Carbon for dashboard embedding; with Product Delivery for Marketplace packaging;
and with Security/Governance for permissions, markings, export checkpoints,
audit, and retention. It should not duplicate those underlying surfaces.

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
| `P0` | Required for credible demo workflows that analyze datasets and Ontology objects, build dashboards, create report documents, and share results securely. |
| `P1` | Required for Foundry-style Analytics Suite parity beyond basic charts and notebooks. |
| `P2` | Advanced, governance-heavy, high-scale, writeback, BI-connectivity, Marketplace, branching, or operational-observability parity. |

## Official Palantir documentation library

These public docs should be treated as the external behavioral contract while
implementing this checklist.

### Analytics overview and tool selection

- [Analytics overview](https://www.palantir.com/docs/foundry/analytics/overview/)
- [Analytical dashboards](https://www.palantir.com/docs/foundry/analytics/dashboards/)
- [Platform overview: Analytics](https://www.palantir.com/docs/foundry/platform-overview/overview/)
- [Foundry platform summary for LLMs](https://www.palantir.com/docs/foundry/getting-started/foundry-platform-summary-llm)
- [Resource Management usage types](https://www.palantir.com/docs/foundry/resource-management/usage-types)

### Contour

- [Contour overview](https://www.palantir.com/docs/foundry/contour/overview/)
- [Contour getting started](https://www.palantir.com/docs/foundry/contour/getting-started/)
- [Contour core concepts](https://www.palantir.com/docs/foundry/contour/core-concepts)
- [Contour boards overview](https://www.palantir.com/docs/foundry/contour/boards-overview/)
- [Contour expression syntax and supported functions](https://www.palantir.com/docs/foundry/contour/expressions-syntax)
- [Parameterize your Contour analysis](https://www.palantir.com/docs/foundry/contour/analysis-parameterize/)
- [Contour dashboards overview](https://www.palantir.com/docs/foundry/contour/dashboards-overview)
- [Contour dashboards getting started](https://www.palantir.com/docs/foundry/contour/dashboards-getting-started/)
- [Contour compute usage](https://www.palantir.com/docs/foundry/contour/compute-usage/)
- [Contour product Q&A](https://www.palantir.com/docs/foundry/questions-answers/contour)

### Quiver

- [Quiver getting started](https://www.palantir.com/docs/foundry/quiver/getting-started/)
- [Quiver core concepts](https://www.palantir.com/docs/foundry/quiver/core-concepts/)
- [Quiver analysis types](https://www.palantir.com/docs/foundry/quiver/analysis-types/)
- [Quiver card index](https://www.palantir.com/docs/foundry/quiver/cards-index)
- [Quiver formula syntax](https://www.palantir.com/docs/foundry/quiver/cards-formula-syntax/)
- [Quiver writeback cards](https://www.palantir.com/docs/foundry/quiver/cards-index-writeback/)
- [Quiver materialization cards](https://www.palantir.com/docs/foundry/quiver/cards-index-materializations)
- [Quiver linked object search](https://www.palantir.com/docs/foundry/quiver/objects-import-linked/)
- [Quiver best practices](https://www.palantir.com/docs/foundry/quiver/quiver-best-practices)
- [Package Quiver dashboards in Marketplace](https://www.palantir.com/docs/foundry/quiver/dashboards-marketplace)

### Insight and Object Explorer analysis

- [Insight overview](https://www.palantir.com/docs/foundry/insight/overview/)
- [Insight getting started](https://www.palantir.com/docs/foundry/insight/getting-started/)
- [Insight analysis panel](https://www.palantir.com/docs/foundry/insight/analysis-panel/)
- [Insight tables and data operations](https://www.palantir.com/docs/foundry/insight/table-insight/)
- [Insight transform card](https://www.palantir.com/docs/foundry/insight/transform-card/)
- [Insight FAQ](https://www.palantir.com/docs/foundry/insight/faq/)
- [Object Explorer overview](https://www.palantir.com/docs/foundry/object-explorer/overview/)
- [Analyze objects using SQL](https://www.palantir.com/docs/foundry/object-explorer/analyze-sql)

### Code Workbook

- [Code Workbook overview](https://www.palantir.com/docs/foundry/code-workbook/overview/)
- [Code Workbook workbooks overview](https://www.palantir.com/docs/foundry/code-workbook/workbooks-overview/)
- [Code Workbook inputs and outputs](https://www.palantir.com/docs/foundry/code-workbook/workbooks-input-output-types/)
- [Code Workbook transforms overview](https://www.palantir.com/docs/foundry/code-workbook/transforms-overview)
- [Code Workbook branching overview](https://www.palantir.com/docs/foundry/code-workbook/branching-overview/)
- [Code Workbook branching getting started](https://www.palantir.com/docs/foundry/code-workbook/branching-getting-started/)
- [Choose imported dataset branch](https://www.palantir.com/docs/foundry/code-workbook/branching-imported-datasets)

### Notepad and reports

- [Notepad overview](https://www.palantir.com/docs/foundry/notepad/overview/)
- [Notepad embed widgets](https://www.palantir.com/docs/foundry/notepad/embed-widgets)
- [Notepad AIP features](https://www.palantir.com/docs/foundry/notepad/aip-features/)
- [Notepad version history](https://www.palantir.com/docs/foundry/notepad/version-history)
- [Quiver dashboard widget in Notepad](https://www.palantir.com/docs/foundry/notepad/widgets-quiver-dashboard/)
- [AIP features](https://www.palantir.com/docs/foundry/aip/aip-features/)

### Fusion spreadsheets

- [Fusion overview](https://www.palantir.com/docs/foundry/fusion/overview)
- [Fusion import XLS documents](https://www.palantir.com/docs/foundry/fusion/import-xls/)
- [Fusion perform Actions](https://www.palantir.com/docs/foundry/fusion/perform-actions)
- [Fusion presentation view](https://www.palantir.com/docs/foundry/fusion/presentation-view)

### Analytical connectivity and BI tools

- [Connectivity: SQL & BI overview](https://www.palantir.com/docs/foundry/analytics-connectivity/overview/)
- [Connectivity architecture](https://www.palantir.com/docs/foundry/analytics-connectivity/architecture)
- [ODBC & JDBC drivers for Foundry datasets](https://www.palantir.com/docs/foundry/analytics-connectivity/odbc-jdbc-drivers/)
- [Connectivity downloads](https://www.palantir.com/docs/foundry/analytics-connectivity/downloads)
- [Tableau getting started](https://www.palantir.com/docs/foundry/analytics-connectivity/tableau-getting-started)
- [Microsoft Report Builder overview](https://www.palantir.com/docs/foundry/analytics-connectivity/msft-report-builder-overview/)
- [MicroStrategy connector](https://www.palantir.com/docs/foundry/analytics-connectivity/microstrategy)
- [Excel via ODBC](https://www.palantir.com/docs/foundry/analytics-connectivity/excel/)

## Target OpenFoundry resource model

The implementation should define stable OpenFoundry-owned resources that can map
to public Foundry concepts without requiring Palantir RID formats. Compatibility
aliases may be accepted at service boundaries, but persisted state should use
OpenFoundry canonical IDs.

| Public Foundry concept | OpenFoundry resource target | Required notes |
| --- | --- | --- |
| Analytics application catalog | `analytics_app_catalog` | Entry points, tool descriptions, creation flows, permission-gated availability, and links to relevant learning/docs. |
| Analysis resource | `analysis_resource` | Shared base for Contour, Quiver, Insight, Code Workbook, Fusion, and Notepad resources with project/folder placement and permissions. |
| Contour analysis | `contour_analysis` | Tabular analysis with paths, boards, parameters, dashboard, saved dataset outputs, refresh settings, and compute usage. |
| Contour path | `contour_path` | Ordered top-down board chain with input datasets, joins, transforms, output schema, and optional saved dataset target. |
| Contour board | `contour_board` | Visualize/filter/aggregate/column/join/deduplicate/transform operation with config, input refs, output schema, preview state, and dashboard eligibility. |
| Contour expression | `contour_expression` | Expression-language AST/text, inferred type, referenced columns/parameters, validation diagnostics, and execution plan. |
| Contour dashboard | `contour_dashboard` | Interactive dashboard associated with one analysis, tabs/boards/text, parameters, chart-to-chart filters, fullscreen state, share links, and exports. |
| Quiver analysis | `quiver_analysis` | Object/time-series/multimodal canvas analysis with cards, graph edges, dashboards, parameters, materializations, and history. |
| Quiver card | `quiver_card` | Typed node that consumes and produces values such as object sets, time series, charts, tables, event sets, numbers, strings, dates, arrays, or actions. |
| Quiver canvas | `quiver_canvas` | Organizing surface for cards with tab membership, visibility/load settings, layout, and performance metadata. |
| Quiver dashboard | `quiver_dashboard` | Read-only interactive dashboard over selected Quiver cards, embeddable in Foundry applications and optionally packageable. |
| Time series analysis | `time_series_analysis` | Simplified Quiver-adjacent time-series analysis with plots, formulas, transforms, anomaly search, range selection, and conversion to Quiver. |
| Object set path analysis | `object_set_path_analysis` | Simplified object-focused analysis with filter/link/aggregate/visualize path and conversion to Quiver. |
| Quiver visual function | `quiver_visual_function` | Reusable visual interaction/function component with typed parameters and card outputs. |
| Quiver writeback action | `quiver_writeback_action` | Configured action button with Ontology action binding, default inputs, time-series selection overrides, display config, and audit metadata. |
| Insight workbook | `insight_workbook` | Ontology analysis workbook with starting object types/sets/interfaces, analysis paths, tables, charts, maps, SQL sandbox, and sharing. |
| Insight path | `insight_path` | Step-by-step object analysis path with filter/link/transform cards, object counts, toggles, output object set, and path menu metadata. |
| Insight step card | `insight_step_card` | Filter, link, transform, SQL, group-by, set operation, map, or writeback step with active state and result preview. |
| Object set result | `analytics_object_set_result` | Saved or transient object set produced by Quiver, Insight, Object Explorer, or SQL analysis with permission-aware refresh semantics. |
| Code Workbook | `code_workbook` | Legacy code-based analysis graph with branches, transforms, datasets, environment, console sessions, templates, and productionization links. |
| Workbook transform node | `workbook_transform_node` | Python/R/SQL/Spark transform or visualization node with input/output type conversions, derived dataset target, and logs. |
| Workbook branch | `workbook_branch` | Workbook-local branch with parent, protected/runnable settings, imported dataset branch pins/fallbacks, merge previews, conflicts, and output dataset branches. |
| Notepad document | `notepad_document` | Object-aware collaborative rich-text report with widgets, templates, linked resources/objects, version history, AIP edits, and export settings. |
| Notepad widget | `notepad_widget` | Embedded chart/table/function/map/object/media/resource/value widget with source resource, lock/freeze state, display config, and permissions. |
| Notepad version | `notepad_version` | Autosaved or manual snapshot with name, endorsement, diff metadata, rollback support, and export provenance. |
| Fusion spreadsheet | `fusion_spreadsheet` | Spreadsheet document with sheets, cells, formulas, table regions, linked cells/dropdowns, presentation settings, and writeback targets. |
| Fusion table region | `fusion_table_region` | Structured table area that can receive submissions, query datasets/objects, and write results downstream. |
| Fusion action formula | `fusion_action_formula` | Button/action formula for copy, submit, toast, serial, parallel, and validation-backed spreadsheet actions. |
| BI connection | `analytics_bi_connection` | ODBC/JDBC/connector configuration for external BI tools with auth mode, host, project/catalog, SQL dialect, driver version, and audit. |
| BI query session | `analytics_bi_query_session` | Read-only SQL session from Tableau/Power BI/Excel/Qlik/MicroStrategy/Report Builder or generic ODBC/JDBC clients. |
| Analytics export | `analytics_export` | PDF, PowerPoint, CSV, dataset, dashboard, report, or BI export event with checkpoint/justification, state snapshot, and audit metadata. |
| Analytics usage metric | `analytics_usage_metric` | Interactive/batch compute, storage, ontology volume, writeback, export, query volume, and embedded widget usage attribution. |

## Milestone A: minimum viable Analytics Suite parity

### Analytics shell and shared resource primitives

- [ ] `AS.1` Analytics landing and tool selection (`P0`, `todo`)
  - Provide an Analytics entry point that explains Contour, Quiver, Insight, Code Workbook, Notepad, Fusion, and BI connectivity in OpenFoundry-native language.
  - Route users to dataset-oriented, ontology-object-oriented, time-series, report, code, spreadsheet, or external-BI workflows based on data type and intent.
  - Respect application access, feature flags, and project/folder permissions when showing create/open actions.
  - Docs: [Analytics overview](https://www.palantir.com/docs/foundry/analytics/overview/), [Platform overview: Analytics](https://www.palantir.com/docs/foundry/platform-overview/overview/).

- [ ] `AS.2` Shared analysis resource CRUD (`P0`, `todo`)
  - Create, get, list, update metadata, move, duplicate, archive/delete, and restore analysis resources across Analytics Suite applications.
  - Track name, description, project/folder, owner, created/updated timestamps, type, current version/history pointer, permissions, and referenced resources.
  - Provide consistent share/copy-link/open-in flows while preserving app-specific behavior.
  - Docs: [Contour getting started](https://www.palantir.com/docs/foundry/contour/getting-started/), [Quiver getting started](https://www.palantir.com/docs/foundry/quiver/getting-started/), [Insight getting started](https://www.palantir.com/docs/foundry/insight/getting-started/).

- [ ] `AS.3` Analytics permissions and project/folder placement (`P0`, `todo`)
  - Enforce viewer/editor/owner style permissions on analysis resources, outputs, dashboards, documents, and spreadsheets.
  - Propagate or validate access to source datasets, object types, object sets, actions, functions, media, and embedded resources.
  - Show actionable missing-access states instead of leaking protected schema or data.
  - Docs: [Analytics overview](https://www.palantir.com/docs/foundry/analytics/overview/), [Insight tables and data operations](https://www.palantir.com/docs/foundry/insight/table-insight/).

### Minimum viable Contour

- [ ] `AS.4` Contour analysis and path model (`P0`, `todo`)
  - Create Contour analyses backed by one or more analytical paths that start from Foundry datasets.
  - Allow users to add datasets, join additional datasets, refresh paths, preview results, and inspect path lineage.
  - Persist path graph/order and ensure downstream boards recompute from upstream board outputs.
  - Docs: [Contour overview](https://www.palantir.com/docs/foundry/contour/overview/), [Contour core concepts](https://www.palantir.com/docs/foundry/contour/core-concepts).

- [ ] `AS.5` Contour boards (`P0`, `todo`)
  - Support board categories for visualize, filter rows, aggregate, manipulate columns, remove duplicates, combine/join datasets, and transform data.
  - Validate board input schemas, output schemas, column references, regex/date/number/null filters, join keys, and aggregation metrics.
  - Show board previews and diagnostics for invalid or expensive operations.
  - Docs: [Contour boards overview](https://www.palantir.com/docs/foundry/contour/boards-overview/), [Contour getting started](https://www.palantir.com/docs/foundry/contour/getting-started/).

- [ ] `AS.6` Contour expression language (`P0`, `todo`)
  - Implement expression parsing, type inference, validation, and execution for string, integer, double, Boolean, date, column references, constants, operators, and documented functions.
  - Provide an expression editor with syntax diagnostics, supported-function help, and safe failure modes.
  - Record expression lineage and downstream impact when saved as dataset output.
  - Docs: [Contour expression syntax and supported functions](https://www.palantir.com/docs/foundry/contour/expressions-syntax).

- [ ] `AS.7` Contour parameters (`P0`, `todo`)
  - Support Date, String, and Number parameters with defaults, suggested values where possible, editing, overriding, and references in transformations.
  - Expose only parameters used by dashboard boards in dashboard mode.
  - Retain parameter overrides when navigating from dashboard back to analysis.
  - Docs: [Parameterize your Contour analysis](https://www.palantir.com/docs/foundry/contour/analysis-parameterize/), [Contour core concepts](https://www.palantir.com/docs/foundry/contour/core-concepts).

- [ ] `AS.8` Contour dashboards (`P0`, `todo`)
  - Associate each Contour analysis with one dashboard that can include eligible visualization boards and text.
  - Support tabs, board titles, parameter labels, drag/reorder, resize, inline parameter references, chart-to-chart filtering, share links, fullscreen mode, and PDF export.
  - Provide refresh-on-open behavior and ensure dashboard operations do not mutate underlying analysis paths except in edit mode.
  - Docs: [Contour dashboards overview](https://www.palantir.com/docs/foundry/contour/dashboards-overview), [Contour dashboards getting started](https://www.palantir.com/docs/foundry/contour/dashboards-getting-started/), [Analytical dashboards](https://www.palantir.com/docs/foundry/analytics/dashboards/).

- [ ] `AS.9` Save Contour path results as datasets (`P0`, `todo`)
  - Save path results as derived datasets in a project folder with schema, build configuration, upstream lineage, and output dataset permissions.
  - Execute saved transformations through the OpenFoundry build system so changes in source datasets or path logic can recompute outputs.
  - Distinguish preview/analysis compute from persisted dataset build compute.
  - Docs: [Contour overview](https://www.palantir.com/docs/foundry/contour/overview/), [Contour core concepts](https://www.palantir.com/docs/foundry/contour/core-concepts), [Contour compute usage](https://www.palantir.com/docs/foundry/contour/compute-usage/).

### Minimum viable Quiver

- [ ] `AS.10` Quiver analysis resource and canvas (`P0`, `todo`)
  - Create Quiver analyses in folders, add object data and time-series data, and organize cards on one or more canvas tabs.
  - Support card layout, canvas tabs, visible/hidden cards, analysis contents panel, and global load settings.
  - Ensure inactive/hidden/only-visible items avoid unnecessary querying where local execution supports it.
  - Docs: [Quiver getting started](https://www.palantir.com/docs/foundry/quiver/getting-started/), [Quiver core concepts](https://www.palantir.com/docs/foundry/quiver/core-concepts/), [Quiver best practices](https://www.palantir.com/docs/foundry/quiver/quiver-best-practices).

- [ ] `AS.11` Quiver card graph and typed data model (`P0`, `todo`)
  - Implement cards as typed graph nodes with inputs/outputs including object set, time series, event set, table, chart, number, string, date/time, Boolean, array, and action/button values.
  - Validate card compatibility, graph edges, output references, parameter references, and recompute order.
  - Provide card editor panels and next-actions menus based on output type.
  - Docs: [Quiver core concepts](https://www.palantir.com/docs/foundry/quiver/core-concepts/), [Quiver card index](https://www.palantir.com/docs/foundry/quiver/cards-index).

- [ ] `AS.12` Quiver object analysis (`P0`, `todo`)
  - Add object types/object sets, filter object sets, traverse linked objects, perform set math, aggregate object properties, and visualize with charts/tables/property cards.
  - Support object security, link traversal permissions, object count previews, and opening selected objects in Object Views.
  - Export object sets according to user permissions and export policy.
  - Docs: [Quiver getting started](https://www.palantir.com/docs/foundry/quiver/getting-started/), [Quiver linked object search](https://www.palantir.com/docs/foundry/quiver/objects-import-linked/), [Object Explorer overview](https://www.palantir.com/docs/foundry/object-explorer/overview/).

- [ ] `AS.13` Quiver time-series analysis (`P0`, `todo`)
  - Add time-series properties from Ontology objects, plot series, derive series with transformations, configure display styling, zoom/selection ranges, and move plots between charts.
  - Support formulas, union, filter, interpolation, rolling aggregate, time/value ranges, relative-time comparison, anomaly search, events, and grouped plots as local primitives mature.
  - Validate time-series permissions, units, timestamp domains, and downsampling/aggregation behavior.
  - Docs: [Quiver getting started](https://www.palantir.com/docs/foundry/quiver/getting-started/), [Quiver formula syntax](https://www.palantir.com/docs/foundry/quiver/cards-formula-syntax/).

- [ ] `AS.14` Quiver dashboards (`P0`, `todo`)
  - Build read-only interactive dashboards from Quiver analysis content with tabs, selected cards, parameter controls, charts, tables, and time-series views.
  - Embed dashboards in Workshop, Object Views, Notepad, and Carbon-compatible surfaces where local apps support embeddings.
  - Preserve dashboard state, data freshness, permissions, and performance settings.
  - Docs: [Quiver analysis types](https://www.palantir.com/docs/foundry/quiver/analysis-types/), [Analytical dashboards](https://www.palantir.com/docs/foundry/analytics/dashboards/), [Notepad embed widgets](https://www.palantir.com/docs/foundry/notepad/embed-widgets).

### Minimum viable Insight

- [ ] `AS.15` Insight workbook creation and ontology data selection (`P0`, `todo`)
  - Create Insight workbooks from Insight, Object Explorer, and Open-in-Insight actions from compatible resources.
  - Search and select object types, object sets, and interfaces with filters for status, spaces, object type groups, interfaces, and shared properties.
  - Preview object type properties, groups, linked object types, and individual objects before adding them to an analysis.
  - Docs: [Insight overview](https://www.palantir.com/docs/foundry/insight/overview/), [Insight getting started](https://www.palantir.com/docs/foundry/insight/getting-started/).

- [ ] `AS.16` Insight analysis paths and step cards (`P0`, `todo`)
  - Build step-by-step paths with filter, link, and transform tools from the analysis panel.
  - Show step cards with object counts, names, active toggles, collapse/expand controls, delete controls, and inspectable results.
  - Allow adding new cards between existing steps while preserving documented non-reorder behavior.
  - Docs: [Insight analysis panel](https://www.palantir.com/docs/foundry/insight/analysis-panel/), [Insight FAQ](https://www.palantir.com/docs/foundry/insight/faq/).

- [ ] `AS.17` Insight results exploration (`P0`, `todo`)
  - Provide tables, charts, maps, property distributions, histograms, group-by aggregations, set operations, and result inspection for each path step.
  - Support geographic properties such as polygon/shape types where local map primitives exist.
  - Save or share resulting object sets with permission-aware latest-result semantics.
  - Docs: [Insight overview](https://www.palantir.com/docs/foundry/insight/overview/), [Insight tables and data operations](https://www.palantir.com/docs/foundry/insight/table-insight/), [Insight transform card](https://www.palantir.com/docs/foundry/insight/transform-card/).

- [ ] `AS.18` Ontology SQL scratchpad (`P0`, `todo`)
  - Provide read-only SQL analysis over eligible object types and materializations with autocomplete for object RIDs/API names.
  - Enforce requirements for single datasource versus materialized editable/multi-datasource object types.
  - Return bounded preview samples, show data freshness warnings for materializations, and attribute usage to the correct compute/dataset source.
  - Docs: [Analyze objects using SQL](https://www.palantir.com/docs/foundry/object-explorer/analyze-sql).

### Minimum viable Notepad, Fusion, and connectivity

- [ ] `AS.19` Notepad documents and widgets (`P0`, `todo`)
  - Create object-aware collaborative rich-text documents with text, images, tables, links, and widgets from Contour, Quiver, Code Workbook, Object cards, media previews, maps, functions, and resources.
  - Maintain structured links from documents to embedded objects, object sets, and Foundry resources.
  - Support widget configuration, permissions checks, and copy-for-Notepad insertion flows.
  - Docs: [Notepad overview](https://www.palantir.com/docs/foundry/notepad/overview/), [Notepad embed widgets](https://www.palantir.com/docs/foundry/notepad/embed-widgets).

- [ ] `AS.20` Notepad versioning and export (`P0`, `todo`)
  - Autosave document versions, create manual versions, endorse versions, view past versions read-only, rollback, and compare versions.
  - Export and print documents with page breaks, embed presentation settings, and object/resource link provenance.
  - Exclude or specially handle formatting-only differences according to local diff support.
  - Docs: [Notepad version history](https://www.palantir.com/docs/foundry/notepad/version-history), [Notepad overview](https://www.palantir.com/docs/foundry/notepad/overview/).

- [ ] `AS.21` Fusion spreadsheet basics (`P0`, `todo`)
  - Create spreadsheet documents with sheets, cells, formulas, cell references, spreadsheet functions, dropdowns, linked cells, locked cells, formatting, and table regions.
  - Query Foundry datasets through search/lookups and submit results to downstream datasets or table regions.
  - Import `.xls` and `.xlsx` files into Fusion documents with validation for size, formulas, unsupported features, and memory limits.
  - Docs: [Fusion overview](https://www.palantir.com/docs/foundry/fusion/overview), [Fusion import XLS documents](https://www.palantir.com/docs/foundry/fusion/import-xls/).

- [ ] `AS.22` BI connectivity basics (`P0`, `todo`)
  - Expose read-only SQL access to Foundry datasets through JDBC and, where supported, ODBC drivers or compatible server endpoints.
  - Support token and OAuth-style authentication modes where local identity primitives exist.
  - Validate Foundry URL/host, project/catalog, dataset RID/path, SQL dialect, timestamp settings, and driver/server compatibility.
  - Docs: [Connectivity: SQL & BI overview](https://www.palantir.com/docs/foundry/analytics-connectivity/overview/), [ODBC & JDBC drivers for Foundry datasets](https://www.palantir.com/docs/foundry/analytics-connectivity/odbc-jdbc-drivers/).

## Milestone B: credible Foundry-style Analytics Suite parity

### Advanced Contour and dashboarding

- [ ] `AS.23` Advanced Contour transformations (`P1`, `todo`)
  - Expand boards to cover pivot-like operations, lookup/add columns, set math, obfuscation, find/replace, complex joins, and multi-path reuse.
  - Validate large-dataset thresholds, join explosion risk, null/error handling, and output schema drift.
  - Provide board-level explainability and downstream impact previews.
  - Docs: [Contour boards overview](https://www.palantir.com/docs/foundry/contour/boards-overview/), [Contour expression syntax and supported functions](https://www.palantir.com/docs/foundry/contour/expressions-syntax).

- [ ] `AS.24` Contour dashboard export checkpoints (`P1`, `todo`)
  - Export dashboards to PDF in portrait/landscape with current parameter overrides and chart-to-chart filter state.
  - Allow administrators to require justification/checkpoint approval before dashboard export.
  - Audit export user, resource, state snapshot, parameters, filters, timestamp, and justification.
  - Docs: [Contour dashboards getting started](https://www.palantir.com/docs/foundry/contour/dashboards-getting-started/), [Resource Management usage types](https://www.palantir.com/docs/foundry/resource-management/usage-types).

- [ ] `AS.25` Contour operational limitations and history policy (`P1`, `todo`)
  - Document and enforce local decisions for version control/history support, including whether Contour follows documented no-version-control behavior or adds OpenFoundry-native history.
  - Provide migration guidance to Code Workbook/Code Workspaces/Code Repositories for use cases requiring stronger versioning.
  - Surface dashboard/fullscreen link behavior and parameter pane limitations where relevant.
  - Docs: [Contour product Q&A](https://www.palantir.com/docs/foundry/questions-answers/contour).

### Advanced Quiver and operational analytics

- [ ] `AS.26` Simplified Quiver analysis types (`P1`, `todo`)
  - Support Quiver analysis, time series analysis, and object set path analysis as separate creation choices.
  - Allow time series and object set path analyses to convert to full Quiver analyses while preserving source-resource independence after conversion.
  - Block conversion from full Quiver back to simplified analysis types when mirroring documented behavior.
  - Docs: [Quiver analysis types](https://www.palantir.com/docs/foundry/quiver/analysis-types/).

- [ ] `AS.27` Quiver materializations and transform tables (`P1`, `todo`)
  - Materialize large object sets into tabular form for downstream cards and table transformations.
  - Support transform table operations such as group, join, filter, edit columns, null/error handling, number/string/time/Boolean/array/range operations, and function calls as local primitives mature.
  - Track materialization lineage, compute usage, branch/source object freshness, and permission filtering.
  - Docs: [Quiver materialization cards](https://www.palantir.com/docs/foundry/quiver/cards-index-materializations), [Quiver card index](https://www.palantir.com/docs/foundry/quiver/cards-index).

- [ ] `AS.28` Quiver writeback cards (`P1`, `todo`)
  - Add Action button cards to analysis canvases, time-series charts, and dashboards.
  - Configure existing Ontology Actions, default inputs, display label/icon/color/style, and form submission behavior.
  - Map time-series x/y selection boundaries into action parameters and enforce action permissions/audit.
  - Docs: [Quiver writeback cards](https://www.palantir.com/docs/foundry/quiver/cards-index-writeback/), [Quiver getting started](https://www.palantir.com/docs/foundry/quiver/getting-started/).

- [ ] `AS.29` Quiver Marketplace packaging (`P1`, `todo`)
  - Validate Quiver dashboards for Marketplace/product packaging with supported object analytics cards, object visualizations, Vega plots, time series, tables, and basic visualizations.
  - Support dashboard templatization inputs and property mappings.
  - Allow installed-dashboard users to create a disconnected analysis copy from the packaged dashboard.
  - Docs: [Package Quiver dashboards in Marketplace](https://www.palantir.com/docs/foundry/quiver/dashboards-marketplace).

- [ ] `AS.30` Quiver visual functions (`P1`, `todo`)
  - Create and use reusable visual functions with typed parameters and typed card outputs.
  - Support function-like composition for metric, string, date/time, Boolean, property select, and time range outputs where locally implemented.
  - Validate circular dependencies, parameter defaults, and dashboard compatibility.
  - Docs: [Quiver card index](https://www.palantir.com/docs/foundry/quiver/cards-index), [Quiver core concepts](https://www.palantir.com/docs/foundry/quiver/core-concepts/).

### Advanced Insight and Object Explorer analysis

- [ ] `AS.31` Insight writeback from results (`P1`, `todo`)
  - Create, update, and delete objects from Insight analysis results using Ontology Actions or locally supported edit flows.
  - Require object type edit permission, write access to underlying data source, project permissions, and action-level checks.
  - Support selecting individual visible objects or all objects matching filters across pages, with explicit confirmation for bulk operations.
  - Docs: [Insight tables and data operations](https://www.palantir.com/docs/foundry/insight/table-insight/), [Insight overview](https://www.palantir.com/docs/foundry/insight/overview/).

- [ ] `AS.32` Insight path duplication and object set references (`P1`, `todo`)
  - Duplicate paths within current, new, or existing workbooks while preserving starting data and step-card details.
  - Reference existing object sets and lists, edit lists by adding/removing objects, and delete paths with confirmation for backing object sets.
  - Preserve published object set behavior if a backing path is deleted.
  - Docs: [Insight analysis panel](https://www.palantir.com/docs/foundry/insight/analysis-panel/).

- [ ] `AS.33` Insight SQL and Vega integration (`P1`, `todo`)
  - Support SQL sandbox card outputs as sources for Vega charts where local chart runtime supports Vega.
  - Prevent unsupported direct Ontology-path-to-Vega usage or implement explicit OpenFoundry divergence with documentation.
  - Track SQL query lineage, sample limits, and compute attribution.
  - Docs: [Insight transform card](https://www.palantir.com/docs/foundry/insight/transform-card/), [Analyze objects using SQL](https://www.palantir.com/docs/foundry/object-explorer/analyze-sql).

### Code Workbook legacy parity

- [ ] `AS.34` Code Workbook graph and transforms (`P1`, `todo`)
  - Implement a workbook graph with imported datasets, transform nodes, visualization outputs, aliases, and optional derived dataset outputs.
  - Support Python, R, SQL, Spark/PySpark/SparkR-compatible execution modes according to local runtime capabilities.
  - Provide full-screen editor, contents pane, global code, console, logs, and node relationship views.
  - Docs: [Code Workbook overview](https://www.palantir.com/docs/foundry/code-workbook/overview/), [Code Workbook workbooks overview](https://www.palantir.com/docs/foundry/code-workbook/workbooks-overview/), [Code Workbook transforms overview](https://www.palantir.com/docs/foundry/code-workbook/transforms-overview).

- [ ] `AS.35` Code Workbook inputs and outputs (`P1`, `todo`)
  - Allow users to set transform input types and convert between Spark dataframes, Pandas dataframes, R data frames, Foundry object/file formats, and null/no-output states where supported.
  - Validate conversions, memory/size guardrails, schema preservation, and runtime package availability.
  - Support saving transforms as derived datasets that write results to Foundry and can be shared downstream.
  - Docs: [Code Workbook inputs and outputs](https://www.palantir.com/docs/foundry/code-workbook/workbooks-input-output-types/), [Code Workbook workbooks overview](https://www.palantir.com/docs/foundry/code-workbook/workbooks-overview/).

- [ ] `AS.36` Code Workbook branching (`P1`, `todo`)
  - Create workbook-local branches, track parent branch, support branch deletion/reparenting, branch settings, protected branches, and run-allowed settings.
  - Store branch creation dataset state and isolate output datasets on matching branches.
  - Support merge preview, conflict detection/resolution, and imported dataset branch fallback or explicit pinning.
  - Docs: [Code Workbook branching overview](https://www.palantir.com/docs/foundry/code-workbook/branching-overview/), [Code Workbook branching getting started](https://www.palantir.com/docs/foundry/code-workbook/branching-getting-started/), [Choose imported dataset branch](https://www.palantir.com/docs/foundry/code-workbook/branching-imported-datasets).

- [ ] `AS.37` Code Workbook templates and productionization (`P1`, `todo`)
  - Support reusable templates for common logic, multi-language template parameters, and domain-specific onboarding flows.
  - Export or promote production-ready logic to Code Repositories where local code repository support exists.
  - Clearly label Code Workbook as legacy if OpenFoundry chooses to mirror documented product status.
  - Docs: [Code Workbook overview](https://www.palantir.com/docs/foundry/code-workbook/overview/), [Code Workbook transforms overview](https://www.palantir.com/docs/foundry/code-workbook/transforms-overview).

### Notepad, Fusion, and analytical connectivity

- [ ] `AS.38` Notepad AIP-assisted editing and custom functions (`P1`, `todo`)
  - Provide AIP editing actions for custom prompts, spelling/grammar, style changes, shortening, translation, and multi-command previews where AIP is enabled.
  - Allow published functions with string input to transform document/template text when AIP is unavailable or when custom behavior is configured.
  - Preserve formatting during text replacement and record safe prompt/function usage metadata.
  - Docs: [Notepad AIP features](https://www.palantir.com/docs/foundry/notepad/aip-features/), [AIP features](https://www.palantir.com/docs/foundry/aip/aip-features/).

- [ ] `AS.39` Notepad templates and linked documents (`P1`, `todo`)
  - Create templates that generate new documents from selected objects, resources, or parameters.
  - Maintain document links to objects and resources so Object Views/Workshop can show linked documents.
  - Support locked/frozen widget data for point-in-time report evidence.
  - Docs: [Notepad overview](https://www.palantir.com/docs/foundry/notepad/overview/), [Notepad embed widgets](https://www.palantir.com/docs/foundry/notepad/embed-widgets).

- [ ] `AS.40` Fusion actions and writeback (`P1`, `todo`)
  - Implement spreadsheet action formulas for copy, submit-to-region, toast, serial, parallel, labels, and validation-backed action flows.
  - Support table-region submissions and downstream dataset writes with permissions, validation, and audit.
  - Recommend Ontology Actions for adding data to the Ontology and prevent bypass of object/action permissions.
  - Docs: [Fusion perform Actions](https://www.palantir.com/docs/foundry/fusion/perform-actions), [Fusion overview](https://www.palantir.com/docs/foundry/fusion/overview).

- [ ] `AS.41` Fusion presentation and sharing (`P1`, `todo`)
  - Provide presentation view, default viewing mode, grid hiding, share links, and viewer/editor modes.
  - Preserve spreadsheet calculation state and data refresh behavior across presentation and edit views.
  - Track edit history and protect locked cells from unauthorized modification.
  - Docs: [Fusion presentation view](https://www.palantir.com/docs/foundry/fusion/presentation-view), [Fusion overview](https://www.palantir.com/docs/foundry/fusion/overview).

- [ ] `AS.42` BI tool connectors (`P1`, `todo`)
  - Provide guided setup for Tableau, Power BI, Excel, Qlik Sense, MicroStrategy, Microsoft Report Builder, and generic JDBC/ODBC clients where product decisions support each tool.
  - Support dataset browse/search, RID/path selection, project/catalog scoping, connection strings, connector downloads, driver versions, and troubleshooting guides.
  - Preserve read-only SQL semantics for dataset drivers and compatibility with granular permissions.
  - Docs: [Connectivity: SQL & BI overview](https://www.palantir.com/docs/foundry/analytics-connectivity/overview/), [Tableau getting started](https://www.palantir.com/docs/foundry/analytics-connectivity/tableau-getting-started), [Microsoft Report Builder overview](https://www.palantir.com/docs/foundry/analytics-connectivity/msft-report-builder-overview/), [MicroStrategy connector](https://www.palantir.com/docs/foundry/analytics-connectivity/microstrategy), [Excel via ODBC](https://www.palantir.com/docs/foundry/analytics-connectivity/excel/).

## Milestone C: advanced, scale, governance, and operational parity

### Scale, performance, and compute governance

- [ ] `AS.43` Analytics compute usage attribution (`P2`, `todo`)
  - Attribute interactive and batch compute to analyses, dashboards, cards, boards, SQL scratchpads, embedded widgets, saved dataset outputs, Fusion writeback, and BI sessions.
  - Separate Contour previews/analyses/reports from builds of datasets saved from Contour when mirroring Resource Management semantics.
  - Expose usage by project, dataset, object type, user, service account, and resource type.
  - Docs: [Resource Management usage types](https://www.palantir.com/docs/foundry/resource-management/usage-types), [Contour compute usage](https://www.palantir.com/docs/foundry/contour/compute-usage/).

- [ ] `AS.44` Large-analysis performance guardrails (`P2`, `todo`)
  - Warn or block expensive joins, high-cardinality group-bys, excessive dashboard cards, all-items load mode on large Quiver canvases, SQL scans, and unbounded BI queries.
  - Provide query cancellation, timeouts, cached previews, sampling controls, result limits, and resource-class recommendations.
  - Show user-facing explanations and remediation links.
  - Docs: [Quiver best practices](https://www.palantir.com/docs/foundry/quiver/quiver-best-practices), [Analyze objects using SQL](https://www.palantir.com/docs/foundry/object-explorer/analyze-sql), [ODBC & JDBC drivers for Foundry datasets](https://www.palantir.com/docs/foundry/analytics-connectivity/odbc-jdbc-drivers/).

- [ ] `AS.45` Data freshness and refresh policy (`P2`, `todo`)
  - Track source dataset transactions, object materialization freshness, time-series freshness, dashboard refresh-on-open settings, and BI query freshness.
  - Surface documented freshness caveats such as materialization delays for recently edited objects in Ontology SQL.
  - Allow manual refresh, scheduled refresh, or open-time refresh according to resource type.
  - Docs: [Analyze objects using SQL](https://www.palantir.com/docs/foundry/object-explorer/analyze-sql), [Contour dashboards getting started](https://www.palantir.com/docs/foundry/contour/dashboards-getting-started/), [Contour core concepts](https://www.palantir.com/docs/foundry/contour/core-concepts).

### Cross-application embedding and operational workflows

- [ ] `AS.46` Analytics embedding in operational apps (`P2`, `todo`)
  - Embed Contour boards, Quiver charts/dashboards, Notepad documents, maps, object cards, and Code Workbook charts in Workshop, Object Views, Notepad, and Carbon-compatible workspaces.
  - Enforce embedded-resource permissions and prevent embedding from bypassing data access controls.
  - Track embedded resource dependencies for impact analysis and product packaging.
  - Docs: [Notepad embed widgets](https://www.palantir.com/docs/foundry/notepad/embed-widgets), [Quiver dashboards Marketplace](https://www.palantir.com/docs/foundry/quiver/dashboards-marketplace), [Analytical dashboards](https://www.palantir.com/docs/foundry/analytics/dashboards/).

- [ ] `AS.47` Analytics-to-actions feedback loop (`P2`, `todo`)
  - Support Insight writeback, Quiver action buttons, Fusion submit/action formulas, and Notepad function widgets as governed operational handoffs.
  - Capture decisions, annotations, corrections, and follow-up actions back into the Ontology through action types where appropriate.
  - Preserve user attribution, action permissions, validation errors, and rollback/compensation metadata where supported.
  - Docs: [Analytics overview](https://www.palantir.com/docs/foundry/analytics/overview/), [Quiver writeback cards](https://www.palantir.com/docs/foundry/quiver/cards-index-writeback/), [Insight tables and data operations](https://www.palantir.com/docs/foundry/insight/table-insight/), [Fusion perform Actions](https://www.palantir.com/docs/foundry/fusion/perform-actions).

- [ ] `AS.48` Analytical outputs as reusable resources (`P2`, `todo`)
  - Save Contour datasets, Insight object sets, Quiver object sets/materializations, Fusion table-region outputs, and Code Workbook derived datasets as reusable resources.
  - Make outputs discoverable in downstream pipelines, Ontology Manager, Workshop, Model Studio, AIP Logic, and BI tools.
  - Track output provenance, refresh/build policy, schema evolution, and source analysis version/config.
  - Docs: [Contour core concepts](https://www.palantir.com/docs/foundry/contour/core-concepts), [Insight overview](https://www.palantir.com/docs/foundry/insight/overview/), [Fusion overview](https://www.palantir.com/docs/foundry/fusion/overview), [Code Workbook workbooks overview](https://www.palantir.com/docs/foundry/code-workbook/workbooks-overview/).

### Branching, versioning, productization, and migration

- [ ] `AS.49` Analytics versioning policy (`P2`, `todo`)
  - Define per-resource version behavior for Notepad, Code Workbook, Quiver, Insight, Contour, and Fusion.
  - Mirror documented behavior when appropriate, such as Notepad autosave/manual versions and Code Workbook branches, while documenting any OpenFoundry divergence for Contour history.
  - Provide diff/rollback/publish semantics only where supported by the resource model.
  - Docs: [Notepad version history](https://www.palantir.com/docs/foundry/notepad/version-history), [Code Workbook branching overview](https://www.palantir.com/docs/foundry/code-workbook/branching-overview/), [Contour product Q&A](https://www.palantir.com/docs/foundry/questions-answers/contour).

- [ ] `AS.50` Global Branching compatibility (`P2`, `todo`)
  - Decide which analytics resources participate in global branches versus app-local branches.
  - Ensure Workshop previews can load branched data while handling non-branchable embedded elements such as Quiver dashboards according to documented limitations.
  - Prevent branch-only analysis outputs from leaking into main runtime consumers before merge/publish.
  - Docs: [Foundry Branching overview](https://www.palantir.com/docs/foundry/foundry-branching/overview), [Code Workbook branching overview](https://www.palantir.com/docs/foundry/code-workbook/branching-overview/).

- [ ] `AS.51` Marketplace/product packaging for analytics (`P2`, `todo`)
  - Package supported dashboards, Notepad templates/documents, Code Workbook templates, and analytics dependencies into OpenFoundry product bundles.
  - Validate resource inputs, object type/property mappings, parameterization, unsupported cards/widgets, and disconnected-copy behavior.
  - Provide install-time remediation for missing datasets, object types, actions, functions, or BI connectors.
  - Docs: [Package Quiver dashboards in Marketplace](https://www.palantir.com/docs/foundry/quiver/dashboards-marketplace), [Notepad overview](https://www.palantir.com/docs/foundry/notepad/overview/).

- [ ] `AS.52` Legacy Reports and Code Workbook migration (`P2`, `todo`)
  - Identify any legacy Reports/Code Workbook behaviors that users need to migrate to Contour dashboards, Quiver dashboards, Notepad, Code Workspaces, or Code Repositories.
  - Provide migration inventories, compatibility warnings, and conversion helpers where public docs describe supported transitions.
  - Preserve legacy resources read-only or fully supported according to OpenFoundry product decision.
  - Docs: [Code Workbook overview](https://www.palantir.com/docs/foundry/code-workbook/overview/), [Parameterize your Contour analysis](https://www.palantir.com/docs/foundry/contour/analysis-parameterize/).

### Security, governance, audit, and exports

- [ ] `AS.53` Analytics audit log (`P2`, `todo`)
  - Audit creation, view, edit, share, dashboard open, parameter override, export, dataset save, object set save, writeback, BI query, Notepad AIP edit, and connector auth events.
  - Include actor, resource, source data refs, target output refs, timestamp, branch, parameters, filter state, action IDs, and policy decision without leaking protected payloads.
  - Provide export for compliance review.
  - Docs: [Analytics overview](https://www.palantir.com/docs/foundry/analytics/overview/), [Resource Management usage types](https://www.palantir.com/docs/foundry/resource-management/usage-types).

- [ ] `AS.54` Export governance and checkpoints (`P2`, `todo`)
  - Apply checkpoint/justification policies to PDF, PowerPoint, CSV, dataset output, object set export, dashboard export, BI extraction, and Notepad print/export where configured.
  - Include current parameter/filter/dashboard state in export provenance.
  - Enforce markings, restricted views, row/column/object security, and download limits.
  - Docs: [Contour dashboards getting started](https://www.palantir.com/docs/foundry/contour/dashboards-getting-started/), [Object Explorer overview](https://www.palantir.com/docs/foundry/object-explorer/overview/), [ODBC & JDBC drivers for Foundry datasets](https://www.palantir.com/docs/foundry/analytics-connectivity/odbc-jdbc-drivers/).

- [ ] `AS.55` BI connector security and lifecycle (`P2`, `todo`)
  - Support connector/driver download versioning, OAuth/service-user/token auth, token rotation, connection-string redaction, and per-client compatibility.
  - Ensure external BI tools receive only read-only dataset access and cannot bypass project, dataset, restricted view, or marking permissions.
  - Log query text safely, redact tokens, and provide session revocation.
  - Docs: [Connectivity downloads](https://www.palantir.com/docs/foundry/analytics-connectivity/downloads), [ODBC & JDBC drivers for Foundry datasets](https://www.palantir.com/docs/foundry/analytics-connectivity/odbc-jdbc-drivers/), [Connectivity: SQL & BI overview](https://www.palantir.com/docs/foundry/analytics-connectivity/overview/).

- [ ] `AS.56` AIP-assisted analytics governance (`P2`, `todo`)
  - Govern Notepad AIP editing and any future analytics AIP assist features through model access, AIP feature flags, prompt logging, redaction, and usage metering.
  - Preserve document formatting and avoid sending unauthorized embedded data to model providers.
  - Provide user-visible disclosure and opt-out/admin controls where configured.
  - Docs: [Notepad AIP features](https://www.palantir.com/docs/foundry/notepad/aip-features/), [AIP features](https://www.palantir.com/docs/foundry/aip/aip-features/).

## Implementation inventory checklist

- [ ] `INV.1` Identify existing OpenFoundry dataset preview, chart, transform, SQL, dashboard, report, spreadsheet, notebook, and embedding primitives.
- [ ] `INV.2` Inventory current Ontology object set, link traversal, time-series, map/geospatial, object security, and action writeback support.
- [ ] `INV.3` Inventory existing expression engines, formula engines, SQL engines, Spark execution, BI server endpoints, and query-planner limits.
- [ ] `INV.4` Inventory available chart libraries, Vega support, PDF/PowerPoint/CSV export, print rendering, fullscreen mode, and responsive dashboard layout.
- [ ] `INV.5` Inventory project/folder resource management, share links, permissions, markings, restricted views, export checkpoints, and audit primitives.
- [ ] `INV.6` Inventory Data Foundation build, saved dataset output, lineage, transactions, schedules, compute usage, and resource management support.
- [ ] `INV.7` Inventory Workshop, Object Views, Notepad, Carbon, Slate-compatible, and Marketplace/product embedding or packaging support.
- [ ] `INV.8` Inventory Code Workbook/Code Workspaces/Code Repositories capabilities for Python/R/SQL/Spark, branches, templates, productionization, and legacy migration.
- [ ] `INV.9` Inventory external BI integration support for JDBC, ODBC, OAuth, service users, Tableau, Power BI, Excel, Qlik, MicroStrategy, and Report Builder.
- [ ] `INV.10` Inventory AIP-assisted editing, function widgets, AIP Logic/function invocation, prompt redaction, model usage accounting, and feature gating.
- [ ] `INV.11` Identify public-doc limitations OpenFoundry should mirror exactly versus intentionally diverge from, such as Contour version history, Code Workbook legacy status, ODBC platform support, and non-branchable Quiver dashboard embeds.
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
| `analytics-resource-service` | Shared analysis resource CRUD, folder/project placement, resource metadata, permissions, sharing, archive/restore, dependency indexing. |
| `contour-service` | Contour analyses, paths, boards, expressions, parameters, dashboard association, path refresh, saved dataset output definitions. |
| `contour-execution-service` | Board preview execution, expression execution, joins/aggregations/transforms, saved output build handoff, compute attribution. |
| `quiver-service` | Quiver analyses, canvases, typed cards, graph validation, object/time-series analysis, dashboards, visual functions, writeback buttons. |
| `quiver-execution-service` | Card execution, materializations, time-series transformations, object set operations, dashboard load strategy, performance guardrails. |
| `insight-service` | Insight workbooks, ontology data selection, analysis paths, step cards, tables/charts/maps, saved object sets, SQL scratchpads. |
| `code-workbook-service` | Legacy workbook graphs, transform nodes, branches, input/output conversions, templates, console sessions, productionization export. |
| `notepad-service` | Documents, widgets, templates, linked resources/objects, version history, AIP/function text edits, export/print settings. |
| `fusion-service` | Spreadsheets, sheets/cells/formulas, table regions, XLS import, actions/writeback, presentation view, edit history. |
| `analytics-connectivity-service` | SQL/BI connectors, ODBC/JDBC endpoints, driver metadata, OAuth/token auth, client setup guides, BI query sessions. |
| `dashboard-render-service` | Dashboard layouts, fullscreen, share links, export rendering, PDF/PowerPoint/print output, responsive rendering, embedded dashboard snapshots. |
| `chart-visualization-service` | Chart primitives, Vega plots, maps, table rendering, time-series plots, custom formatting, image/plot artifact rendering. |
| `dataset-versioning-service` | Saved dataset outputs, transactions, lineage, build triggers, schema evolution, output permissions, dataset export. |
| `ontology-query-service` | Object set queries, link traversal, object security filtering, time-series property reads, materialization freshness, SQL over ontology. |
| `ontology-actions-service` | Insight/Quiver/Fusion writeback, action forms, bulk selection execution, validation, user attribution, audit and rollback hooks. |
| `aip/function service` | Notepad AIP edits, custom function widgets, prompt/function execution, usage accounting, redaction, feature controls. |
| `security/governance service` | Permissions, markings, export checkpoints, audit logs, token redaction, retention, BI connector policy, payload redaction. |
| `resource-management service` | Interactive/batch compute usage, storage usage, ontology volume usage, query/cell/card/dashboard attribution, quotas. |
| `apps/web` | Analytics landing, Contour/Quiver/Insight/Code Workbook/Notepad/Fusion UIs, dashboards, BI setup, embedding UX, export dialogs. |

## Acceptance criteria for first complete Analytics Suite milestone

- [ ] A user can open the Analytics landing page, choose the right OpenFoundry analytics tool, and create resources in project folders with permissions.
- [ ] A user can create a Contour analysis over a dataset, add paths and boards, use expressions and parameters, preview transformations, create a dashboard, and save path results as a derived dataset.
- [ ] A Contour dashboard supports tabs, text, eligible boards, inline parameters, parameter overrides, chart-to-chart filtering, share links, fullscreen mode, and PDF export.
- [ ] A user can create a Quiver analysis, add object data and time-series data, chain typed cards on canvases, visualize results, and publish an interactive dashboard.
- [ ] Quiver object analysis supports object filters, linked-object traversal, charts/tables, and object set export with object security enforced.
- [ ] Quiver time-series analysis supports plotting, formulas or transformations, range selection, display formatting, and derived plot movement between charts.
- [ ] A user can create an Insight workbook from Ontology data, search and preview object types, build an analysis path with filter/link/transform steps, inspect tables/charts/maps, and save/share an object set.
- [ ] Ontology SQL scratchpads allow read-only SQL over eligible object types/materializations with autocomplete, sample limits, and freshness warnings.
- [ ] A user can create a Notepad document, embed Contour/Quiver/Object/Map/Function widgets, maintain linked resources/objects, autosave versions, manually save/endorse versions, rollback, and export/print.
- [ ] A user can create a Fusion spreadsheet, import an XLS/XLSX file, query Foundry datasets, use formulas/table regions, and submit spreadsheet results to a governed output.
- [ ] JDBC/ODBC-compatible read-only SQL access lets an external BI client query permitted Foundry datasets without bypassing permissions.
- [ ] Analytics compute, storage, writeback, export, and BI query activity is attributed to users/projects/resources and visible in basic usage telemetry.
- [ ] Export and writeback operations are audited and enforce permissions, markings, object security, restricted views, and configured checkpoints.
- [ ] All OpenFoundry runtime UI is OpenFoundry-native and does not use Palantir branding, screenshots, icons, fonts, or proprietary assets.

## Test plan expectations

- Unit tests for analysis resource CRUD, permission inheritance, Contour board validation, expression parsing/type inference, parameter defaults/overrides, dashboard layout serialization, Quiver card type compatibility, graph recomputation, Insight step toggles, Notepad versioning, Fusion formula/action validation, and BI connection-string redaction.
- Unit tests for object/link traversal permission filtering, time-series formula validation, SQL scratchpad eligibility checks, saved dataset output schema derivation, XLS import validation, export checkpoint policy decisions, and compute usage attribution keys.
- API tests for Contour analysis/path/board/parameter/dashboard CRUD, Quiver analysis/card/dashboard CRUD, Insight workbook/path/object set CRUD, Notepad document/widget/version CRUD, Fusion spreadsheet/table-region/action CRUD, BI connection/session APIs, export APIs, and audit/usage endpoints.
- Integration tests for Contour saved dataset builds, Quiver object set materialization, Quiver time-series chart rendering, Quiver action writeback, Insight writeback, Insight SQL over materialized objects, Notepad embedded widgets, Notepad AIP/function text edits, Fusion table-region submission, and JDBC/ODBC read-only query execution.
- E2E tests for dataset-to-Contour-dashboard, object-to-Insight-object-set, object/time-series-to-Quiver-dashboard, Notepad reporting with embedded analytics, Fusion spreadsheet writeback, Tableau/Excel-style BI query, and export-with-checkpoint workflows.
- Observability tests for interactive query logs, dashboard load metrics, BI query sessions, saved dataset build lineage, embedded widget dependency tracking, PDF/CSV export events, action writeback audit records, Notepad AIP usage, and stale-analysis health events.
- Regression tests proving unauthorized users cannot see protected datasets/object properties/object links/dashboards/documents/spreadsheets; BI connectors remain read-only; exports require configured justification; Notepad widgets do not bypass source permissions; Quiver writeback obeys action permissions; Insight bulk operations require confirmation; tokens/secrets are never logged; and branch-only workbook outputs cannot leak into main runtime use.
