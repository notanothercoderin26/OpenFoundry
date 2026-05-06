# ONTOLOGY-KERNEL-MIGRATION — Rust → Go autonomous run

**Branch:** `frontend/settings-mfa-apikeys-sso`
**Working dir Go:** `/Users/torrefacto/Documents/Repositorios/OpenFoundry/openfoundry-go`
**Started:** 2026-05-06
**Mode:** /loop dynamic (self-paced)
**Push policy:** never push, never merge — local commits only

This file is the source of truth between iterations. Every iteration
reads it first, advances ONE coherent slice, runs `go build` + `go vet`
+ `go test -race -count=1` workspace-wide, commits, updates this file,
schedules the next wakeup.

Total Rust source: **32 450 LOC across 76 files** in
`libs/ontology-kernel/src/`.

---

## Architectural decisions pinned at iteration 1

### A1. `pyo3` (Python in-process) — STOP-and-ask carve-out
`libs/ontology-kernel/src/domain/function_runtime.rs` (1 493 LOC) is the
only file that imports `pyo3`. Per the existing migration guardrail
(see `NIGHTLY-SUMMARY.md` §4 / Run 5 §4) pyo3 sidecars are STOP-and-ask
and the loop must NOT decide unilaterally. **Strategy:** port the Go
counterpart as a `function_runtime.go` shell with the same public
surface (types, function signatures) but every entry point returns
`ErrPyo3SidecarPending` until a human picks Phase 5 strategy. This
keeps every other consumer compiling 1:1 while making the deferred
work obvious.

### A2. `storage-abstraction` — inline only what the kernel needs
The Rust crate `libs/storage-abstraction` (4 708 LOC) is a separate
crate with a Go counterpart that is empty. Porting the whole crate is
its own project. **Strategy:** the ontology kernel only depends on the
**repository traits** (`ObjectStore` / `LinkStore` / `ActionLogStore`
/ `DefinitionStore` / `ReadModelStore` / `SearchBackend` /
`ObjectSetMaterializationStore`). Inline a minimal Go counterpart of
those interfaces in
`openfoundry-go/libs/storage-abstraction/repositories/` ahead of the
ontology kernel slices that need them. The S3 / Iceberg / local FS /
signed-url surfaces stay out of scope for this migration.

### A3. `axum` → `chi`, `sqlx` → `pgx`
Same conventions as the rest of the Go workspace: handlers register
on `chi.Router`; data access uses `pgx/v5`. The repository abstraction
above means most kernel code stays storage-agnostic.

### A4. Mocks
`stores/mock.rs` (mockall-generated) ports to a hand-written in-memory
implementation under `stores/inmem/` so the kernel can be tested
without touching infra (mirrors the `Stores::in_memory()` Rust helper).

---

## File inventory (76 files, 32 450 LOC)

Order = recommended port order from leaf (no internal deps) to root
(handlers depending on every domain module). All paths relative to
`libs/ontology-kernel/src/`.

### Tier 0 — package skeleton + leaf models (stand-alone structs)

