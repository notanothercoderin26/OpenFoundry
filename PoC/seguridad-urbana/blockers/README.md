# Urban Public-Safety PoC — blockers

> Date: 2026-05-21
> Status: documentation ready, no execution yet. Platform-level
> blocker analyses are reused from the aviation PoC; only the
> per-vertical delta lives here.
>
> **Current platform-level severity** (read this before planning work):
> the aviation-side Phase 1 closure on 2026-05-20 closed B02 and B04
> and largely closed B01 and B06. The *Inherited as-is?* column below
> still says "Yes" because the per-vertical delta is what changes for
> urbana — the file paths, acceptance criteria, and Foundry-parity
> references in the inherited B0X stay the same. What does change is
> the **severity** an executing agent should plan against; see the
> *Status as of 2026-05-20* sections inside each inherited B0X.

The urban public-safety PoC reuses the platform-level blocker
analyses already written for the aviation PoC under
[`../../aviacion/blockers/`](../../aviacion/blockers/). The
underlying OpenFoundry services
(`ontology-definition-service`, `ontology-actions-service`,
`application-composition-service`, `ontology-indexer`,
`llm-catalog-service`, `notification-alerting-service`,
`pipeline-build-service`, …) are vertical-agnostic; what changes
between PoCs is the **ontology that gets loaded** and the **demo
script** that exercises it.

This folder therefore only holds the **per-vertical delta** — the
urban public-safety entities, link types, action types, pipelines
and acceptance items that are not already covered by the
corresponding aviation B0X file.

## Inherited platform-level blockers

