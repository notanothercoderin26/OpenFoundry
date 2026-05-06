# MIGRATION-LOOP-STATUS — Rust → Go autonomous run

**Branch:** `frontend/settings-mfa-apikeys-sso`
**Working dir:** `/Users/torrefacto/Documents/Repositorios/OpenFoundry`
**Started:** 2026-05-06
**Mode:** /loop dynamic (self-paced)
**Push policy:** never push, never merge — local commits only

This file is the source of truth between iterations. Every iteration
reads it first, advances ONE coherent slice, runs `go build` + `go vet`
+ `go test` workspace-wide, commits, updates this file, schedules the
next wakeup.

---

## Discovery (iteration 1, 2026-05-06)

The original audit underestimated done-state. After cross-checking
files vs. NIGHTLY-SUMMARY claims:

- `libs/ml-kernel-go/domain/interop` — **already ported** (844 LOC + 327 LOC tests). `domain/interop/interop.go` mirrors `libs/ml-kernel/src/domain/interop.rs` 1:1, tests green. **Committed** as `2541be78`.
- `libs/ml-kernel-go/domain/training/{runner,execute,hyperparameter}` — **already ported** (~828 LOC + tests). `CreateTrainingJob` handler is fully wired (no longer a 501 stub). **Committed** as `069c3e9a`.
- `libs/ai-kernel-go/domain/llm/runtime.go` — **freshly ported** in this run (644 LOC + 342 LOC tests). Uncommitted at iter-1 close.

Stubs that were claimed pending but are now real production code:
- `handlers/training.CreateTrainingJob` ✅ live
- `handlers/models.CreateModelVersion` ✅ live (chains interop)

---

## True remaining work

### P1 — Unblock 8 AI/ML services (✅ FULLY COMPLETE 2026-05-06)

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1.1 | port `libs/ml-kernel-go/domain/interop` | ✅ done | `2541be78` |
| 1.2 | port `libs/ai-kernel-go/domain/llm/runtime` | ✅ done | `fa09208e` + `ecf9e28d` |
| 1.2b.1 | wire `handlers/chat.BenchmarkProviders` | ✅ done | `40801e9b` |
| 1.2b.2 | wire `handlers/chat.AskCopilot` | ✅ done | `24e751f4` |
| 1.2b.3 | wire `handlers/chat.CreateChatCompletion` | ✅ done | `9c8bd0be` |
| 1.3 | port `libs/ai-kernel-go/domain/agents/executor` + wire `ExecuteAgent` | ✅ done | `ed46de5b` |
| 1.4 | port `libs/ml-kernel-go/training/{runner,execute}` | ✅ done | `069c3e9a` |
| 1.5 | wire `handlers/experiments.{ListRuns,CreateRun,UpdateRun,CompareRuns}` | ✅ done | parallel iter (`runs.go` 352 LOC) |
| 1.6 | wire `handlers/experiments.GetExperimentAssetLineage` | ✅ done | parallel iter (`asset_lineage.go` 566 LOC) |

**Net result:** 0 of 8 chat/agents/experiments 501 stubs remain. All
8 ai/ml services unblocked at the handler layer.

### P2 — Phase 4 (Data & Ontology)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.5 | complete `libs/cassandra-kernel` with gocql | ✅ done | 5 stores ported (Object/Link/Schema/Session/ActionLog) — commits `cf324045..f95f700c`. Includes new `libs/storage-abstraction` (repositories interfaces). ~3500 LOC + 60+ unit tests across 6 slices. |
| 2.6a | port `libs/state-machine` | ✅ done | commit `b1b9f73a` (282 LOC + 12 tests) |
| 2.6b | port `libs/scheduling-cron` | ⏳ pending | currently 0 files. Rust source 1381 LOC across 7 files. Gating cron lib for workflow-automation + reindex-coordinator. |
| 2.6c | port `libs/saga` | ⏳ pending | currently 0 files. Rust source 1591 LOC across 3 files. Gates workflow-automation saga consumer. |
| 2.6d | port `libs/search-abstraction` | ⏳ pending | currently 0 files. Rust source 1465 LOC across 4 files. Vespa/OpenSearch backend traits + index/search/vector surfaces — paired with the `ObjectSet*` and `SearchBackend` types deferred from P2.5.1. |

