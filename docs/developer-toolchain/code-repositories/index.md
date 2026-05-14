# Code repositories

Code repositories are a first-class platform capability in OpenFoundry, not only an external Git integration story.

## Repository signals

`code-repository-review-service` already exposes dedicated APIs for:

- repository listing and creation
- branches (it also hosts the **global branching** plane for the platform)
- commits
- file listing and search
- diffs
- CI runs
- integrations
- merge requests and comments
- code-security scanning

The route surface is wired in `services/code-repository-review-service/cmd/code-repository-review-service/main.go` and `services/code-repository-review-service/internal/server/`; handlers live under `internal/handlers/`.

## Why this matters

This gives OpenFoundry a path toward embedded developer workflows inside the platform, especially when combined with app builder (`application-composition-service`), marketplace (`federation-product-exchange-service`), and project scaffolding.

## Section map

- [Repository lifecycle](/developer-toolchain/code-repositories/repository-lifecycle)
- [Developer platform flow](/developer-toolchain/code-repositories/developer-platform-flow)
- [OpenFoundry current vs target](/developer-toolchain/code-repositories/current-vs-target)
