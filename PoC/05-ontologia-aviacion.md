# 05 — Aviation Ontology

> The **ontology model** is the central asset of Foundry and OpenFoundry. It defines the "things that matter" to the business, their properties, and how they relate to each other. Here is the complete model for the PoC, ready to load into `ontology-definition-service`.

---

## 🧱 Entities (object types)

| ID | Name | Description | Source table |
|---|---|---|---|
| `Aircraft` | Physical aircraft | A fleet unit (a *tail number*). | `curated.aircraft` |
| `Airport` | Airport | Location with IATA/ICAO code. | `curated.airports` |
| `Flight` | Flight | A scheduled or completed flight. | `curated.flights` |
| `FlightSegment` | ADS-B segment | Live tracking (position, speed). | `curated.flight_segments` |
| `WeatherObservation` | Weather observation | Weather state in a cell + time. | `curated.weather_observations` |
| `MaintenanceEvent` | Maintenance event | Work order or inspection. | `curated.maintenance_events` |
| `Part` | Part | Catalog component. | `curated.parts` |
| `PartUsage` | Part usage | Part used in a MaintenanceEvent. | `curated.part_usages` |
| `Engineer` | MRO engineer | Technical staff. | `curated.engineers` |
| `Airline` | Operating airline | | `curated.airlines` |
| `AircraftModel` | Model (e.g., A320-214) | | `curated.aircraft_models` |

---

## 🔗 Relationships (link types)

| Relationship | From | To | Cardinality |
|---|---|---|---|
| `OPERATES` | `Airline` | `Aircraft` | 1—N |
| `IS_MODEL_OF` | `Aircraft` | `AircraftModel` | N—1 |
| `OPERATED_BY` | `Flight` | `Aircraft` | N—1 |
| `DEPARTS_FROM` | `Flight` | `Airport` | N—1 |
| `ARRIVES_AT` | `Flight` | `Airport` | N—1 |
| `TRACKED_BY` | `Flight` | `FlightSegment` | 1—N |
| `OBSERVED_AT` | `WeatherObservation` | `Airport` | N—1 |
| `INFLUENCED_BY` | `Flight` | `WeatherObservation` | N—N (computed) |
| `HAS_EVENT` | `Aircraft` | `MaintenanceEvent` | 1—N |
| `USED_PART` | `MaintenanceEvent` | `PartUsage` | 1—N |
| `OF_PART` | `PartUsage` | `Part` | N—1 |
| `ASSIGNED_TO` | `MaintenanceEvent` | `Engineer` | N—1 |
| `COMPATIBLE_WITH` | `Part` | `AircraftModel` | N—N |

---

## 🧬 Properties per entity

### `Aircraft`
| Property | Type | PII | Notes |
|---|---|---|---|
| `tail_number` (PK) | string | no | "N12345" |
| `serial_number` | string | no | |
| `model_id` | string | no | FK → `AircraftModel.id` |
| `manufacturer` | string | no | |
| `year_built` | int | no | |
| `engine_count` | int | no | |
| `airline_id` | string | no | FK → `Airline.id` |
| `home_base_airport` | string | no | FK → `Airport.iata` |
| `total_flight_hours` | float | no | computed |
| `last_inspection_date` | date | no | computed |
| `current_status` | enum | no | IN_FLIGHT / ON_GROUND / IN_MAINTENANCE / GROUNDED |

### `Flight`
| Property | Type | Notes |
|---|---|---|
| `flight_id` (PK) | string | "AAL123_20260415" |
| `flight_number` | string | "AA123" |
| `airline_id` | string | FK |
| `aircraft_tail_number` | string | FK |
| `origin_iata` | string | FK |
| `destination_iata` | string | FK |
| `scheduled_departure_utc` | timestamp | |
| `actual_departure_utc` | timestamp nullable | |
| `scheduled_arrival_utc` | timestamp | |
| `actual_arrival_utc` | timestamp nullable | |
| `dep_delay_minutes` | int nullable | |
| `arr_delay_minutes` | int nullable | |
| `delay_root_cause` | enum nullable | WEATHER / MAINTENANCE / ATC / CARRIER / SECURITY / LATE_AIRCRAFT |
| `cancelled` | bool | |
| `diverted` | bool | |
| `distance_km` | float | |
| **Computed** | | |
| `risk_score` | float [0,1] | output of the `delay_risk_predictor` pipeline |
| `risk_band` | enum | LOW/MEDIUM/HIGH/CRITICAL |

