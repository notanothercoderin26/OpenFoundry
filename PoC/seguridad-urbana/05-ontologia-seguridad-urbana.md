# 05 — Urban Public-Safety Ontology

> The **ontology model** is the central asset of Foundry and OpenFoundry. It defines the "things that matter" to the Guàrdia Urbana, their properties, and how they relate. Here is the complete model for the Urban Public-Safety PoC, ready to load into `ontology-definition-service`.

The headline pattern here is **spatio-temporal forecasting + Workshop action + after-action close**. The ontology is therefore tighter than the geopolitical one (no link-analysis graph) and centered on a single object, `Incident`, plus a small ring of decision-support objects (`LoadForecast`, `ReinforcementZone`, `TacticalBriefing`).

---

## 🧱 Entities (object types)

| ID | Name | Description | Source dataset |
|---|---|---|---|
| `Incident` | GUB-managed incident | Central object — every event handled by Guàrdia Urbana (security, coexistence, road, other). | `gold.incident_enriched` |
| `TrafficAccident` | Traffic accident | Specialized GUB accident record with vehicles/victims. | `gold.traffic_accident_enriched` |
| `Neighborhood` | Barri de Barcelona | One of the 73 administrative neighborhoods. | `silver.neighborhood_dim` + `gold.neighborhood_rolling_features` |
| `District` | Districte | One of the 10 administrative districts. | `silver.district_dim` |
| `CensusTract` | Sección censal (INE) | Sub-neighborhood block used for population density. | `silver.census_section_dim` |
| `Shift` | Operational shift (interface) | Umbrella for the four canonical 24-h operational windows. | `ref.shift` |
| `WeatherEvent` | Hourly weather observation (AEMET) | One row per hour × station. | `silver.weather_hourly_bcn` |
| `Patrol` | Patrol unit | Synthetic-but-realistic patrol vehicle / foot patrol. | `silver.synth_patrol_dim` |
| `ReinforcementZone` | Reinforcement zone | Created when the commander marks a neighborhood × shift for extra coverage. | `ontology.reinforcement_zone` |
| `TacticalBriefing` | Per-shift briefing | AIP-drafted shift briefing reviewed by the commander. | `ontology.tactical_briefing` |
| `LoadForecast` | Load forecast | Model output per neighborhood × shift × date. | `gold.load_forecast` |
| `IncidentAlert` | Real-time alert | Triggered by the synthetic CAD feed (UC-5). | `ontology.incident_alert` |
| `ActionLog` | Action submission audit | Materialized per Action Type submission. | `ontology.action_log` |

> `Shift` is exposed as an **interface** with exactly four canonical instances: `MAÑANA` (06:00–14:00 Europe/Madrid), `TARDE` (14:00–22:00), `NOCHE` (22:00–02:00), `MADRUGADA` (02:00–06:00). Both `Incident` and `LoadForecast` link `DURING_SHIFT`, so widgets bind uniformly to the interface.

---

## 🔗 Relationships (link types)

| Relationship | From | To | Cardinality | Notes |
|---|---|---|---|---|
| `OCCURRED_IN` | `Incident` | `Neighborhood` | N—1 | Spatial join in `gold.incident_enriched`. |
| `DURING_SHIFT` | `Incident` | `Shift` | N—1 | Derived from `event_datetime_utc`. |
| `UNDER_WEATHER` | `Incident` | `WeatherEvent` | N—1 | Temporal join on `date_trunc('hour', event_datetime_utc)`. |
| `IN_DISTRICT` | `Neighborhood` | `District` | N—1 | From `silver.neighborhood_dim`. |
| `WITHIN_CENSUS` | `CensusTract` | `Neighborhood` | N—1 | INE → BCN geo. |
| `COVERED_BY` | `Neighborhood` | `Patrol` | N—N | From the synthetic AVL allocation. |
| `REINFORCES` | `ReinforcementZone` | `Neighborhood` | N—N | Set by `mark-reinforcement-zone`. |
| `INCLUDES` | `TacticalBriefing` | `Neighborhood` | N—N | The proposed zones inside a briefing. |
| `INCLUDES` | `TacticalBriefing` | `Incident` | N—N | Incidents cited as evidence in the briefing narrative. |
| `PREDICTS_FOR` | `LoadForecast` | `Neighborhood` | N—1 | Plus an implicit FK to `Shift` via `shift_id`. |
| `EVIDENCE_OF` | `Incident` | `TacticalBriefing` | N—N | The reverse pivot of `INCLUDES`. |
| `RAISED_FOR` | `IncidentAlert` | `Neighborhood` | N—1 | Set by the CAD-feed workflow. |

