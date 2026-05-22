# Plugin SDK

The plugin SDK is the contract layer for generated or packaged platform extensions.

## Current state

`libs/plugin-sdk` is today a Go **placeholder package** (`package pluginsdk` with only `doc.go`). The surface will land here when the SDK design is finalised — see the package docstring:

> Package pluginsdk is a placeholder for the OpenFoundry plugin SDK (WASM connectors, transforms, widgets). The surface will land here when the SDK design is finalised.

The intended scope, once shipped, will cover:

- a `PluginKind` enum with `connector`, `transform`, and `widget`
- runtime metadata
- plugin manifests
- Go trait/interface definitions for each kind
- scaffold helpers (Go module setup, manifest JSON, starter package)

> The monorepo is a single Go module rooted at `github.com/openfoundry/openfoundry-go`. The plugin runtime will be WASM, but the SDK host APIs are Go.

## Why this matters

The placeholder is a strong signal that OpenFoundry is designed to support extension as a platform feature, not only as internal source code changes. Once the surface lands, the SDK will be the shared foundation for:

- marketplace packages (distributed via `federation-product-exchange-service`)
- connector templates (loaded by `connector-management-service`)
- transform authoring (consumed by `pipeline-build-service` + `pipeline-runner-spark`)
- widget packaging (registered with `application-composition-service`)
