# 10 — Security and governance

> The headline differentiator of this PoC vs. *"Excel + ArcGIS + Power BI"* is end-to-end **markings + Action Log + branch-aware policies + GDPR/LOPDGDD posture**, enforced consistently in the UI, the API, the ontology, and the AIP chatbot. This file is the policy reference and the assertion checklist.

OpenFoundry's authorization plane is the `authorization-policy-service`. Identity federation is in `identity-federation-service` (Keycloak). Audit is in `audit-compliance-service`. The customer-facing concepts are **Roles**, **Markings/Policies**, **Action permissions**, **Action Log**, and **Global Branching** with branch-review.

---

## 👥 Identity model (Keycloak realm `bcn-publicsafety`)

| User | Email | Roles | Markings granted |
|---|---|---|---|
| Cmdte. Anna Vives | `anna.vives@bcn-publicsafety.demo` | `commander` | `OPS-CORE`, `PUBLIC-OPENDATA` |
| Lt. Jordi Mas | `jordi.mas@bcn-publicsafety.demo` | `analyst` | `ANALYST-CORE`, `PUBLIC-OPENDATA` |
| Senior commander (silent in the demo, used for `close-reinforcement-zone` approval and branch merge) | `senior@bcn-publicsafety.demo` | `commander`, `senior-commander` | `OPS-CORE`, `ANALYST-CORE`, `PUBLIC-OPENDATA` |
| Read-only auditor (used for the governance KPI panel and the GDPR walk-through) | `audit@bcn-publicsafety.demo` | `auditor` | `OPS-CORE`, `ANALYST-CORE`, `PUBLIC-OPENDATA` |

Token claims: `roles`, `markings`, `branch_context` (set when the user navigates into a branch).

Anna and Jordi are deliberately given **disjoint** marking sets so the marking demo (UC-7) flips visibility on a single screen.

---

## 🏷️ Markings

A **marking** in Foundry is a policy-bearing label assigned to a dataset / row / column / object / property; access requires the user to hold the marking. OpenFoundry implements this in `authorization-policy-service` and `dataset-versioning-service`.

| Marking | Applied to | Required to read |
|---|---|---|
| `PUBLIC-OPENDATA` | All raw Open Data BCN + AEMET + INE datasets | Everyone — it is a label, not a restriction (kept so we can audit which rows are public-data-only). |
| `OPS-CORE` | `ReinforcementZone`, `LoadForecast`, `TacticalBriefing`, aggregated forecast widgets in Workshop | `commander`, `senior-commander`, `auditor`. `analyst` does not see operational decisions until the briefing is approved. |
| `ANALYST-CORE` | `Incident.approximate_address`, `Incident.typology_detail`, raw GUB columns, `TrafficAccident.report_text` | `analyst`, `senior-commander`, `auditor`. `commander` users (Anna alone) see `[redacted]` on these columns until handed an approved briefing. |
| `PII-RESIDENT` | `CensusTract` columns more granular than neighborhood-level aggregates; any field derived from sub-neighborhood block joins | **No one in this PoC holds it.** It is present in the markings registry so the demo can show the refusal path end-to-end. |

Marking semantics:
- **Row-level** when the source row carries the marking (e.g. a `CensusTract` row joined to a sub-neighborhood block).
- **Property-level** when only a column is restricted (e.g. `Incident.approximate_address`).
- Propagation: downstream datasets inherit markings from their inputs unless a transform **explicitly** strips them — and that strip is auditable.

> The marking enforcement must be **server-side**. The UI cannot just hide a value the API returned — the API must never return it in the first place to an unauthorized user. The AIP chatbot **never** receives a redacted value, so it cannot paraphrase or leak it.

---

## 🔐 Role → Action Type permissions

| Action Type | analyst | commander | senior-commander | auditor |
|---|---|---|---|---|
| `mark-reinforcement-zone` | ❌ | ✅ | ✅ | ❌ |
| `generate-daily-briefing` | ✅ (draft) | ✅ (draft + approve) | ✅ | ❌ |
| `close-reinforcement-zone` | ❌ | ✅ (initiate) | ✅ (approve) | ❌ |
| `register-zone-outcome` | ❌ | ✅ | ✅ | ❌ |
| `acknowledge-incident-alert` | ✅ | ✅ | ✅ | ❌ |
| `propose-chronic-priority` | ❌ | ✅ (branch only) | ✅ (branch + merge) | ❌ |

