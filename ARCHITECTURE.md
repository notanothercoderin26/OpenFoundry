# OpenFoundry Architecture

The canonical technical documentation lives in [`docs/`](docs/). This
file is a short top-level overview; for runtime detail follow the
links below.

## Stack at a glance

- **Backend:** Go (single module rooted at `github.com/openfoundry/openfoundry-go`)
  with 42 service binaries under [`services/`](services/) and 33
  shared packages under [`libs/`](libs/). New services are bootstrapped
  from the textual skeleton in
  [`docs/templates/service-skeleton/`](docs/templates/service-skeleton/).
- **Frontend:** React 19 + Vite + TypeScript in [`apps/web/`](apps/web/).
- **Contracts:** Protobuf in [`proto/`](proto/), Go code generated to
  [`libs/proto-gen/`](libs/proto-gen/) via `buf` (run `make gen`).
- **SDKs:** TypeScript / Python / Java in [`sdks/`](sdks/), generated
  from the proto + OpenAPI surface.
- **Storage:** Postgres (CNPG + PgBouncer), Cassandra, Kafka (Strimzi
  + MM2), Iceberg (Lakekeeper), Vespa (search + RAG), Temporal
  (workflow), Ceph S3.
- **Infra:** Helm + ArgoCD + Terraform under [`infra/`](infra/).

For agent-facing onboarding (commands, gotchas, what NOT to read), see
the root [`CLAUDE.md`](CLAUDE.md).

## Service grouping

Services are grouped into Helm releases ("ownership boundaries") rather
than physically merged binaries. The current grouping:

```
                ┌─────────────────────────────┐
                │  apps/web (React 19 + Vite) │
                └──────────────┬──────────────┘
                               │
   ┌───────────────────┬───────┴───────────┬──────────────────────┬─────────────────────┐
   │  of-platform      │  of-data-engine   │  of-ontology         │  of-ml-aip          │
   │  edge-gateway     │  connector-mgmt   │  ontology-definition │  model-catalog      │
   │  identity-fed.    │  ingestion-repl   │  ontology-actions    │  model-deployment   │
   │  authorization    │  dataset-versioni │  ontology-query      │  agent-runtime      │
   │  tenancy-orgs     │  lineage          │  object-database     │  llm-catalog        │
   │                   │  media-sets       │  ontology-indexer*   │  retrieval-context  │
   │                   │  pipeline-build   │                      │  ai-evaluation      │
   │                   │  sql-bi-gateway   │                      │  ai-sink*           │
   └───────────────────┴───────────────────┴──────────────────────┴─────────────────────┘
                               │
                ┌──────────────┴──────────────────────────────────┐
                │  of-apps-ops                                    │
                │  application-composition  notebook-runtime      │
                │  ontology-exploratory     solution-design       │
                │  workflow-automation      notification-alerting │
                │  audit-compliance + audit-sink*                 │
                │  telemetry-governance                           │
                │  federation-product-exchange                    │
                │  code-repository-review   sdk-generation        │
                │  entity-resolution                              │
                └─────────────────────────────────────────────────┘
                               │
   ┌──────────┬───────────┬────┴─────┬─────────┬─────────┬───────────┬─────────────┐
   │ Cassandra│ Postgres  │  Kafka   │ Iceberg │ Vespa   │ Temporal  │ Ceph (S3)   │
   │          │ (CNPG +   │ (Strimzi │ (Lake-  │ (search │ (workflow │ (multisite) │
   │          │  PgBoun)  │  + MM2)  │  keeper)│  + RAG) │  engine)  │             │
   └──────────┴───────────┴──────────┴─────────┴─────────┴───────────┴─────────────┘

   * = Kafka sinks (counted separately from ownership boundaries).
```

The grouping is consolidation by ownership and Helm release, **not** a
claim that the source tree has been physically merged. The ownership
boundaries are defined in
[`docs/architecture/adr/ADR-0030-service-consolidation-30-targets.md`](docs/architecture/adr/ADR-0030-service-consolidation-30-targets.md)
and the per-service status lives in
[`docs/architecture/service-consolidation-map.md`](docs/architecture/service-consolidation-map.md).

## Recommended entry points

- [`docs/index.md`](docs/index.md) — capability-oriented documentation home.
- [`docs/guide/repository-map.md`](docs/guide/repository-map.md) — monorepo layout.
- [`docs/architecture/index.md`](docs/architecture/index.md) — system overview.
- [`docs/architecture/adr/`](docs/architecture/adr/) — numbered, dated decisions.
- [`docs/operations/ci-cd.md`](docs/operations/ci-cd.md) — delivery and automation flows.

