# Model connectivity & development

This section covers how OpenFoundry connects models, code, and operational runtimes.

## OpenFoundry mapping

- `services/model-catalog-service` — model adapter, lifecycle CRUD, experiments
- `services/model-deployment-service` — deployment surface and serving-runtime adapter
- `services/notebook-runtime-service` — notebooks (CRUD, cells, sessions, kernel execution, export)
- `services/sql-bi-gateway-service` — Apache Arrow Flight SQL server over DataFusion
- `libs/ml-kernel-go` — ML model serving, batch scoring, monitoring
- `libs/python-sidecar` — Python subprocess runtime exposed over gRPC (used by notebooks + Python transforms)
- `sdks/typescript`, `sdks/python`, `sdks/java` — generated client SDKs
- `tools/of-cli` — CLI for model packaging and platform operations
- `apps/web/src/routes/ml` — ML Studio UI
- `apps/web/src/routes/notebooks` — Notebook editor
- `proto/ml/*` — wire contracts

## Key concerns

- model registration, versioning and experiments (`model-catalog-service`)
- real-time inference and batch serving (`model-deployment-service` + `ml-kernel-go`)
- notebook and experimentation surfaces (`notebook-runtime-service` + `python-sidecar`)
- generated SDKs and client-facing model access patterns (`sdks/*`)
