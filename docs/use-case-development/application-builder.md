# Application builder

Application development in OpenFoundry is not only about frontend routes. It also includes server-side runtime composition and reusable internal platform primitives.

## Repository signals

- `services/application-composition-service` — app composition, pages, widgets, publish runtime
- `apps/web/src/routes/apps`, `/workshop-editor` — frontend UI (React 19 + Vite)
- `services/federation-product-exchange-service` — marketplace + product distribution + federation registry (this is the binary that hosts the marketplace surface; older docs called it `marketplace-service`)
- `services/code-repository-review-service` — embedded code repos and review plane

## What this capability should cover

- internal application composition
- runtime packaging
- reusable widgets or modules
- productization of app assets through marketplace-like surfaces

## Why this matters

For an operational platform, use cases are not complete until teams can assemble them into usable applications with the right semantics, data access, and workflows.
