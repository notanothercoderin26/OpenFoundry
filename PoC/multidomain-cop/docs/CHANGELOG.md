# CHANGELOG — multidomain-cop PoC documentation

> Single authoring session. The set follows the protocol declared in [`00_README.md`](00_README.md). This changelog records the order of authoring, decisions taken outside the canonical brief, and the cross-reference pass at the end of the session.

## Session — initial 16-file authoring

### Batch 1 — narrative spine and framing discipline (user-reviewed checkpoint)

- `00_README.md` — index, reading order, prerequisites, time estimate, honest scope + framing paragraph before the index.
- `01_executive_summary.md` — command-staff version; three indicative post-hoc reconstruction scenarios (felt earthquake on the coast, red AEMET warning ahead of a maritime period, CVE wave on a SCADA vendor); fund-v2 vs stop-here as the framed decision.
- `02_framing_and_honest_limits.md` — the load-bearing framing file. **The user explicitly paused the authoring session here for review before propagation, per the prompt's mandatory checkpoint.** The user confirmed the framing in writing and authoring resumed.

Decisions taken in batch 1: narrative anchored on **resilience and crisis-management situational awareness** (not surveillance, not target mapping); unit of analysis is the **event** (not asset, not individual); no `CriticalInfrastructure` object type in the v1 ontology; MMSIs and aircraft tail numbers / icao24 filtered to aggregate context before they reach the Workshop or AIP Agent; anomaly queue is rule-based with human-in-the-loop confirmation; the 14 July 2025 Cabo de Gata Mw 5.3 earthquake is the planned demo anchor, explicitly framed as post-hoc situational reconstruction.

New callout marker introduced: `> 🎯 FRAMING:` for resilience-not-targeting reinforcement at every drift-prone moment.

### Batch B — architecture, sources, ingestion

- `03_architecture_overview.md` — Foundry layer cake in ASCII; design-choice subsection (event-centric ontology rationale; Code Repositories reserved for AISStream bridge + AEMET TAR-of-CAP unpack + spatial-temporal fusion; no separate graph database; AISStream WebSocket needs a bridging host outside Foundry).
- `04_data_sources.md` — one section per source (IGN seismic, AEMET CAP, NVD, OpenSky, AISStream) with verified URLs + licences + known limitations, plus the dedicated "Sources deliberately excluded from v1" subsection (REE/ESIOS, ENAGAS, asset-level critical-infrastructure inventory) with FRAMING callout on the last.
- `05_ingestion_plan.md` — sprint-by-source ingestion plan; AISStream WebSocket bridge wrapped in `VERIFY`; explicit ingestion-sequence subsection (NVD first because it proves the HTTP-source pattern; AISStream last because the bridge is the most fiddly).

Decisions taken in batch B (logged by the author):

- Auxiliary `raw/aemet/cap_metadata_v0` staging dataset introduced alongside the canonical `raw/aemet/cap_warnings_v0` because the AEMET two-step metadata-then-`datos` pattern needs a landing spot for the wrapper.
- AISStream bridge batching window pinned to "N = 30 seconds as a reasonable starting point" — the canonical doc said "every N seconds" without specifying N.

### Batch C — pipelines, fusion, ontology

- `06_pipeline_design.md` — six named pipeline stages (IGN normalize, AEMET TAR-of-CAP unpack, NVD CVEs, OpenSky filter, AISStream filter, unified event substrate). Explicit `severity_normalized` mapping table per source preserving CAP / CVSS / EMS-98 labels verbatim. Identifier-filtering FRAMING callout at stages 4/5/6.
- `07_temporal_spatial_fusion.md` — the technical heart. Fusion hardness across time / space / severity / latency; unified schema field rationale; 5-minute dashboard bucket vs 1-minute anomaly bucket trade-off; H3 r6 spatial bucket with polygon-explode pattern; three cross-stream join patterns; Cabo de Gata narrative reconstruction as the worked example; "what fusion cannot do" section with FRAMING callout.
- `08_ontology_design.md` — opening FRAMING callout on the no-`CriticalInfrastructure` decision. `Event` Foundry interface implemented by `SeismicEvent`, `WeatherWarning`, `CyberAdvisory`, `VesselObservation`, `AircraftObservation`. Generic `GeographicArea` and `AdministrativeRegion` for spatial context. Identifier (MMSI / icao24 / callsign) kept in `payload_json` only, never a top-level property — with per-type FRAMING callouts. Six link types including descriptive-only `Event --neighbour_of--> Event`. Four action types (`acknowledge_event`, `flag_for_followup`, `link_events`, `dismiss_false_positive`).

Decisions taken in batch C (logged by the author):

- All three files in batch C ran somewhat over their word targets (06: 1824, 07: 2199, 08: 1945). 07 was instructed to run long; 06 and 08 were accepted slightly over because the content density of the per-stream specifications and the per-object-type tables justified the overage. No content was added beyond the canonical scope.

### Batch D — Workshop, AIP Agent, Quiver

