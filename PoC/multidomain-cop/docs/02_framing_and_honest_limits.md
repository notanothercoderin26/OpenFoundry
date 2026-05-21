# Framing and Honest Limits

This is the load-bearing document of the entire deliverable. Every later file inherits the framing decided here. If a reader feels a later document drifts from the discipline below, the later document is wrong and must be revised — the framing stays.

## The framing discipline in one paragraph

This PoC fuses public open-data event streams (seismic, meteorological, maritime, aeronautical, cyber) into a single time-and-space substrate for **crisis-management situational awareness**. The unit of analysis is the **event**. The ontology has no `CriticalInfrastructure` object. Where spatial context is needed, the PoC uses generic admin boundaries, coastline, and population centres — not an inventory of named operator-owned assets. The Workshop console is designed for a coordinator who needs to orient quickly during an incident, not for an analyst building a target file. The AIP Agent is gated to refuse questions that would shift the unit of analysis from events to assets or to individuals. This discipline is not cosmetic. It is the difference between a resilience COP and a target catalogue, and it is the difference between an academic exercise that is defensible and one that is not.

> 🎯 FRAMING: If at any point a reader feels a document is drifting toward asset enumeration, target mapping, or individual identification, the document is wrong and the framing stays. Open an issue against the document and revise it. Do not revise the framing.

## What is in scope

- **Five event streams**, fused on time and space:
  - IGN seismic catalogue (Spain and nearby).
  - AEMET meteorological warnings in CAP.
  - NVD vulnerability advisories filtered by severity and time.
  - OpenSky aircraft observations over Iberian airspace, sampled during demo windows.
  - AISStream vessel observations over Iberian waters, streamed during demo windows.
- **A unified event schema** (`event_id`, `event_type`, `occurred_at_utc`, `latitude`, `longitude`, `severity_normalized`, `source`, `payload_json`) that lets a coordinator query across domains in one vocabulary. See [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md).
- **An event-centric Foundry Ontology** with object types `SeismicEvent`, `WeatherWarning`, `CyberAdvisory`, `VesselObservation`, `AircraftObservation`, plus a generic spatial-context type `GeographicArea` and a coarse `AdministrativeRegion` for NUTS-3 / municipality lookups. See [`08_ontology_design.md`](08_ontology_design.md).
- **A Workshop console** for situational awareness: live map, event detail with cross-domain neighbours, domain pivot, anomaly queue (rule-based, human-in-the-loop), briefing generator, history/audit. See [`09_workshop_app_spec.md`](09_workshop_app_spec.md).
- **An AIP Agent** that answers bounded questions over the event ontology and refuses out-of-scope ones. See [`10_aip_agent_spec.md`](10_aip_agent_spec.md).

## What is out of scope

> 🎯 FRAMING: This list is not exhaustive of every possible misuse. It is the explicit boundary against the failure modes that matter most for this PoC.

- **No inventory of named critical infrastructure.** There is no `CriticalInfrastructure`, `PowerSubstation`, `Pipeline`, `Port`, `Airport`, `DataCenter` object type. There is no list of named assets and their coordinates. The spatial context is generic: admin boundaries, coastline, population centres from INE.
- **No tracking of named individuals, vessels, or aircraft.** MMSIs and aircraft tail numbers / icao24 identifiers are present in the raw stream and **filtered to aggregate context** before they reach the Workshop or the AIP Agent. The unit displayed is the **observation count per spatial bucket per time window**, never the individual identifier.
- **No predictive scoring of "targets".** No model labels a location, a region, an asset, or an actor as high-risk, vulnerable, or likely to be attacked. The PoC is descriptive.
- **No attribution.** Cross-domain proximity (e.g. a CVE published in the same week as an unusual AIS pattern) does not imply causation. Documents reinforce this, and the AIP Agent refuses to draw causal links.
- **No real-time alerting on individual vessels or aircraft.** The anomaly queue operates on aggregate spatial-temporal patterns, not on per-MMSI or per-icao24 trajectories.
- **No operator data.** REE, ENAGAS, AENA, port authorities, Protección Civil internal systems are out of scope. v2 is where those wire onto the same substrate. See [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md).

## Why the framing distinction matters

A naïve common-operational-picture PoC drifts naturally toward asset enumeration: *"we have a map; let us put the things on it; let us colour the things by exposure to the events."* Each step is small and plausible. The end state — a labelled inventory of named infrastructure with severity colouring — is a target catalogue with a resilience preamble. The end state is not the same thing as the preamble.

> 🎯 FRAMING: The discipline is not "do not draw maps". The discipline is "the map shows events, not assets, and the spatial context is generic". A coordinator orienting on an incident does not need a named-asset overlay to make decisions — they need to see what is happening, where, and when, fused across domains, with a clear way to flag a multi-signal pattern for human review.

Publicly available resilience-oriented common operational pictures — the EU Civil Protection Mechanism, INTERREG cross-border crisis projects, the JRC critical-infrastructure resilience literature — share this orientation. They emphasise event fusion, multi-actor coordination, and post-event reconstruction over pre-event asset enumeration. This PoC is in that lineage and inherits its discipline.

## Known data-quality limits

