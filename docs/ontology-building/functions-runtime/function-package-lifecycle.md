# Function package lifecycle

Function packages already behave like managed semantic artifacts in the ontology backend.

## Repository signals

`ontology-actions-service` (which currently hosts the functions runtime + metadata, backed by `libs/python-sidecar` for Python execution) exposes:

- function package CRUD
- validation
- simulation

These endpoints are defined in `services/ontology-actions-service/cmd/ontology-actions-service/main.go` (chi router wiring in `services/ontology-actions-service/internal/server/`) and implemented through `services/ontology-actions-service/internal/handlers/functions.go`.

## Lifecycle

1. create a function package
2. update its metadata and code-linked references
3. validate the package
4. simulate execution
5. attach or consume it from applications, rules, or semantic workflows