### P3 — Identity / Authz follow-ups

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.7a | identity-federation slice 5b (SAML 2.0 + XML signing) | ⏳ pending | crewjam/saml + russellhaering/goxmldsig; needs IdP test certs + metadata fixtures |
| 3.7b | identity-federation slice 8 (Cedar + JWKS + Vault + SCIM) | ⏳ pending | cedar-go Option A chosen 2026-05-06; port `libs/authz-cedar-go` first as de-risking step |

### P4 — Phase 5 decision (HUMAN INPUT REQUIRED)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.8 | go/no-go on pyo3 sidecars | ⏸ blocked-on-human | services: notebook-runtime, pipeline-build, ontology-actions. Loop must NOT decide unilaterally. |

### P5 — Hygiene

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.9 | CI job runs `buf generate` and fails on dirty tree | ⏳ pending | guards proto drift since `openfoundry-go/proto/` is empty (consumes Rust proto/ via buf) |
| 5.10 | refresh `openfoundry-go/README.md` and `INVENTORY-PHASE6.md` | ⏳ pending | both lag the actual state; README still describes Phase 0 |
| 5.11 | decide on the 16 empty lib dirs | ⏸ blocked-on-human | options: delete, or add doc.go with TODO. Sub-decision per lib. |

---

## Iteration log

### Iter 1 — 2026-05-06 (this run)

- Audited the 16 empty libs and 9 real 501 stubs.
- Confirmed P1.1, P1.4 already done (commits `2541be78`, `069c3e9a`).
- Found a fresh full port of `libs/ai-kernel-go/domain/llm/runtime.go` (644 LOC + 342 LOC tests) on disk, uncommitted.
- Verified build + vet + race tests green workspace-wide.
- Created this file.

**Next action (iter 2):** commit the runtime port, then start wiring `handlers/chat.CreateChatCompletion`.

### Iter 2 — 2026-05-06 (later)

User asked to keep going on P2.5 cassandra-kernel after waking up.
6 commits, all on `frontend/settings-mfa-apikeys-sso`, never pushed:

| # | Commit    | Slice                                                |
|---|-----------|------------------------------------------------------|
| 1 | `cf324045`| storage-abstraction repositories interfaces          |
| 2 | `002bbb73`| cassandra-kernel ObjectStore + prepared statements   |
| 3 | `844084ec`| cassandra-kernel LinkStore                           |
| 4 | `c5c181be`| cassandra-kernel SchemaStore + SessionStore          |
| 5 | `f95f700c`| cassandra-kernel ActionLogStore (closes P2.5)        |

Discoveries:
- The audit estimate of "50-100 LOC pending" for cassandra-kernel
  was way off — repos.rs alone was 2.7k LOC across 5 stores. The
  actual ports landed ~3500 LOC of Go (incl. 60+ unit tests).
- storage-abstraction was empty in Go — needed to port the
  interface surface (repositories.go) before any cassandra-kernel
  store could compile. P2.5.1 was a hidden prereq.
- All 5 stores satisfy their repos.* interfaces with compile-time
  `var _ repos.X = ...` pins. Network-bound integration tests
  land with object-database when it wires Cassandra.

**Next action (iter 3):** pick from P2.6b/c/d (scheduling-cron /
saga / search-abstraction). Each is 1.4-1.6k LOC of Rust → its
own multi-iteration slice. Start with scheduling-cron (smallest).

---

## Wire-compat invariants pinned in this loop run

(filled per iteration — empty for now since no new commits yet this run)

---

## Decisions deferred for human review

1. **Phase 5 pyo3 sidecars** — go/no-go decision still required.
2. **16 empty lib dirs** — delete or stub with doc.go? Per-lib decision.
3. **Audit-sink + ai-sink Iceberg writer** (existing deferral from Run 2) — wait for iceberg-go ≥1.0.

---

## Build invariant

After every commit, this command must succeed in `openfoundry-go/`:

```
go build ./... && go vet ./... && go test -race -count=1 ./...
```

If a commit breaks this, the next iteration must revert it before
proceeding.
