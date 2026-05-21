# Risks, Ethics, Governance

This document is the credibility anchor of the deliverable. The PoC is defensible only to the extent that its risks are named, its biases catalogued, and its governance posture explicit. Read this before defending the PoC in front of skeptical command staff, skeptical technical staff, or skeptical ethicists. Cross-link it from [`12_demo_script.md`](12_demo_script.md) so the presenter has it open during the demo.

## Framing risk (revisited and reinforced)

The single largest risk in this PoC is **framing drift**. A naïve common-operational-picture exercise slides downhill toward asset enumeration: *"we have a map; let us put the things on it; let us colour them by exposure."* Each step is small and plausible. The end state — a labelled inventory of named infrastructure with severity colouring — is a target catalogue with a resilience preamble, and the preamble is not the same thing as the artefact.

Quoting [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md):

> This PoC fuses public open-data event streams (seismic, meteorological, maritime, aeronautical, cyber) into a single time-and-space substrate for crisis-management situational awareness. The unit of analysis is the event. The ontology has no `CriticalInfrastructure` object. Where spatial context is needed, the PoC uses generic admin boundaries, coastline, and population centres — not an inventory of named operator-owned assets. The Workshop console is designed for a coordinator who needs to orient quickly during an incident, not for an analyst building a target file. The AIP Agent is gated to refuse questions that would shift the unit of analysis from events to assets or to individuals. This discipline is not cosmetic. It is the difference between a resilience COP and a target catalogue, and it is the difference between an academic exercise that is defensible and one that is not.

> 🎯 FRAMING: Drift does not announce itself. It arrives as "just one more layer", "just this one named site", "just the ports". The structural defences are: the ontology has no asset object type ([`08_ontology_design.md`](08_ontology_design.md)); the Workshop has no named-asset overlay ([`09_workshop_app_spec.md`](09_workshop_app_spec.md)); the AIP Agent's tool allow-list refuses per-identifier queries ([`10_aip_agent_spec.md`](10_aip_agent_spec.md)). All three must stay aligned. A change to any one of them without aligning the other two is a regression of the framing discipline and must be rejected at review.

## Sources of bias

Each stream the PoC fuses carries its own bias profile. The Workshop must not present any of these as ground truth; the substrate is *what was published*, not *what is*.

- **AIS opt-outs.** Warships and sensitive vessels routinely operate with AIS transponders off. Some commercial vessels do the same in known piracy waters or for commercial confidentiality reasons. AIS-silent regions are an artefact of choice, not necessarily of absence. The Workshop must not present absence-of-signal as evidence of anything; see the explicit disclaimer plan in [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md).
- **ADS-B opt-outs and coverage gaps.** Some aircraft are filtered upstream by OpenSky (military, certain government flights, PIA-flagged registrations). Coverage is uneven across receivers — well-covered urban airspace, sparser oceanic airspace. Mode-S-only aircraft transmit no position. A "quiet" patch in the ADS-B layer can be opt-out, receiver geometry, or absence; the substrate cannot tell which.
- **Macroseismic intensity reporting bias.** EMS-98 max-intensity values published by IGN draw partly on public felt-reports submitted through the IGN portal. They are dense in populated areas and sparse in low-population areas. A higher EMS-98 in one place than another reflects the joint event-and-reporting profile, not pure ground motion.
- **CVE vendor-product mapping noise.** CPE matches in NVD are noisy. Multiple CPEs per CVE, multiple versions per CPE, vendor naming drift. "Vendor X is affected" can over-state or under-state the actual operational exposure. The Workshop's cyber domain pivot exists to surface volume and severity, not to make confident vendor-impact claims.
- **AEMET warning coverage.** AEMET issues warnings for Spanish territory. The PoC's nation-wide bbox extends to nearby waters and airspace but AEMET warnings stop at the border. A maritime area west of Galicia or south of Cabo de Gata may be under a hazardous weather system that AEMET does not publish a warning for, because the system is over international waters and another national met service has jurisdiction.
- **Time alignment as artefact.** The five streams publish on different cadences and with different latencies — seismic events within ~1 hour of occurrence, AEMET warnings every 15–30 minutes, NVD daily, OpenSky every 5–10 seconds throttled by rate limit, AISStream live. What looks like a temporal correlation on the Workshop timeline can be an artefact of publication delay. The substrate's `occurred_at_utc` and `payload_json` retain the source's authoritative timestamps so an analyst can audit any apparent coincidence — see [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md).

## False-alarm cost

Incorrectly correlating cross-domain signals can mislead crisis response. A coordinator who treats a coincidence between a CVE publication and an AIS density spike as causally linked will mis-allocate attention, mis-brief upward, and mis-task downward. The PoC's mitigation is the **human-in-the-loop confirmation step on the anomaly queue** — see [`09_workshop_app_spec.md`](09_workshop_app_spec.md) screen 4 and the `acknowledge_event` / `dismiss_false_positive` Action Types in [`08_ontology_design.md`](08_ontology_design.md). An anomaly surfaced by a rule is a *candidate*. It is not an incident until a human says so, and the human's confirm-or-dismiss decision is itself an Action Type write-back with audit. Conservative rules, narrow time windows, and bias toward dismissal are explicit design choices; missed signals are recoverable, false confirmations less so.

## EU AI Act positioning

This PoC is a **decision-support tool**, not automated decision-making. The EU AI Act distinguishes risk tiers; decision-support over public administrative data with a documented human-in-the-loop step on every consequential action does not fall into the prohibited or high-risk categories *as built*. The PoC does not auto-dispatch resources, does not auto-classify regions, does not auto-issue warnings, does not auto-score individuals, and does not auto-attribute. Each of those would change the AI Act analysis.

