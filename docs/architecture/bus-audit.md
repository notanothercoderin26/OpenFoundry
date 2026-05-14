# Bus audit — archived

> **Status**: Historical document. The original audit (2026-04-29)
> reviewed `Cargo.toml` and `.rs` files looking for `event-bus-data`
> usage with control-plane semantics. After the Rust→Go port, the
> `Cargo.toml` files, the `.rs` sources, the `tools/bus-lint/check_bus.py`
> lint, and the `.github/bus-allowlist.yaml` allowlist **no longer exist**
> in the tree, so the methodology is not reproducible and the verdict
> (*"0 services migrating"*) is not actionable.
>
> The full content is preserved in
> [`docs/archive/bus-audit-2026-04-29.md`](../archive/bus-audit-2026-04-29.md)
> as a historical reference for the validation process.

To understand the current control-vs-data contract:

- [`libs/event-bus-control/CLAUDE.md`](../../libs/event-bus-control/CLAUDE.md)
  — control plane (NATS JetStream), usage, conventions.
- [`libs/event-bus-data/CLAUDE.md`](../../libs/event-bus-data/CLAUDE.md)
  — data plane (Kafka), at-least-once semantics, OpenLineage headers.
- [`docs/architecture/runtime-topology.md` §"Control Plane vs Data Plane"](./runtime-topology.md#control-plane-vs-data-plane-event-bus-split)
  — combined view in the topology.
- [ADR-0011 — Control vs Data bus contract](./adr/ADR-0011-control-vs-data-bus-contract.md)
  — decision that formalises the split.
- [ADR-0012 — Data-plane SLOs, SLIs and error budgets](./adr/ADR-0012-data-plane-slos.md)
  — latency and retention budgets.

If you need to re-run an equivalent audit against the current Go
codebase, the grep is simply:

```sh
grep -rl 'libs/event-bus-control\|libs/event-bus-data' services/ libs/
```

…and classify the hits by the semantics of the emitted event. The
corresponding Go-native lint has not been reintroduced (the retired
gates are listed in the root `CLAUDE.md`, *"Removed CI gates (no Go
replacement yet)"*).
