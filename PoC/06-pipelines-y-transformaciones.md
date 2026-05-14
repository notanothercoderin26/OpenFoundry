# 06 — Pipelines and transformations

> Medallion schema **bronze → silver → gold → ontology**, with quality at every hop and automatic lineage. All pipelines are defined in `pipeline-build-service` (authoring + build + orchestration are consolidated into a single binary) and execute on Spark via `pipeline-runner` (orchestrator) and `pipeline-runner-spark` (Scala JAR for Iceberg transforms). Schedules are injected via the `event-scheduler` lib and, when human coordination or approvals are required, via `workflow-automation-service`.

---

## 🥉 Bronze layer — raw data

| Pipeline | Trigger | Input | Output | Frequency |
|---|---|---|---|---|
| `bz-opensky-batch` | manual / cron | trino://opensky/state_vectors_data4 | `bronze.opensky_states` (Iceberg) | one-shot historical |
| `bz-opensky-stream` | event | kafka:`opensky.states.live` | `bronze.opensky_states_live` (Iceberg, micro-batch) | continuous |
| `bz-noaa-hrrr` | daily cron | s3://noaa-hrrr-bdp-pds | `bronze.noaa_hrrr` | daily |
| `bz-bts` | manual | https BTS zips | `bronze.bts_ontime` | one-shot historical |
| `bz-faa-registry` | manual | https FAA | `bronze.faa_aircraft_registry` | monthly |
| `bz-mro-synth` | manual | generator | `bronze.mro_work_orders`, `bronze.mro_parts`, `bronze.mro_inspections` | one-shot |
| `bz-airports` | manual | OurAirports | `bronze.airports`, `bronze.runways` | monthly |

**Bronze quality rules (Great Expectations / Soda):**
- Fixed schema (no unexpected new columns).
- `not_null` on candidate PK.
- `row_count > 0` per partition.

---

## 🥈 Silver layer — clean, typed, deduplicated, enriched

| Pipeline | Inputs | Output | Key logic |
|---|---|---|---|
| `sv-aircraft` | `bronze.faa_aircraft_registry` | `silver.aircraft` | Dedup by tail_number; mapping to canonical models |
| `sv-airports` | `bronze.airports`, `bronze.runways` | `silver.airports` | Validate lat/lon, unique IATA |
| `sv-flights-historical` | `bronze.bts_ontime` | `silver.flights_historical` | Convert local times → UTC; canonicalize carrier codes |
| `sv-flight-segments-batch` | `bronze.opensky_states` | `silver.flight_segments` | Segment by `(icao24, callsign)` and gaps > 30 min |
| `sv-flight-segments-stream` | `bronze.opensky_states_live` | `silver.flight_segments_live` | Same, 1-min micro-batch |
| `sv-weather-by-airport` | `bronze.noaa_hrrr` | `silver.weather_by_airport` | Reproject GRIB → nearest point to airport; hourly aggregation |
| `sv-mro-clean` | `bronze.mro_*` | `silver.mro_*` | Typing, normalization of ATA codes |

**Silver quality rules:**
- `aircraft.tail_number` unique.
- `flights_historical.distance_km > 0` and `< 20000`.
- `flight_segments.lat` ∈ [-90, 90], `lon` ∈ [-180, 180].
- `weather_by_airport`: `wind_speed_kt < 250` (filters outliers).

---

## 🥇 Gold layer — business aggregations + ML features

| Pipeline | Inputs | Output | Purpose |
|---|---|---|---|
| `gd-flights-enriched` | `silver.flights_historical` + `silver.aircraft` + `silver.weather_by_airport` | `gold.flights_enriched` | Flight + origin/destination weather + aircraft data |
| `gd-aircraft-utilization` | `silver.flight_segments` | `gold.aircraft_utilization` | Flight hours/day per tail |
| `gd-recurring-defects` | `silver.mro_work_orders` + `silver.aircraft` | `gold.recurring_defects` | Detection by (model, ATA chapter) in moving windows |
| `gd-airport-load` | `silver.flights_historical` + `silver.flight_segments_live` | `gold.airport_load` | Forecast vs. actual load per airport/hour |
| `gd-delay-features` | `gold.flights_enriched` + `gold.aircraft_utilization` | `gold.delay_features` | Features for `delay_risk_predictor` |

**Gold quality rules:**
- Coverage ≥ 95% (no more than 5% of rows with null key fields).
- Distribution drift vs. previous window < 20% (Soda rules).

---

## 🧠 Model layer — delay risk predictor

### Pipeline `delay_risk_predictor`
- **Type:** binary (HIGH/CRITICAL = 1, rest = 0) + continuous score.
- **Model:** GBT (LightGBM) trained with `gold.delay_features`.
- **Features:**
  - `dep_hour`, `dep_dayofweek`, `month`
  - `origin_avg_delay_30d`, `dest_avg_delay_30d`
  - `aircraft_age_years`, `tail_avg_delay_30d`
  - `wind_speed_origin`, `visibility_origin`, `convective_origin`
  - `wind_speed_dest`, `visibility_dest`, `convective_dest`
  - `route_distance_km`, `airline_id` (one-hot)
  - `late_aircraft_propagation_score` (how late the tail arrives at origin)
- **Output:** `gold.flight_risk_predictions` with `(flight_id, risk_score, risk_band)`.
- **Service:** `model-deployment-service` (with `model-catalog-service` for versioning/experiments) exposes it as REST; consumed by `gd-flights-enriched-with-risk`. The `ml-kernel-go` lib provides serving + batch scoring + monitoring.

