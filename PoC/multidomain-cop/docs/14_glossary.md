# Glossary

Concise two-column reference. Each definition is one sentence (two if unavoidable). No marketing language. Cross-links point to the file where the term is first introduced or most fully treated.

> 🎯 FRAMING: Definitions stay descriptive. None of the entries below promise prediction, attribution, or individual identification — terms that suggest those capabilities (e.g. *target*, *exposure score*, *threat actor profile*) are absent on purpose.

## Foundry concepts

| Term | Definition |
|---|---|
| Ontology | Foundry's formal model of objects, links, and actions over which apps and AI agents query; the PoC's ontology is event-centric, see [`08_ontology_design.md`](08_ontology_design.md). |
| Object Type | A schema describing a class of business objects (in the PoC: `SeismicEvent`, `WeatherWarning`, `CyberAdvisory`, `VesselObservation`, `AircraftObservation`, `GeographicArea`, `AdministrativeRegion`). |
| Interface (Foundry interface) | A shared contract several Object Types implement (in the PoC: the `Event` interface implemented by all five event types). |
| Link Type | A typed relationship between two Object Types (in the PoC: `neighbour_of` between events, `intersects` between events and `GeographicArea`). |
| Action Type | A governed write-back operation against the Ontology; every submission is recorded in the Action Log (in the PoC: `acknowledge_event`, `dismiss_false_positive`, `attach_briefing_note`). |
| Action Log | Foundry's automatic, immutable audit record of every Action Type submission, including the submitter, timestamp, and payload; foundational to the human-in-the-loop guarantee in [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md). |
| Dataset | A Foundry-managed tabular artefact at a specific transaction id; the PoC's substrate is a chain of datasets from raw landing through normalization to the unified event substrate, see [`06_pipeline_design.md`](06_pipeline_design.md). |
| Branch | A named line of development against datasets, pipelines, and ontology; the PoC uses branches for safe pre-demo changes and rehearsed rollback, see [`12_demo_script.md`](12_demo_script.md). |
| Pipeline Builder | Foundry's low-code transform authoring environment used for the bulk of normalization, see [`06_pipeline_design.md`](06_pipeline_design.md). |
| Code Repository | A Foundry-hosted Git repository whose PySpark/Python transforms run against datasets where Pipeline Builder is insufficient (in the PoC: CAP XML parsing inside a TAR, and the H3 fallback). |
| Workshop | Foundry's app-building environment used to compose the operational console, see [`09_workshop_app_spec.md`](09_workshop_app_spec.md). |
| Map widget | A Workshop widget rendering ontology objects as geographic features on a basemap. |
| Time-series widget | A Workshop widget plotting numeric values against time, used for domain timelines and per-area densities. |
| Quiver | Foundry's interactive analysis environment used for the three exploratory analyses prepared in advance, see [`11_quiver_analyses.md`](11_quiver_analyses.md). |
| AIP Logic | The function-authoring layer for LLM-backed transformations bound to the Ontology. |
| AIP Agent (Agent Studio) | A bounded conversational agent over the Ontology with an explicit tool allow-list and system prompt, see [`10_aip_agent_spec.md`](10_aip_agent_spec.md). |
| Object Explorer | Foundry's interactive browser of Ontology objects, used during development and as a backup view during the demo. |
| Data Connection | The Foundry-side configuration of an inbound data source; HTTP-first, with the AISStream WebSocket handled by an external bridge as documented in [`05_ingestion_plan.md`](05_ingestion_plan.md). |
| RID (Resource Identifier) | A globally unique stable identifier Foundry assigns to every resource (dataset, object type, branch, action, agent). |

## Domain concepts

| Term | Definition |
|---|---|
| AIS | Automatic Identification System — the maritime radio protocol vessels broadcast position and identifier on; in the PoC, sourced via AISStream, see [`04_data_sources.md`](04_data_sources.md). |
| MMSI | Maritime Mobile Service Identity — the per-vessel AIS identifier; filtered out at normalization and never exposed in the Workshop or Agent, see [`06_pipeline_design.md`](06_pipeline_design.md). |
| ADS-B | Automatic Dependent Surveillance-Broadcast — the aeronautical protocol aircraft broadcast position and identifier on; in the PoC, sourced via OpenSky. |
| icao24 | The 24-bit ICAO-assigned aircraft transponder identifier; filtered out at normalization on the same basis as MMSI. |
| callsign | An aircraft's currently broadcast flight identifier; filtered out at normalization. |
| CAP | Common Alerting Protocol — the ITU/OASIS XML standard AEMET uses to publish warnings, see [`04_data_sources.md`](04_data_sources.md). |
| CAP severity | A CAP field taking the values `Extreme`, `Severe`, `Moderate`, `Minor`, `Unknown`; preserved verbatim in `payload_json` and mapped to `severity_normalized` only for cross-domain comparison. |
| CAP certainty | A CAP field expressing forecaster confidence (`Observed`, `Likely`, `Possible`, `Unlikely`, `Unknown`); preserved verbatim. |
| CAP urgency | A CAP field expressing how soon a response is needed (`Immediate`, `Expected`, `Future`, `Past`, `Unknown`); preserved verbatim. |
| CPE | Common Platform Enumeration — NVD's structured naming scheme for vendor/product/version affected by a CVE; known to be noisy, see [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md). |
| CVE | Common Vulnerabilities and Exposures — the public catalogue of disclosed software/hardware vulnerabilities maintained at NVD. |
| CVSS | Common Vulnerability Scoring System; both v2 and v3 metrics are present in NVD payloads and preserved in `payload_json`. |
| CISA known-exploited flag | A flag set on a CVE when CISA's Known Exploited Vulnerabilities catalogue lists it as having confirmed in-the-wild exploitation. |
| EMS-98 intensity | European Macroseismic Scale 1998 — the qualitative scale IGN reports as `max_intensity` per seismic event, partly informed by public felt-reports and biased by population density. |
| Mw | Moment magnitude — the principal magnitude scale IGN reports for medium and large events. |
| mbLg | Lg-wave body-wave magnitude — a regional magnitude scale IGN reports for smaller events at short epicentral distances. |
| H3 | Uber's hexagonal hierarchical spatial index; the PoC uses H3 cells as the unit of aggregation for AIS and ADS-B densities, see [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md). |
| H3 resolution | The H3 cell-size level; resolution 6 (~36 km² average per cell) is the PoC default. |
| NUTS | Nomenclature of Territorial Units for Statistics — the EU hierarchical administrative-region scheme. |
| NUTS-3 | The province-level NUTS unit; in Spain it aligns with provinces and the PoC uses it for cross-domain spatial joins. |
| INE municipality code | The Spanish Instituto Nacional de Estadística's per-municipality numeric code used in the `AdministrativeRegion` object. |
| WGS84 / EPSG:4326 | The geodetic reference system and SRID used for all coordinates in the PoC. |
| Protección Civil | The Spanish civil-protection system spanning national, autonomous-community, and municipal levels; the PoC's intended operational owner in v2. |
| EU Civil Protection Mechanism | The EU-level framework for cross-border civil-protection coordination; the PoC's framing inherits from this lineage, see [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md). |
| Common Operational Picture (COP) | A single situational view shared across responders during an incident; in this PoC, an event-centric COP, not an asset catalogue. |

## Cross-links

- [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) — terms used in the framing discipline.
- [`04_data_sources.md`](04_data_sources.md) — authoritative sources for each domain term.
- [`08_ontology_design.md`](08_ontology_design.md) — the Foundry-side terms in action.
- [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) — the bias and governance terms in context.