| Limit | Stream | Operational consequence |
|---|---|---|
| The IGN CSV export endpoint is a Liferay portlet, not a stable API; the URL may change without notice | IGN | The ingestion plan documents the manual-CSV-upload fallback; see [`05_ingestion_plan.md`](05_ingestion_plan.md). |
| AEMET payload is a TAR archive of CAP XMLs, not a flat JSON; CAP itself is a rich ITU/OASIS schema | AEMET | A Code Repository transform unpacks and parses CAP; see [`06_pipeline_design.md`](06_pipeline_design.md). |
| NVD vendor-product mapping (CPE) is noisy; multiple CPEs per CVE, multiple versions per CPE | NVD | The pipeline extracts vendor and product but the analyst must not treat them as ground truth. |
| OpenSky anonymous rate limit and aircraft opt-outs (some are filtered upstream) | OpenSky | The pipeline samples; the Workshop is honest about gaps. |
| AISStream free tier is real-time only; no historical archive | AISStream | The PoC stores only what is captured during demo windows; v2 needs a paid AIS historical feed. |
| Some vessels deliberately turn off AIS transponders | AIS in general | The Workshop must not present absence-of-signal as evidence of anything; `> ⚠️ TODO: add an explicit "AIS-silent regions" disclaimer to the relevant Workshop screen.` |
| Reporting bias across all five sources | All | Findings are framed as patterns visible in the published data, never as ground truth. |

> 💡 TIP: Every chart and table the PoC produces should carry the dataset version (Foundry transaction or branch) it was computed on. Surface it on the Workshop console. It is the difference between *"this is what we saw on this build"* and *"this is what is true"*.

## Ethical and legal limits

- **EU AI Act framing.** This PoC is a **decision-support tool**, not automated decision-making. The AI Act distinguishes risk tiers; decision-support over public administrative data with a documented human-in-the-loop step does not fall into the prohibited or high-risk categories *as built*. A production deployment that auto-blocks responders, auto-dispatches resources, or auto-classifies locations would be a different system requiring its own assessment. See [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md).
- **GDPR / LOPDGDD.** Although all sources are open, **vessel MMSIs and aircraft tail numbers can be tied to natural persons in some cases** (small craft owners, private aviation). The PoC mitigates by filtering individual identifiers out before they reach the Workshop or the AIP Agent — only aggregates are shown. A future iteration that re-introduces them requires a Data Protection Impact Assessment.
- **CAP severity vocabulary.** AEMET warnings use CAP severity/certainty/urgency fields. The Workshop must not paraphrase those into ad-hoc severity labels; the original AEMET labels stay, with their authoritative interpretation. See [`06_pipeline_design.md`](06_pipeline_design.md) and [`09_workshop_app_spec.md`](09_workshop_app_spec.md).
- **Spanish administrative units.** Spatial joins use NUTS-3 (provinces) and INE municipality codes where appropriate; the documentation does not invent boundary schemes.
- **Crisis-management framing.** The PoC's narrative for any demo is *situational awareness for crisis coordination under existing frameworks (EU Civil Protection Mechanism, Protección Civil)*, not surveillance, not enforcement, not targeting. The demo script in [`12_demo_script.md`](12_demo_script.md) enforces this in the spoken narration as well as in the screens.

## Cost transparency

- **Foundry is not free.** Production deployment of a comparable platform — Foundry compute + Ontology + Workshop + AIP — carries non-trivial annual licensing. The PoC assumes a demo/academic tenancy is available; production economics are out of scope here but are surfaced in [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md), alongside open-source (PostGIS + Kafka + Grafana) and commercial-alternative (Databricks + dashboards) comparators.
- **Commercial historical AIS** (MarineTraffic, Spire, Kpler), **commercial historical ADS-B**, and **satellite AIS coverage of dark-vessel areas** are not free and are not in scope here. They are mandatory for v2 if the use case includes any retrospective maritime analysis with confident coverage.
- **Operator data** carries its own licensing and access cost (legal basis, accreditation, integration effort) and is out of scope here.
- **The single largest hidden cost in v1** is the engineering glue around streams that don't fit cleanly into Foundry's connector catalogue (AISStream WebSocket bridge, AEMET TAR-of-CAP parsing, OpenSky rate-limit-aware sampling). Plan for it.

## What v2 would require

- **Operator data on the same substrate**: REE / ESIOS for electricity, ENAGAS for gas, AENA for airport operations, port-authority feeds where lawful, Protección Civil internal feeds where authorised. Each of these adds value precisely because the ontology is **event-centric**: operator events (a generation outage, a flow change, a runway closure) plug into the existing event schema without bending the model.
- **A DPIA** (Data Protection Impact Assessment) — not a checkbox; a substantive assessment now that individual identifiers might be in the pipeline behind proper governance.
- **A legal basis** for processing each new stream, defined per source.
- **Project markings and role-based access** aligned with the customer's classification regime.
- **Security accreditation** for the tenancy if any operator stream is sensitive.
- **An explicit operational handover** to a crisis-management team that will own the COP on a real shift; without that handover the COP is shelfware regardless of how well it is built.

> 🎯 FRAMING: v2 does not abandon the framing discipline. v2 brings operator data **onto the same event-centric substrate** — operator-reported events, not operator-owned-asset inventories. The discipline survives the upgrade.

## What a careful reader should take away

The PoC is honest about its boundaries. It fuses public open-data event streams onto a single Foundry-native substrate, exposed as an operational console with a bounded analyst-assistant agent, with a framing discipline that refuses to drift into target enumeration. It does not promise prediction, attribution, individual identification, or asset cataloguing. Within those boundaries it is genuinely useful as a resilience exercise and as the credible foundation for a v2 with operator data and proper governance.

> 🎯 FRAMING: Do not let any later document, any demo narration, or any AIP Agent answer drift from this. The discipline is the deliverable.
