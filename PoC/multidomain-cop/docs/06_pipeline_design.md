# Pipeline Design

This file describes the per-stream normalization transforms that take the raw landed datasets from [`05_ingestion_plan.md`](05_ingestion_plan.md) and produce the unified event substrate consumed by the ontology in [`08_ontology_design.md`](08_ontology_design.md) and the temporal-spatial fusion layer in [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md).

The pipeline is described in prose, deliberately. The author will implement the transforms in Pipeline Builder where the operation is declarative (column casting, filtering, unions) and in Code Repositories (PySpark / Python) only where the operation is not expressible in Pipeline Builder (TAR-of-XML unpacking, line-delimited JSON schema enforcement, H3 indexing if the Pipeline Builder library does not expose it). The choice is recorded per stage. No PySpark code appears in this document.

All output dataset paths are placeholders the author replaces with the real Foundry RIDs once the project is provisioned. Versioning convention: every output is `_v0` until the schema is frozen; on any schema change the suffix increments. All work is done on a Foundry branch and only promoted to `main` when the quality checks below are green.

## Stage 1 — IGN raw to IGN normalized

**Input:** `raw/ign/seismic_events_landing` (CSV append-only, populated by the IGN ingestion job).
**Tool:** Pipeline Builder. The transformations are flat column operations and a few row-level filters, which Pipeline Builder handles cleanly.
**Logic:** parse the IGN datetime column from Madrid local time to UTC (the source publishes Madrid local, so the offset is applied with an explicit DST-aware conversion); cast `latitude`, `longitude`, `depth_km` to double; coerce magnitude into two parallel columns (`magnitude_mw` and `magnitude_mblg`) — IGN reports either depending on the event, and **the two scales must not be collapsed into a single "magnitude" column** because they are not interchangeable in any defensible way. Drop test events (IGN occasionally publishes `TEST` records during portal maintenance — filter on the location-text field). Extract the EMS-98 maximum intensity into its own column when present.
**Output:** `clean/ign/seismic_events_v0`.
**Quality checks:** row count within plus-or-minus five percent of the upstream landing row count (the only drops should be test events); null rate on `event_id`, `occurred_at_utc`, `latitude`, `longitude` below two percent; at least one of `magnitude_mw` / `magnitude_mblg` populated for every row.

## Stage 2 — AEMET raw TAR to AEMET warnings normalized

**Input:** `raw/aemet/warnings_landing` (one row per fetch, containing the TAR payload bytes and the upstream metadata wrapper).
**Tool:** Code Repository (Python transform). Pipeline Builder cannot unpack a TAR archive of XML files natively, and CAP XML parsing is awkward without the Python `xml.etree` / `lxml` toolchain.
**Logic:** for each TAR row, open the archive in memory, iterate over the CAP XML files, parse each CAP document, and extract `severity`, `certainty`, `urgency`, `event` (the CAP event label, e.g. *Fenómenos costeros*), `effective`, `expires`, `areaDesc`, and the `polygon` geometry. Emit one row per active warning per area (a single CAP message can carry multiple `<area>` blocks). The CAP severity / certainty / urgency labels are **preserved verbatim** — `Extreme`, `Severe`, `Moderate`, `Minor`, `Unknown` for severity; `Observed`, `Likely`, `Possible`, `Unlikely`, `Unknown` for certainty; `Immediate`, `Expected`, `Future`, `Past`, `Unknown` for urgency. No paraphrase. The polygon string is converted to a GeoJSON polygon for downstream spatial joins.

> ⚠️ VERIFY: confirm the Foundry Code Repository runtime allows in-memory TAR unpacking with the standard `tarfile` module; if restricted, use the Foundry-provided file IO primitives.

**Output:** `clean/aemet/warnings_v0`.
**Quality checks:** number of emitted warning rows roughly proportional to the number of CAP files in the TAR (typical TAR carries between tens and low hundreds of CAP files at peak weather periods); null rate on `event_id`, `effective_at_utc`, `area_polygon_geojson` below two percent; CAP severity vocabulary coverage at one hundred percent (every row falls into one of the five published labels).

## Stage 3 — NVD raw to CVEs normalized