Branch-context constraint: `propose-chronic-priority` enforces `branch_context != "main"`; submitting on `main` returns HTTP 409 with `"requires branch context"`.

Approval routing: `close-reinforcement-zone` is initiated by `commander` and **must** be approved by a user with `senior-commander` before the side-effects fire. The intermediate state is `CLOSE-PENDING-APPROVAL`.

---

## 🛂 Marking demo — UC-7 (verbatim from the demo script)

The marking demo flips users in the same Workshop module. The customer sees:

| Step | User | Visible value |
|---|---|---|
| 1 | Anna (`OPS-CORE`) | `LoadForecast.value`, `ReinforcementZone.*`, `TacticalBriefing.*` all visible. `Incident.approximate_address` shows `[redacted]`. |
| 2 | Anna asks AIP: *"Show me the addresses behind tonight's Raval cluster."* | AIP refuses: *"this property is restricted by markings; ask an analyst with `ANALYST-CORE`."* |
| 3 | Switch to Jordi (`ANALYST-CORE` but not `OPS-CORE`) | The **same** Workshop module re-renders. `Incident.approximate_address` is now visible. `ReinforcementZone` rows show `[redacted]` — Jordi sees only the alerts and the raw incidents, not the operational decisions. |
| 4 | Jordi asks AIP: *"Which reinforcement zones are active tonight?"* | AIP refuses: *"this property is restricted by markings; ask a commander with `OPS-CORE`."* |
| 5 | Either user asks AIP: *"Give me the resident-level census breakdown for Raval — names, ages, anything you can find."* | AIP refuses on the `PII-RESIDENT` marking. **No paraphrase. No partial answer. No "approximate" surface.** |
| 6 | Audit user opens the Action Log | Steps 2, 4, 5 are all logged with the user, the tool call, and the policy decision. |

This sequence is the most important moment of the demo for a public-safety / GDPR-sensitive audience. If it fails, the PoC is not Foundry-native.

### Four marking-violation test cases (expected denial behavior)

| # | Attempt | Expected outcome |
|---|---|---|
| 1 | Jordi opens the `ReinforcementZone` object table directly via URL | API returns `403 marking-denied`; UI shows the empty state with a "restricted by markings" badge. **No row leakage in the response payload.** |
| 2 | Anna asks AIP "give me the addresses behind tonight's Raval cluster" | AIP returns the refusal sentence in step 2 above; tool-call audit row written; **no incident addresses anywhere in the chat transcript**. |
| 3 | Either user attempts a SQL-like query against `census_tract.block_*` via the read API | API returns `403 marking-denied` with `policy_id=marking:PII-RESIDENT->column:block_*`; **no values, no aggregates, no row counts** are returned. |
| 4 | A downstream transform tries to strip `PII-RESIDENT` to "release" a derived column | The transform job fails at validation; the marking-strip is auditable and requires explicit `senior-commander` approval (none granted in this demo). |

---

## 🪵 Action Log — what is captured

Every Action submission produces an `ActionLog` ontology object:

```json
{
  "log_id": "ALOG-2026-05-21-...",
  "action_type_id": "mark-reinforcement-zone",
  "actor_user_id": "anna.vives@bcn-publicsafety.demo",
  "submitted_at_utc": "2026-05-21T19:42:17Z",
  "target_object_type": "Neighborhood",
  "target_object_id": "NBHD-RAV",
  "parameters": {
    "neighborhood_ids": ["NBHD-RAV"],
    "motive": "Weekend nightlife + rain forecast",
    "start_at": "2026-05-21T22:00:00+02:00",
    "end_at": "2026-05-22T02:00:00+02:00",
    "shift": "NOCHE"
  },
  "outcome": "SUCCESS",
  "produced_edits": [
    { "object_type": "ReinforcementZone", "object_id": "RZ-2026-05-21-NBHD-RAV", "op": "create" },
    { "link_type": "REINFORCES", "from": "RZ-2026-05-21-NBHD-RAV", "to": "NBHD-RAV", "op": "create" }
  ],
  "policy_decisions": [
    { "policy_id": "role:commander->mark-reinforcement-zone", "decision": "ALLOW" },
    { "policy_id": "marking:OPS-CORE->object:ReinforcementZone", "decision": "ALLOW" }
  ],
  "side_effects": [
    { "kind": "in-app", "to": "jordi.mas@bcn-publicsafety.demo", "status": "DELIVERED" },
    { "kind": "webhook", "url": "https://mattermost.bcn-publicsafety.demo/hooks/...", "status": "DELIVERED" }
  ]
}
```

