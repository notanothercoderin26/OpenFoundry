# Follow-up and Next Iterations

What v2 and v3 look like, what success and failure look like, how to decide between continuing and stopping, and the explicit conditions under which the author would **not** continue the project. The deliverable is the documentation set in either case.

## v2 — operator data on the same substrate

v2 wires operator-issued event streams onto the event-centric substrate built in v1. The candidate sources, each conditional on a lawful basis and a signed access agreement:

- **REE / ESIOS** — Spanish electricity grid operator events (generation curtailments, demand-response activations, frequency excursions, large outages).
- **ENAGAS** — Spanish gas TSO events (flow changes, compressor-station outages, balancing actions).
- **AENA** — airport operational events (runway closures, capacity reductions, NOTAM-equivalent advisories).
- **Port-authority feeds** where lawful (port closures, traffic restrictions, hazardous-cargo advisories).
- **Protección Civil internal feeds** where authorised (declared activation levels, inter-administrative coordination notices).

Each enters the existing event substrate as an **operator-reported event** — a row with `event_id`, `event_type`, `occurred_at_utc`, location, normalized severity, source, and the operator's full payload in `payload_json`. The ontology is extended with new concrete implementations of the `Event` interface (e.g. `GridOperatorEvent`, `GasOperatorEvent`, `AirportOperatorEvent`), not with new asset-inventory object types.

> 🎯 FRAMING: v2 preserves the discipline. Operator-reported events join the substrate as events. Operator-owned **assets** do not enter the ontology, and no v2 deliverable enumerates named infrastructure under any framing. The Workshop's spatial context remains generic (NUTS-3, INE municipality codes, coastline, population centres). The AIP Agent's tool allow-list remains gated against per-identifier queries on individual vessels, aircraft, or any newly arriving operator-identifiable entity.

**Effort estimate:** approximately 3–4 months for one engineer at full capacity, plus a part-time analyst familiar with each operator's data dictionary, plus legal-and-DPIA support spanning the engagement. The single largest line item is not engineering — it is the legal basis and the DPIA for each new stream, and the inter-administrative agreements that authorize the feeds. Plan for the legal track to gate the engineering.

## v3 — paid historical archives and predictive modules behind explicit ethical gates

v3 extends v2 with retrospective depth and a narrowly scoped predictive layer:

- **Commercial historical AIS** (MarineTraffic, Spire, Kpler) for retrospective maritime analysis with confident coverage.
- **Commercial historical ADS-B** for retrospective aeronautical analysis.
- **Satellite AIS** for dark-vessel areas where terrestrial AIS coverage is thin.
- **Predictive modules — only if a separate ethics review approves them.** Predictive outputs live in their own clearly-labelled section of the Workshop, never blend into the resilience COP, and never feed the AIP Agent's primary answer path. Each predictive module ships with its own model card, its own bias-and-limits review, and its own auto-expiry if not re-validated on schedule.

> ⚖️ ETHICS: A predictive layer is the highest-risk addition imaginable to this substrate. The default decision is *do not add it*. The only path to adding it is a documented ethics review by reviewers who are not the engineers building the module, with an explicit charter that includes the option of *no, this should not be built*. A predictive module that labels regions, assets, or actors as high-risk is incompatible with the framing discipline of [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) and must not ship under this lineage of work.

## What success looks like

Three indicators of operational success, none of them a prediction claim:

1. **Time-to-orient drops.** A coordinator who previously spent minutes tab-switching across five sources at the start of an incident shift orients in seconds on the COP's Landing screen. Measurable through observed shift handovers and analyst self-report.
2. **The anomaly queue stays bounded.** Analysts keep up with the queue without falling behind. If the queue grows faster than analysts process it, the rules are too loose; the design choice in [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) is conservative rules with bias toward dismissal.
3. **At least one decision per quarter is informed by a cross-domain pattern the COP surfaced** that would not have surfaced otherwise. *Informed*, not *driven by*. A coordinator who says *"the COP showed me three signals together and I changed how I briefed upward"* is the success criterion.