### `Airport`
`iata` (PK), `icao`, `name`, `city`, `country`, `lat`, `lon`, `elevation_ft`, `timezone`, `runway_count`, `is_hub_for` (list of `airline_id`).

### `WeatherObservation`
`observation_id` (PK), `station_iata`, `valid_at_utc`, `wind_speed_kt`, `wind_dir_deg`, `visibility_m`, `ceiling_ft`, `precipitation_mm_h`, `turbulence_index`, `convective_sigmet` (bool).

### `MaintenanceEvent`
`event_id` (PK), `tail_number` (FK), `event_type` (LINE/A/B/C/D check, AOG, defect-finding), `defect_code` (ATA), `severity`, `discovered_at_utc`, `closed_at_utc`, `mttr_hours`, `assigned_engineer_id` (FK), `description`, `attached_documents` (list of S3 URIs).

### `Part`, `PartUsage`, `Engineer`, `Airline`, `AircraftModel` — standard properties (id, name, descriptive attributes).

---

## ⚡ Actions (action types) registered in `ontology-actions-service`

> An **action** is a write operation on the ontology, with permissions, validation, audit and possible workflow triggering.

| Action ID | On | Parameters | Effect | Required permission |
|---|---|---|---|---|
| `flag-aircraft-for-inspection` | `Aircraft` | `reason: string`, `priority: enum`, `due_by: date` | creates a `MaintenanceEvent` in OPEN state, triggers `mro-inspection` workflow | `role:mro-lead` |
| `assign-maintenance-event` | `MaintenanceEvent` | `engineer_id: string` | updates `assigned_engineer_id`, notifies the engineer | `role:mro-lead` |
| `acknowledge-delay-risk` | `Flight` | `note: string` | adds an audit entry, does not change state | `role:ops-controller` |
| `reroute-flight` | `Flight` | `new_destination: iata`, `reason: string` | creates a new `Flight` linked to the original, notifies ATC sim | `role:ops-controller` + `approval:duty-manager` |
| `order-part` | `Part` | `quantity: int`, `requested_by: user_id`, `for_event: event_id` | creates entry in the purchasing backlog, notifies supply chain | `role:mro-lead` |

> These actions are executed from the UI **and** can be invoked by the AIP copilot — always with audit and, when applicable, with human approval.

---

## 📥 Loading the ontology into `ontology-definition-service`

The service accepts a **declarative** YAML/JSON definition. Template:

