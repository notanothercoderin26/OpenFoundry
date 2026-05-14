# Marketplace and packaging

Packaging is where internal tooling becomes distributable product capability.

## Repository signals

`federation-product-exchange-service` (the marketplace + federation registry + product distribution surface) contains domain areas for:

- discovery
- registry
- validation
- activation
- dependency handling
- devops-oriented flows
- federation across organizations (Nexus / cross-org sharing capability)

Those signals are visible under `services/federation-product-exchange-service/internal/domain/` and `services/federation-product-exchange-service/internal/handlers/`. The frontend surface lives at `apps/web/src/routes/marketplace`.

> Older docs called this binary `marketplace-service`. That service name was never materialised in the Go monorepo; the marketplace + product-distribution + federation-registry capabilities are consolidated in `federation-product-exchange-service`.

## Why this matters

This subtree is the natural home for documentation about:

- publishing assets
- promotion gates
- installation and activation
- dependency resolution
- fleet and rollout models
- cross-organization data and capability sharing (Nexus)
