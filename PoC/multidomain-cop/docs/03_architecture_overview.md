# Architecture Overview

The PoC is a Foundry-native layer cake: public sources are pulled in by Data Connection, landed as raw datasets, normalized in Pipeline Builder (with three narrowly scoped Code Repository transforms), modelled in the Ontology as events linked to generic geographic context, and surfaced through Object Explorer, a Workshop "COP App", Quiver, and AIP. The diagram below is the canonical mental model for the rest of the documentation set.

```
+----------------------------------------------------------------------+
|  External public sources                                             |
|  IGN portal | AEMET OpenData | NVD CVE API | OpenSky REST | AISStream|
+----------------------------------------------------------------------+
              |              |             |            |        |
              v              v             v            v        |
+----------------------------------------------------------------------+
|  Data Connection (Foundry)                                           |
|    - HTTP source (scheduled): IGN, AEMET, NVD, OpenSky               |
|    - HTTP ingest endpoint: AISStream (via external WebSocket bridge) |
+----------------------------------------------------------------------+
              |              |             |            |        |
              v              v             v            v        v
+----------------------------------------------------------------------+
|  Raw datasets  (raw/<source>/...)                                    |
+----------------------------------------------------------------------+
              |              |             |            |        |
              v              v             v            v        v
+----------------------------------------------------------------------+
|  Pipeline Builder + Code Repositories                                |
|    - Pipeline Builder: most normalization, joins, severity mapping   |
|    - Code Repository (Python): AISStream bridge payload validation,  |
|      AEMET TAR-of-CAP unpack + XML parse                             |
|    - Code Repository (PySpark): spatial-temporal fusion transforms   |
+----------------------------------------------------------------------+
              |              |             |            |        |
              v              v             v            v        v
+----------------------------------------------------------------------+
|  Clean normalized event datasets  (clean/events/...)                 |
|    Unified event schema; spatial buckets; identifiers aggregated out |
+----------------------------------------------------------------------+
                                  |
                                  v
+----------------------------------------------------------------------+
|  Foundry Ontology (event-centric)                                    |
|    SeismicEvent | WeatherWarning | CyberAdvisory                     |
|    VesselObservation | AircraftObservation                           |
|    -- linked to -- GeographicArea | AdministrativeRegion (NUTS-3)    |
+----------------------------------------------------------------------+
                                  |
                  +---------------+---------------+
                  v               v               v
        +-----------------+ +-----------+ +-------------------------+
        | Object Explorer | | Workshop  | | Quiver                  |
        |  (browse)       | | COP App   | | (ad-hoc analyses)       |
        +-----------------+ +-----------+ +-------------------------+
                                  |
                                  v
                  +----------------------------------+
                  | AIP Logic + AIP Agent Studio     |
                  | (bounded analyst-assistant agent)|
                  +----------------------------------+
```

## Layer by layer

### Sources
Five public streams: IGN seismic catalogue, AEMET CAP warnings, NVD CVE advisories, OpenSky ADS-B state vectors, AISStream AIS positions. Authorities, URLs, licences, and known limitations are detailed in [`04_data_sources.md`](04_data_sources.md). No paid streams; no operator data.

### Data Connection
Four of the five sources are pulled by Foundry-native scheduled HTTP sources. AISStream is a WebSocket and does not map cleanly to an HTTP-first connector, so it lands through an HTTP ingest endpoint fed by a small external bridge (see below). All ingestion timing, schedules, and the per-source connector pattern are detailed in [`05_ingestion_plan.md`](05_ingestion_plan.md).

### Raw datasets
Each source lands in a versioned `raw/<source>/...` dataset with the payload preserved unchanged. Raw datasets are append-only and serve as the audit substrate for every downstream transform. Dataset path placeholders are listed in [`05_ingestion_plan.md`](05_ingestion_plan.md).

