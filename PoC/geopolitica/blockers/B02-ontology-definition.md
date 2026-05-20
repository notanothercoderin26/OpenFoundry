# B02 — Ontology definition service — emit schema events to the bus (geopolitics)

> **Geopolitics PoC scope** of the platform B02 closed for the aviation
> PoC in [`../../aviacion/blockers/B02-ontology-definition.md`](../../aviacion/blockers/B02-ontology-definition.md).
> The underlying OpenFoundry services
> (`ontology-definition-service`, `ontology-actions-service`,
> `libs/outbox`, the `outbox-pg-schemas` Debezium connector, the
> `ontology.*.changed.v1` Kafka topic CRs) are **vertical-agnostic**:
> the producer code, the outbox migration, the deterministic
> `event_id` derivation and the OpenLineage headers shipped for the
> aviation PoC also cover the geopolitical entities below — no extra
> Go code is required to wire the bus for this vertical.
>
> What this file owns is the **geopolitics-specific delta**: the object
> types, link types and action types from
> [`../05-ontologia-geopolitica.md`](../05-ontologia-geopolitica.md)
> that Act 2 of the demo needs on the bus, plus the per-vertical
> acceptance items that gate the geopolitical Workshop graph widget,
> the indexer ([B03](#b03-cross-reference)) and the AIP tool routing
> ([B07](#b07-cross-reference)).
>
> Severity: **High**. Platform parity is complete; only the
> demo-ontology load + smoke contract remain. Tracked at **~85%**.

## Identity

| Field | Value |
|---|---|
| OpenFoundry service | [`services/ontology-definition-service/`](../../../services/ontology-definition-service/) + [`services/ontology-actions-service/`](../../../services/ontology-actions-service/) |
| Launcher app | **#2 Ontology Manager** — internal id `ontology-manager`, route `/ontology-manager` ([launcher-app-mapping.md §B](../../../docs/reference/launcher-app-mapping.md)) |
| Foundry product | [Ontology Manager](https://www.palantir.com/docs/foundry/ontology-manager/overview/) |
| PoC act(s) | **Act 2** — *"Ontology Manager: object types Actor / Person / Organization / ArmedGroup / GovernmentBody / Event / Location / Country / NewsArticle / SanctionsEntry / Watchlist / InvestigationCase / ActorAlert / ActionLog; 13 link types; 8 action types"* ([`../11-guion-demo.md` §11–14](../11-guion-demo.md)) |
| Foundry-native contract | [`../00-contrato-foundry-native.md` §Foundry-native capability mapping](../00-contrato-foundry-native.md) |
| Architectural decision | [ADR-0022 — Transactional outbox on Postgres drained by Debezium](../../../docs/architecture/adr/ADR-0022-transactional-outbox-postgres-debezium.md) |

## Palantir reference (public docs)

The same pages anchor both PoCs — they describe ontology semantics,
not aviation-specific behavior.

| Page | Live URL |
|---|---|
| Ontology Manager overview | https://www.palantir.com/docs/foundry/ontology-manager/overview/ |
| Ontology overview | https://www.palantir.com/docs/foundry/ontology/overview/ |
| Object/Link type reference | https://www.palantir.com/docs/foundry/object-link-types/type-reference/ |
| Object types overview | https://www.palantir.com/docs/foundry/object-link-types/object-types-overview/ |
| Link types overview | https://www.palantir.com/docs/foundry/object-link-types/link-types-overview/ |
| Action types overview | https://www.palantir.com/docs/foundry/action-types/overview/ |
| Action rules | https://www.palantir.com/docs/foundry/action-types/rules/ |
| Use actions in platform | https://www.palantir.com/docs/foundry/action-types/use-actions/ |

> **Conceptual gap, not a code gap.** The outbox + Debezium pattern
> itself is a Foundry-native *implementation* decision (ADR-0022); the
> *result* it produces — schema-change events that downstream services
> (indexer, schema-bundle distribution, action-log sink) react to — is
> exactly what the four Palantir pages above describe. Customers
> should not see the outbox; they should see "every ontology mutation
> is observable downstream within the platform's latency target".

## Geopolitical ontology mapping (the entities that go on the bus)

Pulled from [`../05-ontologia-geopolitica.md`](../05-ontologia-geopolitica.md).
The right-hand column is the canonical Kafka topic produced by
`libs/outbox`-backed CRUD in `ontology-definition-service` /
`ontology-actions-service`, defined in
[`services/ontology-definition-service/internal/repo/events.go`](../../../services/ontology-definition-service/internal/repo/events.go)
and provisioned by
[`infra/helm/infra/kafka-cluster/templates/topics-ontology-schema-v1.yaml`](../../../infra/helm/infra/kafka-cluster/templates/topics-ontology-schema-v1.yaml).

### Object types (Act 2)

| Geopolitical entity | Foundry concept | Outbox aggregate | Topic |
|---|---|---|---|
| `Actor` (interface) | Object type interface | `ontology_interface` | `ontology.interface.changed.v1` |
| `Person` (implements `Actor`) | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `Organization` (implements `Actor`) | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `ArmedGroup` (implements `Actor`) | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `GovernmentBody` (implements `Actor`) | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `Event` (GDELT + ACLED) | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `NewsArticle` | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `Location` | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `Country` | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `SanctionsEntry` | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `Watchlist` | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `InvestigationCase` | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `ActorAlert` | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |
| `ActionLog` | Object type | `ontology_object_type` | `ontology.object_type.changed.v1` |

### Link types (Act 2)

Each row below is one CRUD on `link_types` and produces one
`ontology.link_type.changed.v1` record.

| Link | From | To | Card. |
|---|---|---|---|
| `MENTIONED_IN` | `Actor` | `NewsArticle` | N—N |
| `INVOLVED_IN` | `Actor` | `Event` | N—N |
| `OCCURRED_AT` | `Event` | `Location` | N—1 |
| `LOCATED_IN` | `Location` | `Country` | N—1 |
| `SANCTIONED_BY` | `Actor` | `SanctionsEntry` | N—N |
| `MEMBER_OF` | `Person` | `Organization` | N—N |
| `AFFILIATED_WITH` | `Organization` | `Organization` | N—N |
| `CITIZEN_OF` | `Person` | `Country` | N—N |
| `ASSOCIATED_WITH` | `Actor` | `Actor` | N—N |
| `ON_WATCHLIST` | `Watchlist` | `Actor` | N—N |
| `INVESTIGATES` | `InvestigationCase` | `Actor` | N—N |
| `RAISED_FOR` | `ActorAlert` | `Actor` | N—1 |
| `EVIDENCE_OF` | `Event` | `InvestigationCase` | N—N |

### Action types (Acts 2, 5, 6)

Action-type CRUD lifts to `ontology-actions-service`; the schema
mutations land on `ontology.action_type.changed.v1` via the same
`libs/outbox`-backed transaction (see the aviation B02
*"Notes from the action-type lift"* section).

| Action | Target | Topic |
|---|---|---|
| `add-to-watchlist` | `Watchlist` | `ontology.action_type.changed.v1` |
| `remove-from-watchlist` | `Watchlist` | `ontology.action_type.changed.v1` |
| `flag-actor` | `Actor` | `ontology.action_type.changed.v1` |
| `open-investigation-case` | `Actor` | `ontology.action_type.changed.v1` |
| `acknowledge-alert` | `ActorAlert` | `ontology.action_type.changed.v1` |
| `attach-evidence-to-case` | `InvestigationCase` | `ontology.action_type.changed.v1` |
| `close-case` | `InvestigationCase` | `ontology.action_type.changed.v1` |
| `propose-sanctions-extension` (branch-only) | `Watchlist` | `ontology.action_type.changed.v1` |

## Acceptance criteria (geopolitics delta)

The nine platform acceptance items closed by the aviation B02 are
re-used verbatim. The list below adds the geopolitics-specific
contract the PoC needs before Act 2 can run end-to-end.

1. **Platform parity holds.** Aviation B02 acceptance items 1–9 PASS
   against the unchanged code in
   [`services/ontology-definition-service/`](../../../services/ontology-definition-service/)
   and
   [`services/ontology-actions-service/`](../../../services/ontology-actions-service/).
   No vertical-specific fork.
2. **Geopolitics ontology asset materialized.** A single declarative
   `PoC/geopolitica/assets/ontology-geopolitica.yaml` is generated
   from the template in
   [`../05-ontologia-geopolitica.md` §Loading the ontology](../05-ontologia-geopolitica.md)
   at PoC-execution time (per the explicit decision in that document,
   the YAML stays a template until execution; **do not commit it
   ahead of execution**).
3. **Bulk-load smoke.** Posting the YAML via
   `POST /api/ontology/v1/definitions` produces, on the bus:
   - 1 × `ontology.interface.changed.v1` (`Actor`)
   - 13 × `ontology.object_type.changed.v1` (one per row in the
     Object-types table above)
   - 13 × `ontology.link_type.changed.v1` (one per row in the
     Link-types table above)
   - 8 × `ontology.action_type.changed.v1`
   - The deterministic `event_id` derivation from
     [`internal/repo/events.go`](../../../services/ontology-definition-service/internal/repo/events.go)
     stays idempotent across a retry of the bulk load.
4. **Branch awareness.** The bulk load runs on the `geopolitica-poc`
   branch (per
   [`../05-ontologia-geopolitica.md` §Loading the ontology](../05-ontologia-geopolitica.md)).
   Outbox headers include `branch=geopolitica-poc` so the indexer
   ([B03](#b03-cross-reference)) and Workshop graph widget can scope
   their reads.
5. **Markings end-to-end.** `Event.source_url` carries the
   `[OPEN-SOURCE, ANALYST-CORE]` marking set in the schema event.
   Downstream consumers (indexer, AIP retrieval) must honour the
   marking — covered by the
   [`10-seguridad-y-gobierno.md`](../10-seguridad-y-gobierno.md) E2E
   test, not by this blocker.
6. **Demo-time smoke queries.** After the load, the four sample
   ontology queries in
   [`../05-ontologia-geopolitica.md` §Sample queries](../05-ontologia-geopolitica.md#-sample-queries-the-customer-will-see-running)
   return the expected row counts. This is the
   "schema-events-actually-landed-on-the-indexer" canary.

## Status (2026-05-20) — ~85% closed

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Platform parity (aviation B02 items 1–9) | ✅ Done | [`../../aviacion/blockers/B02-ontology-definition.md` §Status as of 2026-05-20](../../aviacion/blockers/B02-ontology-definition.md) |
| 2 | Geopolitics YAML materialized | ⏳ Deferred to execution | Explicit decision in [`../05-ontologia-geopolitica.md`](../05-ontologia-geopolitica.md) — *"keep the template here in the .md and materialize it when implementation happens"* |
| 3 | Bulk-load smoke (40 expected events) | ⏳ Pending execution | Will run at T-7 per [`../12-checklist-preparacion.md`](../12-checklist-preparacion.md) |
| 4 | Branch awareness (`geopolitica-poc`) | ✅ Platform-ready | `branch` header already plumbed by [`ff2a16b`](../../../) (B01 Phase 1) and consumed by the outbox envelope |
| 5 | Markings end-to-end | ✅ Schema side / ⏳ Consumer side | Schema event carries property markings (see [`internal/repo/events.go`](../../../services/ontology-definition-service/internal/repo/events.go)); consumer-side enforcement tracked by [`10-seguridad-y-gobierno.md`](../10-seguridad-y-gobierno.md) |
| 6 | Demo-time smoke queries | ⏳ Pending execution | Re-validated against the loaded data at T-1 per [`../12-checklist-preparacion.md`](../12-checklist-preparacion.md) |

**The 15% that remains is bound by PoC execution, not by missing code**:
materializing the YAML and running the bulk-load smoke against a
running stack are explicitly deferred to the PoC kickoff window. The
platform code, the topic CRs, the Debezium connector and the
integration tests are all in `main` today.

## Cross-references

### B03 cross-reference

The 40 events above are the producer half of
[B03 — Ontology indexer](../../aviacion/blockers/B03-ontology-indexer.md).
With this file at ✅ Platform-ready, B03's consumer loop has
something to react to; the geopolitical fan-out (re-index after every
`ontology.object_type.changed.v1`) is what feeds the Workshop graph
widget in Act 4.

### B07 cross-reference

[B07 — Agent runtime tool routing](../../aviacion/blockers/B07-agent-runtime-tool-routing.md)
depends on the `Actor` interface and the `ON_WATCHLIST` /
`INVESTIGATES` link types being live on the bus so the AIP copilot
can route Object-query and Action tool calls. Both are covered by
items 1 and 3 above.

## Implementation notes (carried from the aviation closure)

These are reproduced verbatim from the aviation B02 because the same
code paths are exercised by the geopolitical entities — they are not
fresh decisions for this vertical:

- Outbox table:
  [`services/ontology-definition-service/internal/repo/migrations/0008_ontology_schema_outbox.sql`](../../../services/ontology-definition-service/internal/repo/migrations/0008_ontology_schema_outbox.sql).
- Producer helper:
  [`libs/outbox/outbox.go`](../../../libs/outbox/outbox.go).
- Envelope + headers:
  [`services/ontology-definition-service/internal/repo/events.go`](../../../services/ontology-definition-service/internal/repo/events.go).
- Debezium connector:
  [`infra/helm/infra/debezium/templates/kafka-connector-outbox-pg-schemas.yaml`](../../../infra/helm/infra/debezium/templates/kafka-connector-outbox-pg-schemas.yaml).
- Topic CRs:
  [`infra/helm/infra/kafka-cluster/templates/topics-ontology-schema-v1.yaml`](../../../infra/helm/infra/kafka-cluster/templates/topics-ontology-schema-v1.yaml).
- OpenAPI surface:
  [`services/ontology-definition-service/api/openapi.yaml`](../../../services/ontology-definition-service/api/openapi.yaml).
- Integration tests:
  [`services/ontology-definition-service/internal/repo/outbox_integration_test.go`](../../../services/ontology-definition-service/internal/repo/outbox_integration_test.go)
  (`TestOutboxEndToEnd_ObjectTypeCreated`,
  `TestOutboxEndToEnd_InterfaceLifecycle`,
  `TestOutboxEndToEnd_ActionTypeLifecycle`).