| ID | Platform-level file | Inherited as-is? | Current platform severity (post 2026-05-20) |
|---|---|---|---|
| B01 | [`../../aviacion/blockers/B01-workshop-backend.md`](../../aviacion/blockers/B01-workshop-backend.md) | ✅ Yes | **Medium** — `apps` / `app_versions` tables, publish lifecycle, branch column shipped; AC#6 (button → action-type) and AC#7 (vertical demo module) outstanding. See [B01 *Status as of 2026-05-20 (Phase 1 closure)*](../../aviacion/blockers/B01-workshop-backend.md#status-as-of-2026-05-20-phase-1-closure). For urbana the AC#7 work is the urban Workshop dashboards, not the aviation MRO workbench. |
| B02 | [`../../aviacion/blockers/B02-ontology-definition.md`](../../aviacion/blockers/B02-ontology-definition.md) | ⚠️ Yes, but with a per-vertical delta for the urban ontology (Incident, TrafficAccident, Neighborhood, District, CensusTract, Shift, WeatherEvent, Patrol, ReinforcementZone, TacticalBriefing, LoadForecast, IncidentAlert, ActionLog + 11 link types + 6 action types). Add a sibling file here only if execution shows divergence. | **✅ Platform-closed** — outbox table, 12 outbox sites in `batch_save.go`, Debezium connector, integration tests pass. See [B02 *Status as of 2026-05-20 (Phase 1 closure)*](../../aviacion/blockers/B02-ontology-definition.md#status-as-of-2026-05-20-phase-1-closure). The per-vertical delta is materializing the urban ontology YAML into the live schema, **not** rebuilding the bus integration. |
| B03 | [`../../aviacion/blockers/B03-ontology-indexer.md`](../../aviacion/blockers/B03-ontology-indexer.md) | ✅ Yes — but the urban dataset fits in Postgres + pgvector, so the Vespa-backed search path required by `geopolitica/blockers/B03-...` is **not** required here. Spell this out at execution time. | **Medium for urbana** — the read path (`POST /ontology/search` + Workshop pushdown) is still missing platform-wide, but urbana can serve search from Postgres + pgvector at the urban scale (~1 M incidents) without invoking the Vespa pushdown. Geopolitics is the PoC that exposes the Vespa scale. |
| B04 | [`../../aviacion/blockers/B04-llm-catalog.md`](../../aviacion/blockers/B04-llm-catalog.md) | ✅ Yes — air-gapped model is `qwen2.5-14b-instruct` (smaller than the geopolitical PoC's 70B). | **✅ Platform-closed** — quotas + features migration, provider Prober, `LlmCatalogPage`, `ChatbotModelPicker`, edge-gateway routing. See [B04 *Status as of 2026-05-20*](../../aviacion/blockers/B04-llm-catalog.md#status-as-of-2026-05-20). The per-vertical delta is registering `qwen2.5-14b-instruct` in the catalog, not extending it. |
| B05 | [`../../aviacion/blockers/B05-notifications.md`](../../aviacion/blockers/B05-notifications.md) | ✅ Yes | High (unchanged — no Phase 1 *Status* section in the platform-level file). |
| B06 | [`../../aviacion/blockers/B06-iceberg-e2e.md`](../../aviacion/blockers/B06-iceberg-e2e.md) | ✅ Yes | **✅ Mostly closed** — `IcebergHTTPWriter` / `IcebergHTTPReader` / `LineageWriter`, `iceberg_table_rows` table, `dataset_health_events`, four integration tests. AC#4 (Spark transactional read/write) and AC#6 (≤90 s cold-time benchmark) are *out of scope*. See [B06 *Status as of 2026-05-20*](../../aviacion/blockers/B06-iceberg-e2e.md#status-as-of-2026-05-20). |
| B07 | [`../../aviacion/blockers/B07-agent-runtime-tool-routing.md`](../../aviacion/blockers/B07-agent-runtime-tool-routing.md) | ✅ Yes | Critical (unchanged — no Phase 1 *Status* section in the platform-level file). |

### Note on the pipeline execution path (Spark vs. FASTER)

[ADR-0045](../../../docs/architecture/adr/ADR-0045-eliminate-pipeline-runner-spark-pure-go-runtime.md)
proposes retiring `pipeline-runner-spark` in favour of the Go-in-process
runtime. Its status is still **Proposed**, so Spark remains an active
execution path inside `pipeline-build-service`. For the urban
public-safety PoC this is **irrelevant in either direction**: the urban
volume (~1 M incidents × 73 neighborhood polygons at 60-second cadence)
fits comfortably inside the `FASTER` (Go in-process) execution path,
which goes through `libs/pipeline-expression` + `libs/pipeline-runtime`
without touching `SparkApplication` CRs. The PoC should declare
`pipeline_type=FASTER` on its transforms and ignore whatever decision is
eventually taken about Spark. The only place where the urbana PoC could
plausibly exceed `FASTER` is the spatial-join workload tracked as
[B12](#per-vertical-blockers-placeholders--content-out-of-scope-here)
below; if that benchmark forces a switch, raise it as a per-vertical
B0X file rather than re-opening the Spark question here.

## Per-vertical blockers (placeholders — content out of scope here)

These three are unique to this PoC and have no equivalent in
`aviacion/blockers/` or `geopolitica/blockers/`. Each file will be
written at PoC execution time, not here.

| ID | Title | Why it's unique to this PoC |
|---|---|---|
| **B12** | Spatial-join performance on the `Neighborhood` polygon set inside `pipeline-build-service` | ~1 M incidents × 73 polygons + 60-second CAD cadence stresses the spatial-join path. Aviation and geopolitical PoCs do not exercise polygon-heavy joins at this rate. |
| **B13** | Synthetic AVL data generator | The `seed=42` AVL trace generator (~50–70 GB Parquet) has no equivalent in the other two PoCs and needs its own determinism + replay tests. |
| **B14** | Post-shift after-action close on `ReinforcementZone` via `register-zone-outcome` action | Exercises ontology-mutation patterns (status transitions on an Action-created object + senior-commander approval routing) that neither `aviacion` nor `geopolitica` covers. |

If execution shows any of these need to be promoted to platform-level
fixes, raise a sibling file under `aviacion/blockers/` rather than
here, so the numbering stays consistent across PoCs.
