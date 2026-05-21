# EU Defence Supply Chain Risk Mapping — A Foundry-Native PoC

A four-week academic Proof of Concept that maps the network of awarded suppliers in EU defence procurement and surfaces alert signals — sanctions hits, high-risk jurisdictions, structural opacity, consortium concentration — using exclusively open data, built end-to-end inside Palantir Foundry. It is a decision-support exercise, not a surveillance system, and frames the work under the lens of economic security and supply-chain risk under the EU FDI Screening Regulation.

> ⚖️ ETHICS: This PoC is an academic transparency exercise on public defence procurement. It does not identify individuals, does not perform predictive policing, and does not claim to substitute classified or paid intelligence-grade sources. Read [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md) before anything else.

## Intended audience

Two readers in mind:

1. **Operational command staff (mandos operativos):** read [`01_executive_summary.md`](01_executive_summary.md) only. Five minutes. The rest is appendix.
2. **The technical author (you) and any colleague continuing the work:** read in the order below. The pipeline, ontology, and entity-resolution chapters are the load-bearing files.

## Reading order

| # | File | What it answers |
|---|---|---|
| 00 | this file | What is this, who is it for, where to start |
| 01 | [`01_executive_summary.md`](01_executive_summary.md) | The two-page version, plain language |
| 02 | [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md) | What the PoC IS and IS NOT — read before defending it |
| 03 | [`03_architecture_overview.md`](03_architecture_overview.md) | The Foundry layer cake, in one diagram-in-text |
| 04 | [`04_data_sources.md`](04_data_sources.md) | One section per source, with URLs and licences |
| 05 | [`05_ingestion_plan.md`](05_ingestion_plan.md) | How each source enters Foundry |
| 06 | [`06_pipeline_design.md`](06_pipeline_design.md) | Pipeline Builder + Code Repository transforms |
| 07 | [`07_entity_resolution.md`](07_entity_resolution.md) | The hard part. Where this PoC succeeds or fails |
| 08 | [`08_ontology_design.md`](08_ontology_design.md) | Objects, link types, action types, datasource backing |
| 09 | [`09_workshop_app_spec.md`](09_workshop_app_spec.md) | The operational console, screen by screen |
| 10 | [`10_aip_agent_spec.md`](10_aip_agent_spec.md) | Agent config and the prompts demonstrated live |
| 11 | [`11_quiver_analyses.md`](11_quiver_analyses.md) | Ad-hoc analyses prepared in advance |
| 12 | [`12_demo_script.md`](12_demo_script.md) | The 15-minute runbook |
| 13 | [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md) | Bias, AI Act, GDPR, vendor-lock, cost |
| 14 | [`14_glossary.md`](14_glossary.md) | Foundry terms + procurement/sanctions terms |
| 15 | [`15_followup_and_next_iterations.md`](15_followup_and_next_iterations.md) | What v2 and v3 look like |

## Prerequisites

- A Foundry account with access to: **Data Connection**, **Pipeline Builder**, **Code Repositories** (PySpark), **Ontology Manager**, **Object Explorer**, **Workshop**, **Quiver**, **AIP Logic**, **AIP Agent Studio**.
- A modest compute quota. The PoC is sampled, not bulk; see [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md).
- An out-of-Foundry workstation to register an OpenSanctions API key (free tier), to download the consolidated CSV/JSON snapshots, and to parse the EDF factsheet PDFs into CSV before upload.
- Familiarity with PySpark at the level of joins, window functions, and string normalization. Foundry experience beyond the basics is not required — the documents are written so a careful technical user can execute them step-by-step from the Foundry web UI.

## Open-data sources at a glance

| Source | What it gives us | Verified-URL anchor |
|---|---|---|
| TED — Tenders Electronic Daily | Defence contract-award notices | [`04_data_sources.md`](04_data_sources.md) |
| OpenSanctions (Consolidated) | ~70k sanctioned targets, 85 source lists | [`04_data_sources.md`](04_data_sources.md) |
| EU Consolidated Sanctions XML | Official EU list, daily refresh | [`04_data_sources.md`](04_data_sources.md) |
| European Defence Fund (EDF) | Consortium membership of EU-funded defence R&D projects | [`04_data_sources.md`](04_data_sources.md) |
| OpenCorporates | Legal-entity jurisdiction lookups | [`04_data_sources.md`](04_data_sources.md) |

All sources are listed with verified URLs, licence terms, and known limitations in [`04_data_sources.md`](04_data_sources.md). No paid sources are used.

## Total time estimate

| Block | Time (part-time) |
|---|---|
| Reading the documentation set end-to-end | half a day |
| Ingestion + raw landing of the five sources | 3 working days |
| Pipeline transforms (TED + EDF + Sanctions) | 4 working days |
| Entity resolution — the long pole | 5–7 working days |
| Ontology design + loading into Ontology Manager | 2 working days |
| Workshop app + Quiver analyses | 3 working days |
| AIP Agent + tested prompts | 2 working days |
| Demo rehearsal + risks/ethics doc walk-through | 1 working day |
| **Realistic total** | **~4 working weeks part-time** |

## Honest scope note

This PoC uses only public sources. It cannot reach the level of beneficial-ownership detail that paid databases (ORBIS, Sayari) or internal-government data would unlock — the CJEU 2022 ruling restricted public UBO registries across the EU, and free databases cover jurisdictions unevenly. The dominant technical cost is **entity resolution**: matching free-text supplier names across TED, EDF, OpenCorporates, and OpenSanctions is where 60–70% of the effort goes, and where the PoC will produce both false positives and false negatives. The documentation surfaces this honestly rather than glossing over it; see [`07_entity_resolution.md`](07_entity_resolution.md) and [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md). The PoC is therefore best read as the credible foundation for a v2 with paid sources or internal feeds — not as a production-ready risk-screening tool.

## What you should be able to do after reading

- Sit down in Foundry and start ingesting the first dataset on day one.
- Defend the PoC's scope and limits in front of skeptical command staff or skeptical technical staff.
- Pivot the design if a source becomes unavailable, because each file is self-contained enough to revise.
- Hand the documentation to a colleague and have them continue the work.

If any of those four are not true after a careful read, the documentation has failed — log the gap in [`docs/CHANGELOG.md`](CHANGELOG.md) (created at the end of the authoring session) and revise.
