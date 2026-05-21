# Temporal-Spatial Fusion

This is the technical heart of the PoC. The previous chapter ([`06_pipeline_design.md`](06_pipeline_design.md)) describes how each stream is cleaned into a per-source normalized table and then projected into a unified event substrate (`ontology/event_substrate_v0`). This chapter describes how that substrate is used: how five heterogeneous streams become one queryable time-and-space surface, what the trade-offs are, and what the resulting fusion can and cannot say.

The prose is deliberate. The author will implement the joins and aggregations in Pipeline Builder where the operation is expressible declaratively and in Code Repository PySpark transforms where it is not (H3 indexing, polygon-cell explosion). No PySpark code appears in this document.

## Why heterogeneous-stream fusion is hard

The five streams disagree on almost every dimension that matters for a join.

**Time base.** IGN publishes seismic events with an event-time timestamp (the moment of the rupture) and a publication-time roughly an hour later. AEMET CAP warnings carry an `effective` and an `expires` window — the warning is valid over an interval, not at an instant. NVD CVE advisories carry a publication date that is unrelated to when the vulnerability became exploitable (which is unknowable in general). OpenSky state vectors carry a position-time stamp updated every five to ten seconds per aircraft. AISStream messages carry a message-time stamp updated more often still. A naïve join on a single timestamp column quietly conflates *event time*, *publication time*, *validity interval*, and *observation time*. The unified schema's `occurred_at_utc` papers over this by choosing the most operationally meaningful timestamp per source (event time for IGN, `effective` for AEMET, publication time for NVD, position time for OpenSky and AISStream); the original values are preserved in `payload_json` so the analyst can dig if needed.

**Spatial resolution.** IGN events are points (epicentre coordinates). AEMET warnings are polygons (often a whole NUTS-3 province or a coastal segment). AIS and ADS-B are per-observation points sampled frequently in time. CVE advisories are not spatial at all — there is no defensible way to put a CVE on a map. Joining a point to a polygon is a different operation from joining a point to a point, which is a different operation again from joining a polygon to a polygon, which is a different operation again from joining anything to a non-spatial row.

**Severity vocabulary.** IGN uses moment magnitude (Mw) and local magnitude (mbLg), plus EMS-98 macroseismic intensity. AEMET CAP carries three orthogonal axes: severity, certainty, urgency, each with their own ITU/OASIS-defined vocabulary. NVD carries CVSS v2 and v3 scores plus the CISA known-exploited flag. AIS and ADS-B observations have no native severity at all. The unified `severity_normalized` column ([`06_pipeline_design.md`](06_pipeline_design.md)) is a coarse mapping for sorting and filtering only; the authoritative labels stay in `payload_json` and surface in the Workshop detail panes.

**Latency.** IGN publishes events about an hour after the rupture. AEMET CAP refreshes every fifteen to thirty minutes. NVD updates daily. OpenSky state vectors refresh every five to ten seconds. AISStream is real-time. A live dashboard that displays all five must be honest about the fact that the seismic layer is up to an hour stale even when the AIS layer is current; the Workshop renders the per-stream "last update" timestamp prominently.

## The unified event schema, and why each field exists

The canonical schema, repeated from [`06_pipeline_design.md`](06_pipeline_design.md) and the canonical-decisions document, is:

- `event_id` (string, `${source}-${native_id}`). Globally unique across sources; lets every downstream join reference an event without ambiguity.
- `event_type` (enum: `SEISMIC`, `WEATHER_WARNING`, `CYBER_ADVISORY`, `VESSEL_OBSERVATION`, `AIRCRAFT_OBSERVATION`). Lets the Workshop and the AIP Agent filter by domain without inspecting the source.
- `occurred_at_utc` (timestamp UTC). The single time axis for all temporal joins. The chosen value per source is documented above; the raw alternatives sit in `payload_json`.
- `latitude`, `longitude` (float, WGS84). The single space axis for all spatial joins. `null` for `CYBER_ADVISORY` because CVEs have no geographic locus. A pipeline-level decision: `CYBER_ADVISORY` rows are **not** backfilled with a default centroid — a null is more honest than a fake coordinate, and the cyber stream is surfaced in the Workshop on its own temporal axis without participating in the spatial-proximity joins (see below).
- `severity_normalized` (enum). Coarse, sortable, lossy on purpose. The authoritative label is preserved in `payload_json`.
- `source` (enum). For provenance display and per-source filtering.
- `payload_json` (string). The raw source fields preserved for traceability, lineage, and the rare case where the analyst needs to escape the unified schema. The Workshop never auto-renders `payload_json` — it is for drill-down only, and identifier fields inside it are gated against the AIP Agent.

