# Datasets — Transactions

> Mirror of the Foundry "Transactions" concept, adapted to the
> OpenFoundry implementation. Every write to a dataset goes through a
> transaction; reads see only the post-commit view.

## Lifecycle

A transaction lives in one of three states:

```
        OPEN ──┬── commit ──▶ COMMITTED
               └── abort  ──▶ ABORTED
```

* **`OPEN`** — created with `POST /v1/datasets/{rid}/branches/{branch}/transactions`. The branch may have **at most one** OPEN transaction at any time (enforced by a unique partial index on `dataset_transactions`); a second `POST` while one is OPEN responds `409 Conflict`.
* **`COMMITTED`** — produced by `POST .../transactions/{txn}:commit` after the domain validator (`internal/domain/transactions`) accepts the staged ops. The branch's `head_transaction_id` advances atomically.
* **`ABORTED`** — produced by `POST .../transactions/{txn}:abort`. The staged file paths remain on object storage until the lineage-deletion subsystem in `audit-compliance-service` reaps them under the `DELETE_ABORTED_TRANSACTIONS` retention policy.

## Transaction types

| Type       | What may be staged                                                              | What it produces in the new view |
| ---------- | ------------------------------------------------------------------------------- | -------------------------------- |
| `SNAPSHOT` | Only `ADD` ops. The view is **replaced wholesale** at commit.                   | A fresh view of just these files |
| `APPEND`   | Only `ADD` ops, and none of them may overwrite a path already in the view.      | Previous view ∪ added files       |
| `UPDATE`   | `ADD` and `REMOVE` ops. May add new paths and may remove paths from the view.   | Previous view minus removes ∪ adds |
| `DELETE`   | Only `REMOVE` ops.                                                              | Previous view minus removes       |

These constraints are enforced at commit time inside the `internal/domain/transactions` package. Violations short-circuit with structured 4xx errors (see [`services/dataset-versioning-service/internal/handlers/transactions.go`](../../../services/dataset-versioning-service/internal/handlers/transactions.go) and the invariants test in `internal/repo/transaction_invariants_test.go`).

## Endpoints

| Method | Path                                                                       | Purpose                          |
| ------ | -------------------------------------------------------------------------- | -------------------------------- |
| POST   | `/v1/datasets/{rid}/branches/{branch}/transactions`                        | Open a transaction               |
| GET    | `/v1/datasets/{rid}/branches/{branch}/transactions/{txn}`                  | Inspect a transaction            |
| POST   | `/v1/datasets/{rid}/branches/{branch}/transactions/{txn}:commit`           | Commit                           |
| POST   | `/v1/datasets/{rid}/branches/{branch}/transactions/{txn}:abort`            | Abort                            |

Request body for **open**:

```json
{
  "type": "APPEND",
  "summary": "ingest 2026-05-12",
  "providence": { "source": "kafka.topic.x", "offsets": { "0": 4123 } }
}
```

The `providence` object is an opaque JSON blob persisted alongside the transaction; pipelines use it to record their input pointers so re-runs can be idempotent.

## Authorization

All four mutation endpoints require the caller's claims to carry the `dataset.write` permission (admin role bypasses). See [security-governance/dataset-access-control.md](../../security-governance/index.md) for the wider policy story. Failed checks emit `dataset_rbac_denials_total{operation=…}` and a structured `*.denied` audit record.

## Observability

| Metric                                              | Type      | Labels       | When it moves                              |
| --------------------------------------------------- | --------- | ------------ | ------------------------------------------ |
| `dataset_transactions_open`                         | gauge     | rid, branch  | inc on open, dec on commit/abort           |
| `dataset_transactions_committed_total`              | counter   | type         | inc on each successful commit               |
| `dataset_transactions_aborted_total`                | counter   | —            | inc on each abort                          |
| `dataset_view_compute_duration_seconds`             | histogram | —            | wall-clock to compose a branch's view       |
| `dataset_tx_total`                                  | counter   | action       | bumps for `open|commit|abort`               |

Audit actions emitted to `target = "audit"`:

* `transaction.open`
* `transaction.commit`
* `transaction.abort`
* `transaction.commit.denied` / `transaction.abort.denied` / `transaction.open.denied` (RBAC failures)

Each audit record carries `actor`, `dataset_rid`, `branch`, `transaction_id`, and `tx_type`.

## See also

* [branching.md](./branching.md) — the parent abstraction over which transactions are scoped.
* [retention.md](./retention.md) — how aborted-transaction files are reaped.