**Input:** `raw/nvd/cves_landing` (JSON page responses appended daily).
**Tool:** Pipeline Builder. The transformations are well within its native explode / aggregate / cast capabilities.
**Logic:** one row per CVE at the output. Extract the CVE id, the English description, the CVSS v3 base score and vector, the CWE references, the CISA known-exploited flag, and the publication / last-modified timestamps. CPE matching requires an intermediate explode-then-reaggregate: a single CVE can list dozens of CPE entries, each with a `vendor` and `product` component. Explode the CPE array into one row per CPE; extract `vendor` and `product` from the structured CPE name; then aggregate back at the CVE level with `vendors` and `products` as deduplicated arrays. Preserve the `cisa_known_exploited` flag verbatim as a boolean. CVSS scores are stored as numerics; the qualitative severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) is also retained.
**Output:** `clean/nvd/cves_v0`.
**Quality checks:** row count equal to the upstream count of distinct CVE ids; null rate on `cve_id`, `published_at_utc` below half a percent; vendor / product arrays populated for at least eighty percent of rows (some CVEs have no CPE applicability statement — that is expected and noted).

## Stage 4 — OpenSky raw to aircraft positions normalized

**Input:** `raw/opensky/state_vectors_landing` (one row per state vector snapshot, populated by the demo-window ingestion).
**Tool:** Pipeline Builder.
**Logic:** filter ground-noise positions (`on_ground = true`) — aircraft taxiing produce a high volume of low-value rows that would dominate the aggregates. Retain `icao24`, `lat`, `lon`, `baro_altitude`, `callsign`, `origin_country`, `time_position`. Compute a synthetic `observation_id` as `${icao24}-${time_position_epoch}` for primary-keying. Cast altitude to metres if the source returns feet (the OpenSky REST API returns metres for `baro_altitude`; the assumption is documented).
**Output:** `clean/opensky/aircraft_positions_v0`.
**Quality checks:** ground-filter drop rate roughly twenty to forty percent of input rows (calibrate after the first build); null rate on `icao24`, `lat`, `lon`, `time_position` below one percent.

## Stage 5 — AISStream raw to vessel positions normalized

**Input:** `raw/aisstream/messages_landing` (line-delimited JSON produced by the external WebSocket bridge; see [`05_ingestion_plan.md`](05_ingestion_plan.md)).
**Tool:** Code Repository (PySpark transform). Line-delimited JSON with optional fields and a nested message envelope is awkward in Pipeline Builder; explicit schema enforcement in PySpark is cleaner.
**Logic:** apply an explicit StructType to the JSON, project the `PositionReport` message type only, retain `MMSI`, `Latitude`, `Longitude`, `Sog` (speed over ground in knots), `Cog` (course over ground in degrees), `ShipType`, and the source timestamp. Filter implausible positions: `Latitude` or `Longitude` outside the Iberian bbox `[[35.0, -10.0], [44.0, 5.0]]` are dropped; rows with `Sog > 50` knots are **flagged** (`sog_implausible = true`) rather than dropped — physically impossible for almost all commercial traffic but useful to surface as a data-quality signal. Compute a synthetic `observation_id` as `${MMSI}-${timestamp_epoch}`.
**Output:** `clean/aisstream/vessel_positions_v0`.
**Quality checks:** bbox-filter drop rate below five percent (most rows arrive inside the subscribed bbox); implausible-SOG flag rate below half a percent; null rate on `MMSI`, `Latitude`, `Longitude` below one percent.

## Stage 6 — Unified event substrate

**Input:** the five `clean/*` datasets above.
**Tool:** Pipeline Builder. The union and the per-source projection are flat.
**Logic:** project each clean dataset onto the canonical schema and union them:

- `event_id` (string, `${source}-${native_id}` — guarantees global uniqueness across sources).
- `event_type` (enum: `SEISMIC`, `WEATHER_WARNING`, `CYBER_ADVISORY`, `VESSEL_OBSERVATION`, `AIRCRAFT_OBSERVATION`).
- `occurred_at_utc` (timestamp UTC).
- `latitude`, `longitude` (float, WGS84; null for `CYBER_ADVISORY` rows since CVEs are non-spatial).
- `severity_normalized` (enum: `INFO`, `LOW`, `MEDIUM`, `HIGH`, `EXTREME`).
- `source` (enum: `IGN`, `AEMET`, `NVD`, `OPENSKY`, `AISSTREAM`).
- `payload_json` (string, the source-specific raw fields preserved for traceability and lineage).

