# 06 — Pipelines and transformations

> All pipelines must be authored and visible as Foundry **Pipeline Builder** transforms (or **Code Repositories** transforms where SQL is more natural). The DAG must be visible to the customer; failed runs surface in **Data Health**; lineage propagates to the ontology. OpenFoundry implementation lives in `pipeline-build-service` + `pipeline-runner-spark` + `pipeline-expression` library.

The model is canonical **bronze → silver → gold**. Volumes are smaller than the geopolitical PoC (~80 GB raw, of which ~60 GB is synthetic AVL telemetry) so the DAG is shallower, but the discipline — schema checks, freshness checks, lineage edges — is identical.

---

## 🗺️ DAG overview (bronze → silver → gold → ontology)

```
                       BRONZE                            SILVER                              GOLD                          ONTOLOGY (materialized views)
┌────────────────────────────────────┐   ┌───────────────────────────────────┐   ┌────────────────────────────────┐   ┌────────────────────────────┐
│ bronze.gub_incidents               │──▶│ silver.incident_normalized        │──▶│ gold.incident_enriched         │──▶│ Incident                    │
│ bronze.gub_accidents               │──▶│ silver.traffic_accident_normalized│──▶│ gold.traffic_accident_enriched │──▶│ TrafficAccident             │
│ bronze.aemet_hourly                │──▶│ silver.weather_hourly_bcn         │───┘   │                                │   │                            │
│ bronze.bcn_geo_neighborhoods       │──▶│ silver.neighborhood_dim           │───────┼──▶│ gold.neighborhood_rolling_features │──▶│ Neighborhood (computed)   │
│ bronze.bcn_geo_districts           │──▶│ silver.district_dim               │───────┤                                                                       
│ bronze.ine_census                  │──▶│ silver.census_section_dim         │───────┘                                                                       
│ bronze.synth_avl_traces            │──▶│ silver.synth_patrol_dim           │   ┌──▶│ gold.load_forecast             │──▶│ LoadForecast (model output) │
│ bronze.synth_cad_dispatches        │──▶│ silver.synth_cad_normalized       │───┘                                                                          
└────────────────────────────────────┘   └───────────────────────────────────┘   └────────────────────────────────┘   └────────────────────────────┘
```

---

## 1️⃣ Bronze layer — raw → typed staging

| Dataset | Source | Format | Schedule | Engine | Notes |
|---|---|---|---|---|---|
| `bronze.gub_incidents` | Open Data BCN `incidents-gestionats-gub` | CSV | Daily 03:00 UTC | Spark batch | ~1 M rows 2020–2024. |
| `bronze.gub_accidents` | Open Data BCN `accidents-gu-bcn` | CSV | Daily 03:15 UTC | Spark batch | ~50 k rows. |
| `bronze.aemet_hourly` | AEMET OpenData (El Prat + Fabra) | JSON | Hourly | Spark structured streaming | ~80 k rows / year × 2 stations. |
| `bronze.ine_census` | INE sections of Barcelona | CSV | Yearly (manual refresh) | Spark batch | ~1.1 k rows. |
| `bronze.bcn_geo_neighborhoods` | Open Data BCN GeoJSON | GeoJSON | Yearly | Spark batch | 73 polygons. |
| `bronze.bcn_geo_districts` | Open Data BCN GeoJSON | GeoJSON | Yearly | Spark batch | 10 polygons. |
| `bronze.synth_avl_traces` | Generator script (seeded) | Parquet | One-shot at PoC bootstrap | Spark batch | ~50–70 GB AVL GPS pings. |
| `bronze.synth_cad_dispatches` | Generator script (seeded) | Parquet | One-shot at PoC bootstrap | Spark batch | ~10 GB CAD-style enrichment. |

### Data Health checks (per bronze dataset)
- **Schema check** — explicit Parquet schema vs the recorded baseline (`schema_version` column in dataset metadata). Drift fails the run.
- **Freshness check** — successful build within the expected window (1 h streaming for AEMET, 25 h batch for GUB datasets).
- **Row-count check** — ±50 % vs rolling 7-day median. Sudden 10× spike or drop fails (catches Open Data publishing pauses, AEMET API outages).
- **Null-rate check** — primary-key columns must be 0 % null; `data_creacio` 0 % null for GUB.

---

## 2️⃣ Silver layer — bronze → curated

