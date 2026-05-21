# Workshop App Spec — Defence Supply Chain Risk Console

The operational surface of the PoC is a single Workshop application called the **Defence Supply Chain Risk Console**. It is the screen a senior analyst sits in front of during the demo, and the only screen that command staff are expected to touch. Everything underneath it — pipelines, entity resolution, the ontology — exists to make this console honest and queryable. The console binds to the ontology defined in [`08_ontology_design.md`](08_ontology_design.md); whenever a widget references an object or link type, that reference is the contract.

## App-level navigation

On open, the user lands on a KPI-summary screen that frames the dataset's scope: how many contracts, how many suppliers, how much award value, how many sanctions matches are still pending. A persistent left-hand navigation lets the user move between the six screens described below in roughly the order an analyst would use them — start broad with KPIs, drill into the supplier explorer, branch out into the network or jurisdiction views, work the alerts queue, and finally inspect EDF consortia. A global time-window filter sits at the top of the application and propagates to every screen so that a chosen year window is honoured everywhere.

No specific button or tab labels are quoted here. Foundry's Workshop visual vocabulary is stable; the labels themselves are an implementation detail the author chooses inside Workshop.

## Screen 1 — Landing / KPIs

The landing screen is a KPI dashboard. It carries five aggregations and a single filter.

| Widget | Ontology binding | Filter inputs | Action buttons |
|---|---|---|---|
| KPI card — contracts in scope | count of `Contract` | time window | none |
| KPI card — total awarded value (EUR) | sum of `Contract.awarded_value_eur` | time window | none |
| KPI card — unique suppliers | distinct count of `Supplier` via `awarded` | time window | none |
| KPI card — sanctions matches awaiting review | count of `Supplier --candidate_match--> SanctionsTarget` with `reviewer_status = pending` | time window | none |
| Table or bar — top 5 countries by award value | sum of `Contract.awarded_value_eur` grouped by contracting-authority country | time window | none |

Each card binds to a Foundry aggregation over the ontology objects described in [`08_ontology_design.md`](08_ontology_design.md). The pending-match count is the one number the analyst is expected to drive down during the working session.

## Screen 2 — Supplier explorer

| Widget | Ontology binding | Filter inputs | Action buttons |
|---|---|---|---|
| Object Table | `Supplier` | country, sanctions-flag, CPV (via linked contracts) | none |
| Object Card | the row-selected `Supplier`, with linked `Contract`, `Project`, `SanctionsTarget`, `Jurisdiction` | inherited | open in network view |

The Object Table is the workhorse. The Object Card opens when a row is clicked and follows the link types `awarded`, `beneficiary_of`, `candidate_match`, `confirmed_match`, and `registered_in` to render the supplier's contracts, EDF participation, sanctions context, and jurisdiction info on one card.

## Screen 3 — Network view

A neighbourhood-graph view seeded by a selected `Supplier`. It renders the supplier's contracts, EDF co-beneficiaries reached by following `beneficiary_of` to a `Project` and back to other suppliers, and any sanctions matches reached by `candidate_match` or `confirmed_match`.

> ⚠️ VERIFY: Foundry's link-analysis surface is Object Explorer (pivoting) and/or Vertex (link-analysis app); a Workshop-native node-edge canvas widget is not publicly documented. The pragmatic path is either to embed a Vertex graph via the Workshop embed widget, or to deep-link from a Workshop button into Object Explorer with the selected `Supplier` as the focus. Confirm the embed path on your tenancy before relying on it.

| Widget | Ontology binding | Filter inputs | Action buttons |
|---|---|---|---|
| Embedded graph or deep-link button | seeded `Supplier` and one-hop neighbours | hop depth, link-type subset | open in alerts queue (if a candidate match is present) |

## Screen 4 — Sanctions alerts queue

The queue is the human-in-the-loop guarantee the PoC repeatedly relies on. It is bound to candidate matches and shows, per row, the supplier name, the candidate sanctions target name, the match score, the supplier's country, and the sanction program of the candidate target.

| Widget | Ontology binding | Filter inputs | Action buttons |
|---|---|---|---|
| Object Table | `Supplier --candidate_match--> SanctionsTarget` | match-score range, reviewer status, country, program | `confirm_sanctions_match`, `dismiss_false_positive` |

Both action types are defined in [`08_ontology_design.md`](08_ontology_design.md). Each confirmation or dismissal is a write-back action with an audit trail recorded against the actor and timestamp.

> ⚖️ ETHICS: Confirmation is irreversible in the sense that it produces a finding visible elsewhere in the console. The queue is the human-in-the-loop guarantee referenced in [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md); no candidate match is treated as truth until a reviewer acts on it.

## Screen 5 — Jurisdiction risk map

A choropleth rendered with Foundry's documented Workshop Map widget. It colours countries by aggregated `Contract.awarded_value_eur` and exposes a layer toggle bound to `Jurisdiction.jurisdiction_risk_tier`.

| Widget | Ontology binding | Filter inputs | Action buttons |
|---|---|---|---|
| Map (choropleth) | `Country` aggregation of `Contract.awarded_value_eur`; overlay from `Jurisdiction.jurisdiction_risk_tier` | time window, CPV subset | drill to supplier explorer with country pre-filtered |

The map is consciously not a heatmap of risk; it is a map of award value with a separate, neutral overlay for jurisdiction tier. Suppliers are not labelled "risky" on the map. The overlay is a follow-up invitation.

## Screen 6 — EDF consortium view

Project-centric. The analyst picks a `Project`, sees the consortium members linked via `beneficiary_of`, the project coordinator, the call year, the total funding, and any consortium member with a candidate or confirmed sanctions match. Matched members are highlighted visually; the wording stays neutral and does not pre-judge.

| Widget | Ontology binding | Filter inputs | Action buttons |
|---|---|---|---|
| Object selector | `Project` | call year | none |
| Object Card / table | consortium members via `beneficiary_of`; coordinator role; total funding | inherited | open member in supplier explorer |

## Demo walkthrough

The console is designed around a three-to-four step walkthrough that aligns with [`12_demo_script.md`](12_demo_script.md):

1. Open the **Landing / KPIs** screen and read off the headline numbers, including the pending-review count.
2. Use the country bar to pick a country with a high candidate-match count and navigate to the **Supplier explorer** with that country pre-filtered.
3. Open the **Sanctions alerts queue**, work one row to either `confirm_sanctions_match` or `dismiss_false_positive`, and explain the audit-trail behaviour out loud.
4. Return to the landing screen and observe the pending-review KPI decrement by one.

The point of the walkthrough is to demonstrate that signals are not findings until a person acts on them, and that the console makes that action a deliberate, two-click step rather than an invisible automation.

## What the Workshop console is NOT

It is not a decision system. It does not auto-flag suppliers as high-risk; analysts confirm or dismiss every candidate match. It does not show natural persons; the unit of analysis throughout is the legal entity. It is not a predictive tool, and it is not a substitute for classified or paid intelligence sources.

For the full scope and limits frame see [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md); for the ethics and governance frame, including the EU AI Act and GDPR positions, see [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md).
