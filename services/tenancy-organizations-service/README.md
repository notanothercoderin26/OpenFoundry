# tenancy-organizations-service

Owns organizations, workspace enrollments, Compass project/folder resources,
sharing, trash, favorites, and the resource-resolve / resource-ops helpers.

## Service surface

Endpoints (all under `/api/v1`, JWT-protected):

- `GET    /organizations`            — list (200 most-recent)
- `POST   /organizations`            — create
- `GET    /organizations/{id}`       — fetch
- `PATCH  /organizations/{id}`       — partial update
- `DELETE /organizations/{id}`       — delete
- `GET    /organizations/{id}/enrollments` — list enrollments for an org
- `POST   /enrollments`              — create
- `DELETE /enrollments/{id}`         — delete
- `GET|POST /projects/{id-or-rid}/folders` — list/create nested folder resources
- `POST /workspace/resources/{kind}/{id}/move|rename` — RID-preserving resource operations
- `GET    /compass/search`           — permission-aware Compass resource search over project/folder index entries

Plus the standard `/healthz` + `/metrics` foundation surface.

The schema lives at
`internal/repo/migrations/0001_tenancy_organizations_foundation.sql`.

## Configuration

| Env var                   | Required | Default  |
|---------------------------|----------|----------|
| `DATABASE_URL`            | yes      | —        |
| `OPENFOUNDRY_JWT_SECRET` / `JWT_SECRET` | yes      | —        |
| `HOST`                    | no       | `0.0.0.0`|
| `PORT`                    | no       | `50113`  |
| `METRICS_ADDR`            | no       | `0.0.0.0:9090` |
| `SERVICE_VERSION`         | no       | `dev`    |

## Folder resource contract

Folders are persisted in `ontology_project_folders` and exposed as Compass
`FOLDER` resources. Each row carries a stable `rid`; responses project the
owning `project_rid`, `parent_folder_rid`, `space_rid`, trash status, and
policy-inheritance flags. Create requests accept legacy `parent_folder_id`
or canonical `parent_folder_rid`; folder access inherits project policies and
uses folder-scope resource grants for explicit overrides.

## Move / rename contract

Workspace move and rename operations preserve project/folder RIDs. Folder
rename updates both `name` and `slug`, so breadcrumbs derived from project and
folder paths refresh without link churn. Folder moves update parentage; when a
folder subtree crosses projects, the caller must confirm access-policy changes,
the target project must be marking-compatible, and compatible marking changes
must be explicitly confirmed.

## Search index contract

Project and folder lifecycle writes maintain `compass_resource_search_index`
inside the same database transaction. Each entry is keyed by immutable RID and
carries type, display name, owning project, organization RIDs, marking RIDs,
last modified time, owner, tags, summary, open URL, and trash state. The same
transaction emits `compass.resource.search.updated.v1` via `outbox.events`, so
future Vespa/OpenSearch indexers can subscribe to resource changes without
polling project or folder tables.

`GET /api/v1/compass/search` reads that projection with permission-aware
filters. Supported query parameters are `q`, `type`, `project` (UUID or
Compass project RID), `owner`, repeated `marking`, `limit` (capped at 200),
and opaque `cursor`. Results are ordered by text score, `last_modified_at`
descending, and RID ascending.

The web Quicksearch shell consumes this endpoint alongside ontology search:
resource rows surface the immutable RID, type, owning project, marking badges,
and `open_url`, while the frontend resource type registry controls display
labels, icons, and "Open with" targets.

## Follow-up slices (deferred)

- Spaces (`tenancy_workspaces` table) — Rust migration `0002`
- Projects (`tenancy_projects` table)
- Sharing rules + invitations
- Trash + favorites + recents
- `resource_resolve` / `resource_ops` helpers (cross-service RID lookup)

These are tracked under todos and the archived inventory at
`docs/archive/INVENTORY-tenancy-organizations-service.md`.

## Build / test

```sh
cd openfoundry-go
go build ./services/tenancy-organizations-service/...
go test -race ./services/tenancy-organizations-service/...
```