### `silver.incident_normalized`
- **Inputs:** `bronze.gub_incidents`, `bronze.gub_accidents` (unioned with a `source` discriminator), `bronze.synth_cad_dispatches`.
- **Logic:**
  - Parse `data_creacio` as Europe/Madrid local time → cast to `event_datetime_utc` (UTC).
  - Derive `day_of_week` from `event_datetime_utc` in Europe/Madrid.
  - Derive `shift_id` from the local hour via:
    ```sql
    CASE
      WHEN local_hour >= 6  AND local_hour < 14 THEN 'MAÑANA'
      WHEN local_hour >= 14 AND local_hour < 22 THEN 'TARDE'
      WHEN local_hour >= 22  OR local_hour < 2  THEN 'NOCHE'
      ELSE 'MADRUGADA'
    END
    ```
  - Map free-text typology → `typology_macro` enum (`SECURITY` / `COEXISTENCE` / `ROAD_TRAFFIC` / `OTHER`) using a static dictionary committed under `tools/poc-seguridad-urbana/typology_mapping.yaml`.
  - Carry through `street_label`, `lat`, `lon` with marking `ANALYST-CORE`.
- **Schedule:** Daily 04:00 UTC, incremental.
- **Output schema:** matches the `Incident` ontology object.

### `silver.weather_hourly_bcn`
- **Inputs:** `bronze.aemet_hourly` (raw observations from El Prat + Fabra).
- **Logic:** resample to a strict 1-hour grid per station, forward-fill gaps ≤ 3 h, drop longer gaps, derive `is_rain` (`precipitation_mm > 0`) and `temperature_bin`.
- **Schedule:** Hourly.

### `silver.neighborhood_dim`
- **Inputs:** `bronze.bcn_geo_neighborhoods`, `bronze.ine_census` (joined by census-tract → neighborhood mapping).
- **Logic:** project geometry, compute `area_km2` from polygon, aggregate INE population to neighborhood, compute `population_density`.

### `silver.census_section_dim`
- **Inputs:** `bronze.ine_census`, `bronze.bcn_geo_neighborhoods` (spatial join).
- **Logic:** project geometry, attach `neighborhood_id`. Mark `population`, `median_age`, `pct_foreign_born`, `pct_unemployed` with `PII-RESIDENT`.

### `silver.district_dim`, `silver.synth_patrol_dim`, `silver.synth_cad_normalized`, `silver.traffic_accident_normalized`
Straight typing + light cleaning; nothing surprising.

---

## 3️⃣ Gold layer — silver → enriched + features

### `gold.incident_enriched` (headline transform)

Spatial join + temporal join + holiday/festival enrichment. Single most important transform in the pipeline.

```yaml
transform:
  id: incident-enriched
  kind: spark_sql
  inputs:
    - silver.incident_normalized
    - silver.neighborhood_dim
    - silver.district_dim
    - silver.weather_hourly_bcn
    - ref.calendar_es_cat_bcn   # holidays + festivals static table
  output: gold.incident_enriched
  schedule: { cron: "15 4 * * *", incremental: true }
  sql: |
    WITH joined AS (
      SELECT
        i.incident_id,
        i.numero_expedient,
        i.event_datetime_utc,
        i.typology_macro,
        i.typology_detail,
        i.street_label,
        i.lat,
        i.lon,
        i.source,
        i.shift_id,
        n.neighborhood_id,
        n.district_id,
        w.weather_event_id,
        c.is_holiday,
        c.is_festival
      FROM silver.incident_normalized i
      LEFT JOIN silver.neighborhood_dim n
        ON ST_Contains(n.geometry, ST_Point(i.lon, i.lat))
      LEFT JOIN silver.weather_hourly_bcn w
        ON w.valid_at_utc = date_trunc('hour', i.event_datetime_utc)
        AND w.station    = 'EL_PRAT'
      LEFT JOIN ref.calendar_es_cat_bcn c
        ON c.date_local = date(i.event_datetime_utc AT TIME ZONE 'Europe/Madrid')
    )
    SELECT * FROM joined
  health_checks:
    - id: spatial_join_completeness
      kind: ratio_at_least
      expr: "count_if(neighborhood_id IS NOT NULL) * 1.0 / count(*)"
      threshold: 0.99
    - id: weather_join_completeness
      kind: ratio_at_least
      expr: "count_if(weather_event_id IS NOT NULL) * 1.0 / count(*)"
      threshold: 0.95
    - id: holiday_flag_coverage
      kind: ratio_at_least
      expr: "count_if(is_holiday IS NOT NULL) * 1.0 / count(*)"
      threshold: 1.00
    - id: uniqueness
      kind: unique
      column: incident_id
```

