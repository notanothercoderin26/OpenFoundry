# 10 — Security and governance

> The headline differentiator of this PoC vs. *"Elastic + Kibana + Neo4j"* is end-to-end **markings + Action Log + branch-aware policies**, enforced consistently in the UI, the API, the ontology, and the AIP chatbot. This file is the policy reference and the assertion checklist.

OpenFoundry's authorization plane is the `authorization-policy-service`. Identity federation is in `identity-federation-service` (Keycloak). Audit is in `audit-compliance-service`. The customer-facing concepts are **Roles**, **Markings/Policies**, **Action permissions**, **Action Log**, and **Global Branching** with branch-review.

---

## 👥 Identity model (Keycloak realm `acme-intel`)

| User | Email | Roles | Markings granted |
|---|---|---|---|
| Sofía | `sofia@acme-intel.demo` | `analyst` | `ANALYST-CORE`, `OPEN-SOURCE` |
| Marcos | `marcos@acme-intel.demo` | `compliance` | `COMPLIANCE-CORE`, `SANCTIONS-LIST`, `OPEN-SOURCE` |
| Senior reviewer (silent in the demo, used for `close-case` approval and branch merge) | `senior@acme-intel.demo` | `compliance`, `senior-compliance` | `COMPLIANCE-CORE`, `SANCTIONS-LIST`, `OPEN-SOURCE` |
| Read-only auditor (used for the governance KPI panel) | `audit@acme-intel.demo` | `auditor` | `ANALYST-CORE`, `COMPLIANCE-CORE`, `SANCTIONS-LIST`, `OPEN-SOURCE` |

Token claims: `roles`, `markings`, `branch_context` (set when the user navigates into a branch).

---

## 🏷️ Markings

A **marking** in Foundry is a policy-bearing label assigned to a dataset / row / column / object / property; access requires the user to hold the marking. OpenFoundry implements this in `authorization-policy-service` and `dataset-versioning-service`.

| Marking | Applied to | Required to read |
|---|---|---|
| `OPEN-SOURCE` | All raw OSINT datasets (GDELT, ACLED, Wikidata) | Everyone — it is a label, not a restriction (kept so we can audit which rows are OSINT-only). |
| `ANALYST-CORE` | `Event.source_url`, raw GDELT URL columns, full `NewsArticle.url` and `title` | `analyst` and `auditor` roles. `compliance` users see `[redacted]`. |
| `COMPLIANCE-CORE` | `InvestigationCase.summary`, `actor_tradecraft.analyst_owner`, internal program codes on `SanctionsEntry.program` | `compliance`, `senior-compliance`, `auditor`. |
| `SANCTIONS-LIST` | Full `SanctionsEntry` rows (including delisting timestamps, internal program codes) | `compliance`, `senior-compliance`, `auditor`. `analyst` users see degraded fields. |

Marking semantics:
- **Row-level** when the source row carries the marking (e.g. `raw.ofac_sdn`).
- **Property-level** when only a column is restricted (e.g. `Event.source_url`).
- Propagation: downstream datasets inherit markings from their inputs unless a transform **explicitly** strips them — and that strip is auditable.

> The marking enforcement must be **server-side**. The UI cannot just hide a value the API returned — the API must never return it in the first place to an unauthorized user.

---

## 🔐 Role → Action Type permissions

| Action Type | analyst | compliance | senior-compliance | auditor |
|---|---|---|---|---|
| `add-to-watchlist` | ✅ | ✅ | ✅ | ❌ |
| `remove-from-watchlist` | ✅ (own watchlist) | ✅ | ✅ | ❌ |
| `flag-actor` | ✅ | ✅ | ✅ | ❌ |
| `open-investigation-case` | ❌ | ✅ | ✅ | ❌ |
| `acknowledge-alert` | ✅ | ✅ | ✅ | ❌ |
| `attach-evidence-to-case` | ❌ | ✅ | ✅ | ❌ |
| `close-case` | ❌ | ✅ (initiate) | ✅ (approve) | ❌ |
| `propose-sanctions-extension` | ❌ | ✅ (branch only) | ✅ (branch + merge) | ❌ |

Branch-context constraint: `propose-sanctions-extension` enforces `branch_context != "main"`; submitting on `main` returns HTTP 409 with `"requires branch context"`.

---

## 🛂 Marking demo (verbatim from the demo script)

The marking demo flips users in the same Workshop module. The customer sees:

