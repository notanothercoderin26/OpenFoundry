# Ontology Design

This chapter describes the Foundry Ontology that backs the Workshop console ([`09_workshop_app_spec.md`](09_workshop_app_spec.md)), the AIP Agent ([`10_aip_agent_spec.md`](10_aip_agent_spec.md)), and the Quiver analyses ([`11_quiver_analyses.md`](11_quiver_analyses.md)). The ontology is the contract between the substrate produced by [`06_pipeline_design.md`](06_pipeline_design.md) and [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md) and the analyst-facing surfaces. Get this contract right and the surfaces fall out of it; get it wrong and the surfaces drift.

> 🎯 FRAMING: the v1 ontology is **event-centric, not asset-centric**. There is **no `CriticalInfrastructure` object type**. There is no `PowerSubstation`, no `Pipeline`, no `Port`, no `Airport`, no `DataCenter`. There is no inventory of named operator-owned assets. Spatial context is generic — `GeographicArea` (an H3 cell or a coastline segment or an INE population centre) and `AdministrativeRegion` (NUTS-3 province / INE municipality). A coordinator orienting on an incident does not need a named-asset overlay to make decisions, and v1 deliberately refuses to provide one. The framing discipline from [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) is enforced at the ontology layer, not just at the UI: the surfaces cannot show what the ontology does not model.

## Object types

Eight object types. Five concrete event types, all implementing a shared `Event` interface; two spatial-context types; one action-log type that backs the write-back actions described later.

### `Event` (interface)

A Foundry interface (the equivalent of an abstract type) implemented by the five concrete event types below. Carries the canonical schema declared in [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md):

- **Primary key:** `event_id` (string, `${source}-${native_id}`).
- **Properties:** `event_type` (enum), `occurred_at_utc` (timestamp UTC), `latitude` (double, nullable), `longitude` (double, nullable), `severity_normalized` (enum), `source` (enum), `payload_json` (string), `bucket_5m_utc` (timestamp), `bucket_1m_utc` (timestamp), `h3_cell_r6` (string, nullable for cyber), `acknowledged_at_utc` (timestamp, nullable, set by `acknowledge_event`), `acknowledged_by_user_id` (string, nullable), `flagged_for_followup` (boolean, default false).
- **Title property (for Workshop display):** a computed string `"{event_type} {severity_normalized} @ {occurred_at_utc:HH:mm}"`.
- **Subtitle property:** the source label and (if present) the region name from the spatial-context join.
- **Datasource:** `ontology/event_substrate_v0`.

The interface gives the Workshop, Object Explorer, and AIP Agent a single binding for cross-domain queries — *"events in the last N minutes within this region"* — without enumerating the five concrete types.

> ⚠️ VERIFY: confirm interface-implementation semantics in Ontology Manager on your tenancy — Foundry public documentation describes interfaces but the specific UI flow varies, and on some tenancies the interface may need to be modelled as a parent object with discriminator rather than a true abstract interface.

### `SeismicEvent` (implements `Event`)

Concrete event type backed by `clean/ign/seismic_events_v0`.

- **Primary key:** inherited `event_id`.
- **Extra properties:** `magnitude_mw` (double, nullable — only populated when IGN reports Mw), `magnitude_mblg` (double, nullable — only populated when IGN reports mbLg), `depth_km` (double), `max_intensity_ems98` (string, e.g. `IV`, `V`, `VI`), `location_text` (string, the IGN human-readable location).
- **Title:** `"M{magnitude_mw or magnitude_mblg} earthquake @ {location_text}"`.
- **Datasource:** `clean/ign/seismic_events_v0` joined to the substrate row.

### `WeatherWarning` (implements `Event`)

Concrete event type backed by `clean/aemet/warnings_v0`. CAP labels are **preserved verbatim** (see [`06_pipeline_design.md`](06_pipeline_design.md)) — they appear in the Workshop exactly as AEMET publishes them.

