# Ontology Design

This chapter specifies the Foundry Ontology that sits between the consolidated pipeline outputs ([`06_pipeline_design.md`](06_pipeline_design.md)) and the operator-facing surfaces ([`09_workshop_app_spec.md`](09_workshop_app_spec.md), [`10_aip_agent_spec.md`](10_aip_agent_spec.md)). The ontology is the contract: every Workshop widget, every AIP Agent tool call, every Quiver analysis ([`11_quiver_analyses.md`](11_quiver_analyses.md)) queries against it, not against the underlying datasets directly.

The design follows the standard Foundry pattern: object types are backed by datasource bindings, link types express relationships, and action types are the only write surface. Six object types, five link types, four action types.

## Object types

### `Supplier`

The spine of the ontology.

- **Primary key:** `supplier_id` — the deterministic hash computed in stage 4 of the pipeline.
- **Datasource:** `ontology/supplier_consolidated_v0` (stage 7).
- **Title property:** `name_normalized`.
- **Subtitle property:** the concatenation of `country_iso2` and `jurisdiction_risk_tier`, formatted as `country_iso2 + " · " + jurisdiction_risk_tier`.
- **Properties:**

| Property | Type | Description | Source |
|---|---|---|---|
| `name_normalized` | string | Canonical normalized name from the resolution pipeline | stage 4 |
| `name_original` | string | First-seen original-cased name as it appeared upstream | stage 4 |
| `country_iso2` | string | ISO-3166 alpha-2 country code | stage 4 |
| `country_iso3` | string | ISO-3166 alpha-3 country code | stage 4 |
| `legal_form_stripped` | string | The legal-form suffix that was removed during normalization, kept for audit | stage 4 |
| `first_seen_award_date` | date | Earliest contract or EDF appearance | stage 4 |
| `last_seen_award_date` | date | Latest contract or EDF appearance | stage 4 |
| `total_award_value_eur` | double | Cumulative TED award value in EUR | stage 1 → 4 |
| `n_contracts` | integer | Count of TED contracts | stage 1 → 4 |
| `n_edf_projects` | integer | Count of EDF projects | stage 2 → 4 |
| `has_open_sanctions_candidate` | boolean | True if any candidate sanctions match exists | stage 7 |
| `has_confirmed_sanctions_match` | boolean | True if any candidate has been confirmed by a reviewer | actions |
| `jurisdiction_risk_tier` | enum (`EU`, `EEA`, `OECD`, `OTHER`) | Risk tier from the OpenCorporates enrichment | stage 6 |
| `flagged_for_review` | boolean | Set by the `flag_supplier_for_review` action | actions |

### `Contract`

A single defence-relevant TED contract award, exploded to lot grain.

- **Primary key:** `contract_id` — the TED notice ID concatenated with the lot index.
- **Datasource:** `clean/ted/awards_normalized_v0`.
- **Title:** `contracting_authority_name`.
- **Subtitle:** `cpv_code + " · " + award_date`.
- **Properties:**

| Property | Type | Description |
|---|---|---|
| `award_date` | date | Date the award was published |
| `value_eur` | double | Contract value in EUR (currency-converted upstream if needed) |
| `currency_original` | string | The original currency code |
| `cpv_code` | string | CPV code (one of the defence-relevant codes in scope) |
| `cpv_label` | string | Human-readable CPV label |
| `contracting_authority_name` | string | Name of the awarding authority |
| `contracting_authority_country_iso2` | string | Country of the awarding authority |
| `notice_url_ted` | string | URL of the TED notice |
| `lot_index` | integer | Lot index inside the parent notice |

### `Project`

An EDF-funded R&D project.

- **Primary key:** `edf_project_id`.
- **Datasource:** `clean/edf/consortium_members_v0`, aggregated to one row per project.
- **Title:** `topic_title`.
- **Subtitle:** `call_year + " · " + coordinator_country_iso2`.
- **Properties:**

