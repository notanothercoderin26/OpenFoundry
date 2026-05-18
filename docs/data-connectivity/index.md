# Data connectivity & integration

This section covers how OpenFoundry connects to source systems, ingests data, and moves it into operational platform flows.

## OpenFoundry mapping

- `services/connector-management-service` — data sources, webhooks, REST API runtime
- `services/ingestion-replication-service` — batch + streaming ingestion (over Kafka via `libs/event-bus-data`), branching, cold-tier storage, replication
- `services/dataset-versioning-service` — datasets, branches, transactions, file APIs
- `services/iceberg-catalog-service` — Iceberg REST catalog (Foundry-flavor) over Lakekeeper
- `services/lineage-service` — OpenLineage events sink, lineage graph query API
- `services/media-sets-service` + `services/media-transform-runtime-service` — media items, branches, image/PDF/OCR/geospatial transforms
- `services/pipeline-build-service` + `services/pipeline-runner` — pipeline authoring, build orchestration, and Plan-driven execution against Iceberg (ADR-0045; the prior Scala `pipeline-runner-spark` was retired in Phase D)
- `libs/event-bus-data` (Kafka) + `libs/event-bus-control` (NATS) + `libs/storage-abstraction` + `libs/plugin-sdk` (WASM connectors)
- `apps/web/src/routes/data-connection`, `/datasets`, `/iceberg-tables`, `/streaming`, `/virtual-tables`, `/lineage`
- `proto/data_integration/*`, `proto/dataset/*`, `proto/pipeline/*`, `proto/streaming/*`

## Key concerns

- connection management
- sync orchestration
- dataset creation and versioning
- batch and streaming ingestion
- storage and archival integration
