# 10 — Security and governance

> For an enterprise customer (especially in aviation), **the first question they will ask** after the "wow" is: *"is this secure and auditable?"*. This document prepares the answer.

---

## 👥 Users and roles for the demo

Create in Keycloak (realm `openfoundry-poc`):

| User | Email | Role(s) | Default screen |
|---|---|---|---|
| Ana Morales | `ana@acme-airlines.demo` | `ops-controller` | Operations Live |
| Luis García | `luis@acme-airlines.demo` | `mro-lead` | Fleet Health |
| Marta Ríos | `marta@acme-airlines.demo` | `duty-manager` | Operations Live (with approvals inbox) |
| Diego Ruiz | `diego@acme-airlines.demo` | `mro-engineer` | assigned task (restricted view) |
| Admin | `admin@acme-airlines.demo` | `platform-admin` | reserved for reset |

Passwords: managed by sops, **never in the repo**. Generated with `pwgen 24 1`.

---

## 🛡️ RBAC policy (summary)

Permission matrix over ontology actions:

| Action | ops-controller | mro-lead | mro-engineer | duty-manager | platform-admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Read all objects | ✅ | ✅ | ⚠ (assigned only) | ✅ | ✅ |
| `acknowledge-delay-risk` | ✅ | ⛔ | ⛔ | ✅ | ✅ |
| `flag-aircraft-for-inspection` | ⛔ | ✅ | ⛔ | ✅ | ✅ |
| `assign-maintenance-event` | ⛔ | ✅ | ⛔ | ✅ | ✅ |
| `order-part` | ⛔ | ✅ | ⛔ | ⛔ | ✅ |
| `reroute-flight` | propose | propose | ⛔ | approve+execute | execute |
| Manage ontology definitions | ⛔ | ⛔ | ⛔ | ⛔ | ✅ |
| Branch datasets | ⛔ | ⛔ | ⛔ | ⛔ | ✅ |

Define as YAML in `authorization-policy-service` (Cedar engine, ABAC + RBAC; see libs `authz-cedar-go` and `auth-middleware`):

```yaml
policy:
  id: aviation-poc-v1
  bindings:
    - role: ops-controller
      grants:
        - { resource: "ontology://*", verbs: [read] }
        - { resource: "ontology.action://acknowledge-delay-risk", verbs: [execute] }
        - { resource: "ontology.action://reroute-flight", verbs: [propose] }
    - role: mro-lead
      grants:
        - { resource: "ontology://*", verbs: [read] }
        - { resource: "ontology.action://flag-aircraft-for-inspection", verbs: [execute] }
        - { resource: "ontology.action://assign-maintenance-event", verbs: [execute] }
        - { resource: "ontology.action://order-part", verbs: [execute] }
    - role: mro-engineer
      grants:
        - { resource: "ontology://MaintenanceEvent?assigned_engineer_id={{user.id}}", verbs: [read, update] }
    - role: duty-manager
      grants:
        - { resource: "ontology://*", verbs: [read] }
        - { resource: "ontology.action://reroute-flight", verbs: [approve, execute] }
        - { resource: "ontology.action://*", verbs: [execute] }
    - role: platform-admin
      grants:
        - { resource: "*", verbs: ["*"] }
```

> **ABAC in addition to RBAC**: note the `mro-engineer` rule that filters by `assigned_engineer_id={{user.id}}` — this is a resource attribute, not just a role. We showcase this in the demo.

---

## 📜 Audit log — what is recorded

`audit-compliance-service` captures **every** write action and, optionally, reads to sensitive resources. Each entry contains:

```json
{
  "audit_id": "uuid",
  "timestamp_utc": "2026-04-30T09:42:11Z",
  "actor": { "user_id": "luis", "session_id": "...", "source_ip": "10.0.0.42", "user_agent": "..." },
  "action": "ontology.action.execute",
  "action_id": "flag-aircraft-for-inspection",
  "target": { "object_type": "Aircraft", "id": "N12345" },
  "params": { "reason": "Recurring ATA-27 defect", "priority": "HIGH" },
  "outcome": "success",
  "produced_objects": [{ "object_type": "MaintenanceEvent", "id": "evt_abc123" }],
  "triggered_workflows": ["mro-inspection:run_xyz"],
  "via": { "client": "ui", "feature": "fleet-health-app" },
  "policy_decision": { "policy_id": "aviation-poc-v1", "binding": "mro-lead/flag-aircraft-for-inspection" }
}
```

**Immutability:** audit entries are replicated to S3 with object-lock (mode `COMPLIANCE`, 7-year retention). Show the customer the buckets with policies.

---

## 🔐 Sensitive data

For the PoC there is **no PII** (only tail numbers, callsigns, ATA codes). But we demonstrate the capability:
- In the Iceberg catalog (served by `iceberg-catalog-service`) and in `dataset-versioning-service`, tag columns with `pii: true / quasi_pii: true / public: true`.
- The `media-scanner` lib (Sensitive Data Scanner) scans media/blobs for PII patterns.
- **Roadmap**: field-level encryption / tokenization is not implemented as a dedicated service today; when needed it will run as a step prior to the sink in `ingestion-replication-service` (capability pending).
- The "find all PII assets" search is performed from `apps/web` (`/search`, `/datasets`) and `ontology-query-service`.

---

## 🌳 Branches and *time travel* (governance of data changes)

Demonstrate:
1. Branch `feat/risk-model-v2` from `main` (`mro-lead`+ action).
2. Change (model retraining).
3. Visual diff (rows affected, metrics compared).
4. Merge → audit entry: who approved, when, what changed.
5. One-click rollback to the previous snapshot (time travel).

---

## 🔑 Federated identity

`identity-federation-service` with OIDC against Keycloak. The service already covers auth, MFA, WebAuthn, OIDC, SAML, RBAC and SCIM (it is one of the services flagged as **security-critical** in `CLAUDE.md`). Sessions live inside `identity-federation-service` itself + the `auth-middleware` lib (there is no separate `session-governance-service`). The tenant model and workspace enrollments are managed by `tenancy-organizations-service`.

---

## 🔒 Network isolation

For the cloud demo:
- Private VPC, private subnets for internal services.
- Public ALB only for UI + Keycloak.
- Controlled egress (allowlist: opensky, S3 NOAA, transtats.bts.gov, Azure OpenAI).
- TLS termination at the ALB with ACM/Let's Encrypt cert.

---

## 🧯 Response plan if something "leaks" during the demo

(Unlikely but just in case)
- We have `kill-switch.sh` which shuts down `apps/web` and serves a static "maintenance" page.
- The presenter has this script in an open terminal tab.

---

## 📋 Compliance — what to tell the customer

OpenFoundry **is not** EASA Part-145 or SOC2 today (the PoC does not certify it). But **it is compatible** with those frameworks because:
- Immutable audit, exportable to SIEM.
- Granular RBAC + ABAC.
- Encryption at rest (KMS-backed) and in transit (TLS 1.3).
- End-to-end lineage (key for regulatory audits).
- Branches and approvals for controlled changes (key for Part-145).
- Self-hosted: the customer retains control of their data.

---

## ✅ Concrete actions (when the PoC is executed)

1. Create realm `openfoundry-poc` in Keycloak with the 5 users.
2. Load the YAML policy into `authorization-policy-service`.
3. Enable audit on every service in the subset (global config).
4. Configure S3 object-lock COMPLIANCE for the audit bucket.
5. Test the RBAC matrix with each user before the dry-run (script `tools/poc-aviation/test_rbac.sh`).
6. Have `kill-switch.sh` ready and tested.