### `gold.neighborhood_rolling_features`
- **Inputs:** `gold.incident_enriched`, `silver.neighborhood_dim`.
- **Logic:** for each (`neighborhood_id`, `date`), compute:
  - `incidents_last_7d`, `incidents_last_30d` (centered on date − 1).
  - `trend_30d` — slope of a simple linear regression over the last 30 daily counts.
  - `incidents_per_1000_residents` = `incidents_last_30d / population * 1000`.
- **Schedule:** Daily 04:30 UTC.

### `gold.load_forecast`
- **Inputs:** `gold.incident_enriched`, `gold.neighborhood_rolling_features`, `silver.weather_hourly_bcn` (as the source of weather features for the future days — forecast or persistence), `ref.calendar_es_cat_bcn`.
- **Output:** model predictions for the next 7 days × 73 neighborhoods × 4 shifts = ~2 044 rows / day.

```yaml
transform:
  id: load-forecast
  kind: code_workbook
  language: python
  inputs:
    - gold.incident_enriched
    - gold.neighborhood_rolling_features
    - silver.weather_hourly_bcn
    - ref.calendar_es_cat_bcn
  output: gold.load_forecast
  schedule: { cron: "0 5 * * *" }
  model:
    primary:
      kind: xgboost_regressor
      objective: count:poisson
      params: { max_depth: 6, eta: 0.05, n_estimators: 600, subsample: 0.9 }
    fallback:
      kind: poisson_glm
      formula: "n_incidents ~ dow + month + is_holiday + is_festival + is_rain + temp_bin + roll7 + roll30 + pop_density"
  baseline:
    kind: same_dow_same_shift_30d_mean
  emits:
    - forecast_id
    - neighborhood_id
    - shift_id
    - target_date
    - expected_incidents
    - ci_low
    - ci_high
    - baseline_expected
    - model_version
    - generated_at_utc
  health_checks:
    - id: row_count_exact
      kind: equals
      expr: "count(*)"
      value: 2044  # 7 days × 73 neighborhoods × 4 shifts
    - id: mae_vs_baseline
      kind: at_most_delta
      expr: "mae(expected_incidents, actual) - mae(baseline_expected, actual)"
      threshold: 0.5
      window: "last_7d_backtest"
    - id: predictions_non_negative
      kind: min_at_least
      expr: "min(expected_incidents)"
      threshold: 0.0
```

---

## 4️⃣ Predictive model (Code Workbook)

The forecast lives in a Code Workbook attached to `gold.load_forecast`. Two models are coded; the workbook chooses XGBoost as primary and exposes Poisson GLM as the explainable fallback.

### Feature list (canonical, do not deviate)

| Feature | Type | Source | Notes |
|---|---|---|---|
| `dow` | enum (Mon..Sun) | `silver.incident_normalized` | Day-of-week of the target. |
| `month` | int (1..12) | derived | Seasonality. |
| `is_holiday` | bool | `ref.calendar_es_cat_bcn` | Spain + Catalonia + Barcelona local. |
| `is_festival` | bool | `ref.calendar_es_cat_bcn` | La Mercè, Sant Joan, Christmas window. |
| `is_rain` | bool | `silver.weather_hourly_bcn` | Aggregated over the shift window. |
| `temp_bin` | enum | `silver.weather_hourly_bcn` | COLD / MILD / WARM / HOT. |
| `roll7` | int | `gold.neighborhood_rolling_features` | Per-shift 7-day rolling count. |
| `roll30` | int | `gold.neighborhood_rolling_features` | Per-shift 30-day rolling count. |
| `pop_density` | float | `silver.neighborhood_dim` | Static neighborhood density. |

### Baseline + commitment to honesty

The baseline is the **same-neighborhood × same-shift × same-day-of-week 30-day rolling mean**. The Code Workbook reports both `mae(model)` and `mae(baseline)` on a 7-day rolling backtest. The KPI strip in the Quiver dashboard surfaces the **delta**; if the model is not materially better than baseline, the demo says so on stage. This is an explicit ethical and credibility choice for the police-customer audience: technical honesty beats hype.

### Why XGBoost + Poisson GLM
- XGBoost handles the interaction between weather, festival flags, and day-of-week well; it is the production model.
- Poisson GLM is the explanation surface: the demo opens its coefficient table on stage so the commander sees that, for example, "rain × NOCHE in coastal neighborhoods" has a known sign and magnitude.