> No graph widget binds to this ontology. The pivot is **Map ↔ Object Table ↔ Forecast Chart**, not graph traversal — that is the explicit differentiator versus the geopolitical PoC.

---

## 🧬 Properties per entity

### `Incident` — central object
| Property | Type | PII | Marking | Notes |
|---|---|---|---|---|
| `incident_id` (PK) | string | no | `PUBLIC-OPENDATA` | `"GUB-<numero_expedient>"` or `"SYNTH-CAD-<uuid>"`. |
| `numero_expedient` | string | no | `PUBLIC-OPENDATA` | Original GUB expedient number. |
| `event_datetime_utc` | timestamp | no | `PUBLIC-OPENDATA` | Parsed from `data_creacio` (Europe/Madrid → UTC). |
| `district_id` | string | no | `PUBLIC-OPENDATA` | FK → `District.district_id`. |
| `neighborhood_id` | string | no | `PUBLIC-OPENDATA` | FK → `Neighborhood.neighborhood_id`. |
| `typology_macro` | enum | no | `PUBLIC-OPENDATA` | `SECURITY` / `COEXISTENCE` / `ROAD_TRAFFIC` / `OTHER`. |
| `typology_detail` | string | no | `PUBLIC-OPENDATA` | GUB-published subtype label. |
| `street_label` | string | no | `ANALYST-CORE` | Approximate street; redacted for `OPS-CORE`-only users. |
| `lat` | float | no | `ANALYST-CORE` | Point coordinate (already snapped to mid-street by GUB). |
| `lon` | float | no | `ANALYST-CORE` | Point coordinate. |
| `source` | enum | no | `PUBLIC-OPENDATA` | `GUB_INCIDENTS` / `GUB_ACCIDENTS` / `SYNTH_CAD`. |
| `day_of_week` | enum | no | — | Mon..Sun, derived. |
| `shift_id` | string | no | — | FK → `Shift`, derived from local hour. |
| `is_holiday` | bool | no | — | Spain + Catalonia + Barcelona local calendar. |
| `is_festival` | bool | no | — | La Mercè / Sant Joan / Christmas window. |
| `weather_event_id` | string nullable | no | — | FK → `WeatherEvent`. |

### `TrafficAccident` (extra properties beyond `Incident` shape)
`accident_id` (PK), `n_victims_lleus`, `n_victims_greus`, `n_morts`, `vehicles_implicats`, `causa_mediata`, `tipus_accident`, `tipus_dia` (laborable / festiu).

### `Neighborhood`
| Property | Type | PII | Marking | Notes |
|---|---|---|---|---|
| `neighborhood_id` (PK) | string | no | `PUBLIC-OPENDATA` | Codi BCN (1..73). |
| `name` | string | no | `PUBLIC-OPENDATA` | "el Raval", "el Gòtic", … |
| `district_id` | string | no | `PUBLIC-OPENDATA` | FK → `District`. |
| `geometry` | geojson polygon | no | `PUBLIC-OPENDATA` | EPSG:4326. |
| `population` | int | no | `PUBLIC-OPENDATA` | INE census (latest year). |
| `area_km2` | float | no | — | Computed from geometry. |
| `population_density` | float | no | — | `population / area_km2`. |
| **Computed (rolling features)** | | | | |
| `incidents_last_7d` | int | no | — | From `gold.neighborhood_rolling_features`. |
| `incidents_last_30d` | int | no | — | 30-day rolling count. |
| `incidents_per_1000_residents` | float | no | — | `incidents_last_30d / population * 1000`. |
| `trend_30d` | float | no | — | Slope of the per-day count over the last 30 days. |
| `is_chronic_priority` | bool | no | — | True when the neighborhood is in the standing roster of chronic-priority barrios. |