| Property | Type | Description |
|---|---|---|
| `call_year` | integer | EDF call year (2021–2024 in scope) |
| `topic_code` | string | DG DEFIS topic code |
| `topic_title` | string | Human-readable topic title |
| `total_funding_eur` | double | Total EDF funding awarded to the project |
| `n_consortium_members` | integer | Count of distinct consortium members |
| `coordinator_country_iso2` | string | Country of the consortium coordinator |

### `SanctionsTarget`

A sanctioned legal entity from the OpenSanctions consolidated dataset.

- **Primary key:** `opensanctions_id` — the FollowTheMoney entity id.
- **Datasource:** `clean/sanctions/targets_legal_entity_v0`.
- **Title:** `name`.
- **Subtitle:** `country_iso2 + " · " + sanction_program`.
- **Properties:**

| Property | Type | Description |
|---|---|---|
| `name` | string | Canonical name |
| `aliases` | list of strings | Known aliases and transliterations |
| `country_iso2` | string | ISO-3166 country code (where present) |
| `sanction_program` | string | Sanction program identifier |
| `designation_date` | date | Date of designation |
| `source_list` | string | Source list identifier (UN, EU, OFAC, UK, etc.) |
| `entity_type` | enum (`Company`, `Organization`, `LegalEntity`) | FollowTheMoney type — natural persons are excluded upstream |

### `Country`

Static reference data.

- **Primary key:** `country_iso2`.
- **Datasource:** a static reference CSV the author uploads once.
- **Title:** `name`.
- **Subtitle:** `iso3`.
- **Properties:**

| Property | Type | Description |
|---|---|---|
| `iso3` | string | ISO-3166 alpha-3 |
| `name` | string | English country name |
| `eu_member` | boolean | EU membership flag |
| `eea_member` | boolean | EEA membership flag |
| `oecd_member` | boolean | OECD membership flag |

> ⚠️ TODO: upload a static country-reference CSV.

### `Jurisdiction`

Distinct from `Country` because the same country can host multiple registers, each with its own freshness and reliability, and the OpenCorporates enrichment yields a register-level signal rather than a country-level one. Decoupling the two means the model can carry e.g. "England & Wales" and "Scotland" registers under the same `country_iso2 = GB`.

- **Primary key:** `jurisdiction_code`.
- **Datasource:** `master/supplier_jurisdiction_v0`, aggregated to one row per jurisdiction.
- **Title:** `register_name`.
- **Subtitle:** `country_iso2 + " · " + risk_tier`.
- **Properties:**

| Property | Type | Description |
|---|---|---|
| `country_iso2` | string | Country of the register |
| `register_name` | string | Register identifier from OpenCorporates |
| `risk_tier` | enum (`EU`, `EEA`, `OECD`, `OTHER`) | Risk tier rolled up to the jurisdiction |

## Link types

| Link | Cardinality | Direction | Semantic name | Notes |
|---|---|---|---|---|
| `Supplier --awarded--> Contract` | 1 → N | Supplier to Contract | "awarded" | A supplier holds one or more contracts; a contract has exactly one awarded supplier per lot. |
| `Supplier --beneficiary_of--> Project` | N → N | Supplier to Project | "beneficiary_of" | Consortium members are many-to-many with projects. |
| `Supplier --candidate_match--> SanctionsTarget` | N → N | Supplier to SanctionsTarget | "candidate_match" | Edge property: `match_score` (double). Materialized from stage 5. |
| `Supplier --confirmed_match--> SanctionsTarget` | N → N | Supplier to SanctionsTarget | "confirmed_match" | Set only by the `confirm_sanctions_match` action. |
| `Supplier --registered_in--> Jurisdiction` | N → 1 | Supplier to Jurisdiction | "registered_in" | From the OpenCorporates enrichment. |

The deliberate separation between `candidate_match` and `confirmed_match` is what makes the human-in-the-loop guarantee visible at the model level rather than buried in application logic.

## Action types

