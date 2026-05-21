# Architecture Overview

This file describes the Foundry layer cake the PoC sits on top of. The intent is to give a single picture of how data travels from public sources to the operational app and the AIP Agent, with forward links to the file that details each layer. No images; the diagram below is a fenced ASCII block.

## Layer cake

```
+--------------------------------------------------------------+
|  Sources (public, open)                                      |
|  TED  |  OpenSanctions  |  EU Sanctions XML  |  EDF  |  OC   |
+--------------------------------------------------------------+
                           |
                           v
+--------------------------------------------------------------+
|  Data Connection  /  manual upload                           |
|  HTTP sources, file upload, scheduled pulls                  |
+--------------------------------------------------------------+
                           |
                           v
+--------------------------------------------------------------+
|  Raw datasets   (raw/ted, raw/opensanctions, raw/edf, ...)   |
+--------------------------------------------------------------+
                           |
                           v
+--------------------------------------------------------------+
|  Pipeline Builder  +  Code Repositories (PySpark)            |
|  Pipeline Builder: parsing, typing, enrichment, joins        |
|  Code Repositories: entity resolution + EDF PDF post-process |
+--------------------------------------------------------------+
                           |
                           v
+--------------------------------------------------------------+
|  Clean datasets (clean/*, resolved/*)                        |
+--------------------------------------------------------------+
                           |
                           v
+--------------------------------------------------------------+
|  Foundry Ontology                                            |
|  Supplier  Contract  Project  SanctionsTarget  Jurisdiction  |
|  + link types + action types                                 |
+--------------------------------------------------------------+
                           |
       +-----------+-------+-------+-----------+----------+
       v           v               v           v          v
   Object       Workshop       Quiver      AIP Logic   AIP Agent
   Explorer     console        analyses    functions   Studio
```

## Sources

Five open feeds: TED contract-award notices on defence CPV codes, OpenSanctions Consolidated, the EU Consolidated Sanctions XML, the European Defence Fund factsheets and the FRS consolidated analysis, and OpenCorporates as an enrichment for legal-entity jurisdiction. Every URL, licence, and known limitation is in [`04_data_sources.md`](04_data_sources.md).

## Data Connection and manual upload

The PoC uses two ingress paths into Foundry: Data Connection HTTP sources for feeds that update daily (the EU XML, optionally the TED Search API v3 in sprint-2), and manual dataset upload for sampled snapshots and for any artefact that has been pre-processed out-of-Foundry (the EDF CSV produced from PDFs). Sprint-1 leans on uploads; sprint-2 introduces the live HTTP sources. The full per-source ingestion approach is in [`05_ingestion_plan.md`](05_ingestion_plan.md).

## Raw datasets

Each source lands in its own `raw/<source>/<entity>_v0` Foundry dataset, untouched except for the parser the connector or upload format requires. Raw layers are append-mostly and are the contract with the outside world: every downstream rebuild starts here. Dataset paths and RID placeholders are tracked in [`05_ingestion_plan.md`](05_ingestion_plan.md).

## Pipeline Builder and Code Repositories

The bulk of the transformation work — column typing, CPV filtering, supplier-name normalization, lot-level explosion, joins across feeds — is built in **Pipeline Builder**, because it is visual, version-controlled, and avoids hand-rolled PySpark where simple operations suffice. Two specific concerns are pushed into **Code Repositories** as PySpark transforms: (a) entity resolution between TED suppliers, EDF beneficiaries, OpenCorporates lookups, and OpenSanctions targets, which is the load-bearing analytical step and benefits from explicit testable code; and (b) post-processing of the EDF CSV that arrives from out-of-Foundry PDF parsing. Both are designed in [`06_pipeline_design.md`](06_pipeline_design.md) and [`07_entity_resolution.md`](07_entity_resolution.md).

## Clean datasets

The pipeline outputs are typed, deduplicated, and resolved datasets under `clean/*` and `resolved/*`. These are the datasource backing of the ontology objects, with no further transformation between dataset and object beyond the column-to-property mapping declared in Ontology Manager. The mapping is documented in [`08_ontology_design.md`](08_ontology_design.md).

## Foundry Ontology

Five object types — `Supplier`, `Contract`, `Project`, `SanctionsTarget`, `Jurisdiction` — with link types and action types (notably `confirm_sanctions_match` and `dismiss_false_positive`). The ontology is the contract between the pipeline and every consuming surface: Workshop, Quiver, AIP Logic, AIP Agent Studio. Full design in [`08_ontology_design.md`](08_ontology_design.md).

## Object Explorer, Workshop, Quiver, AIP Logic, AIP Agent

The operational surfaces:

- **Object Explorer** for ad-hoc pivoting on the ontology and for link-analysis style exploration.
- **Workshop** for the operational console — KPI screen, supplier explorer, sanctions-alert queue, jurisdiction map, EDF consortium view. See [`09_workshop_app_spec.md`](09_workshop_app_spec.md).
- **Quiver** for the prepared analyses (temporal patterns, concentration, jurisdiction breakdown). See [`11_quiver_analyses.md`](11_quiver_analyses.md).
- **AIP Logic** for bounded analyst functions (ontology queries, action invocations) reused from Workshop and from the agent.
- **AIP Agent Studio** for the natural-language assistant, which is configured with the AIP Logic functions as tools and with a refusal pattern for out-of-scope queries. See [`10_aip_agent_spec.md`](10_aip_agent_spec.md).

## Design choices

**Why the ontology sits between transforms and apps.** Every consuming surface — Workshop, Quiver, AIP Agent — reads from the ontology rather than from the underlying datasets. That single indirection lets the pipeline be rewritten without breaking any app, lets action types enforce write-side invariants (the human-confirmation step on a sanctions match is an action, not a raw row update), and gives the AIP Agent a typed object model to reason over instead of free-form tables.

**Why Code Repositories are reserved for entity resolution and PDF post-processing.** Entity resolution is the analytical bottleneck of the PoC and needs to be testable, diffable, and code-reviewable; expressing it in Pipeline Builder would obscure both its logic and its known failure modes. The EDF post-processing step is similar — it cleans the output of a fragile out-of-Foundry parser and needs explicit handling of malformed rows. Everything else — parsing, typing, joins, CPV filtering, jurisdiction enrichment — is straightforward enough to live in Pipeline Builder, where the visual lineage is more valuable than custom code.

**Why this PoC deliberately does not add a graph database.** The supplier-contract-project-sanction-jurisdiction model is a small, mostly star-shaped schema, not a deep graph; the questions in [`01_executive_summary.md`](01_executive_summary.md) resolve in one or two hops against the ontology. Adding Neo4j or a similar component would introduce a second source of truth, a second access-control surface, and a synchronization burden, in exchange for traversal patterns the PoC does not need. The ontology plus Object Explorer is the right tool at this scale; a future v2 with UBO chains and multi-hop ownership could revisit the decision.

---

Next: [`04_data_sources.md`](04_data_sources.md) details each public source. Then [`05_ingestion_plan.md`](05_ingestion_plan.md) describes how each enters Foundry. Back to [`00_README.md`](00_README.md) or [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md).
