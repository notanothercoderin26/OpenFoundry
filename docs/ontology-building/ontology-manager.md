# Ontology Manager

Ontology manager is the control-plane area for maintaining and evolving semantic definitions.

## Core concerns

- navigation and ownership
- change management
- review and restore flows
- usage visibility
- import and export of ontology definitions
- cleanup and migration support

## OpenFoundry mapping

This capability would likely sit across:

- the ontology service split (`ontology-definition-service`, `ontology-query-service`, `ontology-actions-service`, `object-database-service`)
- `services/identity-federation-service`
- `services/authorization-policy-service`
- `services/audit-compliance-service`
- `apps/web/src/routes/ontology`

## Why it matters

As ontology scope grows, the platform needs a dedicated management surface rather than forcing semantic governance into raw config or direct backend edits.