- `09_workshop_app_spec.md` — six-screen Workshop console (Landing live map; Event detail; Domain pivot; Anomaly queue; Briefing generator; History/audit). Widget-ontology binding tables per screen. Demo flow anchored on the Cabo de Gata seismic event. Multiple FRAMING callouts reinforcing event-only display, no per-MMSI / per-icao24 exposure, and CAP labels preserved verbatim.
- `10_aip_agent_spec.md` — "COP Analyst Assistant" persona; allowed ontology scope (the `Event` interface + `GeographicArea` + `AdministrativeRegion`); four bound AIP Logic functions (`get_events_in_window`, `get_event_neighbors`, `summarize_briefing`, `find_unusual_multi_signal_clusters`); three rehearsed demo prompts with expected behaviour in prose; six refusal classes (per-MMSI, per-icao24, vulnerability scoring, predictive, attribution, ambiguous-escalate); hallucination caveat.
- `11_quiver_analyses.md` — three analyses (90-day daily event counts by domain; three-layer H3 heatmap of seismicity vs warnings vs maritime density; CVE-publication-vs-disruption lag analysis with explicit correlation-not-causation caveats and both FRAMING and ETHICS callouts).

### Batch E — demo script, ethics, glossary, follow-up

- `12_demo_script.md` — 15-minute timed runbook with narration in command-staff language and per-minute fallback notes. Rehearsal checklist includes the per-MMSI refusal index card (the refusal demo is staged precisely because it is the most credible demonstration of refusal teeth). Verbatim closing slide message: *"What this would look like with operator data and proper crisis-management governance — v2."*
- `13_risks_ethics_governance.md` — framing risk revisited (quoting 02); bias catalogue (AIS opt-outs, ADS-B opt-outs, EMS-98 reporting bias, CPE noise, AEMET coverage edge, time-alignment artefacts); false-alarm cost cross-linked to the anomaly queue; EU AI Act decision-support positioning; GDPR / LOPDGDD with the MMSI / icao24 filtering mitigation; Foundry governance with `VERIFY` on markings propagation; vendor-lock + cost honest paragraph; v2 prerequisites with FRAMING callout.
- `14_glossary.md` — two-column reference (Foundry concepts + domain concepts) with cross-links to the file where each term is first introduced.
- `15_followup_and_next_iterations.md` — v2 with operator data (REE / ESIOS, ENAGAS, AENA, port-authority feeds, Protección Civil where authorised) on the SAME event-centric substrate; v3 with paid historical archives + predictive modules behind explicit ethical gates; success / failure indicators; three decision questions; dedicated "what would make me NOT continue this project" subsection (cost overrun, framing drift, ethical concerns, loss of operational owner).

## Cross-reference pass

- All 16 documents present in `PoC/multidomain-cop/docs/`.
- All internal numeric-prefix Markdown links resolve (verified by grep + path test).
- No emoji outside the four documented callout sigils (`⚠️`, `⚖️`, `💡`, `🎯`).
- No exclamation marks outside callouts.
- No banned marketing language detected (`seamless`, `best-in-class`, `revolutionary`, `cutting-edge`, `game-changing`, `AI-powered`, `state-of-the-art`, `next-generation`).
- `> 🎯 FRAMING:` callout density per file: 00=2, 02=5, 03=1, 04=1, 05=1, 06=1, 07=2, 08=3, 09=3, 10=2, 11=3, 12=1, 13=2, 14=1, 15=1. 01 (executive summary) does not carry an explicit FRAMING callout — the framing is incrustated in the "What this PoC does NOT demonstrate" block and via the forward cross-link to 02; acceptable for a five-minute exec summary that the framing chapter sits next to.
- Key-term consistency: `CriticalInfrastructure` appears in 7 files (all as statements that the type does NOT exist); `event-centric` in 13 files; `MMSI` in 14 files; `icao24` in 11 files; the Cabo de Gata demo anchor in 5 files.
- Root index `PoC/README.md` updated with an academic-tagged row pointing to this PoC.

## Open items left for the author

- All `> ⚠️ VERIFY:` callouts must be checked against the live Foundry tenancy before execution. Inventory:
  - Native WebSocket source in Foundry Data Connection vs the external bridge fallback for AISStream ([`05_ingestion_plan.md`](05_ingestion_plan.md)).
  - H3 availability in Pipeline Builder vs the Code Repository `h3-pyspark` fallback ([`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md)).
  - Map widget layer-count and feature-count limits before pushing more than ~5,000 events onto a single screen ([`09_workshop_app_spec.md`](09_workshop_app_spec.md)).
  - Time-series widget two-axis overlay support; fall back to two stacked panels ([`09_workshop_app_spec.md`](09_workshop_app_spec.md)).
  - AIP Agent Studio system-prompt + tool-allowlist semantics for the per-MMSI / per-icao24 refusal gating ([`10_aip_agent_spec.md`](10_aip_agent_spec.md), [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md)).
  - Interface-implementation semantics in Ontology Manager ([`08_ontology_design.md`](08_ontology_design.md)).
  - Foundry Code Repository runtime allowing TAR unpacking for the AEMET payload ([`05_ingestion_plan.md`](05_ingestion_plan.md), [`06_pipeline_design.md`](06_pipeline_design.md)).
  - Markings propagation from raw datasets through the Ontology to Workshop and to the AIP Agent ([`13_risks_ethics_governance.md`](13_risks_ethics_governance.md)).
- All `> ⚠️ TODO:` callouts (RIDs, API keys, dataset path placeholders, exact field names after first download, region-preset definitions) must be filled in as the work progresses.
- Re-read [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) before every demo. The framing discipline is the credibility anchor; drift on stage is the most damaging failure mode.
