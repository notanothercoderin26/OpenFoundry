# Glossary

Two-column concise reference. One sentence per term where possible. Cross-links point to the file where the term is first introduced or most extensively used. No marketing language.

## Foundry concepts

| Term | Definition |
|---|---|
| Ontology | The formal model of objects, link types, and actions in Foundry, against which Workshop apps and AIP agents query; see [`08_ontology_design.md`](08_ontology_design.md). |
| Object Type | A class of entity in the Ontology (for example `Supplier`, `Contract`) backed by a dataset; see [`08_ontology_design.md`](08_ontology_design.md). |
| Link Type | A typed relationship between two Object Types (for example `awarded_to` from `Contract` to `Supplier`); see [`08_ontology_design.md`](08_ontology_design.md). |
| Action Type | A declared write operation against the Ontology — for example `confirm_sanctions_match` — logged and access-controlled; see [`08_ontology_design.md`](08_ontology_design.md). |
| Dataset | The Foundry-managed tabular store underneath an Object Type, versioned by transaction; see [`05_ingestion_plan.md`](05_ingestion_plan.md). |
| Branch | A version of the project's datasets, pipelines, and Ontology where changes can be made off the main branch and promoted; see [`06_pipeline_design.md`](06_pipeline_design.md). |
| Pipeline Builder | The visual transform tool in Foundry for joining and shaping datasets without writing PySpark by hand; see [`06_pipeline_design.md`](06_pipeline_design.md). |
| Code Repository | The PySpark transform surface for logic that exceeds Pipeline Builder's expressiveness; see [`06_pipeline_design.md`](06_pipeline_design.md). |
| Workshop | The Foundry app builder used to assemble the operational console for analysts; see [`09_workshop_app_spec.md`](09_workshop_app_spec.md). |
| Quiver | The Foundry ad-hoc analysis surface for tabular and time-series exploration; see [`11_quiver_analyses.md`](11_quiver_analyses.md). |
| AIP Logic | The Foundry surface for building deterministic functions and prompt-bounded LLM steps callable as tools; see [`10_aip_agent_spec.md`](10_aip_agent_spec.md). |
| AIP Agent (Agent Studio) | The Foundry surface for assembling a chat agent over a set of AIP Logic tools, Ontology queries, and Action calls, with system-prompt and refusal behaviour; see [`10_aip_agent_spec.md`](10_aip_agent_spec.md). |
| Object Explorer | The Foundry surface for pivoting between linked objects in the Ontology, used as the canonical graph-navigation surface; see [`09_workshop_app_spec.md`](09_workshop_app_spec.md). |
| Data Connection | The Foundry surface for configuring source connectors (file drop, JDBC, HTTP, etc.) feeding raw datasets; see [`05_ingestion_plan.md`](05_ingestion_plan.md). |
| RID (Resource Identifier) | The Foundry-internal opaque identifier referring to a specific dataset, ontology object, or other resource; used in audit logs and configuration. |

## Procurement and sanctions concepts

| Term | Definition |
|---|---|
| TED (Tenders Electronic Daily) | The European Union's official publication channel for procurement notices, including contract-award notices; see [`04_data_sources.md`](04_data_sources.md). |
| CPV (Common Procurement Vocabulary) | The EU's hierarchical classification of procurement subject matter; defence sits primarily under the 35* and 5063*–5066* families; see [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md). |
| Contract Award Notice | A TED notice published after a contract is awarded, naming the winning supplier(s), the contracting authority, and the value; the primary input for the supplier graph. |
| eForms | The EU's structured notice format that progressively replaces the legacy TED XML schema; relevant for forward-compatibility of the ingestion stage. |
| eProcurement Ontology v5.2.0 | The EU's official semantic model for procurement data, published at the TED docs site; the conceptual reference for the PoC's `Contract` / `Supplier` modelling; see [`08_ontology_design.md`](08_ontology_design.md). |
| EDF (European Defence Fund) | The EU's R&D-funding programme for defence capabilities, publishing annual call results listing project consortia and members; see [`04_data_sources.md`](04_data_sources.md). |
| OpenSanctions | An open-data project consolidating ~85 government and international sanctions lists into a single FollowTheMoney-typed dataset, licensed CC BY-NC 4.0; see [`04_data_sources.md`](04_data_sources.md). |
| FollowTheMoney schema | The open schema (used by OpenSanctions and the OCCRP) for typing entities such as `Person`, `Company`, `Organization`, `LegalEntity`, `Ownership`, and `Sanction`. |
| UBO (Ultimate Beneficial Owner) | The natural person or persons who ultimately own or control a legal entity; not reliably obtainable from open sources post-2022 and out of scope for the PoC; see [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md). |
| Sanctions program | A named regime under which targets are listed (for example, EU Russia sanctions, US OFAC SDN, UK OFSI); a single target may appear under multiple programs. |
| Designation date | The date on which a target was added to a given sanctions program, relevant for temporal alignment with contract award dates; see [`11_quiver_analyses.md`](11_quiver_analyses.md). |
| FDI Screening Regulation (EU 2019/452) | The EU regulation requiring Member States to assess foreign direct investment risk in defence and dual-use sectors; the policy frame for this PoC; see [`01_executive_summary.md`](01_executive_summary.md). |
| CJEU 2022 UBO ruling | The Court of Justice of the European Union judgment of 22 November 2022 (joined cases C-37/20 and C-601/20) that restricted general public access to beneficial-ownership registers, with consequences for open-source UBO discovery across the EU; see [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md). |