### `District`
`district_id` (PK), `name`, `geometry` (geojson), `neighborhood_count`, `population`.

### `CensusTract`
| Property | Type | PII | Marking | Notes |
|---|---|---|---|---|
| `tract_id` (PK) | string | no | `PUBLIC-OPENDATA` | INE code. |
| `neighborhood_id` | string | no | `PUBLIC-OPENDATA` | FK. |
| `geometry` | geojson polygon | no | `PUBLIC-OPENDATA` | |
| `population` | int | no | `PII-RESIDENT` | Coarsened to neighborhood level for users without the marking. |
| `median_age` | float | no | `PII-RESIDENT` | |
| `pct_foreign_born` | float | no | `PII-RESIDENT` | |
| `pct_unemployed` | float | no | `PII-RESIDENT` | |

### `Shift` (interface) — four canonical instances
| Property | Type | Notes |
|---|---|---|
| `shift_id` (PK) | string | `MAÑANA` / `TARDE` / `NOCHE` / `MADRUGADA`. |
| `start_local_hour` | int | 6 / 14 / 22 / 2 (Europe/Madrid). |
| `end_local_hour` | int | 14 / 22 / 2 / 6 (Europe/Madrid). |
| `display_name` | string | Catalan label shown in Workshop. |

### `WeatherEvent`
`weather_event_id` (PK), `station` (`EL_PRAT` / `FABRA`), `valid_at_utc`, `temperature_c`, `precipitation_mm`, `wind_speed_kmh`, `humidity_pct`, `is_rain` (bool), `temperature_bin` (enum: COLD / MILD / WARM / HOT).

### `Patrol`
`patrol_id` (PK), `unit_kind` (enum: VEHICLE / FOOT / MOTORBIKE), `home_district_id`, `nominal_shift_id`, `synthetic` (bool, always true in this PoC).

### `ReinforcementZone` — created by `mark-reinforcement-zone`
| Property | Type | PII | Marking | Notes |
|---|---|---|---|---|
| `zone_id` (PK) | string | no | `OPS-CORE` | UUID. |
| `neighborhood_ids` | list<string> | no | `OPS-CORE` | FKs → `Neighborhood`. |
| `motive` | string | no | `OPS-CORE` | Free-text rationale (commander-authored). |
| `start_at` | timestamp | no | `OPS-CORE` | UTC. |
| `end_at` | timestamp | no | `OPS-CORE` | UTC. |
| `shift_id` | string | no | `OPS-CORE` | FK → `Shift`. |
| `created_by_user_id` | string | no | `OPS-CORE` | Anna's user id, in general. |
| `status` | enum | no | `OPS-CORE` | `ACTIVE` / `CLOSED`. |
| `outcome` | enum nullable | no | `OPS-CORE` | `EFFECTIVE` / `NEUTRAL` / `INEFFECTIVE` / `OVERTAKEN_BY_EVENTS`, set on close. |
| `outcome_narrative` | string nullable | no | `OPS-CORE` | Set on close, ≤ 1000 chars. |

