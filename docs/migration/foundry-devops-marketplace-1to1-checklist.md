# Foundry DevOps and Marketplace 1:1 parity checklist

Date: 2026-05-11
Scope: public-docs-based parity plan for OpenFoundry's product delivery,
DevOps, and Marketplace surfaces: product packaging, stores, local and remote
stores, product drafts, folder tracking, resource outputs, dependency-discovered
inputs, linked products, store links, input presets and defaults, product
documentation, thumbnails, changelogs, version history, release channels,
Maven-style coordinates, product deprecation, version recall, approval-required
publishing, store categories and tags, supported and unsupported resource
validation, resource-specific Marketplace linters, Marketplace storefront,
product browsing, product details, install drafts, input mapping, placeholder
inputs, ontology entity prefixing, installation jobs, production/singleton/
bootstrap installation modes, locked/unlocked installations, release-management
environments, maintenance windows, automatic upgrades, manual upgrades,
downgrades, installation deletion, export/import of product files, Foundry
products and Apollo-managed installation concepts, permissions, organization
marking expansion/removal, auditability, observability, and production-readiness
guardrails for reusable data-backed workflows.

This document is intentionally implementation-oriented. It does not attempt to
clone Palantir branding, private source code, proprietary assets, screenshots,
or any non-public behavior. The target is **functional parity based on public
Palantir Foundry documentation**: the same product concepts, comparable product
packaging/storefront/installation/release workflows, compatible resource models
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

This checklist covers Foundry DevOps, Marketplace, Foundry products, and
release-management product-delivery workflows. It should integrate with Data
Foundation for datasets, builds, lineage, transactions, and packaging data;
with Pipeline Builder, Code Repositories, Workshop, Object Views, Functions,
Action Types, Automate/Rules, AIP Agents, Model Integration, Media Sets,
Ontology Manager, Global Branching, Analytics Suite, and Security/Governance for
resource-specific compatibility and install behavior; with Resource Management
for usage attribution; with Audit and Approvals for publishing/install/export
controls; and with Apollo-like deployment infrastructure only through
OpenFoundry-native abstractions where available. It should not duplicate those
resource-specific implementation surfaces.

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
| `P0` | Required for credible product delivery: package resources, publish versions to a store, browse products, map inputs, install content, and upgrade safely. |
| `P1` | Required for Foundry-style DevOps and Marketplace parity beyond basic export/import: linked products, release channels, automatic upgrades, permissions, and compatibility linters. |
| `P2` | Advanced, governance-heavy, multi-environment, cross-enrollment, Apollo-managed, Marketplace ecosystem, observability, or compliance-oriented parity. |

## Official Palantir documentation library

These public docs should be treated as the external behavioral contract while
implementing this checklist.

### Product delivery, DevOps, and Marketplace core docs

