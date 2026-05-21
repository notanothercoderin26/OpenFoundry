# Risks, Ethics, Governance

This is the credibility anchor of the documentation set. Every other file describes what the PoC builds; this file describes what could go wrong, what bias is baked in by construction, what the legal frame demands, and what a production deployment would have to add. Read it before defending the PoC. Read it again before deciding to fund v2.

## Sources of bias

The PoC inherits the bias of every source it joins. Naming each one explicitly is part of the work.

- **Reporting bias in sanctions lists.** Sanctions lists are political instruments. They reflect the listing authority's foreign-policy priorities, not a neutral catalogue of bad actors. OFAC, the EU consolidated list, the UK OFSI list, and the UN consolidated list overlap in places and diverge in others. Some jurisdictions are systematically under-listed because they are not in the listing authority's focus. An absence of sanctions matches is not evidence of clean.
- **Language bias in name matching.** Latin-script names match more reliably than transliterated Cyrillic, Arabic, or Chinese names. Diacritics, legal-form suffixes, and historical name changes are an additional layer. The entity-resolution stage ([`07_entity_resolution.md`](07_entity_resolution.md)) documents the normalization done; suppliers from smaller-language jurisdictions remain under-detected by construction. The Workshop must not invite the reader to interpret "no match" as "clean".
- **Geographic bias in OpenCorporates coverage.** OpenCorporates aggregates national corporate registers with uneven depth and freshness. Some EU registers are well covered and recent; some non-EU jurisdictions are partial or stale; some opaque jurisdictions are not covered at all. Treat OpenCorporates as an enrichment, never a spine — and surface absence explicitly rather than dropping rows.
- **Recency bias in EDF.** The DG DEFIS factsheets and the FRS consolidated analysis lag the actual call results by months. A v1 view of "current consortium concentration" is necessarily a view of the most recent consolidated snapshot, not the live state of EDF.
- **CPV bias.** The nine defence CPV codes used in scope ([`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md)) are conservative. Some defence-adjacent items — dual-use electronics, satellite components, certain logistics services — appear under CPV codes outside this set. A wider net is possible but raises the false-positive rate; the choice is documented, not silent.

## False-positive cost

An incorrectly flagged supplier is a reputational and possibly legal harm. The PoC therefore separates two states explicitly:

- A `candidate_match` is a hypothesis. It is the output of the entity-resolution stage and the sanctions screening join. It is **not** a finding. It does not appear on any external-facing report.
- A `confirmed_match` is a finding. It is the output of an analyst review using the `confirm_sanctions_match` action type on the alerts queue. Only confirmed matches are reportable.

The mitigation against false-positive harm is the human-in-the-loop confirmation step itself — documented across [`07_entity_resolution.md`](07_entity_resolution.md), [`08_ontology_design.md`](08_ontology_design.md), and [`09_workshop_app_spec.md`](09_workshop_app_spec.md). No part of the system promotes a candidate to a confirmed finding without the action being submitted by a named user, with the Foundry audit log recording the submission. The demo enacts this on stage at minute 07–10 of [`12_demo_script.md`](12_demo_script.md).

> ⚖️ ETHICS: The single most important rule for the PoC's framing — externally and on stage — is that *candidate* and *confirmed* are not synonyms. The Workshop screens use the former language by default and the latter only after an action submission.

## EU AI Act positioning

This PoC is a **decision-support** tool, not an automated decision-making system. The EU AI Act distinguishes risk tiers — prohibited, high-risk, limited-risk, minimal-risk — and the placement depends on what the system actually does, who it is used on, and what consequences flow from its outputs.

- The PoC operates on **public administrative data about legal entities** — TED contract awards, EDF consortium membership, OpenSanctions, OpenCorporates. Natural-person data is excluded by design at the upstream filter.
- Every candidate match is reviewed by a human before it becomes a finding. This is a documented human-in-the-loop step, not a notional one.
- The output is a screen and a query result, not a blocking decision, not an enforcement action, not a score on a natural person.

As built, the PoC does not fall into the prohibited or high-risk categories of the AI Act. **A production deployment that auto-blocks suppliers, feeds enforcement workflows, or scores natural persons would be a different system requiring its own assessment.** That distinction must be preserved through any v2 or v3 design.

> ⚖️ ETHICS: The line above is the load-bearing one for AI Act compliance. Any change that removes the human-in-the-loop step, broadens scope to natural persons, or adds automated enforcement triggers a new AI Act assessment.

## GDPR and LOPDGDD

Although all sources are open, certain enrichments touch personal data — notably OpenCorporates officer fields and OpenSanctions Person entries. The PoC excludes natural-person records by design at the upstream filter; the pipeline drops `Person` entities from the OpenSanctions FollowTheMoney stream before any join (see [`06_pipeline_design.md`](06_pipeline_design.md), stage 3, and [`07_entity_resolution.md`](07_entity_resolution.md)).

A future iteration that re-introduces natural-person records — for example, to screen company directors against sanctions — requires a Data Protection Impact Assessment under GDPR Article 35, and equivalent treatment under the Spanish LOPDGDD. That is a v2 scoping decision, not a v1 quick fix.

## Foundry-side governance

The Foundry tenancy itself supplies a governance surface that the PoC relies on without re-implementing:

- **Project markings** apply classification labels to datasets and Ontology objects, controlling who can read what.
- **Role-based access** on the project restricts who can submit actions on which object types — relevant for the `confirm_sanctions_match` and `dismiss_false_positive` actions.
- **Audit logs** record every action submission with the user identity, timestamp, and payload — the candidate-to-confirmed transition is therefore non-repudiable.
- **Branch-based development** keeps pipeline and ontology changes off the production main branch until promoted.

> ⚠️ VERIFY: Confirm on the demo tenancy how project markings propagate from raw datasets through the Ontology to Workshop, and how the AIP Agent's tool gating respects those markings — both are tenancy-dependent in their specifics, even though the capabilities are documented.

## Vendor lock and cost — the honest paragraph

Foundry's compute, Ontology, Workshop, and AIP licences carry non-trivial annual cost. The PoC runs on an academic or demo tenancy; a production deployment is a separate budgetary conversation.

Two comparator stacks exist and are worth naming:

- **Open-source comparators** — Neo4j (graph) plus dbt (transforms) plus Streamlit or Superset (apps) plus a self-hosted LLM gateway — can reproduce most of the data-warehouse and app layers. They cost materially more glue work, and they lose the Ontology layer's audit and lineage guarantees, which in this PoC are load-bearing for the human-in-the-loop and AI Act story.
- **Commercial comparators** — Databricks plus Unity Catalog, or Snowflake plus a BI layer — cover the warehouse and governance layers competently, but do not provide the Ontology / Workshop / AIP Agent stack as a single coherent product. Building a comparable analyst-facing console on top of either is non-trivial.

Foundry might still be the right choice **for this class of problem** — operational console plus analyst-driven graph navigation plus bounded LLM over a governed ontology — but the decision must be informed, not reflexive. A v2 procurement that picks Foundry should be able to defend the choice against the two comparators above.

## What v2 would require to be production-grade

A v2 that crosses the gap from documented PoC to operational tool requires, at minimum:

- **Paid corporate data** — ORBIS or Sayari — for ownership and UBO information that open sources cannot supply since the CJEU 2022 ruling.
- **A commercial sanctions feed** for richer coverage, faster updates, and better entity-side aliasing than the open OpenSanctions baseline.
- **Internal procurement data access** where lawful, replacing or augmenting TED for the operator's own contract pipeline.
- **A Data Protection Impact Assessment** under GDPR, scoped against the new data surface.
- **Project markings and role-based access** aligned with the customer's classification regime, replacing the academic tenancy posture.
- **Security accreditation** for the tenancy at the appropriate level.
- **A documented legal basis** for processing each new source.

Each of these is a programme commitment, not a tooling change. See [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md) for the staged v2 / v3 framing.
