# Quiver Analyses

Three analyses prepared in advance in Quiver, exposed during the demo, and kept in the documentation set as exemplars of the kind of question the event-centric substrate is designed to answer. Each is described by its inputs, the Quiver transformations it uses (verbs only — no PySpark code), the chart it renders, and the operational question it answers.

> 🎯 FRAMING: Quiver is for **exploratory** analysis on top of the unified event substrate ([`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md)) and the event-centric ontology ([`08_ontology_design.md`](08_ontology_design.md)). None of the analyses below produce asset enumerations, individual-identifier disclosures, or predictive scores. The substrate is the same one the Workshop console ([`09_workshop_app_spec.md`](09_workshop_app_spec.md)) and the AIP Agent ([`10_aip_agent_spec.md`](10_aip_agent_spec.md)) read.

## Analysis 1 — Daily event count by domain over the last 90 days

**Inputs.** The `Event` interface, in its aggregated daily form. No per-row identifiers are read; only the `event_type`, the `occurred_at_utc` day bucket, and a count.

**Quiver transformations.** Filter to the last 90 days. Group by `event_type` and by day. Pivot the day axis to columns for the per-domain time series. Window over a rolling 7-day mean to draw the baseline.

**Chart.** A line chart with one line per domain plus a faint rolling-mean baseline per domain. Time on the x-axis, count on the y-axis, domain encoded by colour.

**Operational question answered.** *"What is the baseline rhythm across domains, and where does today sit against the baseline?"* — the chart lets the analyst see at a glance whether the last day's activity is in family with the 90-day pattern, or whether one or more domains are spiking. This is the substrate-level health check; it is *not* an alerting view (alerting is the anomaly queue's job in the Workshop console).

## Analysis 2 — Spatial heatmap of seismicity vs weather warnings vs maritime density

**Inputs.** Three object types, each aggregated to H3 hex resolution 6 (~36 km² average cell): `SeismicEvent` (counts per cell over the last 30 days), `WeatherWarning` (active-warning area coverage per cell, expressed as warning-hours per cell), `VesselObservation` (aggregate observation density per cell — count of observations, not vessels). The H3 indexing is the same one used by the substrate, computed in Pipeline Builder or in a Code Repository PySpark transform (`[07_temporal_spatial_fusion.md](07_temporal_spatial_fusion.md)`).

**Quiver transformations.** Filter each input to the last 30 days. Group by H3 cell id. Compute the per-layer count (seismic event count, warning-hours, observation density). Render as three overlaid heatmap layers on the same map canvas, with layer toggles. No per-event detail rendered.

**Chart.** A three-layer heatmap map. Each layer has its own colour scale and its own legend. Layers can be toggled independently or compared two-at-a-time.

**Operational question answered.** *"Where do the three domains overlap geographically, in aggregate, over the last month?"* — useful for spotting cells with persistent multi-domain activity (e.g. coastal cells with both AEMET warning activity and dense AIS traffic during the same period), which informs where the analyst spends attention during a shift. The heatmap is **aggregate-only**: no individual vessel, no individual warning polygon, no individual seismic event is identifiable from the chart, by construction.

> 🎯 FRAMING: This analysis is exactly where drift toward asset enumeration is plausible — *"now overlay the ports on top of the heatmap"*. The discipline says no. If a future iteration wants asset overlays, it belongs in v2 with the governance changes documented in [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md). For v1, the heatmap shows event aggregates against generic spatial context only.

## Analysis 3 — Lag analysis: CVE publication date vs vendor-specific operational disruptions

**Inputs.** `CyberAdvisory` objects (CVE id, publication date, vendor, product, CVSS v3 score, CISA known-exploited flag) plus a **manual-annotation dataset** the analyst maintains by hand: a small CSV (one row per recorded operational disruption, with vendor, product, disruption date, and a free-text note). The annotation dataset is **not** an automated cross-domain match; it is the analyst's own record of disruptions they have observed in public reporting that plausibly affect the same vendor.

**Quiver transformations.** Join `CyberAdvisory` to the annotation dataset on vendor and product. For each match, compute `lag_days = disruption_date - cve_pub_date`. Filter to the last 365 days. Group by lag-day bucket. Render as a histogram.

**Chart.** A histogram of `lag_days`, with negative values (disruption preceded CVE publication) and positive values (CVE preceded disruption) both visible. A vertical line at zero. No vendor or product is named on the chart.

**Operational question answered.** *"Across the matched annotation set, what is the temporal relationship between cyber advisory publications and recorded operational disruptions for the same vendor — and is there a visible distribution shape that warrants further investigation?"* The intent is to demonstrate that cyber and physical domains can be analysed on the same substrate, not to claim a causal relationship.

> ⚖️ ETHICS: This is **exploratory only**. The chart shows a temporal distribution over a small, analyst-curated annotation set. It is not evidence of causation. It is not evidence of a pattern in the population — the annotation set is biased by the analyst's reading habits, by the visibility of disruptions in public reporting, and by vendor-product naming conventions that themselves are noisy.

> 🎯 FRAMING: This analysis exists to demonstrate that cyber and physical domains can be analysed on the same substrate, **not** to claim a causal relationship between CVE publication and operational disruption. The PoC does not perform attribution and does not score the "vulnerability" of any operator. If the histogram looks suggestive, the appropriate next step is more carefully designed analysis with a documented methodology, not an operational claim. See [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) and [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md).

## What Quiver is for, and what it is not for

Quiver is for **exploratory** analysis on top of the substrate. Its outputs inform the next iteration of pipelines, ontology, Workshop views, and AIP Agent tools. Quiver outputs are not production reports. A Quiver chart that turns out to be useful on every shift is **promoted** to a dataset-backed Workshop view ([`09_workshop_app_spec.md`](09_workshop_app_spec.md)) before sharing with command staff. The promotion step is non-negotiable: it forces the chart to be backed by a versioned dataset with a Foundry transaction id.

> 💡 TIP: every Quiver analysis above should carry the dataset version (Foundry transaction id) of the substrate it was computed on, in a caption.

See [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md) for the substrate these analyses read, [`08_ontology_design.md`](08_ontology_design.md) for the object types they bind to, [`12_demo_script.md`](12_demo_script.md) for the spoken narration of the analyses during the demo, and [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) for the governance posture this work inherits.
