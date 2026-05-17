# Restricted views and data controls

> **Sensitive admin surface.** Restricted views and row-level policies are
> mandatory access controls — misconfiguration leaks data. Read the
> [Security overview](./security-overview.md) for how restricted views
> compose with markings and scoped sessions, and the
> [Shared responsibility model](./shared-responsibility-model.md) for
> who is allowed to define and approve policies. Anything modeled on a
> Foundry concept must follow the
> [Foundry public-docs parity policy](../reference/foundry-public-docs-parity-policy.md).

Data protection in OpenFoundry is not only about authentication. It also needs controlled projections of data for different audiences and contexts.

## Repository signals

`identity-federation-service` owns restricted-view resource CRUD while
`authorization-policy-service` owns the operation catalog and policy
evaluation surface:

- `services/identity-federation-service/internal/handlers/restricted_views.go` — dataset-backed CRUD, build, transaction listing, transform-input checks, and backend policy validation
- `services/identity-federation-service/internal/models/restricted_view.go` — backing dataset, project/folder placement, owners, policy, assumed markings, transactions, and output/view metadata
- `services/authorization-policy-service/internal/repo/migrations/0014_sg19_restricted_view_operations.sql` — granular operations for create-resource, create-for-dataset, read/edit policy, view transaction, build, read, and manage
- `apps/web/src/routes/control-panel/RestrictedViewsPage.tsx` — Control Panel admin UI for restricted-view resources
- `apps/web/src/lib/components/restricted-views/GranularPolicyEditor.tsx` — structured granular policy editor for user attributes, user/group/org IDs, columns, constants, arrays, logical groups, and comparison operators
- `libs/restrictedview/policy.go` — shared runtime evaluator for dataset previews, SQL/BI query rewrite, ontology/object API reads, and ABAC explain responses
- `services/identity-federation-service/internal/repo/migrations/0015_sg22_marking_backed_restricted_views.sql` — persisted `marking_columns` metadata for marking-backed restricted views
- `services/ontology-definition-service/internal/repo/migrations/0003_sg23_restricted_view_backed_object_types.sql` — object type datasource metadata, restricted-view policy versions, and Object Storage V1 registration/index state
- `services/object-database-service/internal/handlers/object_type_policies.go` — runtime resolver that loads object type restricted-view backing metadata and applies the inherited row policy to object reads

These signals suggest that OpenFoundry is already moving toward a layered data-protection model rather than a simple binary allow/deny gate.

At the data plane the decision runs in-process via the shared
restricted-view evaluator. The evaluator receives the view policy plus
the caller's current JWT claims and evaluates:

- dynamic `granular_policy` rules over user attributes, group IDs,
  organization IDs, user IDs, row columns, constants, arrays, and
  logical `and`/`or` groups
- marking membership and row marking requirements where the row exposes
  `marking`, `markings`, `required_markings`, or related marking fields
- explicit marking-backed restricted-view columns configured through
  `marking_columns` or annotated with `marking_type.mandatory`; these
  must be `ARRAY<STRING>` columns containing marking or organization
  UUIDs, and the caller must satisfy every ID in the row
- allowed organization boundaries and scoped-session
  `restricted_view_ids`
- guest and consumer-mode state

Dataset previews filter/redact rows before the preview response,
Flight SQL rewrites eligible `SELECT` statements with the compiled
predicate, including subset predicates for configured marking-backed
columns, and ontology/object list/query/get APIs filter object rows
before returning data to Object Explorer or API consumers. See
[Policy bundles in-process](./policy-bundles.md) for how policy bundles
reach services that need local enforcement.

Marking-backed views validate their input schema before save/build.
OpenFoundry accepts one or more configured marking columns, recognizes
the `marking_type.mandatory` dataset typeclass as a UI/schema hint, and
rejects unsupported scalar columns or non-UUID row requirements for the
explicit marking-backed mode. Legacy non-SG.22 policies can still use
named `allowed_markings` such as `public`, `confidential`, and `pii`.

## Ontology object types backed by restricted views

Ontology object types can use a restricted view as their backing
datasource. The object type stores `backing_datasource_type =
restricted_view`, the restricted view identifier, the policy JSON, and
policy / registered / indexed version counters. Object Database resolves
that metadata before object list, get, and query responses, then filters
object rows through the same `libs/restrictedview` evaluator used by
dataset previews and Flight SQL.

Datasource edits are permissioned separately from object metadata:
callers need ontology manager permission, object datasource manage
permission, dataset read permission, restricted-view read and policy
read permissions, plus restricted-view policy edit permission when the
policy JSON changes. At read time, restricted-view-backed object reads
fail closed unless the caller has `restricted_view:read` and
`object_type_datasource:read` (or a managing equivalent).

For local / Object Storage V1 style modes, policy changes carry
propagation state. If the current policy version is newer than the
registered or indexed version, the object type reports
`requires_reregistration` / `requires_reindex` warnings so Object
Explorer and downstream applications do not silently rely on stale
row-level policy state. Remote / Object Storage V2 style reads apply the
latest policy automatically at request time.

Restricted-view transaction history records policy and output changes.
It does **not** reconstruct historical user attributes, group
membership, marking membership, or scoped-session state by itself; that
requires an explicit identity snapshot extension if OpenFoundry needs
forensic replay of historical per-user visibility.

Pipeline Builder rejects restricted views as transform inputs through
`PipelineIR.Validate`. This mirrors Foundry's reproducibility constraint:
restricted-view rows depend on session-time policy evaluation, so using
them as build inputs would make outputs depend on who launched the build
rather than only on stable source data and code.

## Why this matters

Restricted views are especially useful for:

- regulated or marked datasets
- tenant-aware operational data
- partial exposure to external partners
- object-level and field-level semantics in ontology-driven apps