| # | Rust path | LOC | Status | Notes |
|---|---|---:|---|---|
| 0.0 | `lib.rs` | 60 | ⏳ | `AppState` + module wiring |
| 0.1 | `models/mod.rs` | 18 | ✅ iter1 | covered by `models/doc.go` |
| 0.2 | `models/link_type.rs` | 42 | ✅ iter1 | `models/link_type.go` |
| 0.3 | `models/object_type.rs` | 52 | ✅ iter1 | `models/object_type.go` |
| 0.4 | `models/graph.rs` | 61 | ✅ iter1 | `models/graph.go` |
| 0.5 | `models/shared_property.rs` | 67 | ✅ iter1 | `models/shared_property.go` |
| 0.6 | `models/search.rs` | 73 | ✅ iter1 | `models/search.go` |
| 0.7 | `models/property.rs` | 81 | ✅ iter2 | `models/property.go` (Option<Option<...>> via raw map dispatch) |
| 0.8 | `models/interface.rs` | 91 | ✅ iter2 | `models/interface.go` |
| 0.9 | `models/quiver.rs` | 117 | ✅ iter2 | `models/quiver.go` (`default_chart_kind`, `IntoDraft`, `StringUpdate`) |
| 0.10 | `models/object_set.rs` | 156 | ✅ iter2 | `models/object_set.go` (policy/filters/traversals defaults) |
| 0.11 | `models/submission_criteria.rs` | 173 | ✅ iter2 | `models/submission_criteria.go` (tag="kind"/tag="type" enums) |
| 0.12 | `models/object_type_binding.rs` | 184 | ⏳ | depends on object_type |
| 0.13 | `models/object_view.rs` | 228 | ⏳ | depends on object_type |
| 0.14 | `models/project.rs` | 227 | ⏳ | pure data |
| 0.15 | `models/rule.rs` | 269 | ⏳ | pure data |
| 0.16 | `models/funnel.rs` | 289 | ⏳ | pure data |
| 0.17 | `models/action_type.rs` | 374 | ⏳ | depends on property |
| 0.18 | `models/function_package.rs` | 207 | ⏳ | pure data |
| 0.19 | `models/function_authoring.rs` | 32 | ⏳ | depends on function_package |
| 0.20 | `models/function_metrics.rs` | 74 | ⏳ | pure data |
| 0.21 | `models/constraint.rs` | 0 | ⏳ | empty |

### Tier 1 — config + metrics + storage-abstraction shim

| # | Rust path | LOC | Status | Notes |
|---|---|---:|---|---|
| 1.0 | `config.rs` | 81 | ⏳ | env config |
| 1.1 | `metrics.rs` | 202 | ⏳ | prometheus collectors |
| 1.2 | `storage-abstraction shim` | (new) | ⏳ | trait skeleton in `libs/storage-abstraction/repositories/` |
| 1.3 | `stores/mod.rs` | 70 | ⏳ | `Stores` bag + `InMemory()` |
| 1.4 | `stores/mock.rs` | 200 | ⏳ | hand-written in-memory impls |
| 1.5 | `stores/pg.rs` | 188 | ⏳ | legacy-pg adapters |

### Tier 2 — domain leaves

| # | Rust path | LOC | Status | Notes |
|---|---|---:|---|---|
| 2.0 | `domain/mod.rs` | 24 | ⏳ | re-exports |
| 2.1 | `domain/access.rs` | 55 | ⏳ | access predicates |
| 2.2 | `domain/function_metrics.rs` | 69 | ⏳ | metric helpers |
| 2.3 | `domain/composition.rs` | 122 | ⏳ | inline composition |
| 2.4 | `domain/definition_queries.rs` | 111 | ⏳ | def queries |
| 2.5 | `domain/storage_repository.rs` | 133 | ⏳ | adapters |
| 2.6 | `domain/link_type_repository.rs` | 119 | ⏳ | repo |
| 2.7 | `domain/read_models.rs` | 199 | ⏳ | read-side projections |
| 2.8 | `domain/binding_repository.rs` | 203 | ⏳ | repo |
| 2.9 | `domain/type_system.rs` | 207 | ⏳ | type checking |
| 2.10 | `domain/time_series.rs` | 215 | ⏳ | time-series helpers |
| 2.11 | `domain/object_set_repository.rs` | 217 | ⏳ | repo |
| 2.12 | `domain/writeback.rs` | 246 | ⏳ | writeback hooks |
| 2.13 | `domain/schema.rs` | 253 | ⏳ | schema validation |
| 2.14 | `domain/media_reference_validator.rs` | 281 | ⏳ | media refs |
| 2.15 | `domain/project_access.rs` | 334 | ⏳ | project ACL |
| 2.16 | `domain/media_action_template.rs` | 340 | ⏳ | template builder |
| 2.17 | `domain/sync.rs` | 0 | ⏳ | empty |

### Tier 3 — domain heavy

