# Policy bundles in-process

> Distribution and evaluation pattern for authorization policies across
> OpenFoundry's Go services. **This page is purely documentary: it does not
> rewrite any existing service.** Its goal is to pin down the contract for the
> "policy bundle in-process" pattern before any service adopts it.

## Why this pattern

Authorization policies (RBAC + ABAC + restricted views, see
[`/security-governance/policies-and-authorization`](./policies-and-authorization.md)
and [`/security-governance/abac-and-cbac-model/`](./abac-and-cbac-model/)) must
be evaluated on the **hot path** of every read/write over objects, queries, and
actions. A central PDP (Policy Decision Point) reached over RPC on every
request introduces:

- additional synchronous latency on every data operation,
- a **single point of failure** that cuts across the entire platform,
- operational coupling between the data services and the
  `authorization-policy-service`.

For that reason we fix the following architectural rule:

> **There is no central PDP on the hot path.** Each service evaluates policies
> _in-process_ against a versioned, signed *bundle* delivered out of band.

This rule extends the control-plane / data-plane separation formalized in
[`docs/architecture/adr/ADR-0011-control-vs-data-bus-contract.md`](../architecture/adr/ADR-0011-control-vs-data-bus-contract.md):
policy **decisions** are data-plane (each service runs them over its own
data), while policy **updates** travel on the control-plane (NATS JetStream,
`libs/event-bus-control`).

## Publisher: `authorization-policy-service`

Responsible for compiling, signing, and publishing the platform's canonical
*policy bundle*. The service lives at `/services/authorization-policy-service`
and is one of the _governance & semantics_ services documented in
[`docs/architecture/runtime-topology.md`](../architecture/runtime-topology.md)
(§ "Layered service map"). Its internal Cedar engine uses the
`libs/authz-cedar-go` library.

> Earlier versions of this page mentioned a separate `ontology-security-service`
> as the bundle publisher. That binary does not exist; the capability is
> consolidated inside `authorization-policy-service`.

Publisher contract:

1. **Compilation.** `authorization-policy-service` takes as input the policies
   it manages itself (CRUD endpoints in
   `services/authorization-policy-service/internal/handlers/`, cited in
   [`policies-and-authorization`](./policies-and-authorization.md)) along with
   the restricted views, and produces an immutable declarative *bundle*.
2. **Versioning.** Each bundle receives a monotonic identifier
   (`bundle_version`, e.g. ULID + logical epoch) and a content hash
   (`sha256:…`). The previous bundle remains available for rollback.
3. **Storage.** The bundle is uploaded to the S3-compatible backend operated by
   **Ceph RGW**, already documented in
   [`docs/operations/deployment.md`](../operations/deployment.md) §"Production
   (Ceph RGW via Rook)" and in
   [`docs/architecture/adr/ADR-0010-cnpg-postgres-operator.md`](../architecture/adr/ADR-0010-cnpg-postgres-operator.md)
   §"Backups y WAL archive a Ceph RGW". The distributed URL is a **signed
   URL** (presigned) with a bounded TTL.
4. **Cryptographic signature.** The bundle is signed with the release key of
   `authorization-policy-service`. Consumers reject any bundle whose signature
   does not verify against the public key distributed out of band.
5. **Notification.** After uploading the artifact, `authorization-policy-service`
   publishes an event on **NATS JetStream** via the `libs/event-bus-control`
   library:

   - **Subject:** `policy.bundle.updated`
   - **Payload (JSON):**
     ```json
     {
       "bundle_version": "01J…",
       "sha256": "…",
       "signed_url": "https://rgw…/bundles/01J…?X-Amz-Signature=…",
       "signed_url_expires_at": "2026-04-29T21:00:00Z",
       "signature": "base64(ed25519(sha256))",
       "issued_at": "2026-04-29T20:55:00Z"
     }
     ```
   - **Stream:** inside the control-plane (NATS), never on `event-bus-data`
     (Kafka). This satisfies the mechanical contract of
     [`ADR-0011`](../architecture/adr/ADR-0011-control-vs-data-bus-contract.md)
     §"Decision" / "Allowlist file".

## Consumer: `libs/auth-middleware`

Each data service links the `libs/auth-middleware` library and delegates policy
evaluation to it. The middleware encapsulates:

1. **Bootstrap.** On startup, the service downloads the latest known bundle
   (via the signed URL obtained from `authorization-policy-service` or cached
   locally) and verifies its signature. If verification fails, the service
   **fails closed**: it rejects requests until a valid bundle is available.
2. **Push subscription.** The middleware subscribes to the
   `policy.bundle.updated` subject on `event-bus-control` (NATS JetStream).
   On receiving the event it:
   - downloads the new bundle from the `signed_url`,
   - verifies the signature and the `sha256`,
   - atomically swaps the active in-memory bundle (swap behind an
     `ArcSwap`/`RwLock`),
   - keeps the previous bundle accessible during a short *grace period* for
     in-flight evaluations.
3. **In-process evaluation.** Every `allow/deny` decision is resolved within
   the service's own process, **without an RPC to the PDP on the hot path**,
   against the active bundle. The in-memory swap of the active bundle uses an
   `atomic.Pointer` (or a `sync.RWMutex` wrapping an immutable struct) in Go.
   This is what makes the rule stated above operational.
