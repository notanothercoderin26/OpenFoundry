# ADR-0044: Ontology parity scope — OSv2 baseline, explicit gap acceptance

- **Status:** Accepted
- **Date:** 2026-05-08
- **Deciders:** OpenFoundry technical committee + Ontology working group
- **Related ADRs:**
  - [ADR-0027](./ADR-0027-cedar-policy-engine.md) — Cedar policy engine
    (authorization substrate for object/marking enforcement).
  - [ADR-0033](./ADR-0033-branching-foundry-parity.md) — branching parity.
  - [ADR-0034](./ADR-0034-datasets-foundry-parity.md) — datasets parity.
  - [ADR-0037](./ADR-0037-foundry-pattern-orchestration.md) — orchestration
    substrate that ontology indexers and writeback flows ride on.
- **Full evaluation matrix (archived):**
  [`docs/archive/ONTOLOGY-EVALUATION.md`](../../archive/ONTOLOGY-EVALUATION.md).

## Context

OpenFoundry positions itself as a Foundry/Gotham-style operational data
platform. The ontology is the central differentiator — without a
strong ontology we are a data-lake-with-extras. In May 2026 a detailed
gap analysis evaluated the live ontology implementation
(`libs/ontology-kernel`, `services/ontology-*`,
`services/object-database-service`, plus supporting libs) against
Palantir's published capabilities for **OSv2 (Object Storage V2)**.

The headline result: **6 / 10 against OSv2**, ~60–65 % of Foundry's
critical capabilities, materially above an academic clone but below a
mature product. The full per-dimension matrix (24 dimensions, scored
0.5 – 8.0) is preserved in
[`docs/archive/ONTOLOGY-EVALUATION.md`](../../archive/ONTOLOGY-EVALUATION.md).

This ADR exists because the choice of *what to compare against* and
*which gaps to accept* is itself an architectural decision: the
ontology surface area is large enough that without a fixed target,
each working slice picks its own parity bar and the platform drifts.

## Decision

### 1. Baseline target: **OSv2 only**

OpenFoundry compares against **OSv2** capabilities. **OSv1 / Phonograph
are out of scope** because Palantir is retiring them on 2026-06-30; any
parity work on the legacy surface would obsolete itself within a
quarter.

### 2. Capability targets (committed)

These dimensions are committed parity targets. New work in
`libs/ontology-kernel` and `services/ontology-*` must move them
toward parity, not regress them:

- **Type system & primitives** — close the 14 → ~22 gap by adding
  `Decimal`, `Geoshape` (distinct from Geopoint), `Time Series`,
  `Attachment`, `Marking` (as base type), `Cipher`. Composite primary
  keys remain deferred.
- **Polymorphism & composition** — `extends_interfaces`, polymorphic
  links, link-properties, function-backed properties.
- **Geo & temporal** — fill out `geospatial-core`, add Geoshape
  indexing, GTSS-equivalent time-series storage, and a real
  bitemporal layer (`valid_from` / `valid_to`) on `Object`.
- **Derived properties** — multi-hop derivations (3-hop minimum),
  required for analytical surfaces.
- **Query & analytics** — OQL parser + object-set algebra
  (`union | intersect | difference`), permanent vs temporal vs static
  object-set typology.
- **Access control** — runtime Cedar enforcement on every read and
  write path (currently only admin paths are gated); marking
  hierarchies; ABAC fully wired; Object Security Policies as
  parametric, not just per-type.
- **Functions & extensibility** — `OntologyEditFunction` decorator,
  auto-regenerated typed OSDK on schema change.
- **Search** — phonetic / fuzzy / geo, Search-Around (N-hop link
  traversal), advanced facetting.

### 3. Gaps formally accepted as deferred

Listed here so they stop being re-litigated in PR reviews. Each is
acceptable for the current product phase; promoting any of them to
"committed" requires an amending ADR.

- **Value Types** (semantic wrappers — Email, URL, UUID, SSN, IBAN,
  …). Score 0.5 / 10. Adds expressivity but does not block any user
  workflow today.
- **AIP Logic** (no-code LLM functions over ontology) and
  **AIP Chatbot/Agent Studio**. Score 2.0 / 10. Tracked separately
  under AI-platform roadmap.
- **OMCP** (Ontology MCP — exposing ontology types to external agents
  as MCP tools). Score 1.0 / 10. Defer until MCP adoption stabilises.
- **Virtual Tables / zero-copy** for Snowflake/Databricks/BigQuery.
  Score 1.0 / 10. Iceberg catalog parity (ADR-0041) is the priority;
  zero-copy lands after.
- **Privacy / DLP primitives** (differential privacy, k-anonymity,
  PII auto-classification, redaction). Score 0.5 / 10. Add on demand
  driven by a concrete compliance customer.
- **Ontology Manager (OMA) UI**. Today schema is authored via
  proto/JSON; a dedicated UI is desirable but not blocking.

### 4. Service decomposition policy

OSv2 separates **OMS** (metadata), **Object Databases**, **OSS**
(object set service), **Object Data Funnel**, **Actions Service**,
**Functions Service**. OpenFoundry today blurs these into
`ontology-definition-service`, `ontology-query-service`,
`ontology-actions-service`, `object-database-service` and the kernel.

We **do not** mandate splitting them further as a precondition for
parity work. The decomposition is allowed to follow load and
ownership pressure; until then, the kernel's bounded-context
subpackages (`handlers/actions/`, `handlers/funnel/`,
`handlers/objects/`, `handlers/objectsets/`, …) are the seams. See
[`libs/ontology-kernel/CLAUDE.md`](../../../libs/ontology-kernel/CLAUDE.md).

### 5. Wire-compat invariants (do not break)

OSv2 conformance brings external consumers (SDKs, third-party
integrations) into scope. The contracts already pinned by
`libs/core-models/**/*_test.go` (Dataset RID format, marking source
discriminator, schema field type discriminator, media reference
camelCase keys) extend to ontology types and **must not drift** during
parity work without an amending ADR.

## Consequences

**Positive**

- A single source of truth for "what does parity mean for OpenFoundry's
  ontology". Future dimension scoring is an update to the archived
  matrix; this ADR captures *which* scores must move.
- Explicit deferrals stop the spiral of "shouldn't we add Value Types
  too?" in unrelated PRs.
- Working-group can prioritise the **8 committed dimensions** rather
  than uniformly chasing all 24.

**Negative / accepted costs**

- Customers who want OSv1-compatible behaviour are not served. This is
  intentional and aligned with Palantir's own retirement timeline.
- The deferred set (value types, AIP, OMCP, virtual tables, privacy
  primitives) widens the product gap with Foundry until those are
  promoted. Sales / GTM messaging must reflect this.
- Bitemporality (committed) is structural — schema migrations across
  Cassandra and Postgres, indexer rewrites, query API updates.
  Estimated 4–6 sprints; sequencing is the working-group's call.

**Tracking**

- The per-dimension scores live in
  [`docs/archive/ONTOLOGY-EVALUATION.md`](../../archive/ONTOLOGY-EVALUATION.md).
  When a parity slice lands, the working group amends that document
  in-place and references the slice's PR. Promotions/demotions between
  "committed" and "deferred" require an amending ADR (e.g. ADR-0044a)
  rather than silent edits to this one.
