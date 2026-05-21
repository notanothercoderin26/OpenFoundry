# Scope and Honest Limits

This is the most important non-technical document in the set. Read it before you defend the PoC to anyone. The scope and limits below are not a disclaimer — they are the working frame.

## What is in scope

- **TED contract-award notices** for defence-relevant CPV codes:
  - `35000000` Security, fire-fighting, police and defence equipment (parent)
  - `35300000` Weapons, ammunition and associated parts
  - `35400000` Military vehicles
  - `35411000` Battle tanks
  - `35513200` Auxiliary research vessel
  - `50630000` Repair/maintenance of military vehicles
  - `50640000` Repair/maintenance of warships
  - `50650000` Repair/maintenance of military aircraft, missiles, spacecraft
  - `50660000` Repair/maintenance of military electronic systems
  Time window for the demo dataset is bounded; see [`04_data_sources.md`](04_data_sources.md) and [`05_ingestion_plan.md`](05_ingestion_plan.md). Ingestion is sampled, not bulk.
- **OpenSanctions consolidated targets** and the **EU Consolidated Sanctions XML** as the screening layer. ~70k targets across ~85 government / international lists.
- **EDF consortium membership** for the 2021–2024 funding rounds, reconstructed from DG DEFIS factsheets (PDF) and the FRS consolidated analysis. See [`04_data_sources.md`](04_data_sources.md).
- **OpenCorporates lookups** for legal-entity country of registration and jurisdiction tier. Used as an enrichment, not as the spine — coverage and freshness are uneven.
- **A Workshop console** ("Defence Supply Chain Risk Console") with screens for KPIs, supplier explorer, network view, sanctions-alert queue, jurisdiction map, and EDF consortium view. See [`09_workshop_app_spec.md`](09_workshop_app_spec.md).
- **An AIP Agent** that answers bounded analyst questions over the ontology, with refusal behaviour for out-of-scope queries. See [`10_aip_agent_spec.md`](10_aip_agent_spec.md).
- **A documented human-in-the-loop confirmation step** for every candidate sanctions match before it counts as a finding. See [`07_entity_resolution.md`](07_entity_resolution.md) and [`08_ontology_design.md`](08_ontology_design.md) for the `confirm_sanctions_match` / `dismiss_false_positive` actions.

## What is out of scope