- [Product delivery overview](https://www.palantir.com/docs/foundry/devops/overview/)
- [Foundry DevOps overview](https://www.palantir.com/docs/foundry/foundry-devops/overview/)
- [Core concepts](https://www.palantir.com/docs/foundry/devops/core-concepts/)
- [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/)
- [Track a source folder](https://www.palantir.com/docs/foundry/foundry-devops/folder-tracking)
- [Input presets](https://www.palantir.com/docs/foundry/foundry-devops/input-presets)
- [Supported resources](https://www.palantir.com/docs/foundry/foundry-devops/supported-resources)
- [Manage products](https://www.palantir.com/docs/foundry/foundry-devops/manage-products/)
- [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/)
- [Manage store tags](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-tags)
- [Export and import products](https://www.palantir.com/docs/foundry/foundry-devops/export-import-products/)

### Marketplace storefront and installations

- [Marketplace overview](https://www.palantir.com/docs/foundry/marketplace/overview)
- [Marketplace getting started](https://www.palantir.com/docs/foundry/marketplace/getting-started/)
- [Browse products](https://www.palantir.com/docs/foundry/marketplace/browse-products)
- [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/)
- [Installations](https://www.palantir.com/docs/foundry/marketplace/installations)
- [Linked products](https://www.palantir.com/docs/foundry/marketplace/linked-products/)
- [Foundry products](https://www.palantir.com/docs/foundry/marketplace/foundry-products)

### Release management and environments

- [Use DevOps for release management](https://www.palantir.com/docs/foundry/devops-release-management/use-devops-for-release-management)
- [Foundry Branching overview](https://www.palantir.com/docs/foundry/foundry-branching/overview)
- [Application reference](https://www.palantir.com/docs/foundry/getting-started/application-reference/)
- [Architecture: AIP, Foundry, and Apollo](https://www.palantir.com/docs/foundry/architecture-center/platforms)

### Resource-specific Marketplace packaging

- [Workshop applications in Marketplace](https://www.palantir.com/docs/foundry/workshop/marketplace-workshop/)
- [Action types in Marketplace](https://www.palantir.com/docs/foundry/action-types/marketplace-action-types)
- [Automations in Marketplace](https://www.palantir.com/docs/foundry/automate/marketplace-automate/)
- [Pipeline Builder pipelines in Marketplace](https://www.palantir.com/docs/foundry/pipeline-builder/marketplace-pipeline-builder/)
- [Foundry Rules in Marketplace](https://www.palantir.com/docs/foundry/foundry-rules/marketplace/)
- [AIP Agents in Marketplace](https://www.palantir.com/docs/foundry/agent-studio/marketplace)
- [Functions in Marketplace](https://www.palantir.com/docs/foundry/functions/marketplace-functions/)
- [Modeling resources in Marketplace](https://www.palantir.com/docs/foundry/model-integration/marketplace-models)
- [Object Views in Marketplace](https://www.palantir.com/docs/foundry/object-views/marketplace-object-views)
- [Developer Console applications with Marketplace](https://www.palantir.com/docs/foundry/developer-console/marketplace-installation/)
- [Quiver dashboards in Marketplace](https://www.palantir.com/docs/foundry/quiver/dashboards-marketplace)

### Security, observability, and governance references

- [Organizations and spaces](https://www.palantir.com/docs/foundry/security/orgs-and-spaces/)
- [Projects and roles](https://www.palantir.com/docs/foundry/security/projects-and-roles)
- [Markings](https://www.palantir.com/docs/foundry/security/markings/)
- [Approvals overview](https://www.palantir.com/docs/foundry/approvals/overview/)
- [Audit logs overview](https://www.palantir.com/docs/foundry/security/audit-logs-overview)
- [Workflow Lineage getting started](https://www.palantir.com/docs/foundry/workflow-lineage/getting-started)
- [Resource Management usage types](https://www.palantir.com/docs/foundry/resource-management/usage-types)

## Target OpenFoundry resource model

The implementation should define stable OpenFoundry-owned resources that can map
to public Foundry concepts without requiring Palantir RID formats. Compatibility
aliases may be accepted at service boundaries, but persisted state should use
OpenFoundry canonical IDs.

| Public Foundry concept | OpenFoundry resource target | Required notes |
| --- | --- | --- |
| Product delivery application | `product_delivery_app` | Entry point for DevOps, Marketplace, release environments, installation fleets, and product documentation. |
| Marketplace store | `marketplace_store` | Local or remote store with project/folder placement, markings, permissions, tags, featured products, store links, and approval policy. |
| Remote store | `marketplace_remote_store` | Read-only store imported from another enrollment or provider, configured through admin controls and not editable in local DevOps. |
| Store category | `marketplace_store_category` | Store-local grouping for tags with order, name uniqueness, delete semantics, and product-filter display settings. |
| Store tag | `marketplace_store_tag` | Store-local product label used for browsing/filtering; applied through new product versions. |
| Product | `marketplace_product` | Collection of packageable resources made available for install, with identifier, coordinate, documentation, versions, drafts, deprecation, and ownership. |
| Product coordinate | `marketplace_product_coordinate` | Stable package coordinate derived from enrollment/namespace/store/product IDs, with validation against sensitive names. |
| Product draft | `marketplace_product_draft` | Mutable packaging workspace with selected outputs, discovered inputs, validation state, docs, settings, changelog, and publish workflow. |
| Product version | `marketplace_product_version` | Immutable published product version with content manifest, input contract, documentation snapshot, changelog, release-channel tags, recall state, and provenance. |
| Product output | `marketplace_product_output` | Resource that will be recreated/installed as content, including packaging mode, source resource version, destination path, and compatibility metadata. |
| Product input | `marketplace_product_input` | Dependency installers must map, including type, configuration contract, dependents, presets, default tracking, optionality, and placeholder support. |
| Input preset | `marketplace_input_preset` | Allowed/default input mapping value sourced from source dependencies or override lists, with cross-environment locator behavior. |
| Linked product | `marketplace_linked_product` | Relationship where an upstream product/version can fulfill downstream product inputs with semantic dependency metadata. |
| Store link | `marketplace_store_link` | One-way relationship allowing products in one store to discover upstream linked products from another store. |
| Folder tracking config | `marketplace_folder_tracking_config` | Product setting that auto-discovers source-folder resources, syncs additions/removals, and validates resources outside source scope. |
| Packaging validation finding | `marketplace_packaging_finding` | Error/warning from DevOps or resource-specific linter, with resource, severity, remediation, and publish-blocking state. |
| Release channel | `marketplace_release_channel` | Hierarchical channel such as Release/Test or Pre-Stable/Stable with product version tags and installation tracking behavior. |
| Product recall | `marketplace_product_recall` | Recall marker preventing new manual/automatic installs/upgrades for a version while preserving existing installations. |
| Installation draft | `marketplace_installation_draft` | Guided install/upgrade/downgrade workflow state with mode, location, roles, ontology, input mappings, entity prefixes, validations, and review state. |
| Product installation | `marketplace_installation` | Installed instance of a product with installed resources, source product version, mode, settings, lock state, inputs, release channel, and job history. |
| Installation job | `marketplace_installation_job` | Async job creating/upgrading/downgrading/deleting installed content with step statuses, logs, resource results, and retry/force-delete metadata. |
| Placeholder input | `marketplace_placeholder_input` | Temporary stub resource generated for missing supported inputs, later remappable to a real resource. |
| Installation lock | `marketplace_installation_lock` | Project/folder/content lock that prevents downstream edits to preserve safe upgrades, with fork/unlock metadata. |
| Maintenance window | `marketplace_maintenance_window` | Installation setting controlling when automatic upgrades may run, including always-open mode and downtime warnings. |
| Product environment | `marketplace_environment` | Release-management view over spaces/environments such as development, test, and production with installation summaries. |
| Product export artifact | `marketplace_export_artifact` | Short-lived unencrypted package file exported from a local store, with provenance, checksum, sensitivity warnings, and import compatibility. |
| Foundry product | `marketplace_foundry_product` | Cross-enrollment portable product concept that may be managed by an Apollo-like external orchestrator. |
| Apollo-managed installation | `marketplace_managed_installation` | Read-only/control-plane view of externally managed product installation status, changes, and debugging details. |
| Product permission operation | `marketplace_permission_operation` | Store/product/install operation such as read, install, use-input, install-in, create, edit, export, import, link, approve, or finalize. |
| Product audit event | `marketplace_audit_event` | Normalized event for store, product, publish, install, upgrade, delete, export/import, recall, marking, and permission changes. |
| Product usage metric | `marketplace_usage_metric` | Usage attribution for packaging, install jobs, upgrades, builds, exports, automatic upgrade attempts, and storefront activity. |

## Milestone A: minimum viable DevOps and Marketplace parity

### DevOps shell, stores, and product creation

- [ ] `DMP.1` Product Delivery application shell (`P0`, `todo`)
  - Provide DevOps and Marketplace entry points from an OpenFoundry-native Product Delivery area.
  - Explain product, store, input, output, installation, release channel, and environment terminology before users create or install products.
  - Gate DevOps builder actions and Marketplace installer actions by application access, store permissions, and project/folder permissions.
  - Docs: [Product delivery overview](https://www.palantir.com/docs/foundry/devops/overview/), [Core concepts](https://www.palantir.com/docs/foundry/devops/core-concepts/).

- [ ] `DMP.2` Local Marketplace stores (`P0`, `todo`)
  - Create local stores in projects/folders with inherited permissions, markings, owner/editor/viewer grants, and settings pages.
  - List stores visible to the user and distinguish local, remote, and Foundry-product stores.
  - Support store deletion/archive decisions consistent with OpenFoundry resource lifecycle policy.
  - Docs: [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/), [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/).

- [ ] `DMP.3` Product CRUD and draft lifecycle (`P0`, `todo`)
  - Create products inside stores with title, identifier, documentation, installation mode, folder-structure setting, build settings, and draft metadata.
  - Show published products, drafts, latest versions, draft status, validation status, and product overview.
  - Start new versions from an existing product and preserve previous versions as immutable records.
  - Docs: [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/), [Manage products](https://www.palantir.com/docs/foundry/foundry-devops/manage-products/).

- [ ] `DMP.4` Add outputs and dependency discovery (`P0`, `todo`)
  - Let builders add files/resources from project folders, ontology resources, and supported resource pickers as product outputs.
  - Discover upstream dependencies and surface them as inputs with dependent-resource explanations.
  - Recommend adding downstream resources first so dependency discovery can identify required upstream entities.
  - Docs: [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/), [Workflow Lineage getting started](https://www.palantir.com/docs/foundry/workflow-lineage/getting-started).

- [ ] `DMP.5` Input/output promotion and management (`P0`, `todo`)
  - Move eligible inputs to outputs individually or in bulk, while blocking non-promotable inputs such as parameters or groups where required.
  - Group outputs by folder, filter inputs/outputs by type or error, and show destination folder previews when folder structure is enabled.
  - Persist input contracts, output manifests, source refs, and dependency graph provenance.
  - Docs: [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/).

- [ ] `DMP.6` Product documentation and storefront metadata (`P0`, `todo`)
  - Capture short description, thumbnail, preview images, Markdown product description, changelog, content preview, and input preview.
  - Render documentation safely in Marketplace without executing embedded scripts or leaking unauthorized resource names.
  - Snapshot documentation with each product version.
  - Docs: [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/), [Browse products](https://www.palantir.com/docs/foundry/marketplace/browse-products).

- [ ] `DMP.7` Product settings and installation modes (`P0`, `todo`)
  - Support Production, Singleton, and Bootstrap installation modes with default lock/upgrade/location behavior.
  - Support folder-structure replication and build settings that build/hydrate datasets or models during installation where local build systems support it.
  - Validate settings before publish and explain install-time consequences to builders.
  - Docs: [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/), [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/).

- [ ] `DMP.8` Review and publish product versions (`P0`, `todo`)
  - Provide review-changes flow with validation results, content/input diffs, documentation snapshot, changelog entry, and publish confirmation.
  - Publish immutable product versions to the selected local store and make them visible in Marketplace.
  - Support publish latency/progress tracking for large product drafts.
  - Docs: [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/), [Manage products](https://www.palantir.com/docs/foundry/foundry-devops/manage-products/).

### Marketplace storefront and installation basics

- [ ] `DMP.9` Marketplace storefront (`P0`, `todo`)
  - Browse visible stores and products with search, filters, featured products, tags, version selector, recalled-version badges, overview, changelogs, content, and input tabs.
  - Disable installation for recalled versions and surface existing accessible installations with Open / Install again behavior.
  - Respect store visibility, local/remote store permissions, and organization markings.
  - Docs: [Marketplace overview](https://www.palantir.com/docs/foundry/marketplace/overview), [Browse products](https://www.palantir.com/docs/foundry/marketplace/browse-products).

- [ ] `DMP.10` Guided installation draft (`P0`, `todo`)
  - Create install drafts with General, Inputs, Content, New versions, and Review steps where applicable.
  - Configure installation name/suffix, location, target project/folder, space, ontology, roles, and installer-visible mode information.
  - Validate that installers have install-in permissions on target locations and edit permissions on target ontology where ontology resources are created.
  - Docs: [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/), [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/).

- [ ] `DMP.11` Installation input mapping (`P0`, `todo`)
  - Map required inputs manually, through linked products, from existing folders, or through legacy/template-like input sources where locally supported.
  - Show missing inputs, dependency explanations, configuration tabs, column mappings, and validation errors.
  - Support products with no required input mappings by hiding or skipping the input step.
  - Docs: [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/), [Linked products](https://www.palantir.com/docs/foundry/marketplace/linked-products/).

- [ ] `DMP.12` Installation content review and ontology prefixing (`P0`, `todo`)
  - Preview all resources that will be installed, including applications, functions, object types, link types, action types, pipelines, datasets, and other supported resources.
  - Support optional ontology entity prefixing for object/link/action/function names where target ontology semantics allow it.
  - Validate target naming conflicts, API name conflicts, and namespace collisions before install.
  - Docs: [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/), [Marketplace getting started](https://www.palantir.com/docs/foundry/marketplace/getting-started/).

- [ ] `DMP.13` Installation jobs and installed-resource tracking (`P0`, `todo`)
  - Execute installation jobs asynchronously with per-resource status, logs, failures, retryability, and final View installation link.
  - Track every installed resource, target project/folder, target ontology, input mapping, source product version, and installation creator.
  - Create default owner-only project access unless roles/groups are configured during installation.
  - Docs: [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/), [Installations](https://www.palantir.com/docs/foundry/marketplace/installations).

- [ ] `DMP.14` Installation settings and lock state (`P0`, `todo`)
  - Show installation settings for release channel, automatic upgrades, maintenance windows, and lock/unlock state.
  - Lock production/singleton installations to prevent downstream edits needed for safe upgrades; allow explicit unlock/fork where product mode supports it.
  - Document known limitations where unlocking does not make certain resources editable.
  - Docs: [Installations](https://www.palantir.com/docs/foundry/marketplace/installations), [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/).

- [ ] `DMP.15` Manual upgrades and downgrades (`P0`, `todo`)
  - Surface banners when new versions are available and let users review content/input changes before upgrading.
  - Support manual upgrade/downgrade to a chosen version with a draft and review flow.
  - Require manual action when new inputs need mapping, even if automatic upgrades are enabled.
  - Docs: [Installations](https://www.palantir.com/docs/foundry/marketplace/installations), [Manage products](https://www.palantir.com/docs/foundry/foundry-devops/manage-products/).

- [ ] `DMP.16` Installation deletion (`P0`, `todo`)
  - Provide irreversible delete flow with preview of all resources that will be permanently deleted.
  - Require typed confirmation and show success/failure lists for deleted and failed resources.
  - Support force-delete of installation metadata while acknowledging failed content persists, and delete the project/folder only if it contains no unrelated resources.
  - Docs: [Installations](https://www.palantir.com/docs/foundry/marketplace/installations).

### Minimum viable permissions and governance

- [ ] `DMP.17` Store and product permission model (`P0`, `todo`)
  - Implement operations for viewing stores, installing products, using resources as inputs, installing into target locations, creating stores, editing products, exporting/importing products, linking stores, and approving/finalizing versions.
  - Map operations to OpenFoundry roles and custom role sets while preserving project/folder inheritance.
  - Deny actions with explanations that include missing role/operation and target resource when safe to reveal.
  - Docs: [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/), [Projects and roles](https://www.palantir.com/docs/foundry/security/projects-and-roles).

- [ ] `DMP.18` Organization marking checks (`P0`, `todo`)
  - Enforce organization marking membership when creating stores, packaging resources, installing products, moving content, expanding access, or removing markings.
  - Require expand-access permissions when packaging/installing content into broader organization visibility and remove-marking permissions when output movement drops markings.
  - Show partial explanations when users are not authorized to see all organization markings.
  - Docs: [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/), [Markings](https://www.palantir.com/docs/foundry/security/markings/).

- [ ] `DMP.19` Basic product audit events (`P0`, `todo`)
  - Audit store creation, product draft creation, output/input changes, validation failures, publish, release-channel tag changes, recall, install, upgrade, downgrade, delete, export, import, and permission changes.
  - Include actor, store/product/version/installation IDs, source/target resources, target space/ontology, markings decision, job ID, and outcome.
  - Restrict audit views to product owners and security administrators.
  - Docs: [Audit logs overview](https://www.palantir.com/docs/foundry/security/audit-logs-overview), [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/).

## Milestone B: credible Foundry-style DevOps and Marketplace parity

### Product versioning, release channels, and approvals

- [ ] `DMP.20` Product version table and changelogs (`P1`, `todo`)
  - Show all product versions with version ID, author, published time, release-channel tags, recall/deprecation state, changelog, content summary, inputs, and local installations.
  - Provide version detail pages with immutable product metadata and install/upgrade entry points.
  - Compare versions to show changed, added, removed, and remapped resources.
  - Docs: [Manage products](https://www.palantir.com/docs/foundry/foundry-devops/manage-products/), [Browse products](https://www.palantir.com/docs/foundry/marketplace/browse-products).

- [ ] `DMP.21` Hierarchical release channels (`P1`, `todo`)
  - Tag product versions with release channels such as Release, Test/Pre-Stable, and Stable according to OpenFoundry's configured channel vocabulary.
  - Implement hierarchical matching so an installation tracking a broader channel receives eligible narrower/stabler channel versions according to documented behavior.
  - Record who changed channel tags and when, and prevent recalled versions from being selected by upgrades.
  - Docs: [Manage products](https://www.palantir.com/docs/foundry/foundry-devops/manage-products/), [Installations](https://www.palantir.com/docs/foundry/marketplace/installations).

- [ ] `DMP.22` Automatic upgrades and maintenance windows (`P1`, `todo`)
  - Let installations opt into automatic upgrades with release channel and maintenance window settings.
  - Run upgrades only during configured maintenance windows or always-open mode and warn that upgrades can cause downtime.
  - Skip automatic upgrades requiring manual action, such as new required input mappings, and surface a manual review banner instead.
  - Docs: [Installations](https://www.palantir.com/docs/foundry/marketplace/installations), [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/).

- [ ] `DMP.23` Approval-required product publishing (`P1`, `todo`)
  - Allow stores to require approval before new product versions are finalized/published.
  - Route publish drafts to approvers with finalize permission; require approver to differ from author.
  - Store approval decision, comments, validation snapshot, and published version provenance.
  - Docs: [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/), [Approvals overview](https://www.palantir.com/docs/foundry/approvals/overview/).

- [ ] `DMP.24` Product deprecation and version recall (`P1`, `todo`)
  - Deprecate products to hide them from storefront without hard deletion.
  - Recall local-store product versions to prevent new manual installs, upgrades, and automatic upgrades while preserving existing installations.
  - Retain recall metadata through local product export/import where supported and document remote-store recall limitations.
  - Docs: [Manage products](https://www.palantir.com/docs/foundry/foundry-devops/manage-products/), [Browse products](https://www.palantir.com/docs/foundry/marketplace/browse-products).

- [ ] `DMP.25` Maven-style product coordinates (`P1`, `todo`)
  - Configure stable product coordinates from enrollment/reverse URL, namespace, store identifier, and product identifier.
  - Validate coordinate uniqueness and block sensitive, restricted, or highly restricted names in any coordinate segment.
  - Use coordinates for cross-store, cross-enrollment, or external orchestration references where OpenFoundry supports them.
  - Docs: [Manage products](https://www.palantir.com/docs/foundry/foundry-devops/manage-products/).

### Linked products, presets, and folder tracking

- [ ] `DMP.26` Linked products (`P1`, `todo`)
  - Detect products whose content can satisfy another product's inputs and show linked-product recommendations in both packaging and installation flows.
  - Support simultaneous or ordered installation that automatically maps upstream product content to downstream product inputs.
  - Track semantic dependency versions and avoid duplicate installed content when shared upstream content is used.
  - Docs: [Linked products](https://www.palantir.com/docs/foundry/marketplace/linked-products/), [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/).

- [ ] `DMP.27` Store links (`P1`, `todo`)
  - Configure one-way store links so downstream products can discover upstream linked products from another store.
  - Gate store-link creation by the target store's link operation and viewer permissions.
  - Prevent cyclic or unauthorized dependency discovery across stores.
  - Docs: [Linked products](https://www.palantir.com/docs/foundry/marketplace/linked-products/), [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/).

- [ ] `DMP.28` Input presets and defaults (`P1`, `todo`)
  - Configure presets from source dependency values or manual overrides for product inputs.
  - Support mandatory presets, allowed custom values, default preset selection, track-default behavior, and bulk source-preset configuration.
  - Use API-name or locator-based cross-environment matching for supported resource types and explain unavailable presets in target installs.
  - Docs: [Input presets](https://www.palantir.com/docs/foundry/foundry-devops/input-presets), [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/).

- [ ] `DMP.29` Placeholder inputs (`P1`, `todo`)
  - Generate temporary placeholder resources for supported missing inputs, initially dataset inputs, during install drafts.
  - Allow later remapping from placeholder to real resource and record placeholder provenance.
  - Block placeholder generation for unsupported input types with clear guidance.
  - Docs: [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/).

- [ ] `DMP.30` Source folder tracking (`P1`, `todo`)
  - Create products that track a source project/folder and automatically discover resources on new version creation.
  - Re-sync tracked products to reflect resources added or removed from the source folder, while allowing manual overrides for non-filesystem resources.
  - Block publish when tracked products include resources outside the source folder unless explicitly configured as manual outputs.
  - Docs: [Track a source folder](https://www.palantir.com/docs/foundry/foundry-devops/folder-tracking), [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/).

- [ ] `DMP.31` Store tags and categories (`P1`, `todo`)
  - Configure store-local tag categories, tags, ordering, uniqueness, and permanent deletion semantics.
  - Apply tags to products through new published product versions.
  - Use tags in Marketplace store browsing filters and featured product sections.
  - Docs: [Manage store tags](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-tags), [Browse products](https://www.palantir.com/docs/foundry/marketplace/browse-products).

### Resource-specific packaging coverage

- [ ] `DMP.32` Supported-resource registry (`P1`, `todo`)
  - Maintain a registry of packageable resource types, unsupported resource types, resource-specific packagers, validators, dependency discoverers, and installers.
  - Surface unsupported resources in drafts as publish-blocking errors with bulk drop-all-failed action.
  - Include a non-exhaustive unsupported list such as Data Connection sources, Code Workbook workbooks, and Fusion sheets unless OpenFoundry intentionally diverges.
  - Docs: [Supported resources](https://www.palantir.com/docs/foundry/foundry-devops/supported-resources).

- [ ] `DMP.33` Workshop packaging (`P1`, `todo`)
  - Package Workshop applications, discover object/function/action dependencies, and surface installation parameters from Workshop installation configuration.
  - Support string and Boolean install parameters connected to Workshop variables.
  - Provide packaging error linter integration and block unsupported features such as static/object-backed scenarios where mirroring documented limitations.
  - Docs: [Workshop applications in Marketplace](https://www.palantir.com/docs/foundry/workshop/marketplace-workshop/).

- [ ] `DMP.34` Pipeline Builder packaging (`P1`, `todo`)
  - Package Pipeline Builder pipelines, pipeline parameters, required/optional datasets, required/optional columns, and packaging settings.
  - Provide Marketplace linter warnings for unsupported streaming time-series targets and unsupported parameter types.
  - Build or hydrate installed pipeline datasets during install jobs when build settings require it.
  - Docs: [Pipeline Builder pipelines in Marketplace](https://www.palantir.com/docs/foundry/pipeline-builder/marketplace-pipeline-builder/).

- [ ] `DMP.35` Ontology, Object Views, Actions, Rules, and Automate packaging (`P1`, `todo`)
  - Package object types, link types, action types, Workshop-tab-builder Object Views, Foundry Rules workflows, and Automate automations with dependency discovery.
  - Enforce action type guidance that security/submission criteria reference groups rather than individual users.
  - Enforce automation limitations for saved object sets, non-group recipients, and production-mode automations with action/AIP Logic effects where documented.
  - Docs: [Object Views in Marketplace](https://www.palantir.com/docs/foundry/object-views/marketplace-object-views), [Action types in Marketplace](https://www.palantir.com/docs/foundry/action-types/marketplace-action-types), [Foundry Rules in Marketplace](https://www.palantir.com/docs/foundry/foundry-rules/marketplace/), [Automations in Marketplace](https://www.palantir.com/docs/foundry/automate/marketplace-automate/).

- [ ] `DMP.36` Functions, OSDK, Developer Console, AIP Agent, and model packaging (`P1`, `todo`)
  - Package functions and OSDK-backed functions with ontology dependencies remappable at install time.
  - Package Developer Console applications with install-time parameters for hosted app domains and generated environment/config values.
  - Package AIP Agents except unsupported assist agents, including media set document context with explicit whole-media-set content warnings.
  - Package model resources only according to documented support and limitations, such as output-only models, static/model-with-producer modes, size limits, and unsupported external models.
  - Docs: [Functions in Marketplace](https://www.palantir.com/docs/foundry/functions/marketplace-functions/), [Developer Console applications with Marketplace](https://www.palantir.com/docs/foundry/developer-console/marketplace-installation/), [AIP Agents in Marketplace](https://www.palantir.com/docs/foundry/agent-studio/marketplace), [Modeling resources in Marketplace](https://www.palantir.com/docs/foundry/model-integration/marketplace-models).

### Release management environments

- [ ] `DMP.37` Environment configuration (`P1`, `todo`)
  - Configure suggested release-management environments mapped to spaces, such as Development, Test, and Production.
  - Restrict environment editing to users with owner access to spaces and ensure spaces belong to a single enrollment where required.
  - Display environment order and environment summaries in DevOps.
  - Docs: [Use DevOps for release management](https://www.palantir.com/docs/foundry/devops-release-management/use-devops-for-release-management), [Organizations and spaces](https://www.palantir.com/docs/foundry/security/orgs-and-spaces/).

- [ ] `DMP.38` Environment installation fleet view (`P1`, `todo`)
  - Show products packaged in a store as the development environment and installations across configured spaces/environments.
  - Provide high-level install/upgrade/lock/release-channel status per product and environment.
  - Allow navigation to individual installation pages and environment detail pages.
  - Docs: [Use DevOps for release management](https://www.palantir.com/docs/foundry/devops-release-management/use-devops-for-release-management), [Installations](https://www.palantir.com/docs/foundry/marketplace/installations).

- [ ] `DMP.39` Multi-product installation ordering guidance (`P1`, `todo`)
  - Recommend installing upstream products before downstream products and use linked products to automate input fulfillment where available.
  - Validate that downstream product inputs use resources from the same target environment unless explicitly overridden.
  - Warn about cross-environment input mappings that can break release isolation.
  - Docs: [Use DevOps for release management](https://www.palantir.com/docs/foundry/devops-release-management/use-devops-for-release-management), [Linked products](https://www.palantir.com/docs/foundry/marketplace/linked-products/).

## Milestone C: advanced, cross-enrollment, observability, and governance parity

### Cross-enrollment distribution and Foundry products

- [ ] `DMP.40` Remote stores (`P2`, `todo`)
  - Represent remote stores as read-only local views with Control Panel/admin-configured permissions.
  - Allow browsing and installing products from remote stores while blocking local editing, export, import, tag editing, and recall where documented.
  - Track source enrollment/store metadata and sync status.
  - Docs: [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/), [Browse products](https://www.palantir.com/docs/foundry/marketplace/browse-products).

- [ ] `DMP.41` Export and import product artifacts (`P2`, `todo`)
  - Export selected products from local stores as short-lived transport files with checksum, schema version, provenance, and sensitivity warnings.
  - Import product artifacts into local stores with provenance, recall state retention, compatibility checks, and permission checks.
  - Warn that exported files are not encrypted and may contain sensitive datasets, media, models, names, descriptions, and schemas.
  - Docs: [Export and import products](https://www.palantir.com/docs/foundry/foundry-devops/export-import-products/), [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/).

- [ ] `DMP.42` Foundry products and external orchestrator integration (`P2`, `blocked`)
  - Model cross-enrollment portable products and managed/artifact installation modes only if OpenFoundry has an Apollo-like orchestrator or compatible external deployment system.
  - Provide Control Panel visibility into installation status, last change, organization installations, and debugging for managed products.
  - Clearly mark beta/externally managed capabilities and avoid implying Palantir Apollo management in OpenFoundry-native deployments.
  - Docs: [Foundry products](https://www.palantir.com/docs/foundry/marketplace/foundry-products), [Architecture: AIP, Foundry, and Apollo](https://www.palantir.com/docs/foundry/architecture-center/platforms).

- [ ] `DMP.43` Cross-environment locator and namespace mapping (`P2`, `todo`)
  - Implement API-name/RID/path/coordinate locators for inputs and presets that need to resolve across spaces, ontologies, stores, and enrollments.
  - Validate namespace collisions, object/action/link API-name conflicts, dataset RID availability, and preset unavailability.
  - Provide dry-run installation checks before cross-environment or cross-enrollment install attempts.
  - Docs: [Input presets](https://www.palantir.com/docs/foundry/foundry-devops/input-presets), [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/).

### Advanced safety, governance, and compliance

- [ ] `DMP.44` Product packaging security scan (`P2`, `todo`)
  - Scan product drafts for sensitive data in package content, documentation, screenshots, coordinate names, schemas, media, model artifacts, and changelogs.
  - Block or warn on packaging data that violates markings, export policy, store organization scope, or unredacted secrets.
  - Integrate with approvals for risky publish/export actions.
  - Docs: [Export and import products](https://www.palantir.com/docs/foundry/foundry-devops/export-import-products/), [Manage products](https://www.palantir.com/docs/foundry/foundry-devops/manage-products/), [Markings](https://www.palantir.com/docs/foundry/security/markings/).

- [ ] `DMP.45` Installation safety diff and rollback metadata (`P2`, `todo`)
  - Show upgrade diffs for every installed resource, including destructive changes, input changes, lock-state changes, and build-impact changes.
  - Store rollback/downgrade metadata and compatibility constraints for every installed version.
  - Warn when local edits will be overwritten by upgrade or when unlocked installations are effectively forks.
  - Docs: [Installations](https://www.palantir.com/docs/foundry/marketplace/installations), [Manage products](https://www.palantir.com/docs/foundry/foundry-devops/manage-products/).

- [ ] `DMP.46` Product ownership, provenance, and supply-chain metadata (`P2`, `todo`)
  - Record product authors, approvers, source resources, source versions, code commits, build IDs, dependency graph, validation results, signatures/checksums, and import/export provenance.
  - Expose supply-chain metadata in product detail pages and admin audit views.
  - Verify package integrity during import, install, and upgrade.
  - Docs: [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/), [Export and import products](https://www.palantir.com/docs/foundry/foundry-devops/export-import-products/), [Audit logs overview](https://www.palantir.com/docs/foundry/security/audit-logs-overview).

- [ ] `DMP.47` Export governance and marketplace checkpoints (`P2`, `todo`)
  - Apply export checkpoints and justifications to product export, cross-store import, remote-store publishing, and install into broader organization visibility.
  - Capture product/version/install state, markings, coordinate, inputs, outputs, target location, and justification in export/install provenance.
  - Enforce irreversible delete confirmations and high-risk install warnings.
  - Docs: [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/), [Export and import products](https://www.palantir.com/docs/foundry/foundry-devops/export-import-products/), [Audit logs overview](https://www.palantir.com/docs/foundry/security/audit-logs-overview).

- [ ] `DMP.48` Marketplace permission review and least privilege (`P2`, `todo`)
  - Recommend least-privilege store/project roles for builders, approvers, installers, exporters, importers, and remote-store viewers.
  - Detect overbroad store edit/export permissions, risky marking expansion rights, and owners who can approve their own product versions.
  - Provide review workflows for store permissions and product ownership.
  - Docs: [Manage store permissions](https://www.palantir.com/docs/foundry/foundry-devops/manage-store-permissions/), [Projects and roles](https://www.palantir.com/docs/foundry/security/projects-and-roles).

### Observability, operations, and scale

- [ ] `DMP.49` DevOps and Marketplace metrics (`P2`, `todo`)
  - Track storefront search/views, product installs, install success/failure, upgrade success/failure, automatic upgrade skips, delete failures, validation errors, build usage, and export/import activity.
  - Attribute usage to product, store, installation, project, space, user/service, resource type, and job.
  - Surface fleet-level health dashboards for product builders and platform admins.
  - Docs: [Installations](https://www.palantir.com/docs/foundry/marketplace/installations), [Resource Management usage types](https://www.palantir.com/docs/foundry/resource-management/usage-types).

- [ ] `DMP.50` Installation job resilience (`P2`, `todo`)
  - Support idempotent install/upgrade/delete phases, retry, resume, compensation, partial failure reports, and safe cleanup of orphaned resources.
  - Prevent duplicate resource creation when retried jobs resume after transient failures.
  - Preserve detailed logs and per-resource operation traces for debugging.
  - Docs: [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/), [Installations](https://www.palantir.com/docs/foundry/marketplace/installations).

- [ ] `DMP.51` Product dependency graph and impact analysis (`P2`, `todo`)
  - Visualize dependencies among stores, products, versions, linked products, installed resources, source resources, input mappings, and downstream consumers.
  - Show impact of recalling/deprecating/upgrading products across all installations and environments.
  - Integrate with Workflow Lineage for draft and installed resources.
  - Docs: [Linked products](https://www.palantir.com/docs/foundry/marketplace/linked-products/), [Workflow Lineage getting started](https://www.palantir.com/docs/foundry/workflow-lineage/getting-started).

- [ ] `DMP.52` Product health and notifications (`P2`, `todo`)
  - Notify product owners/installers about publish approvals, validation failures, recalls, new versions, automatic upgrade results, manual-action requirements, delete failures, and broken linked products.
  - Respect email redaction and notification governance when product metadata or resource names are sensitive.
  - Provide in-app notification inbox and webhook/event integrations where locally supported.
  - Docs: [Installations](https://www.palantir.com/docs/foundry/marketplace/installations), [Audit logs overview](https://www.palantir.com/docs/foundry/security/audit-logs-overview).

### Branching, forkability, and developer workflows

- [ ] `DMP.53` DevOps versus Branching guidance (`P2`, `todo`)
  - Explain when users should use DevOps/Marketplace release management versus Global Branching for environment promotion.
  - Support release-management spaces and product installations without conflicting with branch-scoped development workflows.
  - Prevent branch-only resources from being accidentally packaged or installed as production content unless explicitly selected.
  - Docs: [Use DevOps for release management](https://www.palantir.com/docs/foundry/devops-release-management/use-devops-for-release-management), [Foundry Branching overview](https://www.palantir.com/docs/foundry/foundry-branching/overview).

- [ ] `DMP.54` Bootstrap fork workflows (`P2`, `todo`)
  - Treat Bootstrap products as starter content intended for local customization rather than centrally managed production upgrades.
  - Support installation into editable locations, fork provenance, and optional disconnected upgrade warnings.
  - Provide migration path from bootstrap fork to a locally managed product/store where feasible.
  - Docs: [Create a product](https://www.palantir.com/docs/foundry/foundry-devops/create-products/), [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/), [Installations](https://www.palantir.com/docs/foundry/marketplace/installations).

- [ ] `DMP.55` Production mode content locks and source-code editability (`P2`, `todo`)
  - Enforce production-mode content locks to protect automatic upgrades and central maintenance.
  - Handle source-code package editability rules, such as Code Repositories needing source code packaged to be editable after unlock.
  - Warn builders about resource types that remain non-editable even after unlock.
  - Docs: [Installations](https://www.palantir.com/docs/foundry/marketplace/installations), [Install a product](https://www.palantir.com/docs/foundry/marketplace/install-product/).

- [ ] `DMP.56` Developer Console app installation outputs (`P2`, `todo`)
  - Generate install-specific values for hosted app domain, Foundry hostname, npm/pnpm config, environment files, and application config where local Developer Console support exists.
  - Track third-party application ownership, OAuth scopes, service users, and Marketplace installation identity.
  - Validate installed app config after upgrade and revoke stale generated credentials during delete.
  - Docs: [Developer Console applications with Marketplace](https://www.palantir.com/docs/foundry/developer-console/marketplace-installation/), [Third-party applications overview](https://www.palantir.com/docs/foundry/platform-security-third-party/third-party-apps-overview/).

## Implementation inventory checklist

- [ ] `INV.1` Identify existing OpenFoundry project/folder resource model, package/export format, resource manifests, dependency graph, lineage, and resource move/copy primitives.
- [ ] `INV.2` Inventory current store/catalog/application portal capabilities, search/filter/tag UI, featured products, Markdown documentation rendering, image attachment handling, and storefront permissions.
- [ ] `INV.3` Inventory supported resource packagers for datasets, pipelines, ontology entities, actions, functions, Workshop apps, Object Views, Automate, Rules, AIP Agents, models, media sets, apps, dashboards, and code repositories.
- [ ] `INV.4` Inventory unsupported resource types and intentional divergences from documented limitations, including Data Connection sources, Code Workbook workbooks, Fusion sheets, external models, and unsupported Workshop/Automation features.
- [ ] `INV.5` Inventory current build/install job orchestration, async logs, retry/resume/idempotency, partial failure handling, build hydration, and delete/force-delete primitives.
- [ ] `INV.6` Inventory identity, project roles, Marketplace-specific permission operations, organization markings, expand-access/remove-marking checks, approvals, and publish finalization controls.
- [ ] `INV.7` Inventory release-channel, maintenance-window, scheduler, automatic upgrade, lock/unlock, project/folder lock, version recall, deprecation, and downgrade support.
- [ ] `INV.8` Inventory cross-environment locators, API names, namespace mappings, ontology prefixing, preset/default tracking, linked product detection, and store-link dependency discovery.
- [ ] `INV.9` Inventory product export/import security, checksums/signatures, unencrypted artifact handling, sensitive-data scanning, package schema versioning, and cross-enrollment transport support.
- [ ] `INV.10` Inventory audit, Resource Management, usage telemetry, product health, notification, SIEM export, and observability capabilities for install and upgrade jobs.
- [ ] `INV.11` Inventory external orchestrator/Apollo-like support, Foundry products beta equivalence, managed/artifact installation models, and cross-enrollment product management gaps.
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
| `marketplace-store-service` | Store CRUD, local/remote store metadata, tags/categories, featured products, store links, permissions, approval requirements, visibility. |
| `product-registry-service` | Product CRUD, coordinates, drafts, versions, changelogs, documentation snapshots, release-channel tags, deprecation, recall, version comparison. |
| `product-packaging-service` | Output selection, dependency discovery, input contracts, folder tracking, package manifest generation, resource-specific packagers, export artifacts. |
| `product-validation-service` | Packaging validation, resource-specific Marketplace linters, unsupported resource findings, sensitive-data scans, publish blockers, remediation hints. |
| `marketplace-installation-service` | Install drafts, input mapping, presets/defaults, placeholder inputs, content preview, ontology prefixing, install/upgrade/downgrade/delete jobs. |
| `installation-runtime-service` | Idempotent job execution, resource creation/copy/move, build hydration, retry/resume, per-resource logs, compensation, force delete. |
| `release-management-service` | Release channels, automatic upgrades, maintenance windows, environment configuration, fleet views, manual upgrade/downgrade workflows. |
| `linked-product-service` | Linked product discovery, semantic dependencies, store links, input auto-fulfillment, multi-product install ordering, dependency impact analysis. |
| `resource-packager plugins` | Resource-specific package/install adapters for Workshop, Pipeline Builder, Ontology, Actions, Functions, Automate, Rules, AIP Agents, models, Object Views, and apps. |
| `security/governance service` | Store/product/install permissions, organization marking expansion/removal, export checkpoints, approval workflows, audit restrictions, sensitive metadata redaction. |
| `audit-service` | Product audit events, install job events, export/import events, permission decisions, recall/deprecation events, SIEM/dataset delivery. |
| `resource-management service` | Usage attribution for packaging, installs, builds, automatic upgrades, storage, exported artifacts, and storefront activity. |
| `notification-service` | Publish approval notifications, new version banners, automatic upgrade results, install/delete failures, recall alerts, email redaction. |
| `external-orchestrator adapter` | Optional Apollo-like managed installation visibility, cross-enrollment product sync, managed/artifact installation status, debugging metadata. |
| `apps/web` | DevOps builder UI, Marketplace storefront, install wizard, installation pages, environment fleet views, store settings, product details, admin panels. |

## Acceptance criteria for first complete DevOps and Marketplace milestone

- [ ] A builder can create a local Marketplace store in a project/folder, configure permissions, and create a product draft.
- [ ] A builder can add supported resources as outputs, see discovered dependencies as inputs, promote eligible inputs to outputs, and view dependency explanations.
- [ ] A builder can add product documentation, configure installation mode, enable folder structure/build settings, review validation findings, publish a version with a changelog, and see it in Marketplace.
- [ ] A user can browse visible stores/products, inspect versions, overview, changelogs, content, inputs, and recalled/deprecated state.
- [ ] A user can install a product through a guided draft, choose location/ontology/roles, map required inputs, configure input columns or parameters, preview content, prefix ontology entities, review validation, and launch an install job.
- [ ] Installation jobs create resources, record per-resource status, link installed resources to the installation, and provide a completed installation page.
- [ ] A user can configure installation release channel, automatic upgrade preference, maintenance windows, and lock/unlock state where allowed by installation mode.
- [ ] A user can manually upgrade or downgrade to a version, review changes, map newly required inputs, and see local edits overwrite warnings.
- [ ] A user can permanently delete an installation with preview, typed confirmation, per-resource failure report, retry, and force-delete acknowledgement.
- [ ] Store/product/install permissions enforce view, create, edit, install, use-resource-as-input, install-in, export/import, link, approve/finalize, and marking expand/remove requirements.
- [ ] Product versions can be tagged with hierarchical release channels, deprecated, recalled, and excluded from new installs/upgrades after recall.
- [ ] Linked products and input presets can reduce manual input mapping in at least one multi-product workflow.
- [ ] Resource-specific linters block unsupported Workshop, Pipeline Builder, Action, Automate, AIP Agent, model, Object View, Function, or Rules packaging cases with actionable errors.
- [ ] Product packaging, publishing, installation, upgrade, export/import, recall, delete, permission, and marking decisions are audited and visible to qualified administrators.
- [ ] All OpenFoundry runtime UI is OpenFoundry-native and does not use Palantir branding, screenshots, icons, fonts, or proprietary assets.

## Test plan expectations

- Unit tests for product/store CRUD, coordinate validation, product draft state transitions, output/input graph validation, input promotion rules, folder tracking sync, documentation sanitization, release-channel matching, recall/deprecation rules, and installation mode defaults.
- Unit tests for permission checks, organization marking expansion/removal, publish approval routing, input preset/default resolution, cross-environment locator matching, placeholder input generation/remap rules, ontology prefixing, and product export artifact sensitivity warnings.
- Unit tests for resource-specific validators covering Workshop installation parameters/linter errors, Pipeline Builder unsupported parameters and optional columns, Action type user-reference restrictions, Automation recipient/saved-object-set limits, Function/OSDK dependencies, AIP Agent assist-agent exclusions, Object View builder limits, and model packaging limits.
- API tests for stores, tags/categories, store links, products, drafts, outputs, inputs, presets, versions, release channels, recalls, deprecation, installation drafts, jobs, settings, upgrades, downgrades, deletes, export/import, environment configuration, and audit/usage endpoints.
- Integration tests for product packaging from downstream Workshop/Pipeline/Ontology resources, linked product auto-mapping, Marketplace install into a target project/ontology, build hydration, manual upgrade with new inputs, automatic upgrade during maintenance window, version recall exclusion, installation delete with partial failures, and product export/import roundtrip.
- Integration tests for resource-specific packaging across Workshop, Pipeline Builder, Action Types, Automate, Rules, Functions/OSDK, AIP Agents with document context, Model resources, Object Views, Developer Console apps, and Quiver dashboards where locally supported.
- E2E tests for builder creates store/product/version, installer browses/installs, release manager configures development/test/production environments, owner tags Stable release, installation auto-upgrades, installer downgrades, builder recalls bad version, admin exports/imports product, and security admin reviews audit trail.
- Observability tests for install job logs, per-resource statuses, validation finding metrics, automatic upgrade skip reasons, fleet health dashboards, product search/view metrics, usage attribution, audit delivery, notification delivery, and product dependency impact analysis.
- Regression tests proving unauthorized users cannot view stores/products, install into protected locations, use protected resources as inputs, package resources requiring marking expansion/removal without permission, approve their own publish when approval is required, install recalled versions, auto-upgrade when new inputs require manual mapping, edit locked production content, import tampered artifacts, leak sensitive package metadata in coordinates/docs, or delete unrelated resources during installation deletion.
