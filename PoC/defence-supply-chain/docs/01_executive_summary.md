# Executive Summary

> Intended reader: operational command staff. Reading time: five minutes. Skip the rest of this documentation set unless you decide to fund the next iteration.

## Problem framing

Defence procurement in the European Union is reported through a single public channel — Tenders Electronic Daily (TED) — and a smaller set of R&D-funding records published by the European Defence Fund (EDF). Both are open. Neither is structured for operational analysis. A senior officer who wants to ask *"which non-EU-headquartered suppliers are winning maintenance contracts on military vehicles, and do any of them appear on a sanctions list?"* today has no single screen to ask it on. The data exists in fragments — TED notices in XML, EDF factsheets in PDF, sanctions in a dozen consolidated lists — and joining them is a manual, error-prone exercise repeated every time the question is asked.

The EU Foreign Direct Investment Screening Regulation (EU 2019/452) raised that question to a policy obligation: Member States must assess foreign-investment risk in defence and dual-use sectors. The same question — *who is actually in this supply chain and what is their risk profile* — sits behind it.

## Approach

This Proof of Concept builds, inside Palantir Foundry, a single operational console that joins four open sources into one queryable model:

1. **TED** contract-award notices filtered to defence-relevant CPV codes (weapons, military vehicles, naval and air maintenance, military electronics).
2. **EDF** consortium membership for the 2021–2024 funding rounds.
3. **OpenSanctions** consolidated targets — sanctioned entities aggregated from ~85 government and international lists.
4. **OpenCorporates** for legal-entity jurisdiction lookups.

The model is loaded into the Foundry Ontology as `Supplier`, `Contract`, `Project`, `SanctionsTarget`, and `Jurisdiction` objects. An operational app (Workshop) and a natural-language assistant (AIP Agent) sit on top of it. See [`03_architecture_overview.md`](03_architecture_overview.md) for the layer cake and [`08_ontology_design.md`](08_ontology_design.md) for the object model.

## What this PoC demonstrates

- A **searchable supplier register** for defence procurement across the EU, narrowed by CPV, country, contracting authority, and time window.
- A **candidate sanctions-match queue** in which a human reviewer confirms or dismisses each candidate match between a supplier name and a sanctions-list target — never an automated flag. See [`07_entity_resolution.md`](07_entity_resolution.md) for the matching method and its honest false-positive / false-negative behaviour.
- An **EDF consortium view** that reveals which entities co-participate in EU-funded defence R&D, surfacing concentration patterns the contract-award stream alone cannot.
- A **jurisdiction-risk overlay** that highlights suppliers registered in opaque or non-EU jurisdictions, without inferring guilt — only inviting follow-up.
- A **natural-language analyst assistant** (AIP Agent) that answers bounded questions over the ontology and is constrained to refuse questions outside its scope.

## What this PoC does NOT demonstrate

- **It does not perform real Ultimate Beneficial Owner (UBO) discovery.** The CJEU November 2022 ruling restricted public UBO access across the EU. Reliable UBO chains require paid sources (ORBIS, Sayari) or accredited access to national registers.
- **It is not a predictive tool.** It surfaces signals; it does not classify suppliers as "high risk" automatically.
- **It does not identify individuals.** The unit of analysis is the legal entity. Natural-person data is out of scope.
- **It does not substitute classified or intelligence-grade sources.** Open-source data has reporting biases, jurisdiction gaps, and language gaps that this document is explicit about. See [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md).
- **It does not claim production-grade accuracy.** Entity resolution on free-text supplier names produces false positives and false negatives by construction. Every candidate match requires human confirmation before it leaves the queue.

## Indicative findings (placeholder — to be filled after execution)

> ⚠️ TODO: After executing the PoC, populate this block with five honest, sourced findings. Suggested shape:
>
> - *N* unique suppliers identified across defence CPVs in the time window *[start–end]*, awarded a combined *€X*.
> - *M* candidate sanctions matches surfaced; of those, *K* confirmed by reviewer, *J* dismissed, *L* still pending.
> - *P* % of contract value awarded to suppliers registered outside the EU/EEA, ranked by jurisdiction.
> - The largest EDF consortium contains *Q* distinct entities across *R* Member States.
> - The dominant supplier within CPV *35400000* (military vehicles) holds *Z* % share by award value in *year Y*.
>
> Each finding must cite the ontology query and dataset version that produced it.

## Defined terms (the only jargon used above)

- **TED** — Tenders Electronic Daily, the EU's official tender publication channel.
- **CPV** — Common Procurement Vocabulary, the EU's classification of procurement subject matter. Defence sits primarily under code family 35*.
- **EDF** — European Defence Fund, the EU's R&D-funding programme for defence capabilities; publishes annual project results.
- **Sanctions target** — a legal entity (or person — out of scope here) appearing on a sanctions list maintained by a government or international body.
- **Ontology** — in Foundry, the formal model of the objects (e.g. `Supplier`) and the links between them, against which apps and AI agents query.
- **Entity resolution** — the process of deciding when two records that look slightly different refer to the same real-world entity.

## The decision being asked

The audience is invited to decide, at the end of the demo, one of the following:

- **Fund a v2** with paid sources (ORBIS or Sayari for real ownership data; commercial sanctions feeds for richer coverage) and proper governance (DPIA, project markings, role-based access in Foundry), so that the supply-chain console moves from open-data PoC to operational tool with internal feeds where lawful.
- **Stop here** and treat the PoC as a teaching artefact: the documentation set explains what is feasible with open data, what is not, what entity resolution actually costs, and what a follow-up would require.

Either decision is defensible. The PoC's job is to make the choice an informed one rather than a hopeful one.

> See [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md) for the explicit v2 / v3 scope.