A production deployment that crossed any of those lines would be a different system requiring its own assessment. The same applies to a deployment that used the substrate to influence access to essential services, to law enforcement decisions, or to migration/border decisions — those use cases would fall under high-risk articles of the Act regardless of the human-in-the-loop posture, and the framing discipline of [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) is incompatible with them.

> ⚖️ ETHICS: The honest answer to *"is this AI-Act-compliant?"* is *"as built, this PoC is in decision-support territory; a v2 must re-run the assessment against the actual deployed scope, the actual operator data sources, and the actual user population. Compliance is not inherited from v1."* See [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md).

## GDPR / LOPDGDD

Open data is not exempt from GDPR. The Spanish LOPDGDD (Ley Orgánica 3/2018) adds national-level obligations, including a strong stance on automated profiling. Two streams in v1 carry data that can be tied to natural persons in some cases:

- **AIS MMSIs.** Small-craft owners are often natural persons. An MMSI is not pseudonymous; ownership registries make re-identification trivial in many jurisdictions.
- **Aircraft tail numbers / icao24.** Private aviation tail numbers commonly resolve to natural persons through public registries.

The PoC mitigates by **filtering individual identifiers out at the normalization step** — see [`06_pipeline_design.md`](06_pipeline_design.md) stages 4 (CleanedAndNormalized) and 5 (UnifiedEventSubstrate). MMSI and icao24 never enter the Foundry Ontology, never appear in the Workshop, never appear in any AIP Agent response. The unit shown is observation counts per spatial bucket per time window. A future iteration that re-introduces the identifiers requires a Data Protection Impact Assessment under Spanish LOPDGDD with a defined lawful basis per source, an articulated purpose limitation, a retention policy, a data-subject-rights workflow, and explicit role-based access. None of that is in v1, by design.

## Foundry-side governance

Foundry provides governance primitives the PoC relies on: project markings on datasets and ontology objects, role-based access through groups, the Action Log for every Action Type submission (`acknowledge_event`, `dismiss_false_positive`, `attach_briefing_note`), and branch-based development for changes to pipelines and ontology. The substrate inherits markings from the raw datasets through the pipeline and into the Ontology.

> ⚠️ VERIFY: Confirm on the demo tenancy how markings propagate from raw datasets through Pipeline Builder transforms into the Ontology, how Workshop respects ontology markings on a per-widget basis, and how the AIP Agent's tool gating respects markings on the bound functions and ontology queries it can call. The defaults are sensible but the exact propagation behaviour is tenancy-configurable.

## Vendor lock and cost — the honest paragraph

Foundry is not free. A production deployment of compute + Ontology + Workshop + AIP Agent licences carries non-trivial annual cost, and the cost scales with active users, dataset volume, and AIP usage. The honest comparison:

- **Open-source comparator.** PostGIS + Kafka + Grafana, or PostGIS + Apache NiFi + Apache Superset, covers ingestion + storage + dashboards. Materially more glue work, no integrated event-centric ontology layer, no audit + lineage guarantees of the Foundry Ontology, no integrated bounded-LLM layer over a governed model. Cheaper in licence, expensive in engineering and operations.
- **Commercial cloud-warehouse comparator.** Databricks + a dashboard tool (Power BI, Tableau, Superset) covers the data-warehouse layer well. It does not natively provide the event-centric Ontology + Workshop + Agent stack the PoC relies on. Building those layers on top of a cloud warehouse is feasible and a non-trivial engineering programme in its own right.

Foundry might still be the right choice **for this class of problem** — event-centric ontology + integrated app layer + bounded LLM over a governed ontology + audit log on consequential actions. The decision must be informed by the actual cost on the actual tenancy and the actual user count, not by enthusiasm for the substrate. The PoC's job is to make the choice an informed one.

## What v2 would require to be production-grade

The transition from v1 to a production COP requires materially more than wiring new streams in. Concretely:

- **Operator data on the same substrate** — REE / ESIOS, ENAGAS, AENA, port-authority feeds where lawful, Protección Civil internal feeds where authorised.
- **Commercial historical AIS** (MarineTraffic, Spire, Kpler) and **commercial historical ADS-B** for retrospective analysis with confident coverage; **satellite AIS** for dark-vessel areas.
- **A Data Protection Impact Assessment** under LOPDGDD, with a defined lawful basis per source, purpose limitation, retention policy, and data-subject-rights workflow.
- **Project markings and role-based access** aligned with the customer's classification regime.
- **Security accreditation** for the tenancy if any operator stream is sensitive.
- **An explicit operational handover** to a crisis-management team that will own the COP on a real shift; without that handover the COP is shelfware regardless of how well it is built.

The v2 scope, effort, and stop-conditions are laid out in [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md).

> 🎯 FRAMING: Operator data enters the **same** event-centric substrate as operator-reported events — a generation outage, a flow change, a runway closure, an authority-issued advisory. Not asset-inventory rows, not target lists. The framing discipline survives the v2 upgrade; it is the load-bearing element of the v2 plan as much as of v1.

## Cross-links

- [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) — the framing this document defends.
- [`06_pipeline_design.md`](06_pipeline_design.md) — where individual identifiers are filtered out.
- [`08_ontology_design.md`](08_ontology_design.md) — the absence of `CriticalInfrastructure`, the `acknowledge_event` / `dismiss_false_positive` actions.
- [`09_workshop_app_spec.md`](09_workshop_app_spec.md) — the anomaly-queue human-in-the-loop step.
- [`10_aip_agent_spec.md`](10_aip_agent_spec.md) — the refusal behaviour.
- [`12_demo_script.md`](12_demo_script.md) — the on-stage discipline this document underwrites.
- [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md) — v2 / v3 scope and stop-conditions.