### Pipeline Builder + Code Repositories
The bulk of normalization — column renames, type coercion, severity mapping into the unified `severity_normalized` enum, joins against admin geography — runs in Pipeline Builder, which keeps the work declarative and reviewable. Three transforms are reserved for Code Repositories because they exceed what Pipeline Builder cleanly expresses: a Python parser that unpacks the AEMET TAR and walks each CAP XML, a Python validator that accepts the AISStream bridge's batched JSON payloads and reshapes them into rows, and a PySpark transform for the spatial-temporal fusion (H3 bucket assignment, time-window grouping, density rollups). Details in [`06_pipeline_design.md`](06_pipeline_design.md) and [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md).

### Clean normalized event datasets
The output is the unified event substrate: every row from every source carries `event_id`, `event_type`, `occurred_at_utc`, `latitude`, `longitude`, `severity_normalized`, `source`, and `payload_json`. Per-MMSI and per-icao24 identifiers are aggregated out at this layer — they do not propagate to anything a user touches. See [`06_pipeline_design.md`](06_pipeline_design.md) for the exact column derivations and [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md) for the fusion logic.

### Foundry Ontology (event-centric)
The Ontology exposes one object type per event class plus generic spatial-context types `GeographicArea` and `AdministrativeRegion`. There is no `CriticalInfrastructure` object type, no asset inventory, no named-operator overlay. See [`08_ontology_design.md`](08_ontology_design.md).

### Object Explorer, Workshop COP App, Quiver, AIP
Object Explorer is the technical author's read-only browse surface. The Workshop COP App is the operational console — live map, domain pivot, anomaly queue with human-in-the-loop confirmation, briefing generator — specified in [`09_workshop_app_spec.md`](09_workshop_app_spec.md). Quiver hosts three pre-prepared exploratory analyses ([`11_quiver_analyses.md`](11_quiver_analyses.md)). AIP Logic + AIP Agent Studio host the bounded analyst-assistant agent, with a refusal layer for out-of-scope queries ([`10_aip_agent_spec.md`](10_aip_agent_spec.md)).

## Design choices

**Event-centric ontology, not asset-centric.** The unit of analysis is the event. An asset-centric ontology would invite a target catalogue under a resilience preamble; an event-centric one resists that drift by construction. See [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) and the ontology rationale in [`08_ontology_design.md`](08_ontology_design.md).

**Code Repositories reserved for three specific transforms.** Pipeline Builder is preferred because it is declarative and easier to review. Code Repositories enter only where Pipeline Builder is awkward: TAR unpacking and CAP XML parsing for AEMET, payload validation for the AISStream bridge, and the spatial-temporal fusion PySpark job. Every other transform stays in Pipeline Builder. This keeps the imperative surface small and auditable.

**No separate graph database.** A naïve design might layer Neo4j or a property-graph engine alongside Foundry to represent cross-domain links. The Foundry Ontology already exposes objects and links queryable from Workshop, Quiver, and AIP — adding a parallel graph store would duplicate the substrate, double the operational surface, and break Foundry's lineage model. The Ontology is the graph.

**AISStream needs a bridging host outside Foundry.** Foundry Data Connection is HTTP-first. AISStream is a WebSocket subscription that holds a connection open and pushes messages as vessels report. A small process outside Foundry consumes the WebSocket, batches messages, and POSTs them to a Foundry HTTP ingest endpoint every N seconds. The bridge is documented in [`05_ingestion_plan.md`](05_ingestion_plan.md) with the matching `> ⚠️ VERIFY:` for native WebSocket support.

> 🎯 FRAMING: The architecture is built event-first. Spatial context is generic — admin boundaries, coastline, population centres — never an inventory of named operator assets. No asset-inventory layer enters the design at any tier of the cake, and the Code Repository surface is deliberately small so that nothing slips one in under the floorboards.

## Where to go next

- [`04_data_sources.md`](04_data_sources.md) — per-source detail with verified URLs.
- [`05_ingestion_plan.md`](05_ingestion_plan.md) — per-source Foundry ingestion approach.
- [`06_pipeline_design.md`](06_pipeline_design.md) — the normalization transforms.
- [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md) — the technical heart.
- [`08_ontology_design.md`](08_ontology_design.md) — the event-centric object model.
