# Executive Summary

> Intended reader: operational command staff and crisis-management coordinators. Reading time: five minutes. Skip the rest of this documentation set unless you decide to fund the next iteration.

## Problem framing

When something happens — a felt earthquake on the coast, a red weather warning in a province, an unusual maritime pattern off the Strait, a critical CVE published affecting a vendor common in operational technology — the information that lets a coordinator orient is **siloed**. The seismic catalogue lives at IGN's portal. Weather warnings live at AEMET. Vessel positions live in the AIS world. Aircraft positions live in ADS-B feeds. Vulnerability advisories live at NVD. Each silo has its own interface, its own time base, its own severity vocabulary, its own update cadence. In an incident, a coordinator who needs to look at all five at once opens five browser tabs, calls a colleague, copies coordinates into a spreadsheet, and loses minutes that matter.

This is a **fusion problem**, not a data-acquisition problem. The data is public and free. The work is in giving it one substrate.

## Approach

This PoC builds, inside Palantir Foundry, a single Common Operational Picture (COP) that joins five public streams onto one time-and-space substrate:

1. **IGN** Spanish seismic catalogue.
2. **AEMET** meteorological warnings in CAP (Common Alerting Protocol) format.
3. **NVD** vulnerability advisories (CVEs) filtered by severity and date.
4. **OpenSky** aircraft state vectors (ADS-B) over Iberian airspace, sampled during demo windows.
5. **AISStream** maritime AIS observations over Iberian waters, streamed during demo windows.

The five streams are normalized into a unified event schema (`event_id`, `event_type`, `occurred_at_utc`, `latitude`, `longitude`, `severity_normalized`, `source`, `payload_json`), modelled in the Foundry Ontology as **events** linked to **generic geographic areas** (not named assets), and surfaced through a Workshop console with a live map, a domain-pivot view, an anomaly queue, and a one-page briefing generator. An AIP Agent helps an analyst orient on demand, with strict refusal behaviours for out-of-scope questions.

See [`03_architecture_overview.md`](03_architecture_overview.md) for the Foundry layer cake, [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md) for how the heterogeneous streams become one substrate, and [`08_ontology_design.md`](08_ontology_design.md) for the event-centric object model.

## What this PoC demonstrates

- **Real-time and near-real-time ingestion** of five heterogeneous public streams into a single Foundry-native substrate.
- **A unified event schema** that lets a coordinator ask cross-domain questions without translating between five vocabularies.
- **A Workshop COP** with a live map, domain timelines, an anomaly queue with human-in-the-loop confirmation, and a one-page situational briefing generator.
- **An AIP Agent** that answers bounded analyst questions over the event ontology, with strict refusal of out-of-scope queries (individual identification, vulnerability scoring of locations, prediction).
- **Post-hoc situational reconstruction** of a real recent incident (the 14 July 2025 Cabo de Gata Mw 5.3 earthquake is the planned anchor) to show what the COP would have surfaced if it had been running live — explicitly framed as reconstruction, not retroactive prediction.

## What this PoC does NOT demonstrate

- **It is not a target-mapping tool.** There is no enumeration of critical infrastructure. The unit of analysis is the event, not the asset. See [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md).
- **It is not predictive.** The COP shows what is happening and what just happened, not what will happen. The AIP Agent refuses predictive questions.
- **It is not an attribution tool.** Cross-domain proximity does not imply causation; the documentation says so explicitly and the Workshop labels reflect it.
- **It does not identify individuals.** MMSIs, aircraft tail numbers, and any other individual identifier are filtered to aggregate context, not exposed for exploration.
- **It does not substitute operator data or classified feeds.** REE, ENAGAS, AENA, port authorities, and Protección Civil have richer data that is not in scope here. The PoC's value is the substrate; the v2 wires the operator feeds onto the same substrate.
- **It does not claim production-grade alerting.** Anomaly detection is rule-based and conservative; every alert is reviewed by a human before any "incident" status is declared.

## Indicative scenarios (the demo arc)

These are the scenarios the demo rehearses. They are **post-hoc** illustrations of what the COP surfaces, not claims of foresight.

- **A felt earthquake on the coast.** The Workshop map shows the IGN-reported event; the side panel surfaces nearby AIS observations from the last hour, any active AEMET warnings in the affected provinces, and any unusual aircraft holding patterns in the OpenSky snapshot window. The coordinator sees, in one screen, what previously took three browser tabs.
- **A red AEMET warning ahead of a maritime period.** The map overlays the warning polygon, the in-area AIS density timeline, and recent ADS-B traffic. The coordinator's question — *"is the warning being respected by maritime traffic"* — has an answer on one screen.
- **A CVE wave affecting a SCADA vendor common in operational technology.** The Workshop's domain pivot shows the cyber-domain spike; the anomaly queue does NOT auto-link cyber events to physical events (the documentation is explicit that this would be epistemically reckless), but the analyst can mark a cyber advisory as worth correlating manually with operational signals during their shift.

## Defined terms (the only jargon used above)

- **COP** — Common Operational Picture: a single situational view shared across responders.
- **CAP** — Common Alerting Protocol: the ITU/OASIS XML standard AEMET uses for warnings.
- **CVE** — Common Vulnerabilities and Exposures: the public catalogue of disclosed software/hardware vulnerabilities maintained at NVD.
- **AIS** — Automatic Identification System: the radio protocol vessels broadcast position and identifier on; aggregated by AISStream.
- **ADS-B** — Automatic Dependent Surveillance-Broadcast: the radio protocol aircraft broadcast position and identifier on; aggregated by OpenSky.
- **Ontology** — in Foundry, the formal model of the objects (here: events of various types and generic geographic areas) and the links between them, against which apps and AI agents query.
- **Anomaly queue** — a Workshop screen listing rule-based cross-domain patterns flagged for analyst review; no anomaly is treated as an incident until a human confirms.

## The decision being asked

The audience is invited to decide, at the end of the demo, one of the following:

- **Fund a v2** with operator data (REE, ENAGAS, AENA, port-authority feeds where lawful) and proper crisis-management governance (DPIA, project markings, role-based access, Protección Civil integration). v2 is where the COP becomes operationally useful for a real coordinator on a real shift.
- **Stop here** and treat the PoC as a teaching artefact: the documentation set explains what is feasible with open data, what the framing discipline requires, what fusion actually costs, and what a follow-on iteration would require.

Either decision is defensible. The PoC's job is to make the choice an informed one rather than a hopeful one.

> See [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md) for the explicit v2 / v3 scope and the *what would make me NOT continue* section.
