# Quiver Analyses

Quiver is the PoC's **exploratory** analysis surface. It sits beside the Workshop console (see [`09_workshop_app_spec.md`](09_workshop_app_spec.md)) and the AIP Agent (see [`10_aip_agent_spec.md`](10_aip_agent_spec.md)) and is where the technical author rapidly cross-tabulates, groups, and charts ontology-backed data without committing to a permanent pipeline output. Three analyses are prepared in advance so that, on demo day, the author can switch from console-driven storytelling to ad-hoc questioning without flailing.

Each analysis below lists the ontology inputs, the Quiver-internal transformations described in verbs (group, pivot, window, chart) rather than code, the chart type produced, and the reading the analyst is expected to take away. The ontology object and link names match [`08_ontology_design.md`](08_ontology_design.md).

## Analysis 1 — Concentration analysis (HHI of suppliers per CPV across years)

**Inputs.** `Supplier` joined to `Contract` through the `awarded` link. Each row carries `Contract.cpv_code`, `Contract.award_year` (derived from `Contract.award_date`), `Contract.awarded_value_eur`, and the supplier identifier.

**Transformations in Quiver.**

- Group by (`cpv_code`, `award_year`, `supplier_id`); sum `awarded_value_eur` to a per-supplier annual award total per CPV.
- Window over (`cpv_code`, `award_year`); compute each supplier's share of the CPV-year total.
- Square the share, sum within (`cpv_code`, `award_year`) to produce the Herfindahl-Hirschman Index for that CPV-year cell.
- Pivot to a long table of (`cpv_code`, `award_year`, `hhi`).
- Chart: a small-multiples line chart, one panel per defence-relevant CPV code in [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md), x = year, y = HHI.

**What the analyst is meant to see.** Whether a CPV's supplier base is consolidating (HHI rises over time) or dispersing (HHI falls), and which CPVs are structurally concentrated regardless of trend. A high-and-flat HHI in, for example, `35411000` (battle tanks) tells a different story from a falling HHI in `50660000` (military-electronics maintenance).

**Limits the chart must surface.** HHI is brittle on small panels. A CPV-year cell with only two or three suppliers will produce a high HHI for arithmetic reasons rather than because the market is genuinely concentrated. The recommended mitigation is to pool years where N is small, and to print N alongside HHI on each panel so the reader can discount cells that are arithmetically forced. The chart caption must say so explicitly.

## Analysis 2 — Cross-border supplier network (awarding country x supplier country)

**Inputs.** `Contract` for the contracting-authority country (the country of the issuing contracting authority), and `Supplier` for the supplier country derived via `registered_in --> Jurisdiction.country_iso2`. The `awarded` link connects the two.

**Transformations in Quiver.**

- Group by (`contracting_authority_country`, `supplier_country`); sum `awarded_value_eur` and count contracts.
- Pivot to a square matrix indexed by country code on both axes.
- Chart: a chord diagram, with countries on the circumference and arcs sized by total award value flowing from awarding country to supplier country.

> ⚠️ VERIFY: confirm Quiver chord-diagram availability; fall back to a heatmap if not. The heatmap is the safe choice — it carries the same information (a 2D cross-tabulation) and is unambiguously available in Quiver's chart catalogue.

**What the analyst is meant to see.** The **diagonal** is domestic awards: a Member State buying from a supplier registered in the same Member State. **Off-diagonal** cells are cross-border flows within the EU and from the EU to third countries. Concentrated off-diagonal arcs (or hot cells, in the heatmap fallback) are the signal worth investigating, in conjunction with the jurisdiction risk overlay in [`09_workshop_app_spec.md`](09_workshop_app_spec.md).

**Limits.** OpenCorporates coverage is uneven (per [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md)); supplier-country attribution is missing or stale for a fraction of suppliers. Missing supplier countries are bucketed as an explicit "unknown" cell on both axes rather than silently dropped, so the reader can see how much of the picture is unattributed.

## Analysis 3 — Sanctions match temporal pattern

**Inputs.** Confirmed `confirmed_match` links from `Supplier` to `SanctionsTarget`; `SanctionsTarget.designation_date`; the earliest `Contract.award_date` for the linked supplier, via the `awarded` link.

**Transformations in Quiver.**

- Group by (`supplier_id`); take the minimum `award_date` as `first_award_date`.
- Join to the confirmed `SanctionsTarget` and its `designation_date`.
- Compute `delta_days = first_award_date - designation_date`.
- Chart: a histogram of `delta_days`, binned monthly, centred on zero. Negative values are pre-designation awards; positive values are post-designation awards.

**What the analyst is meant to see.** The shape of the distribution and the count on either side of zero. A right-leaning shape (most awards post-designation) raises a different question from a left-leaning shape (most awards pre-designation). Neither shape is, on its own, evidence of anything.

> ⚖️ ETHICS: Do not draw causal conclusions from this chart. A pre-designation award is **not** evidence of wrongdoing. Sanctions are listed continuously, and very many awards predate any conceivable issue with the supplier — the listing event happened later for reasons that have nothing to do with the contract. The chart describes a temporal pattern in the open data, not a moral or legal pattern in the suppliers. Any narrative built on this chart must repeat that caveat out loud. See [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) for the governing frame.

**Limits.** The number of confirmed matches in a four-week PoC is small by construction (entity resolution is the bottleneck — see [`07_entity_resolution.md`](07_entity_resolution.md)). The histogram is illustrative, not statistical. Confidence intervals are not drawn. The chart caption must say so.

## What Quiver is for, and what it is not

Quiver is for **exploratory** analysis to inform the next pipeline, Workshop, or agent iteration. It is the right place to test a hypothesis quickly, to find the shape of a distribution, and to decide whether a question is worth promoting to a permanent dataset. It is **not** the right place to publish a production report or to brief command staff.

Findings produced in Quiver that survive sanity-checking must be promoted before they are shown beyond the technical author: either materialised as a Foundry dataset and bound to a new Workshop widget (see [`09_workshop_app_spec.md`](09_workshop_app_spec.md)), or written up in the demo script (see [`12_demo_script.md`](12_demo_script.md)) with an explicit dataset-version reference. Charts shown live during the demo must come from the Workshop console; Quiver stays in the analyst's hands.

For the broader ethical and governance frame around any analysis produced here see [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md); for the scope of what data underlies these analyses see [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md).