---

## 5️⃣ Data Health checks — consolidated

| Layer | Check | Threshold | Action on fail |
|---|---|---|---|
| All bronze | Schema drift | 0 tolerance | Fail the run; alert. |
| All bronze | Freshness | 1 h streaming / 25 h batch | Warn, then fail after 2 missed windows. |
| All bronze | Row count | ±50 % vs rolling 7-day median | Fail. |
| `silver.incident_normalized` | `shift_id` enum domain | 100 % in the four canonical values | Fail. |
| `silver.weather_hourly_bcn` | Hour-grid completeness | ≥ 95 % per day after forward-fill | Warn. |
| `gold.incident_enriched` | Spatial-join completeness | ≥ 99 % `neighborhood_id` non-null | Fail. |
| `gold.incident_enriched` | Weather-join completeness | ≥ 95 % `weather_event_id` non-null | Warn. |
| `gold.incident_enriched` | Holiday-flag coverage | 100 % `is_holiday` non-null | Fail. |
| `gold.load_forecast` | Row count exact | 2 044 / day | Fail. |
| `gold.load_forecast` | MAE vs baseline (7-day backtest) | `mae(model) ≤ mae(baseline) + 0.5` | Warn (NOT fail — honesty over green-light). |
| `gold.load_forecast` | Predictions non-negative | min ≥ 0 | Fail. |

> Failures pop in **Data Health** as red cards in Workshop. The demo backup deck includes a screenshot of the all-green state for the morning of the meeting.

---

## 6️⃣ Lineage propagation

`lineage-service` consumes the build events from each pipeline and emits Foundry-style lineage edges. By acceptance:

- Click on `Neighborhood.incidents_last_30d` in the ontology → "Show lineage" → see the chain
  `gold.neighborhood_rolling_features ← gold.incident_enriched ← silver.incident_normalized ← {bronze.gub_incidents, bronze.gub_accidents, bronze.synth_cad_dispatches}`,
  plus the join into `silver.neighborhood_dim ← bronze.bcn_geo_neighborhoods` and `bronze.ine_census` for `population`.
- Click on `LoadForecast.expected_incidents` → see
  `gold.load_forecast ← {gold.incident_enriched, gold.neighborhood_rolling_features, silver.weather_hourly_bcn, ref.calendar_es_cat_bcn}` plus the model run metadata (Git SHA in `model_version`, training-data window, hyperparameters).

Lineage is a customer-visible feature, not a developer convenience — it is the answer to the inevitable question *"and where does this number come from?"*.

---

## 7️⃣ Branch-aware execution (UC-6)

When a Global Branch is created (e.g. `chronic-priority-2026Q4`), the pipeline service must:
1. Materialize branched outputs **only** for downstream nodes the branch touches — in this PoC, just `silver.neighborhood_dim` (which carries `is_chronic_priority`) and the Workshop bindings that read it.
2. Leave `gold.incident_enriched`, `gold.neighborhood_rolling_features`, and `gold.load_forecast` reading from `main` (the chronic-priority flag does not retrain the model, by design).
3. Expose a branch-aware view to Workshop so the commander can preview the new chronic-priority roster side by side with main before merging.

---

## ✅ Concrete actions (when the PoC is executed)

1. Author each transform in `pipeline-build-service` (Pipeline Builder UI) or as a Code Repositories Spark / Code Workbook transform; commit YAML/SQL under `tools/poc-seguridad-urbana/pipelines/`.
2. Schedule per the tables above; confirm AEMET hourly streaming runs without API-key throttling.
3. Wire Data Health checks; confirm all check IDs appear in `telemetry-governance-service` and that the `mae_vs_baseline` check is a **warn**, not a fail.
4. Train the XGBoost forecaster on 2020–2023, hold out 2024 Q1 as the backtest; commit the resulting `model_version` (Git SHA) into the workbook config.
5. Run a full bronze → gold build; confirm row counts hit the KPIs in [`01-vision-y-caso-de-uso.md`](01-vision-y-caso-de-uso.md) (≈ 1 M Incidents, ≈ 50 k TrafficAccidents, 73 Neighborhoods, 2 044 forecasts / day).
6. Capture lineage screenshots from `Neighborhood.incidents_last_30d` and `LoadForecast.expected_incidents` back to the bronze sources, for the demo backup deck.