## Temporal bucketing

Two bucket sizes are used in v1:

- **Five-minute windows** for the dashboard's domain-pivot view and for the live map's "events in the last N minutes" filter. Five minutes is short enough to feel current to a coordinator and long enough that the bucket-edge effects on streams with seconds-resolution timestamps (AIS, ADS-B) are small.
- **One-minute windows** for the anomaly queue's rolling-window scans. The anomaly rules (defined in [`09_workshop_app_spec.md`](09_workshop_app_spec.md)) look for cross-domain coincidences — and the smaller the temporal window, the lower the false-positive rate on coincidence-based rules. One minute is the practical floor given AEMET's fifteen-minute refresh and IGN's hour-scale publication latency.

The trade-off is straightforward: smaller buckets give tighter joins and more selective anomaly rules but cost more in compute and produce more empty buckets. Five-minute and one-minute were chosen as the smallest sizes that respect the slowest source's latency.

The bucketing is computed as an additional column (`bucket_5m_utc`, `bucket_1m_utc`) on the unified substrate during a downstream transform; the temporal joins below all reference these buckets rather than recomputing them per query.

## Spatial bucketing

H3 hex resolution 6 is the v1 spatial bucket. At resolution 6 each cell averages roughly 36 km² — coarse enough that aggregation produces meaningful counts on a sparse stream like AIS off the Iberian coast, fine enough that the map view does not collapse into a few enormous polygons.

The point-stream sources (IGN, OpenSky, AISStream) get an `h3_cell_r6` column added at the unified-substrate level by indexing their `(latitude, longitude)` pair. The polygon-stream source (AEMET CAP) is handled by a separate explode-and-aggregate pattern: each warning polygon is rasterized into the set of H3 cells it covers, producing one `(warning_id, h3_cell_r6)` row per covered cell, and the per-cell view of "active warnings" is then a simple aggregation. CVEs are non-spatial and do not receive an H3 cell.

Raw `latitude` and `longitude` are retained alongside the H3 cell so that the Workshop's point-map mode still renders individual events at their published coordinates; the H3 cell is for aggregation and for cross-stream joins, not for display in the per-event detail view.

> ⚠️ VERIFY: confirm H3 availability in Pipeline Builder; if not available, compute H3 in a Code Repository PySpark transform using the `h3-pyspark` library. The polygon-to-cell explode for AEMET CAP almost certainly requires a Code Repository transform either way, since polygon rasterization with H3 is not commonly exposed as a built-in Pipeline Builder operation on demo tenancies.

## Cross-stream join patterns

Three patterns cover the v1 use cases. All three are described as queries against the unified substrate joined to itself or to derived per-bucket aggregates.

**Pattern A — point-near-point in time and space.** Example: *any AIS observation within fifty kilometres and sixty minutes of a seismic event of magnitude greater than four*. The query selects seismic rows from the substrate with `magnitude_mw >= 4`, joins to vessel-observation rows on a bucket-narrowed temporal predicate (events whose `occurred_at_utc` differ by less than sixty minutes) and a haversine-or-H3-neighbourhood spatial predicate. The H3 neighbourhood approach is cheaper: for each seismic event, expand its `h3_cell_r6` into the set of cells within a configurable ring radius (a ring of two at resolution 6 covers roughly the right distance), and join AIS rows on cell membership. The fifty-kilometre threshold is then enforced exactly with a haversine post-filter. This is the worked-example pattern for the Cabo de Gata reconstruction below.

**Pattern B — polygon-intersects-cell with stream density.** Example: *AEMET warning polygons currently active over H3 cells that show elevated ADS-B holding-pattern density*. The query joins the per-cell active-warning aggregate (from the polygon-explode pipeline) to a per-cell aircraft-observation density aggregate over a five-minute window, filtered to cells where the density exceeds a configurable threshold. Holding-pattern *detection* is out of scope for v1 — what the query actually surfaces is elevated observation density, which an analyst then reviews; the documentation does not pretend that elevated density equals a holding pattern.

**Pattern C — temporal-only, no spatial join.** Example: *NVD CVEs published in the last seven days affecting vendors in a watchlist (Siemens, Schneider, ABB, Hitachi)*. The cyber stream has no `latitude` / `longitude` and does not participate in any of the spatial joins above. It is surfaced alongside the others on the Workshop's domain-pivot view and in the anomaly queue's per-domain timeline, but it is **never causally linked** to physical events by any automated rule. A spike in CRITICAL CVEs in a week when a felt earthquake also happens is a coincidence on the Workshop unless an analyst manually links them with the `link_events` action ([`08_ontology_design.md`](08_ontology_design.md)).

