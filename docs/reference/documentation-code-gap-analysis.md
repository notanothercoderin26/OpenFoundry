# Documentation vs Code Gap Analysis

This page is a code-first audit of technical documentation drift. The rule for this repository is: **documentation follows the code; code is never changed just to satisfy stale documentation**.

## Audit Snapshot

The snapshot below was produced from the working tree, not from older roadmap text:

| Evidence | Current code value | Documentation impact |
| --- | ---: | --- |
| `find services -mindepth 1 -maxdepth 1 -type d` | 50 service directories | Any page claiming 42 service binaries or omitting the newest placeholders is stale. |
| `find libs -mindepth 1 -maxdepth 1 -type d` | 36 library directories | Any page claiming 33 shared libraries is stale. |
| `find proto -mindepth 1 -maxdepth 1 -type d` | 23 protobuf domains | Contract docs should describe these proto domains as the source of truth. |
| `services/edge-gateway-service/internal/proxy/router_table.go` | Gateway route ownership is prefix-based and alias-driven | Public-route docs must follow the router table, not inferred service names. |
| `services/edge-gateway-service/internal/config/config.go` + `services/*/internal/config/config.go` + `services/*/config.yaml` | Several gateway aliases intentionally point at consolidated owners instead of same-named placeholder services | Port and route docs must distinguish “binary exists” from “gateway default routes traffic there.” |

## High-Priority Gaps Found

### 1. Service inventory was behind the repository

`docs/reference/repository-layout.md` said `services/` contained 42 Go microservice binaries. The code currently has 50 service directories. The missing or incorrectly described services were:

- `action-log-sink`
- `cipher-service`
- `function-runtime-service`
- `global-branch-service`
- `iceberg-object-indexer`
- `knowledge-index-service`
- `network-boundary-service`
- `report-service`

Important nuance: several of these are real binaries but still placeholders or alias targets in flux. The docs must say that explicitly instead of deleting them from the inventory.

### 2. Shared-library count was stale

`docs/reference/repository-layout.md` claimed 33 cross-cutting Go packages. The current `libs/` directory has 36. The missing library names were:

- `pipeline-plan`
- `pipeline-runtime`
- `restrictedview`

### 3. Port tables mixed historical defaults with current code defaults

`docs/architecture/services-and-ports.md` had several default ports that no longer matched service config or gateway defaults. Examples fixed in this pass:

| Service | Stale doc value | Current code value / nuance |
| --- | --- | --- |
| `authorization-policy-service` | `50115` | `50093` |
| `ingestion-replication-service` | `50120` | `50090` |
| `dataset-versioning-service` | `50117` | `50078` |
| `media-sets-service` | `50121` / `50122` | `50156` / `50157` |
| `ontology-definition-service` | `50122` | `50103` |
| `application-composition-service` | `50118` | `50140` |
| `federation-product-exchange-service` | `50126` | `50120` |
| `iceberg-catalog-service` | `8197` only | service config defaults to `50118`; gateway `config.yaml` may point to `8197` |

### 4. Gateway alias docs treated old placeholder ports as live route targets

The gateway keeps legacy upstream fields for Helm/strangler compatibility, but the code defaults often point those fields at surviving consolidated owners. Examples:

- `security_governance_service_url`, `cipher_service_url`, `network_boundary_service_url`, and `checkpoints_purpose_service_url` default to `authorization-policy-service` on `50093` in code defaults.
- `data_asset_catalog_service_url` and `dataset_quality_service_url` default to `dataset-versioning-service` on `50078`.
- `application_curation_service_url` and app-builder routes default to `application-composition-service` on `50140`.
- `report_service_url` defaults to `notebook-runtime-service` on `50134`, even though `report-service` now exists as a placeholder binary.
- `global_branch_service_url` defaults to `code-repository-review-service` on `50155`, even though `global-branch-service` now exists as a skeleton binary.

This means docs must present two separate facts:

1. the filesystem/binary inventory under `services/`; and
2. the gateway's current default route target.

### 5. Route ownership had at least one stale ontology entry

The docs said `/api/v1/ontology/types/{id}/objects/query` belonged to `ontology-query-service`. The router table sends broad object-instance paths, including object query paths under `/api/v1/ontology/types/*/objects`, to `object-database-service`; KNN remains on `ontology-query-service`.

### 6. Operations docs still contain at least one stale command family

`docs/operations/deployment-modes.md` still names `just infra-up` and `just dev-stack`, but the current `justfile` only delegates to Makefile targets and does not define those recipes. That page should be corrected in a follow-up to use the active Compose commands from `docs/guide/local-development.md` and the current `just --list` output.

## Code-First Documentation Policy

When updating docs, use this precedence order:

1. **Router ownership:** `services/edge-gateway-service/internal/proxy/router_table.go`.
2. **Gateway defaults:** `services/edge-gateway-service/internal/config/config.go` and `services/edge-gateway-service/config.yaml`.
3. **Service default ports:** `services/<service>/internal/config/config.go`; for koanf-based skeleton services, `services/<service>/config.yaml`.
4. **Service role and readiness:** service-local `README.md`, `NOT_IMPLEMENTED_AUDIT.md`, and tests.
5. **Repository inventory:** `find services`, `find libs`, `find proto`, and checked-in package manifests.
6. **Roadmaps/migration checklists:** only after the current code has been verified.

## Follow-Up Work Recommended

- Add a small docs drift checker that fails when repository-layout counts disagree with `services/`, `libs/`, or `proto/`.
- Generate the service inventory table from service-local metadata where possible.
- Add a route-doc check that compares documented gateway route examples against `router_table.go` test fixtures.
- Review `docs/operations/deployment-modes.md` and any runbook mentioning `just infra-up`, `just dev-stack`, or historical service names.
- Review migration checklists that state “green” test commands from old commits; those should be dated or converted into current verification instructions.