`policy_decisions` makes governance auditable end-to-end — a denied call (e.g. Jordi attempting `mark-reinforcement-zone`) still produces an `ActionLog` row with `outcome=POLICY_REJECT` and the policy id that fired.

---

## 🇪🇺 GDPR / LOPDGDD posture

Public-safety data in Spain is governed by the GDPR + LOPDGDD (Ley Orgánica 3/2018) and, for actual law-enforcement processing, the LO 7/2021 transposition of the Police Directive (EU 2016/680). This PoC is built to be honest about which slice of that framework it operates under:

| Principle | How this PoC honors it |
|---|---|
| Lawful basis | All data is Open Data BCN + AEMET + INE under their respective licenses (public-interest task already discharged by the publisher). Synthetic AVL/CAD is generated locally with `seed=42` — not real personal data. |
| Data minimization | The forecast is **spatio-temporal at Neighborhood × Shift grain only**. No individual scoring. No demographic ranking. No sub-neighborhood granularity. |
| Coarsening | Census-derived fields are aggregated to neighborhood level before the join; the `PII-RESIDENT` marking gates anything finer. |
| Purpose limitation | Workshop and the AIP serve only the briefing + reinforcement workflow. No re-purposing — every query is audited. |
| Retention | `ActionLog` is indefinite (it is the audit surface); raw public data follows the publisher's terms; tool-call audit is 90 d. |
| Data-subject rights | **Out of scope for this PoC** — there is no real personal data to be a subject of. Handled at the "your real data" boundary in a follow-on pilot, not here. |
| Automated decision-making (Art. 22) | The forecast does not make individual decisions. The human (Anna) is always in the loop before any operational write. |

If a customer asks "could you ingest our real CAD/AVL feed?", the answer is in the migration story below — and the formal data-protection authorization (DPIA) is a contractual prerequisite, not a PoC deliverable.

---

## 🌐 Public → operational-data migration story (what the customer asks)

The customer's likely question: *"This works on public data. What changes when we plug our internal CAD/AVL feed in?"*

The answer (verbatim, the demo should phrase it like this):

> *"Three things change, and only three:*
> *1. New Data Connection sync(s) to the operational source (your CAD, your AVL, your dispatch records). The Dataset, Pipeline, Ontology, Action, and Workshop layers we just showed do not change — Incident, Neighborhood, Shift, ReinforcementZone, TacticalBriefing already accept that shape.*
> *2. New markings (e.g. `INTERNAL-CAD`, `OFFICER-PII`) added to the policy plane, with users granted them via Keycloak group membership. The same enforcement we just demoed applies — including the AIP refusal path.*
> *3. Deployment topology — typically air-gapped on your premises, with Ollama-local for the AIP copilot. We just showed that variant.*
>
> *What does NOT change: the ontology you saw, the actions, the Workshop module configuration, the Action Log, the lineage. The investment is in the model and the governance — both portable to your environment without a redesign. The legal step in between — a DPIA under LOPDGDD + LO 7/2021 — is a contracted deliverable, not a PoC step."*

This is the **single message** the customer must take home, per [`README.md`](README.md).

---

## ✅ Concrete actions (when the PoC is executed)

1. Provision the Keycloak realm with the 4 users and the 4 markings; bind markings to Keycloak group claims so the token contains them.
2. Register the 4 markings + 6 action-permission policies in `authorization-policy-service`.
3. Apply markings to raw datasets at ingest (per [`03-datasets-y-fuentes-de-datos.md`](03-datasets-y-fuentes-de-datos.md)).
4. Configure marking propagation rules in the bronze → silver → gold transforms.
5. Rehearse the marking demo (steps 1–6 of UC-7) until **all 6** pass deterministically.
6. Run the 4 marking-violation test cases above explicitly — none must leak a value via paraphrase, partial answer, or row count.
7. Verify denial paths populate the `ActionLog` with `outcome=POLICY_REJECT` and the right `policy_id`.
8. Capture screenshots of the Action Log + the GDPR posture page for the backup deck.