Each action is the only sanctioned write path to the property or link it touches. Direct dataset writes from the UI are not permitted.

### `flag_supplier_for_review`

- **Parameters:** `supplier_id` (string), `reason` (string).
- **Effect:** sets the `flagged_for_review` boolean on the matching `Supplier` object to true; appends an entry to the audit-log dataset with the actor, the timestamp, the supplier_id, and the reason.

> ⚖️ ETHICS: this action records a reviewer's intent to take a closer look. It is decision-support, not enforcement. The AIP Agent may propose this action and surface the proposal to the user; it must not auto-execute it.

### `confirm_sanctions_match`

- **Parameters:** `supplier_id` (string), `opensanctions_id` (string), `reviewer_note` (string).
- **Effect:** removes the `candidate_match` link between the pair and creates a `confirmed_match` link in its place; sets `has_confirmed_sanctions_match = true` on the `Supplier`; appends an entry to the audit-log dataset.

> ⚖️ ETHICS: this action moves a candidate from "machine-proposed" to "human-confirmed". It changes how the supplier appears in dashboards and how the Agent talks about it. The AIP Agent must not auto-execute this action under any circumstances; confirmation is a human-only act.

### `dismiss_false_positive`

- **Parameters:** `supplier_id` (string), `opensanctions_id` (string), `reviewer_note` (string).
- **Effect:** removes the `candidate_match` link; appends the pair to a `dismissed_matches` audit dataset so the entity-resolution stage filters them out on the next build (preventing requeue churn); appends an entry to the audit-log dataset.

> ⚖️ ETHICS: dismissing a candidate is also a consequential act — it suppresses the pair on future builds. The AIP Agent may surface a candidate as low-confidence but must not auto-dismiss.

### `add_jurisdiction_note`

- **Parameters:** `supplier_id` (string), `note` (string).
- **Effect:** appends a free-text analyst note to the `Supplier`'s note collection, with the actor and timestamp.

> ⚖️ ETHICS: a note is a non-destructive enrichment, but it is still part of the analyst's contemporaneous record. The AIP Agent may draft a note for the analyst to review, but may not write the note autonomously.

## Relationship to the TED eProcurement Ontology

The object model above is **informed by the TED eProcurement Ontology v5.2.0** (RDF) — see `https://docs.ted.europa.eu/EPO/latest/index.html` — and the property names borrow ePO vocabulary where it maps cleanly (CPV code, contracting authority, award date). The model is **not** a 1:1 translation of ePO into Foundry. Two reasons:

- ePO is RDF; Foundry's ontology is an object/link/action model. Translating every RDF predicate into a Foundry link type would balloon the model with edges the operational UI does not need (e.g. separate predicates for "has contract", "has lot", "has procedure", "was awarded by"), and would force the Workshop screens to traverse multi-hop paths for what is logically a single supplier-to-contract relationship.
- ePO carries a procurement-procedure modelling layer (procedure type, criteria, framework agreements) that this PoC does not consume — the unit of demonstration is the *award*, not the *procedure*. Modelling procedure structure would be dead weight in v1.

The most visible simplification: ePO distinguishes `epo:hasContract` (authority to contract) from `epo:wonBy` (contract to supplier). The Foundry model collapses these into a single `Supplier --awarded--> Contract` link. The contracting authority is carried as a property on `Contract` rather than as its own object type, because the PoC's questions do not require pivoting on authorities as first-class objects. A v2 that wants to analyse buyer behaviour would promote `ContractingAuthority` to an object type and split the link accordingly.

## Cross-references

- Datasets backing each object type: [`06_pipeline_design.md`](06_pipeline_design.md).
- Why `candidate_match` and `confirmed_match` are separate links: [`07_entity_resolution.md`](07_entity_resolution.md).
- Screens that consume these objects, links, and actions: [`09_workshop_app_spec.md`](09_workshop_app_spec.md).
- Agent tool bindings against these object types and actions: [`10_aip_agent_spec.md`](10_aip_agent_spec.md).
