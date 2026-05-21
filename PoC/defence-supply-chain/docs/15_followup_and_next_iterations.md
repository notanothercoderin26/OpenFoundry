# Follow-up and Next Iterations

The PoC's job is to make the v2 / v3 decision an informed one. This file frames what each iteration would actually cost, what success and failure look like, and how to decide between continuing and stopping. Read this with [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) and the closing block of [`01_executive_summary.md`](01_executive_summary.md).

## v2 — with budget

The shape of v2 is mostly about replacing the load-bearing open sources with paid equivalents and putting proper governance around the result.

- **Paid corporate and ownership data.** ORBIS or Sayari replaces the OpenCorporates jurisdiction enrichment and supplies the ownership chains that open sources cannot reach since the CJEU 2022 ruling. A commercial sanctions feed (Refinitiv World-Check, Dow Jones Risk & Compliance, LSEG, or similar) replaces the OpenSanctions baseline for richer coverage, faster updates, and better aliasing.
- **A Data Protection Impact Assessment.** Required as soon as ownership data brings natural persons back into scope. The DPIA is not a documentation deliverable — it is a real assessment by a competent DPO with a documented legal basis for each new processing purpose.
- **Project markings aligned with the customer's classification regime.** The academic-tenancy posture is replaced with the customer's actual markings, role assignments, and access reviews.
- **A production tenancy** at the appropriate accreditation level, with security review of the AIP Agent's tool surface (which Ontology actions the agent can call, under which markings, with what auditing).
- **Entity-resolution hardening.** With paid identifiers (LEI, ORBIS / Sayari company IDs) the entity-resolution stage moves from probabilistic name matching to deterministic identifier joins for the bulk of the data, leaving probabilistic matching only for the residual tail.
- **Effort estimate.** Roughly four to six months for one engineer plus a part-time analyst, depending on how clean the paid-data integrations are and how long the DPIA and accreditation paths take in the customer's organization. The engineering is not the long pole; governance and procurement of the paid sources usually are.

## v3 — with internal data

A v3 turns the PoC into a real operational tool by connecting to the customer's internal data where it is lawful to do so.

- **Internal procurement feeds** — the customer's own contract pipeline, replacing or augmenting TED for the operator's organization.
- **Internal intelligence feeds** where appropriate and lawful — adding context that no open source can supply.
- **Security accreditation** for the tenancy at the appropriate classification level.
- **A documented legal basis** for processing each new internal source — without this, the tool is unbuildable, not merely unwise.
- v3 is not a documentation exercise. It is a programme — multiple quarters, a named accountable owner, and a real budget.

## What success looks like

Three concrete indicators, none of them subjective:

1. **Analyst time-to-answer drops from hours to minutes** for the canonical question — *is this supplier a concern, and on what grounds?* — because the join across procurement, sanctions, and jurisdiction has been done once and is queryable in one place.
2. **The alerts queue stays bounded.** Analysts keep up with new candidate matches week over week; the queue does not grow unboundedly, which would indicate either the matching threshold is too loose or the analyst capacity is too thin.
3. **Confirmed-match findings inform real decisions.** At least one downstream decision per quarter — a procurement review, an FDI screening referral, a request for further enquiry — is informed by a finding that would not have surfaced without the console. If this number stays at zero for two consecutive quarters, the tool is not earning its keep.

## What failure looks like

Failure has two shapes, and the second is worse than the first.

- **Operational failure.** False positives swamp the queue, analysts stop reviewing because the signal-to-noise ratio is poor, and the console becomes shelfware. The remediation here is technical and procedural — re-tune the matching, re-staff the review, narrow the scope.
- **Ethical failure.** The console is used outside its intended bounds — to auto-block suppliers without review, to screen individuals, to feed predictive labelling of natural persons, or to name suppliers as "high risk" externally without confirmation. This is an ethics failure first and a tool failure second. The AI Act framing in [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) is the line; crossing it is a different system requiring a different assessment.

The PoC's documentation is partly designed to make ethical failure harder to drift into accidentally — by being explicit about scope, candidate-versus-confirmed language, the human-in-the-loop step, and the AI Act positioning.

## How to decide between continuing and stopping

Three questions, in order. Any "no" stops or scopes down the next iteration. There is no third option.

1. **Do we have the budget for paid sources and the governance overhead?** ORBIS / Sayari, a commercial sanctions feed, a DPIA, an accreditation path, a production tenancy. If the answer is no, v2 is not viable and the right move is to stop at v1 documentation.
2. **Do we have the analyst capacity to operate the queue?** A console without operators is shelfware. If the customer cannot commit named analyst time to the alerts queue and the confirmation workflow, the tool will not function regardless of how well it is built.
3. **Do we have the governance to ensure the tool does not drift outside its bounds?** A named owner, an AI Act position, a review cadence, an ethics escalation path. If the answer is no, the risk of ethical failure is unmitigated and the tool should not be deployed.

A "yes" to all three is the green light for v2. Anything else is a deliberate stop or a scope reduction — both defensible outcomes for a public-data PoC.

## Final paragraph

The documentation set is the deliverable in either case. If the decision is to continue to v2, the set is the design brief for that programme. If the decision is to stop, the set explains what was tried, what worked, what did not, and why. Either way, it is a more useful artefact than a half-built tool would have been — and that is the value the PoC was designed to produce.

See [`12_demo_script.md`](12_demo_script.md) for the live framing of this decision and [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) for the constraints any v2 must respect.