| # | Rust path | LOC | Status | Notes |
|---|---|---:|---|---|
| 3.0 | `domain/search/mod.rs` | 475 | ⏳ | dispatcher |
| 3.1 | `domain/search/fulltext.rs` | 61 | ⏳ | leaf |
| 3.2 | `domain/search/objects_fulltext.rs` | 116 | ⏳ | leaf |
| 3.3 | `domain/search/semantic.rs` | 348 | ⏳ | knn + embeddings |
| 3.4 | `domain/action_repository.rs` | 446 | ⏳ | action log |
| 3.5 | `domain/object_sets.rs` | 470 | ⏳ | set ops |
| 3.6 | `domain/indexer.rs` | 512 | ⏳ | search indexing |
| 3.7 | `domain/traversal.rs` | 518 | ⏳ | graph traversal |
| 3.8 | `domain/submission_eval.rs` | 557 | ⏳ | submission criteria |
| 3.9 | `domain/pg_repository.rs` | 578 | ⏳ | unified PG |
| 3.10 | `domain/graph.rs` | 622 | ⏳ | graph builder |
| 3.11 | `domain/funnel_repository.rs` | 900 | ⏳ | funnel CRUD |
| 3.12 | `domain/rules.rs` | 1 282 | ⏳ | rules engine |
| 3.13 | `domain/function_runtime.rs` | 1 493 | ⏳ | **pyo3 STOP-and-ask** — port shell only |

### Tier 4 — handlers

| # | Rust path | LOC | Status | Notes |
|---|---|---:|---|---|
| 4.0 | `handlers/mod.rs` | 15 | ⏳ | router glue |
| 4.1 | `handlers/bulk.rs` | 0 | ⏳ | empty |
| 4.2 | `handlers/types.rs` | 268 | ⏳ | object types |
| 4.3 | `handlers/storage.rs` | 439 | ⏳ | storage adapters |
| 4.4 | `handlers/properties.rs` | 457 | ⏳ | properties |
| 4.5 | `handlers/rules.rs` | 470 | ⏳ | rules |
| 4.6 | `handlers/search.rs` | 586 | ⏳ | search |
| 4.7 | `handlers/interfaces.rs` | 590 | ⏳ | interfaces |
| 4.8 | `handlers/links.rs` | 592 | ⏳ | link CRUD |
| 4.9 | `handlers/object_sets.rs` | 709 | ⏳ | set CRUD |
| 4.10 | `handlers/bindings.rs` | 735 | ⏳ | bindings |
| 4.11 | `handlers/functions.rs` | 845 | ⏳ | functions |
| 4.12 | `handlers/projects.rs` | 965 | ⏳ | projects |
| 4.13 | `handlers/funnel.rs` | 1 400 | ⏳ | funnel |
| 4.14 | `handlers/objects.rs` | 3 328 | ⏳ | objects (huge) |
| 4.15 | `handlers/actions.rs` | 5 618 | ⏳ | actions (huge) |
| 4.16 | `handlers/shared_properties.rs` | 311 | ⏳ | shared props |

### Tier 5 — integration tests in `libs/ontology-kernel/tests/`

Out of scope for the 1:1 LOC port. Coverage is replicated via Go
table-driven unit tests inside each ported file.

---

## Wire-compat invariants pinned per slice

### iter 1 — leaf models (link_type / object_type / graph / shared_property / search)
- `LinkType`, `ObjectType` JSON keys + sqlx `db` tags 1:1.
- `ListObjectTypesResponse` envelope `{"data": [...], "total", "page", "per_page"}`.
- `GraphSummary` map keys serialise sorted (matches Rust `BTreeMap`).
- `SearchResult.score_breakdown` and `KnnObjectResult.distance` honour
  Rust's `skip_serializing_if = "Option::is_none"` via `omitempty`.
- `metadata` carries `json.RawMessage` to mirror Rust `serde_json::Value`.

### iter 2 — leaf models (property / interface / quiver / object_set / submission_criteria)
- `PropertyInlineEditConfig.input_name`: `omitempty` honours
  `skip_serializing_if = "Option::is_none"`.