None of these is a prediction claim. The COP is a descriptive substrate.

## What failure looks like

- **False alarms swamp the queue and analysts stop reviewing it.** The console becomes shelfware. Mitigation: tighten rules, narrow windows, dismiss the queue back to a manageable size — or shut the queue down entirely if it cannot be brought back into balance.
- **The console becomes shelfware for the simpler reason that no coordinator owns it on a real shift.** A COP without an operational owner is a museum piece. The v2 plan is explicit that an operational handover is a prerequisite, not a follow-on.
- **The console is used outside its intended bounds** — asset enumeration, individual identification, predictive labelling. This is an **ethics failure first** and a tool failure second. The framing discipline of [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md), the absent `CriticalInfrastructure` object type in [`08_ontology_design.md`](08_ontology_design.md), the AIP Agent refusals in [`10_aip_agent_spec.md`](10_aip_agent_spec.md), and the per-MMSI refusal demo in [`12_demo_script.md`](12_demo_script.md) all exist precisely to prevent this drift. If it happens despite those defences, the project owes a candid post-mortem and a structural correction, not a patch.

## How to decide between continuing and stopping

Three questions, answered honestly:

1. **Is there a real operational owner ready to take the COP on a real shift?** A crisis-management team, a Protección Civil coordinator, an inter-administrative cell — someone whose actual job will be made easier by the COP and who will use it on Monday morning. If no, stop.
2. **Is there budget for operator data AND for the legal-and-DPIA work that comes with it?** v2 is not engineering-bounded; it is legal-and-DPIA-bounded. If the budget covers engineering but not legal, stop or scope down to a more modest v2 scoped to a single operator.
3. **Is there governance to ensure the tool does not drift outside its bounds?** A standing review of changes to the ontology, the Workshop screens, and the AIP Agent's allow-list against the framing discipline. If no, the framing decays under operational pressure and the tool drifts. Stop.

If any answer is *no*, stop or scope down. *Maybe* is *no*.

## What would make the author NOT continue this project

A dedicated subsection because the question matters more than the answers.

- **Cost overrun beyond the v2 budget envelope without a clear payoff.** A v2 that runs 50% over budget without a coordinator demonstrably using the COP on a real shift is a project that has lost its operational anchor. Stop.
- **Framing drift.** Pressure to add a named-asset overlay *"just for the demo"*, an individual identifier *"just to validate the model"*, or a predictive scoring layer *"just as an experiment"*. Each of these would, on entry, change what this PoC is. The lineage of this work does not survive any of them. Stop.
- **Ethical concerns surfacing during the DPIA that cannot be mitigated.** A DPIA that surfaces an unmitigable risk — a lawful basis that does not hold, a data-subject-rights workflow that cannot be honoured, a re-identification risk that cannot be capped — ends the project. The DPIA is a stop-condition, not a checkbox.
- **Loss of the operational owner.** A coordinator who was going to take the COP on a real shift moves on or withdraws. Without a replacement, the COP has no operational meaning. Stop.

## Final paragraph

The documentation set is the deliverable in either case. If the decision is to continue, the set is the technical and ethical foundation v2 builds on. If the decision is to stop, the set explains what was tried, what worked, what didn't, and why the framing discipline matters — useful to the next team that thinks about a Common Operational Picture for crisis management and resilience analysis, in whatever lineage of work they are working in. Stopping is not failure; building something that drifts outside its bounds is.

## Cross-links

- [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) — the discipline v2 and v3 preserve.
- [`08_ontology_design.md`](08_ontology_design.md) — the `Event` interface that v2 extends.
- [`10_aip_agent_spec.md`](10_aip_agent_spec.md) — the refusal posture v2 inherits unchanged.
- [`12_demo_script.md`](12_demo_script.md) — the decision being asked at the end of the v1 demo.
- [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) — the credibility anchor every iteration inherits.