The per-source `severity_normalized` mapping is defined explicitly here and **does not paraphrase the source's authoritative labels** — those stay in `payload_json`:

| Source | Source label | `severity_normalized` |
|---|---|---|
| IGN | magnitude >= 5.0 or EMS-98 intensity >= VI | `EXTREME` |
| IGN | magnitude 4.0–4.9 or EMS-98 III–V | `HIGH` |
| IGN | magnitude 3.0–3.9 | `MEDIUM` |
| IGN | magnitude < 3.0 | `LOW` |
| AEMET CAP | `Extreme` | `EXTREME` |
| AEMET CAP | `Severe` | `HIGH` |
| AEMET CAP | `Moderate` | `MEDIUM` |
| AEMET CAP | `Minor` | `LOW` |
| AEMET CAP | `Unknown` | `INFO` |
| NVD | CVSS v3 >= 9.0 OR `cisa_known_exploited = true` | `EXTREME` |
| NVD | CVSS v3 7.0–8.9 | `HIGH` |
| NVD | CVSS v3 4.0–6.9 | `MEDIUM` |
| NVD | CVSS v3 < 4.0 | `LOW` |
| OpenSky | (all observations) | `INFO` |
| AISStream | (all observations) | `INFO` |

Individual aircraft and vessel observations carry `INFO` severity because the operational signal lives in the **aggregate** (density per H3 cell per time window), not in the single observation — see [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md).

**Output:** `ontology/event_substrate_v0`.
**Quality checks:** total row count equals the sum of the five upstream counts; severity-mapping coverage one hundred percent (no rows fall through with a null `severity_normalized`); event-id uniqueness one hundred percent; `event_type` populated on every row.

> ⚠️ TODO: record the actual baseline row counts and null rates here after the first successful end-to-end build; the plus-or-minus-five-percent tolerances above are calibrated against those baselines.

## Identifier filtering (stages 4, 5, 6)

> 🎯 FRAMING: `icao24`, `callsign`, and `mmsi` are preserved in `payload_json` for lineage and audit traceability. They are **not** promoted to top-level columns on the unified substrate, and they are **not** exposed in the Workshop screens or in the AIP Agent surfaces. The Workshop binds to aggregated spatial buckets (H3 cells, see [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md)) and never to the per-observation identifier. This filtering is performed at the normalization step, not at the UI — a defence-in-depth design choice. The framing discipline established in [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) requires that the individual identifier never reach a query surface even if a future Workshop screen is accidentally bound at the wrong granularity.

The same discipline applies to the AIP Agent: the agent is bound to the ontology object types defined in [`08_ontology_design.md`](08_ontology_design.md), which expose aggregate properties only, never the raw payload identifier.

## Quality checks — what "green" looks like

Across all six stages, a build is considered green and promotable to `main` when:

- Row counts at every output are within plus-or-minus five percent of the upstream baseline (allowing for the documented filter drop rates).
- Null rate is below two percent on every primary-key and timestamp column.
- Severity-mapping coverage is one hundred percent (no fall-through nulls).
- Event-id uniqueness is one hundred percent on `ontology/event_substrate_v0`.
- The per-stage data-quality expectations (bbox-filter rate, implausible-SOG flag rate, CPE coverage, etc.) sit within the documented bands.

> ⚠️ TODO: each metric needs a concrete baseline recorded after the first end-to-end build; the bands above are working assumptions until measured.

## Versioning and branching

Every output dataset is suffixed `_v0`. Any schema change — adding a column, changing a type, renaming an enum value — bumps the suffix and the consuming pipelines are updated in lockstep. All development happens on a Foundry branch named after the stage (`pipeline/aemet-warnings-v0-cleanup` etc.); merges to `main` happen only after the quality checks above are green on the branch. The branch / transaction id is surfaced on the Workshop console per the discipline in [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) and [`09_workshop_app_spec.md`](09_workshop_app_spec.md), so that any chart or table the PoC produces carries the lineage of the build it was computed on.

## Cross-references

- The unified schema and the fusion logic that consumes `ontology/event_substrate_v0`: [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md).
- The ontology object types backed by the `clean/*` datasets: [`08_ontology_design.md`](08_ontology_design.md).
- The ingestion plan that produces the `raw/*` landing datasets: [`05_ingestion_plan.md`](05_ingestion_plan.md).
- The framing discipline that motivates the identifier-filtering design: [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md).
