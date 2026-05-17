# Project init

Project scaffolding is the fastest way to make the developer platform feel coherent.

## Current state

`of-cli` (`tools/of-cli/main.go`) today exposes **contract and SDK generation commands** (`docs generate-openapi`, `docs generate-sdk-*`, `smoke run`, `bench run`, `mock-provider serve`) but **not yet** a `project init` flow. The intended template-selection surface for:

- connector
- transform
- widget

…is on the [ROADMAP](../../ROADMAP.md) and will be supported by helper logic in `libs/plugin-sdk` once that package is finalised (today `libs/plugin-sdk` is a placeholder — see [Plugin SDK](../plugin-sdk/index.md)).

A new service entrypoint is meanwhile created by copying `docs/templates/service-skeleton/` and registering the result in the Helm chart + Argo CD app set + the edge gateway router table (see [`CLAUDE.md`](../../../CLAUDE.md) §"Adding a new service").

## Why this matters

A good `project init` flow does three things:

- reduces setup errors
- encodes platform conventions
- shortens the path from idea to runnable artifact

Until it ships, the `docs/templates/service-skeleton/` boilerplate fills that role for new services, and the `make tools` / `make gen` flow fills it for contracts.