> For the PoC we can train **only once** with 2023–2024 data and serve inferences in streaming. The copilot's action consumes these predictions.

---

## 🔭 Ontology layer — materialized views served by `ontology-query-service`

| Materialized view | Sourced from |
|---|---|
| `ontology.aircraft` | `silver.aircraft` + aggregates from `silver.mro_*` |
| `ontology.flights` | `gold.flights_enriched` + `gold.flight_risk_predictions` |
| `ontology.airports` | `silver.airports` |
| `ontology.weather_observations` | `silver.weather_by_airport` (rolling 14 days) |
| `ontology.maintenance_events` | `silver.mro_work_orders` |
| `ontology.parts` | `silver.mro_parts` |
| `ontology.engineers` | `silver.mro_engineers` |

Refresh: incremental every 5 min (gold) and append-only (streaming).

---

## 📐 Declarative pipeline specification (format expected by `pipeline-build-service`)

> `quality.expectations` are evaluated with the `pipeline-expression` lib (DSL of Foundry's Pipeline Builder).

```yaml
pipeline:
  id: gd-flights-enriched
  description: "Flights joined with weather + aircraft master"
  version: 1
  schedule:
    cron: "*/15 * * * *"   # every 15 min
    catchup: false
  inputs:
    - dataset: silver.flights_historical@main
    - dataset: silver.aircraft@main
    - dataset: silver.weather_by_airport@main
  output:
    dataset: gold.flights_enriched@main
    write_mode: merge
    merge_key: [flight_id]
  transform:
    engine: spark
    language: sql
    code: |
      WITH wx_origin AS (
        SELECT station_iata, valid_at_utc, wind_speed_kt AS wind_origin,
               visibility_m AS vis_origin, convective_sigmet AS conv_origin
        FROM silver.weather_by_airport
      ),
      wx_dest AS (
        SELECT station_iata, valid_at_utc, wind_speed_kt AS wind_dest,
               visibility_m AS vis_dest, convective_sigmet AS conv_dest
        FROM silver.weather_by_airport
      )
      SELECT
        f.flight_id,
        f.flight_number,
        f.airline_id,
        f.aircraft_tail_number,
        f.origin_iata,
        f.destination_iata,
        f.scheduled_departure_utc,
        f.actual_departure_utc,
        f.dep_delay_minutes,
        f.delay_root_cause,
        f.distance_km,
        a.model_id,
        a.year_built,
        wo.wind_origin, wo.vis_origin, wo.conv_origin,
        wd.wind_dest,   wd.vis_dest,   wd.conv_dest
      FROM silver.flights_historical f
      LEFT JOIN silver.aircraft a
             ON f.aircraft_tail_number = a.tail_number
      LEFT JOIN wx_origin wo
             ON wo.station_iata = f.origin_iata
            AND wo.valid_at_utc = date_trunc('hour', f.scheduled_departure_utc)
      LEFT JOIN wx_dest wd
             ON wd.station_iata = f.destination_iata
            AND wd.valid_at_utc = date_trunc('hour', f.scheduled_arrival_utc)
  quality:
    expectations:
      - column: flight_id
        rule: not_null
      - column: flight_id
        rule: unique
      - column: distance_km
        rule: between
        min: 0
        max: 20000
      - rule: row_count_min
        value: 1000
  lineage:
    auto: true
    emit_to: openlineage://lineage-service
```

> Pending task at execution time: generate 12 YAML files in `PoC/assets/pipelines/` (one per pipeline). Here we leave the template and rules; materialization happens when we execute.

---

## 🌳 Branches and *time travel* (Foundry-style)

Pattern to demonstrate in Act 6:

1. Create branch `feat/risk-model-v2` from `main` on the `gold.flights_enriched` dataset:
   ```bash
   curl -X POST .../api/datasets/v1/gold.flights_enriched/branches \
     -d '{"name":"feat/risk-model-v2","from":"main"}'
   ```
2. Retrain `delay_risk_predictor` on the branch.
3. Compare metrics on the branch vs. `main` side-by-side.
4. Merge if OK; rollback if KO. Both are kept in audit and lineage.

---

## 🧪 Per-pipeline smoke tests

After each deployment, run:

```bash
# Each silver/gold pipeline must finish in < 3 min and not break expectations
for p in sv-aircraft sv-airports sv-flights-historical sv-weather-by-airport \
         gd-flights-enriched gd-recurring-defects gd-airport-load gd-delay-features; do
  curl -X POST .../api/pipelines/v1/$p/runs \
       -d '{"trigger":"manual"}'
done

# Validate
curl .../api/pipelines/v1/runs?status=FAILED&since=now-10m
# Must return an empty list
```

---

## ✅ Concrete actions (when the PoC is executed)

1. Materialize `PoC/assets/pipelines/*.yaml` (12 files) from the templates.
2. Register connectors in `connector-management-service` (S3 NOAA, Trino OpenSky, REST OpenSky live, HTTPS BTS).
3. Launch bronze historical pipelines (expect several hours — these are TBs).
4. Launch silver and gold incrementally.
5. Train `delay_risk_predictor`, register it in `model-catalog-service` and publish it in `model-deployment-service`.
6. Materialize `ontology.*` views and verify query latency.
7. Demonstrate branches with `feat/risk-model-v2` before the demo (it is the "wow" of Act 6).