- **Real UBO graphs.** Reliable beneficial-ownership chains require paid databases (ORBIS, Sayari, Moody's, LexisNexis) or accredited access to national registers. The CJEU 22 November 2022 ruling restricted public UBO access; many EU Member States have since closed or limited their public-facing registers. This PoC does not attempt UBO inference from open data because the result would be misleading.
- **Individual-level surveillance and natural-person data.** The unit of analysis is the **legal entity**. We do not screen natural persons on sanctions lists in this PoC, even where they appear on the source data. Out of scope is out of scope; see [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md).
- **Attribution to state actors.** A foreign-jurisdiction signal is a signal to investigate further, not an accusation of state-directed activity. The Workshop console must reflect this in its labels — see [`09_workshop_app_spec.md`](09_workshop_app_spec.md).
- **Predictive policing in any form.** No risk scoring of natural persons, no behavioural predictions, no learned classifiers that label a supplier as "likely to fail screening". Signals are deterministic and explainable: a hit on a sanctions list, a registration in a jurisdiction tier, a structural pattern in consortium membership.
- **Classified data.** The PoC runs on open sources only. It is not accredited and is not intended for classified workflows.
- **Bulk-historical TED ingestion.** The PoC samples; production ingestion of the full 1993-onward archive is out of scope for a four-week academic exercise.

## Known data-quality limits

| Limit | Source | Operational consequence |
|---|---|---|
| Supplier names in TED are **unnormalized free text** with national legal-form suffixes, spelling variants, transliterations, and historical name changes | TED | Entity resolution is the dominant cost; see [`07_entity_resolution.md`](07_entity_resolution.md). |
| Some TED award notices are **lot-level**, others are aggregated | TED eForms / TED legacy XML | The pipeline must explode lots and re-aggregate at supplier × contracting-authority × CPV grain. |
| EDF beneficiary data is published as **PDFs**, one factsheet per project per call | DG DEFIS | Parsing required out-of-Foundry; output is a CSV. Parsing errors are inevitable on a fraction of projects. |
| OpenSanctions aggregates 85 lists with different schemas, aliases, and reporting practices | OpenSanctions | False positives on common names; false negatives on transliteration. Threshold tuning is mandatory. |
| OpenCorporates has **uneven jurisdiction coverage**; some registers are stale or partial; the free tier is rate-limited | OpenCorporates | Treat as an enrichment, not a spine. Cache aggressively. Note absence of data explicitly rather than silently dropping rows. |
| All sources carry **reporting bias** — what is published, in which language, by which authority | All five | Findings must be framed as "patterns visible in the published data", not "ground truth". |
| **Time alignment** is awkward — sanctions designation dates, contract award dates, and EDF call windows do not align; some sanctions are listed after a contract was already running | All | The Quiver temporal-pattern analysis ([`11_quiver_analyses.md`](11_quiver_analyses.md)) addresses this explicitly and refuses to draw causal conclusions. |

> 💡 TIP: Every chart and table the PoC produces must carry the dataset version (Foundry transaction or branch) it was computed on. The Ontology Manager and Quiver expose this metadata; surface it on the Workshop console.

## Ethical and legal limits

- **EU AI Act framing.** This PoC is a **decision-support tool**, not an automated decision-making system. The AI Act distinguishes risk tiers; decision-support over public administrative data with a documented human-in-the-loop step does not fall into the prohibited or high-risk categories *as built*, but a production deployment that automatically blocks suppliers or feeds enforcement workflows would. The line is drawn in [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md).
- **GDPR / LOPDGDD.** Although all sources are open, certain enrichments (notably OpenCorporates officer records, and OpenSanctions Person entries) touch personal data. We **exclude natural-person records** from the screening pipeline as a matter of design; see [`07_entity_resolution.md`](07_entity_resolution.md). A future iteration that re-introduces them requires a Data Protection Impact Assessment.
- **CJEU 2022 UBO ruling.** Acknowledged above. The PoC must not give the impression of UBO discovery; both the executive summary and the Workshop screens must make this clear.
- **FDI Screening Regulation framing.** The narrative for the demo is *economic security and supply-chain transparency under EU 2019/452*, not surveillance. This framing must be visible in the demo script ([`12_demo_script.md`](12_demo_script.md)).
- **Defence procurement is politically sensitive.** The PoC must not be presented as a tool for naming, shaming, or pre-judging suppliers. Workshop screens use neutral language ("candidate match", "registered in", "consortium member") and avoid loaded labels.

## Cost transparency

- **Foundry is not free.** Production deployment of a comparable platform — Foundry compute + Ontology + Workshop + AIP — carries non-trivial annual licensing. The PoC assumes a demo/academic tenancy is available; production economics are out of scope here but are surfaced in [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md), alongside open-source (Neo4j + dbt + Streamlit) and commercial-alternative (Databricks + Unity Catalog) comparators.
- **Paid data is not free either.** ORBIS, Sayari, Dun & Bradstreet annual subscriptions for the breadth and depth a real v2 needs run into six figures. A v2 budget needs to anticipate this; see [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md).
- **The single largest cost in v1 is human time on entity resolution**, not compute and not data licensing. This is consistent with what every published procurement-network study reports.

## What a careful reader should take away

The PoC is honest about its boundaries. It produces a defensible, explainable view of *who appears in EU defence procurement*, augmented with screening signals against open sanctions data and jurisdiction enrichment, with every signal subject to human confirmation. It does not produce ownership chains, does not score individuals, and does not replace classified or paid sources. Within those boundaries it is genuinely useful as a transparency exercise and as the credible foundation for deciding what a paid-source / internal-data v2 should look like.