### `TacticalBriefing` — created by `generate-daily-briefing`
| Property | Type | PII | Marking | Notes |
|---|---|---|---|---|
| `briefing_id` (PK) | string | no | `OPS-CORE` | UUID. |
| `target_date` | date | no | `OPS-CORE` | Briefing applies to this calendar day. |
| `target_shift_id` | string | no | `OPS-CORE` | FK → `Shift`. |
| `scope_districts` | list<string> | no | `OPS-CORE` | FKs → `District` (empty = all 10). |
| `narrative_markdown` | string | no | `OPS-CORE` | AIP-drafted prose, ≤ 6 000 chars. |
| `proposed_zones` | list<string> | no | `OPS-CORE` | List of `neighborhood_id` values the AIP recommends reinforcing. |
| `cited_object_ids` | list<string> | no | `OPS-CORE` | Object IDs (incident / neighborhood / forecast) the narrative cites. |
| `generated_by_user_id` | string | no | `OPS-CORE` | The human who triggered the generation. |
| `generated_at_utc` | timestamp | no | `OPS-CORE` | |
| `aip_model_version` | string | no | `OPS-CORE` | The model/version that drafted the briefing (audit). |

### `LoadForecast`
| Property | Type | PII | Marking | Notes |
|---|---|---|---|---|
| `forecast_id` (PK) | string | no | `OPS-CORE` | UUID. |
| `neighborhood_id` | string | no | `OPS-CORE` | FK. |
| `shift_id` | string | no | `OPS-CORE` | FK → `Shift`. |
| `target_date` | date | no | `OPS-CORE` | The day the forecast applies to. |
| `expected_incidents` | float | no | `OPS-CORE` | Model point estimate. |
| `ci_low` | float | no | `OPS-CORE` | 80 % lower bound. |
| `ci_high` | float | no | `OPS-CORE` | 80 % upper bound. |
| `baseline_expected` | float | no | `OPS-CORE` | Naive same-shift same-DOW 30-day mean (honest comparator). |
| `model_version` | string | no | `OPS-CORE` | Git SHA of the training run. |
| `generated_at_utc` | timestamp | no | `OPS-CORE` | |

### `IncidentAlert`
`alert_id` (PK), `neighborhood_id` (FK), `triggering_incident_id` (FK), `raised_at_utc`, `severity` (enum), `acknowledged_at_utc` (nullable), `acknowledged_by_user_id` (nullable).

### `ActionLog`
`log_id` (PK), `action_type_id`, `actor_user_id`, `submitted_at_utc`, `target_object_type`, `target_object_id`, `parameters` (json), `outcome` (enum: SUCCESS / VALIDATION_REJECT / POLICY_REJECT / SIDE_EFFECT_FAIL), `produced_edits` (list of object refs).

---

## ⚡ Actions (action types) registered in `ontology-actions-service`

> An **action** is a write operation on the ontology, with permissions, validation, audit, and possible workflow triggering. The six actions below are the entire write surface for this PoC.

| Action ID | On | Parameters | Effect | Required permission |
|---|---|---|---|---|
| `mark-reinforcement-zone` | none (creates) | `neighborhood_ids: list<string>`, `motive: string`, `start_at: ts`, `end_at: ts`, `shift_id: string` | creates a `ReinforcementZone` in `ACTIVE`, adds `REINFORCES` links | `role:commander` |
| `generate-daily-briefing` | none (creates) | `target_date: date`, `target_shift_id: string`, `scope_districts: list<string>` | creates a `TacticalBriefing`, calls AIP to draft `narrative_markdown` + `proposed_zones`, adds `INCLUDES` links | `role:commander` or `role:analyst` |
| `close-reinforcement-zone` | `ReinforcementZone` | `outcome: enum`, `narrative: string` | sets `status='CLOSED'`, `outcome`, `outcome_narrative` | `role:commander` + `approval:senior-commander` |
| `register-zone-outcome` | `ReinforcementZone` | `incident_count_during_zone: int`, `narrative: string` | appends to the `outcome_narrative` log of an already-closed or active zone (after-action review entry) | `role:commander` |
| `acknowledge-incident-alert` | `IncidentAlert` | `note: string?` | sets `acknowledged_at_utc`, `acknowledged_by_user_id` | `role:commander` or `role:analyst` |
| `propose-chronic-priority` | `Neighborhood` (set) | `neighborhood_ids: list<string>`, `rationale: string` | **branch-only** — flips `is_chronic_priority=true` for the listed neighborhoods on the branch dataset, previews impact in Workshop. Merge requires senior approval. | `role:commander` + `branch-context` |