4. **Local cache with TTL.** The bundle is persisted to local disk with a
   configurable TTL (e.g. 24 h) to support restarts without contacting the
   publisher. Normal invalidation is **push**-based via NATS; the TTL is the
   safety net for when the control-plane is degraded.
5. **Telemetry and audit.** Each decision emits a structured record (decision
   id, bundle_version, principal, resource, action, outcome) that feeds the
   flow described in
   [`/security-governance/audit-and-traceability`](./audit-and-traceability.md)
   and in [`/security-governance/audit-model/`](./audit-model/).

### Failure modes

| Scenario                                   | Consumer behavior                                              |
| ------------------------------------------ | -------------------------------------------------------------- |
| NATS unavailable                           | Continues with the active bundle; retries the subscription.    |
| Signed URL expired before download         | Requests re-issuance from `authorization-policy-service`.      |
| Invalid signature on the new bundle        | **Discards** the bundle, keeps the previous one, alerts.       |
| Local TTL expired and publisher unreachable| **Fails closed** on sensitive resources, configurable.         |

## Bundle format

Three options were evaluated, all OSS:

| Option           | License       | Traceability | Notes                                                                                  |
| ---------------- | ------------- | ------------ | -------------------------------------------------------------------------------------- |
| Rego (OPA)       | Apache-2.0    | Medium       | Imperative-logical language; decision explanations require external tooling.           |
| **Cedar**        | **Apache-2.0**| **High**     | Designed for static analysis and *policy reasoning*; native decision traces.           |
| Declarative JSON | N/A           | Low          | Simple, but requires writing your own evaluator and testing system.                    |

**Decision adopted: Cedar (Apache-2.0)** — already implemented through
`libs/authz-cedar-go` (Go bindings to the Cedar engine). Reasons:

- Native traceability: each decision exposes which policy and which *condition*
  contributed, integrating directly with the audit model documented in
  [`audit-model/`](./audit-model/).
- Formal static analysis (schema validation, detection of unreachable or
  conflicting policies) executable in CI over the bundle before it is
  published.
- Apache-2.0 license, aligned with the platform's 100% OSS requirement.
- Entity/attribute model coherent with the ABAC/CBAC design already documented
  in [`abac-and-cbac-model/`](./abac-and-cbac-model/).

Proposed bundle structure (to be locked in via a later ADR when implemented):

```
bundle-<version>.tar.zst
├── manifest.json          # version, sha256, schema_version, issued_at
├── schema.cedarschema     # schema of entities and actions
├── policies/              # *.cedar (declarative policies)
└── entities/              # snapshots of stable entities (roles, groups)
```

## Sub-issue plan: adopting the pattern

> Sub-issue plan associated with this page. **No** code is changed in this
> task; the checkboxes will be ticked when each service adopts
> `libs/auth-middleware` with in-process bundle evaluation.

Priority services, ordered by hot-path surface over ontology objects (see the
classification of _governance & semantics_ services in
[`docs/architecture/runtime-topology.md`](../architecture/runtime-topology.md)
§ "Layered service map"):

- [ ] **`object-database-service`** (`/services/object-database-service`).
  Custodian of object state; every read/write must evaluate policies
  in-process. Largest latency gain from eliminating the RPC to the PDP.
- [ ] **`ontology-query-service`** (`/services/ontology-query-service`).
  Applies bundle-derived filters (restricted views, ABAC) when planning and
  executing queries; needs a local decision for *row/column-level* filtering.
- [ ] **`ontology-actions-service`** (`/services/ontology-actions-service`).
  Evaluates permissions on actions (structured writes) before dispatching
  them; blocks unauthorized actions without network hops.

Each adoption will require its own PR and will include:

1. Importing `libs/auth-middleware` from the root `go.mod` (single module —
   no per-service sub-modules).
2. Subscribing to `policy.bundle.updated` via `libs/event-bus-control`
   (compatible with the bus allowlist in
   [`ADR-0011`](../architecture/adr/ADR-0011-control-vs-data-bus-contract.md);
   add the service to `/.github/bus-allowlist.yaml` if not already present).
3. Integration tests with a signed sample bundle.
4. Latency metrics *before/after* documented in the PR.

## Cross-references

- [`docs/architecture/adr/ADR-0011-control-vs-data-bus-contract.md`](../architecture/adr/ADR-0011-control-vs-data-bus-contract.md)
  — control vs data bus separation; bundle notifications travel on the control
  bus.
- [`docs/architecture/runtime-topology.md`](../architecture/runtime-topology.md)
  — topology and classification of services.
- [`/security-governance/policies-and-authorization`](./policies-and-authorization.md)
  — current policy surface in `authorization-policy-service`.
- [`/security-governance/abac-and-cbac-model/`](./abac-and-cbac-model/)
  — attribute model that the bundle materializes.
- [`/security-governance/audit-and-traceability`](./audit-and-traceability.md)
  and [`/security-governance/audit-model/`](./audit-model/) — destination of
  the decision traces emitted in-process.
- [`docs/operations/deployment.md`](../operations/deployment.md) §"Production
  (Ceph RGW via Rook)" — S3 backend that hosts the signed bundles.