```yaml
ontology:
  id: aviation-poc
  version: 1
  description: "Ontology for OpenFoundry Aviation PoC"

  object_types:
    - id: Aircraft
      primary_key: tail_number
      backed_by:
        dataset: curated.aircraft
        branch: main
      properties:
        - { id: tail_number, type: string, required: true }
        - { id: serial_number, type: string }
        - { id: model_id, type: string }
        - { id: manufacturer, type: string }
        - { id: year_built, type: int }
        - { id: engine_count, type: int }
        - { id: airline_id, type: string }
        - { id: home_base_airport, type: string }
        - { id: total_flight_hours, type: float, computed: true }
        - { id: last_inspection_date, type: date, computed: true }
        - { id: current_status, type: enum, values: [IN_FLIGHT, ON_GROUND, IN_MAINTENANCE, GROUNDED] }

    - id: Flight
      primary_key: flight_id
      backed_by:
        dataset: curated.flights
        branch: main
      properties:
        - { id: flight_id, type: string, required: true }
        - { id: flight_number, type: string }
        - { id: aircraft_tail_number, type: string }
        - { id: origin_iata, type: string }
        - { id: destination_iata, type: string }
        - { id: scheduled_departure_utc, type: timestamp }
        - { id: actual_departure_utc, type: timestamp, nullable: true }
        - { id: dep_delay_minutes, type: int, nullable: true }
        - { id: delay_root_cause, type: enum, nullable: true,
            values: [WEATHER, MAINTENANCE, ATC, CARRIER, SECURITY, LATE_AIRCRAFT] }
        - { id: distance_km, type: float }
        - { id: risk_score, type: float, computed: true }
        - { id: risk_band, type: enum, values: [LOW, MEDIUM, HIGH, CRITICAL], computed: true }

    # ... remaining: Airport, WeatherObservation, MaintenanceEvent, Part, PartUsage,
    #     Engineer, Airline, AircraftModel, FlightSegment

  link_types:
    - { id: OPERATED_BY,    from: Flight,            to: Aircraft,         cardinality: N-1 }
    - { id: DEPARTS_FROM,   from: Flight,            to: Airport,          cardinality: N-1 }
    - { id: ARRIVES_AT,     from: Flight,            to: Airport,          cardinality: N-1 }
    - { id: HAS_EVENT,      from: Aircraft,          to: MaintenanceEvent, cardinality: 1-N }
    - { id: ASSIGNED_TO,    from: MaintenanceEvent,  to: Engineer,         cardinality: N-1 }
    - { id: USED_PART,      from: MaintenanceEvent,  to: PartUsage,        cardinality: 1-N }
    - { id: OF_PART,        from: PartUsage,         to: Part,             cardinality: N-1 }
    - { id: TRACKED_BY,     from: Flight,            to: FlightSegment,    cardinality: 1-N }
    - { id: INFLUENCED_BY,  from: Flight,            to: WeatherObservation, cardinality: N-N, computed: true }
    - { id: COMPATIBLE_WITH, from: Part,             to: AircraftModel,    cardinality: N-N }

  action_types:
    - id: flag-aircraft-for-inspection
      target: Aircraft
      params:
        - { id: reason,    type: string,   required: true }
        - { id: priority,  type: enum, values: [LOW, MEDIUM, HIGH, CRITICAL] }
        - { id: due_by,    type: date }
      effect:
        - kind: create
          object: MaintenanceEvent
          fields:
            tail_number: "{{target.tail_number}}"
            event_type: "DEFECT_FINDING"
            severity: "{{params.priority}}"
            discovered_at_utc: "{{now()}}"
            description: "{{params.reason}}"
        - kind: trigger_workflow
          workflow: mro-inspection
      auth:
        required_roles: [mro-lead]
      audit: true

    - id: acknowledge-delay-risk
      target: Flight
      params:
        - { id: note, type: string, required: true }
      effect:
        - kind: audit_only
      auth:
        required_roles: [ops-controller]

    # ... remaining: assign-maintenance-event, reroute-flight, order-part
```

### Load command
```bash
curl -X POST https://poc.openfoundry.dev/api/ontology/v1/definitions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/yaml" \
  --data-binary @PoC/assets/ontology-aviation.yaml
```

> Pending task: **create `PoC/assets/ontology-aviation.yaml`** with the complete YAML. **Do not create now** (decision: keep the template here in the `.md` and materialize it when implementation happens).

---

## 🔍 Sample queries the client will see running

### 1) Aircraft with the most critical events in 30 days
```
ONTOLOGY MATCH (a:Aircraft)-[:HAS_EVENT]->(e:MaintenanceEvent)
WHERE e.severity = 'CRITICAL'
  AND e.discovered_at_utc >= now() - INTERVAL '30 days'
RETURN a.tail_number, a.model_id, count(e) AS critical_events
ORDER BY critical_events DESC
LIMIT 10
```

### 2) Flights at HIGH/CRITICAL risk arriving at JFK in the next 4 h
```
ONTOLOGY MATCH (f:Flight)-[:ARRIVES_AT]->(a:Airport {iata:'JFK'})
WHERE f.risk_band IN ['HIGH','CRITICAL']
  AND f.scheduled_arrival_utc BETWEEN now() AND now() + INTERVAL '4 hours'
RETURN f.flight_number, f.aircraft_tail_number, f.risk_score, f.scheduled_arrival_utc
```

### 3) Recent ATA-27 defects in A320 fleet (UC-3)
```
ONTOLOGY MATCH (a:Aircraft)-[:IS_MODEL_OF]->(m:AircraftModel),
               (a)-[:HAS_EVENT]->(e:MaintenanceEvent)
WHERE m.family = 'A320'
  AND e.defect_code STARTS WITH '27-'
  AND e.discovered_at_utc >= now() - INTERVAL '60 days'
RETURN a.tail_number, e.defect_code, e.severity, e.discovered_at_utc
ORDER BY e.discovered_at_utc DESC
```

---

## ✅ Concrete actions (when the PoC is executed)

1. Materialize `PoC/assets/ontology-aviation.yaml` from the template.
2. Load it into `ontology-definition-service`.
3. Run the 3 queries above as a **smoke test** and validate they return > 0 rows.
4. Assign permissions to the `ops-controller` and `mro-lead` roles for the corresponding actions.
5. Validate that a user `ana` (ops-controller) **cannot** execute `flag-aircraft-for-inspection` (must return 403).
