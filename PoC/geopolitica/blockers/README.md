# Geopolitics PoC — blockers

> Date: 2026-05-20
> Status: **B02 closed at ~85%** (platform-ready; YAML materialization
> + bulk-load smoke deferred to PoC execution). **B04 closed at ~70%**
> for this vertical — Azure OpenAI is now a first-class provider in
> the catalog and the gateway routes `/api/v1/llm/*` correctly; the
> UI dropdown, the seed migration and the runtime catalog-lookup
> (B07) remain. **B05 closed at ~55%** — outbound webhooks are now
> HMAC-SHA256-signed with retry + DLQ accounting and `/approvals` is
> a real queue UI; the SLA-aware escalation timer remains. **B06
> closed at ~55%** — the `/append` write path has Stripe-style
> idempotency (header + body hash + race resolution); real Parquet
> writes to MinIO and the Lakekeeper reconciliation remain. Other
> blockers still track the aviation set; only the per-vertical delta
> lives here.

The geopolitics PoC reuses the platform-level blocker analyses already
written for the aviation PoC under
[`../../aviacion/blockers/`](../../aviacion/blockers/). The
underlying OpenFoundry services
(`ontology-definition-service`, `ontology-actions-service`,
`application-composition-service`, `ontology-indexer`, …) are
vertical-agnostic; what changes between PoCs is the **ontology that
gets loaded** and the **demo script** that exercises it.

This folder therefore only holds the **per-vertical delta** — the
geopolitical entities, link types, action types and acceptance items
that are not already covered by the corresponding aviation B0X file.

## Index

| ID | Title | Per-vertical delta? | See also (platform-level) |
|---|---|---|---|
| [B02](B02-ontology-definition.md) | Ontology definition + outbox events for the geopolitical graph | ✅ Yes — Country, SanctionsEntry, EventGDELT, Person, Organization, ArmedGroup, GovernmentBody, Watchlist, InvestigationCase, ActorAlert + 13 link types + 8 action types | [`../../aviacion/blockers/B02-ontology-definition.md`](../../aviacion/blockers/B02-ontology-definition.md) |
| [B04](B04-llm-catalog.md) | LLM catalog — Azure OpenAI provider + gateway routing for Act 5 (AIP Chatbot) and the network Plan B | ✅ Yes — the aviation file was written when the service was a stub; this file documents the real state (`llm_models` table, admin CRUD, `/invoke`) and the geopolitics-specific deltas (Azure provider, `/api/v1/llm/*` gateway rule, both rows seeded for the demo dropdown) | [`../../aviacion/blockers/B04-llm-catalog.md`](../../aviacion/blockers/B04-llm-catalog.md) |
| [B05](B05-notifications.md) | Notifications — HMAC-signed outbound webhooks, retry + DLQ accounting, and the real `/approvals` queue UI for Acts 5 and 6 | ✅ Yes — the aviation file lists five gaps; three are stale (channels, subscription model, queue projection live in `main`) and two new ones (webhook signing, retry/DLQ status) matter for the Mattermost / SIEM demo path | [`../../aviacion/blockers/B05-notifications.md`](../../aviacion/blockers/B05-notifications.md) |
| [B06](B06-iceberg-e2e.md) | Iceberg `/append` idempotency for the GDELT 15-min stream + bronze→silver→gold transforms in Acts 1 and 3; dual-catalog story documented | ✅ Yes — closes the demo-visible "two clicks = two snapshots" regression. Real Parquet writes to MinIO and the Lakekeeper reconciliation are deferred to B06 Phase 2 / Phase 3 (own follow-ups) | [`../../aviacion/blockers/B06-iceberg-e2e.md`](../../aviacion/blockers/B06-iceberg-e2e.md) |

For B01, B03, B07 the aviation files apply unchanged — no
geopolitics-specific override is needed today. If the geopolitical
PoC ever requires a divergent code path (e.g. a graph-widget-only
acceptance criterion), add a sibling B0X file here that references
the aviation version and lists only the delta.