> These actions are executed from the UI **and** can be invoked by the AIP copilot — always with audit and, when applicable, with human confirmation. `propose-chronic-priority` is **only** executable inside a Global Branch context — this is the UC-6 demo and a Foundry-native pattern.

---

## 📥 Loading the ontology into `ontology-definition-service`

The service accepts a **declarative** YAML/JSON definition. Template (excerpt — full file to be materialized at execution time):

```yaml
ontology:
  id: seguridad-urbana-poc
  version: 1
  description: "Ontology for OpenFoundry Urban Public-Safety PoC"

  interfaces:
    - id: Shift
      properties:
        - { id: shift_id,          type: string, required: true }
        - { id: start_local_hour,  type: int }
        - { id: end_local_hour,    type: int }
        - { id: display_name,      type: string }
      canonical_instances:
        - { shift_id: MAÑANA,    start_local_hour: 6,  end_local_hour: 14, display_name: "Matí" }
        - { shift_id: TARDE,     start_local_hour: 14, end_local_hour: 22, display_name: "Tarda" }
        - { shift_id: NOCHE,     start_local_hour: 22, end_local_hour: 2,  display_name: "Nit" }
        - { shift_id: MADRUGADA, start_local_hour: 2,  end_local_hour: 6,  display_name: "Matinada" }

  object_types:
    - id: Incident
      primary_key: incident_id
      backed_by: { dataset: gold.incident_enriched, branch: main }
      properties:
        - { id: incident_id,         type: string, required: true }
        - { id: numero_expedient,    type: string }
        - { id: event_datetime_utc,  type: timestamp }
        - { id: district_id,         type: string }
        - { id: neighborhood_id,     type: string }
        - { id: typology_macro,      type: enum,
            values: [SECURITY, COEXISTENCE, ROAD_TRAFFIC, OTHER] }
        - { id: typology_detail,     type: string }
        - { id: street_label,        type: string, markings: [ANALYST-CORE] }
        - { id: lat,                 type: float,  markings: [ANALYST-CORE] }
        - { id: lon,                 type: float,  markings: [ANALYST-CORE] }
        - { id: source,              type: enum,
            values: [GUB_INCIDENTS, GUB_ACCIDENTS, SYNTH_CAD] }
        - { id: shift_id,            type: string, computed: true }
        - { id: is_holiday,          type: bool,   computed: true }
        - { id: is_festival,         type: bool,   computed: true }

    - id: Neighborhood
      primary_key: neighborhood_id
      backed_by: { dataset: silver.neighborhood_dim, branch: main,
                   joins: [gold.neighborhood_rolling_features] }
      properties:
        - { id: neighborhood_id,                type: string, required: true }
        - { id: name,                           type: string }
        - { id: district_id,                    type: string }
        - { id: geometry,                       type: geojson }
        - { id: population,                     type: int }
        - { id: incidents_last_30d,             type: int,   computed: true }
        - { id: incidents_per_1000_residents,   type: float, computed: true }
        - { id: trend_30d,                      type: float, computed: true }
        - { id: is_chronic_priority,            type: bool }

    - id: LoadForecast
      primary_key: forecast_id
      backed_by: { dataset: gold.load_forecast, branch: main }
      properties:
        - { id: forecast_id,        type: string, required: true }
        - { id: neighborhood_id,    type: string }
        - { id: shift_id,           type: string }
        - { id: target_date,        type: date }
        - { id: expected_incidents, type: float }
        - { id: ci_low,             type: float }
        - { id: ci_high,            type: float }
        - { id: baseline_expected,  type: float }
        - { id: model_version,      type: string }
        - { id: generated_at_utc,   type: timestamp }
      markings: [OPS-CORE]

    # ... remaining: TrafficAccident, District, CensusTract, WeatherEvent,
    #     Patrol, ReinforcementZone, TacticalBriefing, IncidentAlert, ActionLog

  link_types:
    - { id: OCCURRED_IN,    from: Incident, to: Neighborhood,     cardinality: N-1 }
    - { id: DURING_SHIFT,   from: Incident, to: Shift,            cardinality: N-1 }
    - { id: UNDER_WEATHER,  from: Incident, to: WeatherEvent,     cardinality: N-1 }
    - { id: IN_DISTRICT,    from: Neighborhood, to: District,     cardinality: N-1 }
    - { id: WITHIN_CENSUS,  from: CensusTract, to: Neighborhood,  cardinality: N-1 }
    - { id: COVERED_BY,     from: Neighborhood, to: Patrol,       cardinality: N-N }
    - { id: REINFORCES,     from: ReinforcementZone, to: Neighborhood, cardinality: N-N }
    - { id: INCLUDES,       from: TacticalBriefing, to: Neighborhood, cardinality: N-N }
    - { id: PREDICTS_FOR,   from: LoadForecast, to: Neighborhood, cardinality: N-1 }
    - { id: EVIDENCE_OF,    from: Incident, to: TacticalBriefing, cardinality: N-N }
    - { id: RAISED_FOR,     from: IncidentAlert, to: Neighborhood, cardinality: N-1 }

  action_types:
    - id: mark-reinforcement-zone
      target: null
      params:
        - { id: neighborhood_ids, type: list[string], required: true }
        - { id: motive,           type: string,       required: true }
        - { id: start_at,         type: timestamp,    required: true }
        - { id: end_at,           type: timestamp,    required: true }
        - { id: shift_id,         type: string,       required: true }
      effect:
        - kind: create
          object: ReinforcementZone
          fields:
            zone_id:            "RZ-{{uuid()}}"
            neighborhood_ids:   "{{params.neighborhood_ids}}"
            motive:             "{{params.motive}}"
            start_at:           "{{params.start_at}}"
            end_at:             "{{params.end_at}}"
            shift_id:           "{{params.shift_id}}"
            created_by_user_id: "{{user}}"
            status:             "ACTIVE"
        - kind: create_link
          link_type: REINFORCES
          for_each: "{{params.neighborhood_ids}}"
          from: "{{last_created.zone_id}}"
      auth: { required_roles: [commander] }
      audit: true

    - id: generate-daily-briefing
      target: null
      params:
        - { id: target_date,      type: date,         required: true }
        - { id: target_shift_id,  type: string,       required: true }
        - { id: scope_districts,  type: list[string] }
      effect:
        - kind: create
          object: TacticalBriefing
          fields:
            briefing_id:          "TB-{{uuid()}}"
            target_date:          "{{params.target_date}}"
            target_shift_id:      "{{params.target_shift_id}}"
            scope_districts:      "{{params.scope_districts}}"
            generated_by_user_id: "{{user}}"
            generated_at_utc:     "{{now()}}"
            aip_model_version:    "{{aip.model_version}}"
        - kind: call_aip
          template: tactical-briefing-v1
          writes_to:
            narrative_markdown: "{{last_created.briefing_id}}.narrative_markdown"
            proposed_zones:     "{{last_created.briefing_id}}.proposed_zones"
            cited_object_ids:   "{{last_created.briefing_id}}.cited_object_ids"
      auth: { required_roles: [commander, analyst] }
      audit: true

    - id: close-reinforcement-zone
      target: ReinforcementZone
      params:
        - { id: outcome,   type: enum,
            values: [EFFECTIVE, NEUTRAL, INEFFECTIVE, OVERTAKEN_BY_EVENTS] }
        - { id: narrative, type: string, required: true }
      effect:
        - kind: update
          object: ReinforcementZone
          where: "zone_id == target.zone_id"
          fields:
            status:            "CLOSED"
            outcome:           "{{params.outcome}}"
            outcome_narrative: "{{params.narrative}}"
      auth:
        required_roles: [commander]
        required_approval: senior-commander
      audit: true

    - id: propose-chronic-priority
      target: null
      params:
        - { id: neighborhood_ids, type: list[string], required: true }
        - { id: rationale,        type: string,       required: true }
      effect:
        - kind: branch_only
        - kind: update
          object: Neighborhood
          for_each: "{{params.neighborhood_ids}}"
          fields:
            is_chronic_priority: true
      auth:
        required_roles: [commander]
        required_context: branch
      audit: true

    # ... remaining: register-zone-outcome, acknowledge-incident-alert
```

