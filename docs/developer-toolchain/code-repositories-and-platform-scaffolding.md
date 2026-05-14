# Code repositories and platform scaffolding

OpenFoundry's developer platform is more than build scripts. The repo already contains signals of a productized internal developer platform.

## Repository signals

- `services/code-repository-review-service` — global branching, code-security scanning, review plane
- `services/application-composition-service` — Workshop app composition, pages, widgets, publish runtime
- `services/federation-product-exchange-service` — marketplace, product distribution, federation registry
- `libs/plugin-sdk` — Go package that **will** host the WASM connector/transform/widget SDK (currently a placeholder; see [Plugin SDK](./plugin-sdk/index.md))
- `tools/of-cli` — platform CLI (Go binary)

## CLI surface today

The CLI in `tools/of-cli/main.go` currently exposes:

- `docs generate-openapi` / `docs validate-openapi`
- `docs generate-sdk-typescript` / `docs validate-sdk-typescript`
- `docs generate-sdk-python` / `docs validate-sdk-python`
- `docs generate-sdk-java` / `docs validate-sdk-java`
- `smoke run` — execute smoke scenarios (also invoked from CI by `chaos-smoke.yml`)
- `bench run` / `benchmark run` — execute benchmarks under `benchmarks/`
- `mock-provider serve` — local mock provider for development

> The original Rust-era roadmap entries (`of project init`, deploy plan rendering, plugin scaffolding) are not yet shipped in the Go CLI; they remain on the [ROADMAP](../../ROADMAP.md) as candidates for the developer ecosystem milestone.

## Why this matters

This area is the beginning of a real platform builder story:

- creating new packages and templates
- managing code artifacts as platform resources
- connecting build assets to app-builder (`application-composition-service`) and marketplace (`federation-product-exchange-service`) capabilities