- **Primary key:** inherited `event_id`.
- **Extra properties:** `cap_severity` (string: `Extreme` / `Severe` / `Moderate` / `Minor` / `Unknown`), `cap_certainty` (string: `Observed` / `Likely` / `Possible` / `Unlikely` / `Unknown`), `cap_urgency` (string: `Immediate` / `Expected` / `Future` / `Past` / `Unknown`), `event_label` (string, the CAP `<event>` value, e.g. *Fenómenos costeros*), `effective_at_utc` (timestamp), `expires_at_utc` (timestamp), `area_name` (string, the CAP `<areaDesc>`), `area_polygon_geojson` (string).
- **Title:** `"{event_label} ({cap_severity}) — {area_name}"`.
- **Datasource:** `clean/aemet/warnings_v0`.

### `CyberAdvisory` (implements `Event`)

Concrete event type backed by `clean/nvd/cves_v0`. **Non-spatial:** `latitude` and `longitude` are null for every row of this type, and `h3_cell_r6` is null. The CVE participates in the temporal axes but not in the spatial joins (see [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md)).

- **Primary key:** inherited `event_id` (which is `NVD-${cve_id}`).
- **Extra properties:** `cve_id` (string, e.g. `CVE-2025-12345`), `cvss_v3_base_score` (double), `cvss_v3_vector` (string), `cwe_ids` (list of string), `vendors` (list of string), `products` (list of string), `cisa_known_exploited` (boolean), `description_en` (string).
- **Title:** `"{cve_id} ({cvss_v3_base_score}) — {vendors[0]}/{products[0]}"`.
- **Datasource:** `clean/nvd/cves_v0`.

### `VesselObservation` (implements `Event`)

Concrete event type backed by `clean/aisstream/vessel_positions_v0`. Properties describe **the observation, not the vessel** — there is no `Vessel` object type in the v1 ontology.

- **Primary key:** inherited `event_id` (which is `AISSTREAM-${mmsi}-${timestamp_epoch}`; the MMSI appears in the surrogate key for uniqueness but is never exposed as a queryable property).
- **Extra properties:** `observation_id` (string, same as `event_id` for clarity in the Workshop), `h3_cell_r6` (string), `ship_type_class` (enum: `CARGO`, `TANKER`, `PASSENGER`, `FISHING`, `TUG`, `OTHER` — a coarse aggregation of the raw AIS `ShipType` integer, **not** the named vessel), `sog_knots_bucket` (enum: `STATIONARY` (< 0.5), `SLOW` (0.5–5), `CRUISE` (5–15), `FAST` (15–25), `IMPLAUSIBLE` (> 25)), `cog_bucket` (enum: 8-way compass bucket).
- **Title:** `"{ship_type_class} observation @ {h3_cell_r6}"`.
- **Datasource:** `clean/aisstream/vessel_positions_v0`.

> 🎯 FRAMING: `mmsi` is preserved in `payload_json` for lineage and audit, but it is **not** a top-level property of `VesselObservation`. The Workshop cannot bind to it. The AIP Agent cannot query it. This is enforced at the ontology layer — there is no property to bind to. The reason is the discipline from [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md): the unit displayed is the observation count per spatial bucket per time window, never the named vessel.

### `AircraftObservation` (implements `Event`)

Concrete event type backed by `clean/opensky/aircraft_positions_v0`. Same pattern as `VesselObservation` — properties describe the observation, not the aircraft.

