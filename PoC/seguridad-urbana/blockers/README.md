# Urban Public-Safety PoC — blockers

> Date: 2026-05-21
> Status: documentation ready, no execution yet. Platform-level
> blocker analyses are reused from the aviation PoC; only the
> per-vertical delta lives here.

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

| ID | Platform-level file | Inherited as-is? |
|---|---|---|
| B01 | [`../../aviacion/blockers/B01-workshop-backend.md`](../../aviacion/blockers/B01-workshop-backend.md) | ✅ Yes |
| B02 | [`../../aviacion/blockers/B02-ontology-definition.md`](../../aviacion/blockers/B02-ontology-definition.md) | ⚠️ Yes, but with a per-vertical delta for the urban ontology (Incident, TrafficAccident, Neighborhood, District, CensusTract, Shift, WeatherEvent, Patrol, ReinforcementZone, TacticalBriefing, LoadForecast, IncidentAlert, ActionLog + 11 link types + 6 action types). Add a sibling file here only if execution shows divergence. |
| B03 | [`../../aviacion/blockers/B03-ontology-indexer.md`](../../aviacion/blockers/B03-ontology-indexer.md) | ✅ Yes — but the urban dataset fits in Postgres + pgvector, so the Vespa-backed search path required by `geopolitica/blockers/B03-...` is **not** required here. Spell this out at execution time. |
| B04 | [`../../aviacion/blockers/B04-llm-catalog.md`](../../aviacion/blockers/B04-llm-catalog.md) | ✅ Yes — air-gapped model is `qwen2.5-14b-instruct` (smaller than the geopolitical PoC's 70B). |
| B05 | [`../../aviacion/blockers/B05-notifications.md`](../../aviacion/blockers/B05-notifications.md) | ✅ Yes |
| B06 | [`../../aviacion/blockers/B06-iceberg-e2e.md`](../../aviacion/blockers/B06-iceberg-e2e.md) | ✅ Yes |
| B07 | [`../../aviacion/blockers/B07-agent-runtime-tool-routing.md`](../../aviacion/blockers/B07-agent-runtime-tool-routing.md) | ✅ Yes |

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