### Load command
```bash
curl -X POST https://poc.openfoundry.dev/api/ontology/v1/definitions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/yaml" \
  --data-binary @PoC/seguridad-urbana/assets/ontology-seguridad-urbana.yaml
```

> Pending task: **create `PoC/seguridad-urbana/assets/ontology-seguridad-urbana.yaml`** with the complete YAML. **Do not create now** (decision: keep the template here in the `.md` and materialize it when implementation happens, matching the geopolitica convention).

---

## 🔍 Sample queries the customer will see running

### 1) Incidents per neighborhood — last 30 days
```
ONTOLOGY MATCH (i:Incident)-[:OCCURRED_IN]->(n:Neighborhood)
WHERE i.event_datetime_utc >= now() - INTERVAL '30 days'
GROUP BY n.neighborhood_id, n.name
RETURN n.neighborhood_id, n.name, count(i) AS incidents_30d,
       n.incidents_per_1000_residents
ORDER BY incidents_30d DESC
LIMIT 25
```

### 2) Load forecast for tomorrow's NOCHE shift — sorted descending
```
ONTOLOGY MATCH (f:LoadForecast)-[:PREDICTS_FOR]->(n:Neighborhood)
WHERE f.target_date = current_date + 1
  AND f.shift_id    = 'NOCHE'
RETURN n.neighborhood_id, n.name,
       f.expected_incidents, f.ci_low, f.ci_high,
       f.baseline_expected,
       (f.expected_incidents - f.baseline_expected) AS delta_vs_baseline
ORDER BY f.expected_incidents DESC
LIMIT 20
```