## Cross-cutting invariants

These contracts are pinned by tests in `libs/core-models/**/*_test.go`
and must not drift:

- `/healthz` payload shape (`status`, `service`, `version`, `timestamp`).
- JWT claims field names + JSON tags
  ([`libs/auth-middleware/claims.go`](libs/auth-middleware/claims.go)).
- Resource RID format
  (`ri.<service>.<instance>.<type>.<uuid>` for platform-minted resources;
  [`libs/core-models/rid`](libs/core-models/rid) is the shared parser and
  registry-reserving minter).
- Resource type registry
  ([`libs/core-models/resource`](libs/core-models/resource) owns display names,
  owning services, icons, actions, RID namespace mapping, open-app URLs, and
  unknown-type placeholders).
- Compass project resource
  ([`services/tenancy-organizations-service`](services/tenancy-organizations-service)
  owns project RIDs, parent Space RIDs, organization/marking RIDs, default queue
  assignment, resource-level grant toggles, and per-role policies).
- Compass folder resource
  ([`services/tenancy-organizations-service`](services/tenancy-organizations-service)
  owns folder RIDs, project/parent/space RID projection, trash status, and
  folder-scope grant overrides on top of project policy inheritance).
- Compass move/rename
  ([`services/tenancy-organizations-service/internal/workspace`](services/tenancy-organizations-service/internal/workspace)
  updates parentage, names, slugs, and derived breadcrumbs while preserving
  project/folder RIDs; cross-project folder moves require policy/marking
  confirmations).
- Compass search index
  ([`services/tenancy-organizations-service/internal/workspace`](services/tenancy-organizations-service/internal/workspace)
  projects project/folder resources into `compass_resource_search_index` and
  emits `compass.resource.search.updated.v1` outbox events on lifecycle
  mutations so search backends can consume changes without resource-table
  polling).
- Compass search API
  ([`GET /api/v1/compass/search`](services/tenancy-organizations-service/internal/workspace)
  intersects all results with project visibility, accepts text/type/project/
  owner/marking filters, and returns opaque cursor pages ordered by score,
  last-modified time, and RID).
- Compass search UI shell
  ([`apps/web/src/routes/search/SearchPage.tsx`](apps/web/src/routes/search/SearchPage.tsx)
  preserves the Quicksearch-style global shell, combines ontology search with
  permission-aware Compass resource search, loads recents/favorites for
  jump-to mode, shows marking badges, and resolves resource "Open with"
  actions through the frontend resource type registry).
- Compass breadcrumbs
  ([`apps/web/src/lib/components/workspace/ProjectBreadcrumb.tsx`](apps/web/src/lib/components/workspace/ProjectBreadcrumb.tsx)
  builds the standard project/folder path from current resource metadata,
  links every ancestor to its open location, and exposes copy-RID actions for
  project and folder crumbs).
- Dataset RID format `ri.foundry.main.dataset.<uuid-v7>`.
- Transaction state / type tokens (`open|committed|aborted`,
  `snapshot|append|update|delete`).
- Marking source discriminator
  (`{"kind": "direct"}` / `{"kind": "inherited_from_upstream", ...}`).
- Media reference camelCase keys
  (`mediaSetRid`, `mediaItemRid`, `branch`, `schema`).
- Schema field type discriminator
  (`{"type": "DECIMAL", "precision": ..., "scale": ...}`).

## Bounded contexts (deeper reading)

| Domain | Service / library | README |
|---|---|---|
| Identity & federation | `services/identity-federation-service` | [README](services/identity-federation-service/README.md) |
| Authorization (Cedar/ABAC/RBAC) | `services/authorization-policy-service` | [README](services/authorization-policy-service/README.md) |
| Datasets, branches, transactions | `services/dataset-versioning-service` | [README](services/dataset-versioning-service/README.md) |
| Media sets | `services/media-sets-service` | [README](services/media-sets-service/README.md) |
| Ontology kernel (shared) | `libs/ontology-kernel` | [CLAUDE.md](libs/ontology-kernel/CLAUDE.md) |
| AI kernel (shared) | `libs/ai-kernel-go` | [CLAUDE.md](libs/ai-kernel-go/CLAUDE.md) |
| Edge / proxy | `services/edge-gateway-service` | [README](services/edge-gateway-service/README.md) |
| Audit pipeline | `libs/audit-trail`, `services/audit-sink` | [README](services/audit-sink/README.md) |