- **Primary key:** inherited `event_id` (which is `OPENSKY-${icao24}-${timestamp_epoch}`; again, the icao24 appears in the surrogate key but is not exposed as a queryable property).
- **Extra properties:** `observation_id` (string), `h3_cell_r6` (string), `altitude_band` (enum: `SURFACE` (< 100 m), `LOW` (100–3000 m), `MID` (3000–9000 m), `HIGH` (> 9000 m)), `origin_country_iso2` (string, two-letter country code from OpenSky's `origin_country` field).
- **Title:** `"{altitude_band} aircraft observation @ {h3_cell_r6} ({origin_country_iso2})"`.
- **Datasource:** `clean/opensky/aircraft_positions_v0`.

> 🎯 FRAMING: `icao24` and `callsign` are preserved in `payload_json` for lineage and audit, but they are **not** top-level properties of `AircraftObservation`. Same enforcement and same reason as for `VesselObservation` above.

### `GeographicArea`

Generic spatial-context type. **This is not an asset inventory.** A `GeographicArea` is an H3 cell, a coastline segment, or an INE population centre — a spatial bucket the events join into, not a named asset that the events threaten.

- **Primary key:** composite `(area_kind, area_id)`. The composite key is chosen over a bare `h3_cell_r6` because the type covers heterogeneous spatial entities (an H3 cell and a coastline segment are not the same thing and should not collide in the key space).
- **Properties:** `area_kind` (enum: `H3_CELL`, `COASTLINE_SEGMENT`, `POPULATION_CENTRE_INE`, `OTHER`), `area_id` (string, the H3 cell id or the INE code or the coastline segment id), `centroid_lat` (double), `centroid_lon` (double), `containing_admin_region` (string, the NUTS-3 or municipality code that the centroid falls in).
- **Title:** `"{area_kind} {area_id}"`.
- **Datasource:** a static reference dataset uploaded once. `> ⚠️ TODO: upload a static H3-cell + INE-population-centre reference CSV covering the Iberian + Baleares + Canarias bbox.`

### `AdministrativeRegion`

NUTS-3 province and INE municipality, used by the `felt_in` and `covers` link types below.

- **Primary key:** composite `(level, code)`.
- **Properties:** `level` (enum: `NUTS3`, `MUNICIPALITY`), `code` (string), `name` (string, the official name in Spanish), `parent_code` (string, nullable — e.g. the NUTS-3 a municipality belongs to).
- **Title:** `"{name} ({level})"`.
- **Datasource:** a static reference dataset uploaded once. `> ⚠️ TODO: upload a static NUTS-3 + INE-municipality reference CSV with WGS84 polygons for the spatial-intersection joins.`

### `ActionLog`

A row per write-back action invoked by the analyst — the audit substrate for the four action types defined below.

- **Primary key:** `action_id` (string, ULID).
- **Properties:** `action_type` (enum: `ACKNOWLEDGE_EVENT`, `FLAG_FOR_FOLLOWUP`, `LINK_EVENTS`, `DISMISS_FALSE_POSITIVE`), `invoked_at_utc` (timestamp), `invoked_by_user_id` (string), `subject_event_id` (string), `secondary_event_id` (string, nullable — used by `link_events` and `dismiss_false_positive`), `payload_json` (string, the action's parameter dump including analyst notes / reasons).
- **Title:** `"{action_type} on {subject_event_id} @ {invoked_at_utc}"`.
- **Datasource:** a write-back dataset populated by the Action Types below.

## Link types

Six link types. Two link events to administrative regions, two link observations to generic geographic areas, one links events to each other auto-computed, and one links events to the audit log.

- **`SeismicEvent --felt_in--> AdministrativeRegion`** (N→N). Populated when the EMS-98 intensity at the region is at least III (the threshold below which felt reports are rare). Computed in the pipeline by intersecting the seismic event's macroseismic shake field with the region polygon; for v1 the shake field is approximated as a radius from the epicentre scaled by magnitude, and the link is marked with an `intensity_approximation` edge property.
- **`WeatherWarning --covers--> AdministrativeRegion`** (N→N). Computed by intersecting the warning's `area_polygon_geojson` with the region polygon. A single warning typically covers one to several NUTS-3 provinces.
- **`VesselObservation --observed_in--> GeographicArea`** (N→1). Link to the H3 cell the observation's coordinates fall in. The Workshop's density layer joins through this link.
- **`AircraftObservation --observed_in--> GeographicArea`** (N→1). Same pattern.
- **`Event --neighbour_of--> Event`** (N→N, cross-domain). Auto-computed by the temporal-spatial fusion pipeline ([`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md)). Edge properties `spatial_km` (double, nullable — null when one side is non-spatial like a `CyberAdvisory`) and `temporal_minutes` (double). **Descriptive only — not causal.** The link surfaces co-occurrence so an analyst can review; the ontology layer itself makes no causal claim.
- **`Event --acknowledged_by--> ActionLog`** (N→1). Set when an analyst invokes `acknowledge_event` on the event.

## Action types

Four action types. Every action writes a row to `ActionLog` for audit; the data effects are listed per action.

- **`acknowledge_event`** — parameters: `event_id` (string), `analyst_note` (string, optional). Effect: sets `acknowledged_at_utc` and `acknowledged_by_user_id` on the target event; appends to `ActionLog`. > ⚖️ ETHICS: acknowledgement is an analyst's "I have seen this", **not** "incident is confirmed". The Workshop label for the action and the AIP Agent's description of the action both reflect this. An acknowledged event is not promoted to an incident by any automated rule.
- **`flag_for_followup`** — parameters: `event_id` (string), `reason` (string). Effect: sets `flagged_for_followup = true` on the event; surfaces it in the follow-up queue described in [`09_workshop_app_spec.md`](09_workshop_app_spec.md); appends to `ActionLog`.
- **`link_events`** — parameters: `event_id_a` (string), `event_id_b` (string), `link_reason` (string). Effect: creates a `manually_linked` link between two events. This link is **distinct** from `neighbour_of` (which is auto-computed by the fusion pipeline) — it represents a deliberate analyst judgement that the two events warrant being considered together during incident case-building. Appends to `ActionLog`.
- **`dismiss_false_positive`** — parameters: `event_id_a` (string), `event_id_b` (string), `dismissal_reason` (string). Effect: removes the auto-computed `neighbour_of` link between the two events (or marks it dismissed if the link cannot be physically removed in the underlying store), and appends the pair to a queryable dismissed-pairs dataset so that subsequent runs of the fusion pipeline do not re-emit the same neighbour link. Appends to `ActionLog`.

## Closing — why interfaces over per-stream redundancy

The design uses a single `Event` interface implemented by the five concrete event types rather than a tree of per-stream object types with overlapping properties. The reason is the surfaces. The Workshop's live map binds to `Event` and gets all five domains in one query. The Object Explorer's filter pane binds to `Event` and lets an analyst filter by `severity_normalized` or `bucket_5m_utc` without picking a concrete type first. The AIP Agent ([`10_aip_agent_spec.md`](10_aip_agent_spec.md)) binds its tool functions to `Event` for cross-domain questions — *"what events are happening in this region right now"* — and only descends to a concrete type when the question is type-specific. The cost of the design is the discipline required to keep the inherited schema stable across the five implementers; that discipline is enforced at the pipeline layer ([`06_pipeline_design.md`](06_pipeline_design.md)) and at the substrate-quality checks.

> ⚠️ VERIFY: confirm interface-implementation semantics in Ontology Manager on your tenancy. The Foundry public documentation describes interfaces but the specific UI flow for declaring an interface and binding an object type to it varies between Foundry releases. On a tenancy where true interfaces are not available the design degrades cleanly to a single `Event` object type backed by `ontology/event_substrate_v0` with a `concrete_type` discriminator column and per-type joined views.

## Cross-references

- The unified schema and the fusion logic that populates the ontology: [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md).
- The per-stream normalization that backs each concrete event type: [`06_pipeline_design.md`](06_pipeline_design.md).
- The Workshop screens that bind to the ontology: [`09_workshop_app_spec.md`](09_workshop_app_spec.md).
- The AIP Agent that queries the ontology with bounded scope: [`10_aip_agent_spec.md`](10_aip_agent_spec.md).
- The framing discipline that requires the event-centric design: [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md).