### 3) Active ReinforcementZones with outcome still pending
```
ONTOLOGY MATCH (z:ReinforcementZone)-[:REINFORCES]->(n:Neighborhood)
WHERE z.status = 'ACTIVE'
   OR (z.status = 'CLOSED' AND z.outcome IS NULL)
RETURN z.zone_id, z.motive, z.start_at, z.end_at, z.shift_id,
       collect(n.name) AS neighborhoods,
       z.status, z.outcome
ORDER BY z.start_at DESC
```

---

## ✅ Concrete actions (when the PoC is executed)

1. Materialize `PoC/seguridad-urbana/assets/ontology-seguridad-urbana.yaml` from the template above.
2. Load it into `ontology-definition-service` and seed the four canonical `Shift` instances.
3. Run the 3 queries above as a **smoke test**:
   - Q1 returns 73 rows (one per neighborhood); top 3 are Raval / Gòtic / Eixample-Dreta in any reasonable week.
   - Q2 returns 73 rows; the panel shows `delta_vs_baseline` honestly (positive **and** negative values are acceptable).
   - Q3 returns 0 rows immediately after a clean load; re-run after the demo's `mark-reinforcement-zone` step to confirm > 0.
4. Assign permissions: `commander` (Anna) has `mark-reinforcement-zone`, `close-reinforcement-zone`, `register-zone-outcome`, `generate-daily-briefing`, `acknowledge-incident-alert`, `propose-chronic-priority`; `analyst` (Jordi) has `generate-daily-briefing`, `acknowledge-incident-alert`.
5. Validate that Jordi (analyst) **cannot** execute `mark-reinforcement-zone` (must return 403) and that Anna **cannot** execute `propose-chronic-priority` outside a Global Branch (must return 409 with "requires branch context").
6. Validate marking enforcement: Jordi sees `Incident.street_label`, `lat`, `lon`; Anna sees `[redacted]` for those three columns and the AIP refuses to surface them when she asks. Census-derived `PII-RESIDENT` columns are coarsened to neighborhood-level aggregates for both users.
