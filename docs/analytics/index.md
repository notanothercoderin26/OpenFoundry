# Analytics

This section covers how OpenFoundry exposes analysis and operational insight.

## OpenFoundry mapping

- `services/sql-bi-gateway-service` — Apache Arrow Flight SQL server (port `50133`) backed by DataFusion, with per-statement routing to Iceberg, Vespa and Postgres
- `services/ontology-exploratory-analysis-service` — time-series, geospatial, scenarios surface
- `services/notebook-runtime-service` — notebook CRUD + kernels (analytical workbooks)
- `services/entity-resolution-service` — fusion / entity resolution (match rules, merge strategies, fuzzy matching)
- `libs/analytical-logic` — analytical expressions for BI queries
- `libs/query-engine` — SQL evaluator for BI client probes
- `libs/geospatial-core`, `libs/geospatial-tiles` — geospatial primitives and tile generation
- `apps/web/src/routes/queries` — Query Workbench
- `apps/web/src/routes/dashboards`, `apps/web/src/routes/quiver` — dashboards
- `apps/web/src/routes/reports` — reports (the dedicated `report-service` binary is planned; today jobs run as steps inside `workflow-automation-service`)
- `apps/web/src/routes/geospatial`, `apps/web/src/routes/maplibre-demo` — geospatial analytics
- `apps/web/src/routes/fusion` — entity resolution UI

## Key concerns

- SQL query execution over Iceberg / Vespa / Postgres (`sql-bi-gateway-service`)
- ad-hoc analysis surfaces (notebooks, queries)
- reporting (currently delivered through workflow steps + the `/reports` frontend; dedicated service planned)
- geospatial analytics (`ontology-exploratory-analysis-service` + libs)
- dashboard and exploration surfaces (`/dashboards`, `/quiver`)
