# Audit and traceability

Auditability is a core platform feature, not an afterthought.

## Repository signals

OpenFoundry contains dedicated audit infrastructure through:

- `services/audit-compliance-service` — platform audit ledger, retention policies, lineage deletion subsystem
- `services/audit-sink` — Kafka → Iceberg consumer for the `audit.events.v1` stream (the long-term archive)
- `libs/audit-trail` — shared structured-audit-event library used by every service that needs to emit auditable records
- gateway audit middleware in `libs/auth-middleware` (records who accessed what, with which scope)
- ontology and action flows that call into audit-aware layers (`ontology-actions-service` records every action execution)

The service topology and CI smoke setup treat `audit-compliance-service` as a first-class runtime dependency.

## Why this matters

This is the layer that makes it possible to answer questions like:

- who changed an object
- which action was executed
- which policy allowed or blocked a decision
- what happened during a workflow or incident

For an operational platform, those answers are often required for trust, compliance, and post-incident learning.