- `UpdatePropertyRequest.inline_edit_config` and
  `UpdateQuiverVisualFunctionRequest.selected_group` carry Rust
  `Option<Option<T>>` three-way semantics (absent / null / value).
  Implemented via custom `UnmarshalJSON` on the parent that does a
  pre-pass over `map[string]json.RawMessage` to spot key presence —
  Go's stdlib decoder bypasses inner `UnmarshalJSON` on JSON `null`
  pointer fields, so detection has to live one level up.
- `default_chart_kind() == "line"`: pinned by `DefaultChartKind` and
  by `QuiverVisualFunctionDraft.UnmarshalJSON` falling back when
  `chart_kind` is absent.
- `CreateQuiverVisualFunctionRequest.IntoDraft()` mirrors the Rust
  `unwrap_or_default` / `unwrap_or_else` chain verbatim.
- `ObjectSetPolicy.allowed_markings` and `CreateObjectSetRequest.{filters,
  traversals, projections}` apply `#[serde(default)]` so missing keys
  decode to `[]` not `null`. `ObjectSetPolicy.MarshalJSON` also forces
  `[]` on encode.
- `ListObjectSetsResponse.next_token` honours `skip_serializing_if =
  "Option::is_none"`.
- `submission_criteria.Operand` (`tag = "kind"`) and
  `SubmissionNode` (`tag = "type"`) enums emit Rust serde shapes
  byte-for-byte (`{"kind": "param", "name": ...}` etc.) via custom
  Marshal/Unmarshal. All 14 `Operator` snake_case tokens pinned.
  `UserAttr` 6 snake_case tokens pinned.

---

## Iteration log

### Iter 1 — 2026-05-06

- Created Go package skeleton at `libs/ontology-kernel/` with `doc.go`
  + `models/doc.go`.
- Ported the smallest standalone leaf models 1:1:
  `link_type.go`, `object_type.go`, `graph.go`, `shared_property.go`,
  `search.go` (~ 295 LOC of Rust → 235 LOC of Go).
- Test file `models/leaves_test.go` pins the wire-compat invariants
  above (6 test cases).
- Workspace `go build ./...`, `go vet ./...`,
  `go test -race -count=1 ./...` all green.
- Decisions A1–A4 pinned in this doc.

**Next iteration target:** continue Tier 0 leaf models —
`property.rs` (81), `interface.rs` (91), `quiver.rs` (117), and as much
of `object_set.rs` (156) / `submission_criteria.rs` (173) as fits in a
single coherent slice without breaking any test.

### Iter 2 — 2026-05-06

- Ported 5 more Tier 0 leaf models 1:1 (~620 LOC Rust → 720 LOC Go):
  `property.go`, `interface.go`, `quiver.go`, `object_set.go`,
  `submission_criteria.go`. 11 / 22 Tier 0 entries done.
- Submission-criteria carries the most subtle wire-compat: tagged enums
  with `tag = "kind"` / `tag = "type"` and 14 + 6 + 4 snake_case enum
  variants pinned against the Rust round-trip test.
- `Option<Option<T>>` three-way pattern landed twice (property +
  quiver) — extracted as the parent-UnmarshalJSON-with-raw-map idiom
  the rest of the kernel will reuse.
- 9 new test cases in `models/iter2_test.go`. Workspace `go build`,
  `go vet`, `go test -race` all green.

**Next iteration target:** finish Tier 0 — `object_type_binding.rs`
(184), `object_view.rs` (228), `project.rs` (227), `rule.rs` (269),
`funnel.rs` (289). Skip `action_type.rs` (374) and
`function_package.rs` (207) for the next-next iteration since they
chain into property / function-runtime concerns.

---

## Decisions deferred for human review

1. **pyo3 sidecar strategy** for `domain/function_runtime.rs` — see A1.
2. **storage-abstraction full port** — only the repository-traits subset
   needed by ontology-kernel is being ported here; the S3/Iceberg/local
   FS surface remains for a separate migration.

---

## Build invariant

After every commit, in `openfoundry-go/`:

```
go build ./... && go vet ./... && go test -race -count=1 ./...
```

If a commit breaks this, the next iteration must revert it before
proceeding.
