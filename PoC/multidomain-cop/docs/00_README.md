# Multi-Domain Common Operational Picture — A Foundry-Native PoC for Crisis Management and Resilience Analysis

A four-week academic Proof of Concept that fuses five public real-time and near-real-time streams — seismic events, meteorological warnings, maritime AIS, aeronautical ADS-B, and published vulnerability advisories — into a single time-and-space substrate inside Palantir Foundry, exposed as an operational console for crisis-management decision support. It is a resilience exercise, not a target-mapping one, and the framing discipline is the load-bearing element of the deliverable.

> 🎯 FRAMING: The unit of analysis in this PoC is the **event** (an earthquake, a warning, a vessel position observation, an aircraft observation, a CVE publication), not the asset. There is no inventory of named critical infrastructure. There is no tracking of named individuals, vessels, or aircraft. The Workshop console fuses public open-data event streams so that a crisis-management coordinator can orient quickly during an incident. Read [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) before anything else.

## Intended audience

Two readers in mind:

1. **Operational command staff and crisis-management coordinators** (jefes de unidad, mandos de gestión de crisis, Protección Civil coordinators, civil-protection officers in a regional or national role): read [`01_executive_summary.md`](01_executive_summary.md) only. Five minutes. The rest is appendix.
2. **The technical author (the academic running the PoC) and any colleague continuing the work:** read the full set in the order below. The temporal-spatial fusion chapter and the ontology chapter are the load-bearing technical files.

## Reading order

| # | File | What it answers |
|---|---|---|
| 00 | this file | What is this, who is it for, where to start |
| 01 | [`01_executive_summary.md`](01_executive_summary.md) | The two-page version for command staff |
| 02 | [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) | The framing discipline and the explicit out-of-scope items — read before defending the PoC |
| 03 | [`03_architecture_overview.md`](03_architecture_overview.md) | The Foundry layer cake, in text |
| 04 | [`04_data_sources.md`](04_data_sources.md) | One section per stream with verified URLs |
| 05 | [`05_ingestion_plan.md`](05_ingestion_plan.md) | How each stream enters Foundry |
| 06 | [`06_pipeline_design.md`](06_pipeline_design.md) | Pipeline Builder + Code Repository transforms |
| 07 | [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md) | The technical heart: how heterogeneous events become one substrate |
| 08 | [`08_ontology_design.md`](08_ontology_design.md) | Event-centric (not asset-centric) ontology |
| 09 | [`09_workshop_app_spec.md`](09_workshop_app_spec.md) | The operational console, screen by screen |
| 10 | [`10_aip_agent_spec.md`](10_aip_agent_spec.md) | The analyst-assistant agent and its allowed scope |
| 11 | [`11_quiver_analyses.md`](11_quiver_analyses.md) | Three exploratory analyses prepared in advance |
| 12 | [`12_demo_script.md`](12_demo_script.md) | The 15-minute live runbook |
| 13 | [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) | Bias, AI Act, GDPR, framing discipline reinforced |
| 14 | [`14_glossary.md`](14_glossary.md) | Foundry terms + domain terms |
| 15 | [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md) | What v2 and v3 look like, and when NOT to continue |

## Prerequisites

- A Foundry account with access to: **Data Connection**, **Pipeline Builder**, **Code Repositories** (PySpark + Python), **Ontology Manager**, **Object Explorer**, **Workshop** (with the Map widget and time-series widget), **Quiver**, **AIP Logic**, **AIP Agent Studio**.
- Outbound HTTP access from Foundry connectors (or, where Foundry's connectors fall short, a small bridging host outside Foundry — see [`05_ingestion_plan.md`](05_ingestion_plan.md) for the AISStream WebSocket bridge pattern).
- API keys: AEMET OpenData (free, 3-month renewable), NVD (optional, raises rate limits), AISStream (free, GitHub sign-in), OpenSky account (optional, raises rate limits). IGN seismicity needs no key.
- An out-of-Foundry workstation able to parse CAP XML inside a TAR (the AEMET payload) and to run a tiny WebSocket-to-HTTP bridge during demo windows.

## Streams at a glance

| Stream | Authority | Update cadence | Volume in PoC scope |
|---|---|---|---|
| Seismic catalogue | IGN (Instituto Geográfico Nacional, Spain) | ~hourly on event | ~tens to low hundreds of events / month |
| Meteorological warnings (CAP) | AEMET (Agencia Estatal de Meteorología) | every 15–30 min | ~tens of active warnings / day, peninsular + islands |
| Vulnerability advisories | NVD (NIST National Vulnerability Database) | daily | ~50–150 CRITICAL CVEs / week |
| Aircraft observations (ADS-B) | OpenSky Network | 5–10 s state vectors, sampled by anonymous rate limit | snapshots during demo windows only |
| Vessel observations (AIS) | AISStream.io | real-time WebSocket | streaming during demo windows only |

All five are detailed with verified URLs, licences, and limitations in [`04_data_sources.md`](04_data_sources.md). No paid streams are used. No operator data is used.

## Total time estimate

| Block | Time (part-time) |
|---|---|
| Reading the documentation set end-to-end | half a day |
| Ingestion + raw landing of the five streams | 4 working days (the AISStream bridge + AEMET TAR-of-CAP parse are the awkward bits) |
| Normalization transforms (per stream) | 3 working days |
| Unified event substrate + temporal-spatial fusion | 4 working days |
| Ontology design + loading into Ontology Manager | 2 working days |
| Workshop console + Quiver analyses | 3 working days |
| AIP Agent + tested prompts | 2 working days |
| Demo rehearsal + risks/ethics review pass | 1 working day |
| **Realistic total** | **~4 working weeks part-time** |

## Honest scope and framing — read before the index

This PoC fuses five public open-data event streams into a single Foundry-native substrate, so that a crisis-management coordinator can answer questions like *"what is happening right now in this region across these domains"* on one screen rather than across three browser tabs and a phone call. It is a **decision-support** exercise, not a decision-making one. It is **event-centric**, not asset-centric: there is no `CriticalInfrastructure` object in the ontology, no inventory of named assets, no list of "things that could be attacked". Where spatial context is needed, the PoC uses generic admin boundaries (NUTS-3 provinces, INE municipality codes), coastline, and population centres — never an enumeration of operator-owned infrastructure.

The framing matters operationally and ethically. A naïve version of this exercise would drift into target-cataloguing under the guise of resilience analysis. This PoC is built to refuse that drift: the ontology is structured against it, the Workshop screens are designed against it, the AIP Agent is gated against it. Every later document reinforces this framing with [`> 🎯 FRAMING:`](02_framing_and_honest_limits.md) callouts. If at any point a reader feels a document is drifting toward target enumeration, the document is wrong and must be revised — not the framing.

The PoC is best read as the credible foundation for deciding what a v2 with operator data and proper crisis-management governance should look like. See [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md) for that decision frame.

## What you should be able to do after reading

- Sit down in Foundry on Monday and start ingesting the IGN seismic catalogue without further preamble.
- Defend the PoC's scope, framing, and limits in front of skeptical command staff, skeptical technical staff, and skeptical ethicists.
- Pivot the design if a stream becomes unavailable, because each file is self-contained enough to revise.
- Hand the documentation to a colleague and have them continue the work without drifting the framing.

If any of those four are not true after a careful read, the documentation has failed — log the gap in [`CHANGELOG.md`](CHANGELOG.md) (created at the end of the authoring session) and revise.