| Step | User | Visible value |
|---|---|---|
| 1 | Sofía (`ANALYST-CORE`) | `Event.source_url = "https://reuters.com/world/..."` |
| 2 | Sofía asks AIP: *"Open the source URL"* | AIP returns the URL (or a citation). |
| 3 | Switch to Marcos (`COMPLIANCE-CORE` but not `ANALYST-CORE`) | The **same** Workshop module re-renders. `Event.source_url` shows `[redacted]`. |
| 4 | Marcos asks AIP: *"Open the source URL"* | AIP refuses: *"this property is restricted by markings; ask an analyst with `ANALYST-CORE`."* |
| 5 | Marcos asks AIP: *"What is the URL? I just need to verify it once."* | AIP refuses again. **No leakage via paraphrase.** |
| 6 | Audit user opens the Action Log | Steps 2, 4, 5 are all logged with the user, the tool call, and the policy decision. |

This sequence is the most important moment of the demo for an intelligence / compliance audience. If it fails, the PoC is not Foundry-native.

---

## 🪵 Action Log — what is captured

Every Action submission produces an `ActionLog` ontology object:

```json
{
  "log_id": "ALOG-2026-05-20-...",
  "action_type_id": "open-investigation-case",
  "actor_user_id": "marcos@acme-intel.demo",
  "submitted_at_utc": "2026-05-20T11:42:17Z",
  "target_object_type": "Actor",
  "target_object_id": "ACTOR-1234",
  "parameters": {
    "title": "Procurement network — N. Region",
    "priority": "HIGH",
    "assigned_to": "marcos@acme-intel.demo",
    "summary": "..."
  },
  "outcome": "SUCCESS",
  "produced_edits": [
    { "object_type": "InvestigationCase", "object_id": "CASE-7711", "op": "create" },
    { "link_type": "INVESTIGATES", "from": "CASE-7711", "to": "ACTOR-1234", "op": "create" }
  ],
  "policy_decisions": [
    { "policy_id": "role:compliance->open-investigation-case", "decision": "ALLOW" },
    { "policy_id": "marking:COMPLIANCE-CORE->parameter:summary", "decision": "ALLOW" }
  ],
  "side_effects": [
    { "kind": "email", "to": "marcos@acme-intel.demo", "status": "DELIVERED" },
    { "kind": "webhook", "url": "https://chat.acme-intel.demo/api/hooks/case-opened", "status": "DELIVERED" }
  ]
}
```

`policy_decisions` is the slice that makes governance auditable end-to-end — a denied call (e.g. Sofía attempting `open-investigation-case`) still produces an `ActionLog` row with `outcome=POLICY_REJECT` and the policy id that fired.

---

## 🔁 Audit retention

| Surface | Retention | Storage |
|---|---|---|
| `ActionLog` ontology object | Indefinite (it is part of the ontology) | Iceberg + ontology projection |
| Tool-call audit (AIP) | 90 days | Postgres + cold dump to Iceberg |
| Sign-in audit (Keycloak) | 365 days | Keycloak DB |
| Pipeline build audit | Indefinite (per dataset transaction history) | Iceberg metadata |

For an air-gapped pilot, all of the above lives on the same MinIO + Postgres footprint; no external retention service is needed.

---

## 🌐 Public → classified migration story (what the customer asks)

The customer's likely question: *"This works on public data. What changes when we plug our classified feeds in?"*

The answer (verbatim, the demo should phrase it like this):

> *"Three things change, and only three:*
> *1. New Data Connection sync(s) to the classified source. The Dataset, Pipeline, Ontology, Action, and Workshop layers we just showed do not change.*
> *2. New markings (e.g. `TS-SCI-COMPARTMENT-X`) added to the policy plane, with users granted them via Keycloak group membership. The same enforcement we just demoed applies.*
> *3. Deployment topology — typically air-gapped, with Ollama-local for the AIP copilot. We just showed that variant.*
>
> *What does NOT change: the ontology you saw, the actions, the Workshop module configuration, the Action Log, the lineage. The investment is in the model and the governance — both portable to your environment without a redesign."*

This is the **single message** the customer must take home, per [`README.md`](README.md).

---

## ✅ Concrete actions (when the PoC is executed)

1. Provision the Keycloak realm with the 4 users and the 4 markings; bind markings to Keycloak group claims so token contains them.
2. Register the 4 markings + 8 action-permission policies in `authorization-policy-service`.
3. Apply markings to raw datasets at ingest (per [`03-datasets-y-fuentes-de-datos.md`](03-datasets-y-fuentes-de-datos.md)).
4. Configure marking propagation rules in the bronze→silver→gold transforms.
5. Rehearse the marking demo (steps 1–6 above) until **all 6** pass deterministically.
6. Verify the AIP chatbot does not leak redacted values via paraphrase (this is a system-prompt + retrieval-filter joint test).
7. Verify denial paths populate the `ActionLog` with `outcome=POLICY_REJECT` and the right `policy_id`.
8. Capture screenshots of the Action Log for the backup deck.