## Worked example — Cabo de Gata 14 July 2025 Mw 5.3

The demo anchor is the felt earthquake off Cabo de Gata on 14 July 2025, Mw 5.3 reported by IGN. The fusion pipeline, run on the substrate populated for that week, produces:

- The IGN seismic event itself, with `severity_normalized = EXTREME` (above the magnitude-five threshold), rendered on the Workshop map at its published epicentre.
- A pattern-A join surfaces AIS observations within fifty kilometres of the epicentre during the sixty minutes before and after the event. The reconstruction does not show "the ships felt the earthquake" or anything of the kind — it shows what AIS traffic was present in the area at the time, aggregated per H3 cell, so that a coordinator orienting on a felt event can see whether maritime traffic was sparse or busy.
- A pattern-B join surfaces any AEMET CAP warnings active in the affected provinces (Almería, Granada) during the same window. In July 2025 these are likely to include heat-wave warnings; the reconstruction shows them as concurrent context, not as causes or consequences.
- A pattern-C query surfaces CRITICAL CVEs published that week affecting industrial-control vendors. There is no causal link to the seismic event; the CVE list sits in its own pane.

> 🎯 FRAMING: this is **post-hoc situational reconstruction**, not retroactive prediction. The example shows what the COP would surface for a coordinator orienting on a felt earthquake during their shift — what is happening in adjacent domains, in one view. It is not a claim that the COP would have warned anyone of anything in advance, nor a claim that the cross-domain coincidences shown are anything other than coincidences. The same reconstruction run on a week where nothing happened would produce the same shape of output with different content.

## What fusion cannot do

The fusion produces **co-occurrence**, which is descriptive. It does not produce:

- **Causal inference.** That an AIS pattern and a seismic event co-occur in a bucket implies nothing about whether one caused the other. The Workshop labels reflect this; the AIP Agent refuses causal questions ([`10_aip_agent_spec.md`](10_aip_agent_spec.md)).
- **Attribution.** No fusion rule names an actor, an operator, or an intent.
- **Prediction.** No model on the substrate forecasts future events. The PoC is descriptive.
- **Per-individual analysis.** The substrate retains MMSI and icao24 in `payload_json` for lineage, but the fusion joins and the downstream surfaces aggregate at H3-cell and time-window granularity. Pattern A above produces "AIS observation count per cell" rather than "vessel MMSI X was at position Y" — the per-MMSI breakdown is not exposed.

> 🎯 FRAMING: cross-domain proximity in this substrate is descriptive only. The fusion lets a coordinator see what is co-occurring; it does not let anyone infer why. Every Workshop screen that surfaces a fusion result carries language to this effect. Every AIP Agent answer that touches a fusion result acknowledges it. The framing discipline from [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) governs the fusion layer as strictly as it governs the ontology and the UI.

## Foundry-specific advice

The work splits naturally across Foundry tools:

- **Pipeline Builder** owns the temporal-window joins, the per-bucket aggregates, and the unified-substrate union. These are flat declarative operations and benefit from Pipeline Builder's lineage view.
- **Code Repository (PySpark)** owns the H3 indexing (resolution-6 cell assignment for point streams, polygon-to-cell rasterization for AEMET CAP), and the H3-ring expansion used in pattern A. These need a library call (`h3-pyspark`) that may not exist in Pipeline Builder's transform catalogue on the author's tenancy.
- **Object Explorer** is for ad-hoc inspection — given an `event_id`, look at the row, look at its neighbours via the `neighbour_of` link (defined in [`08_ontology_design.md`](08_ontology_design.md)).
- **Workshop** is the analyst surface — described in [`09_workshop_app_spec.md`](09_workshop_app_spec.md), it binds to the ontology rather than to the raw substrate.

> ⚠️ VERIFY: confirm the Workshop Map widget's per-screen layer count and feature count limits before pushing more than around five thousand events onto a single screen; the seismic + warning-polygon + aggregated-AIS + aggregated-ADS-B overlay may need an aggregation tightening if the widget begins to lag.

## Cross-references

- The per-stream normalization that produces the substrate consumed here: [`06_pipeline_design.md`](06_pipeline_design.md).
- The ontology object types bound to the fusion results: [`08_ontology_design.md`](08_ontology_design.md).
- The framing discipline that constrains what the fusion is allowed to claim: [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md).
