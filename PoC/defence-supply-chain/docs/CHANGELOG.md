# CHANGELOG — defence-supply-chain PoC documentation

> Single authoring session. The set follows the protocol declared in [`00_README.md`](00_README.md). This changelog records the order of authoring, decisions taken outside the canonical brief, and the cross-reference pass at the end of the session.

## Session — initial 16-file authoring

### Batch 1 — narrative spine

- `00_README.md` — index, reading order, prerequisites, time estimate, honest scope paragraph.
- `01_executive_summary.md` — two-page command-staff version; explicit "what this PoC does NOT demonstrate" block; indicative findings deferred as `TODO`; fund-v2 vs stop-here as the framed decision.
- `02_scope_and_honest_limits.md` — in/out scope; data-quality limits table; EU AI Act + GDPR/LOPDGDD + CJEU 2022 UBO framing; cost transparency.

Decisions taken in batch 1: narrative anchored on the **EU FDI Screening Regulation (EU 2019/452)** rather than on a surveillance frame; **legal-entity-only** unit of analysis (natural persons out of scope by design); **human-in-the-loop confirmation mandatory** for every candidate sanctions match.

### Batch B — architecture, sources, ingestion

- `03_architecture_overview.md` — Foundry layer cake in ASCII; design-choice subsection (why ontology between transforms and apps; Code Repositories reserved for ER and PDF post-processing; no separate graph database).
- `04_data_sources.md` — one section per source with verified URLs copied verbatim from the canonical inputs; defence CPV reference subsection; FollowTheMoney schema names; OpenSanctions CC-BY-NC 4.0 licence flag.
- `05_ingestion_plan.md` — sprint-1 / sprint-2 split per source; TED Search API v3 POST payload as a sprint-2 path wrapped in `VERIFY`; manual CSV upload as the safe sprint-1 default.

Decisions taken in batch B (logged by the author):

- Placeholder TED date window `2022-01-01` to `2024-12-31` and example payload field names (`classification-cpv`, `notice-type`, `publication-date`); flagged that the exact field syntax must be validated against the live TED API docs.
- OpenSanctions positioned as the breadth source; EU Consolidated Sanctions XML as the authoritative-EU reference; the priority is reversible (TODO callout).
- OpenCorporates cache materialized at `enrich/opencorporates/cache_v0`.

### Batch C — pipelines, entity resolution, ontology

- `06_pipeline_design.md` — seven named transform stages; quality-checks subsection; versioning + branching discipline; **prose-only strict, no PySpark code**.
- `07_entity_resolution.md` — normalization → blocking → scoring (Jaro-Winkler + token-set ratio) → threshold tuning; honest false-positive / false-negative section; manual-review workflow; legal-entity-only constraint restated.
- `08_ontology_design.md` — six object types (`Supplier`, `Contract`, `Project`, `SanctionsTarget`, `Country`, `Jurisdiction`); five link types; four action types (`flag_supplier_for_review`, `confirm_sanctions_match`, `dismiss_false_positive`, `add_jurisdiction_note`); design informed by the TED eProcurement Ontology v5.2.0 but adapted to Foundry's object/link/action model.

Decisions taken in batch C (logged by the author):

- Added a `flagged_for_review` boolean property on `Supplier` so the `flag_supplier_for_review` action has a state to write to.
- Used a SHA-256 truncated hash family for `supplier_id` (chosen as the collision-resistant default).
- `07_entity_resolution.md` ran modestly over the upper word target because the mandatory subsection list could not be compressed without omitting required content.

### Batch D — apps, agent, analyses

- `09_workshop_app_spec.md` — six screens (Landing/KPIs; Supplier explorer; Network view; Sanctions alerts queue; Jurisdiction risk map; EDF consortium view); explicit `VERIFY` on the Network-view screen (Foundry's link-analysis surface is Object Explorer / Vertex; Workshop integration via embed widget or deep link).
- `10_aip_agent_spec.md` — bound-function catalogue (six functions); the three demo prompts with expected behaviour described in prose; explicit refusal/escalation rules; limits-of-LLM-over-tabular-data section.
- `11_quiver_analyses.md` — HHI concentration analysis; cross-border supplier network; sanctions-match temporal pattern (with the ETHICS callout against causal claims).

Decisions taken in batch D (logged by the author):

- Introduced an implicit `ConsortiumSummary` return type for `summarize_consortium` without defining its fields — treated as agent-internal.
- Surfaced missing supplier-country values as an explicit "unknown" bucket in analysis 2 rather than dropping them, consistent with the data-quality stance in [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md).
- Described prompt 2 (non-EU + candidate match) as decomposed into multiple bound-function calls rather than inventing a new combined function.

### Batch E — demo, ethics, glossary, follow-up

- `12_demo_script.md` — 15-minute timed runbook (Problem → Architecture → Workshop → Alerts queue → AIP → Honest limits → Close); rehearsal checklist; closing slide message verbatim.
- `13_risks_ethics_governance.md` — bias sources; false-positive cost; EU AI Act positioning; GDPR/LOPDGDD; Foundry-side governance; vendor-lock + cost honest paragraph; v2 prerequisites.
- `14_glossary.md` — two definition tables (Foundry concepts + procurement/sanctions concepts).
- `15_followup_and_next_iterations.md` — v2-with-budget, v3-with-internal-data, what-success-looks-like, what-failure-looks-like, the three-question decision frame.

Decisions taken in batch E (logged by the author):

- Glossary modestly over target; trimming further would have dropped the cross-link convention.
- Follow-up modestly over target; the ethics-failure paragraph could not be compressed without becoming glib.
- One extra rehearsal checklist item (visible dataset version on the Landing KPIs) added, consistent with the TIP callout in [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md).
- CJEU joined cases `C-37/20` and `C-601/20` cited in the glossary for the November 2022 UBO ruling.

## Cross-reference pass

- All 16 documents present in `PoC/defence-supply-chain/docs/`.
- All internal numeric-prefix Markdown links resolve.
- Action-type identifiers used consistently across the nine documents that reference them.
- Object-type identifiers used consistently across the documents that reference them.
- All verified URLs centralized in [`04_data_sources.md`](04_data_sources.md) and [`05_ingestion_plan.md`](05_ingestion_plan.md); no other file invents URLs.
- Style discipline pass: no emoji outside the documented callout markers (`⚠️`, `⚖️`, `💡`); no exclamation marks outside callouts; no marketing language.
- Root index `PoC/README.md` updated with an academic-tagged row pointing to this PoC.

## Open items left for the author

- All `> ⚠️ VERIFY:` callouts must be checked against the live Foundry tenancy before execution. Inventory:
  - HTTP-source POST with JSON body for the TED Search API (`05_ingestion_plan.md`).
  - XML parsing path for the EU Consolidated Sanctions XML (`05_ingestion_plan.md`).
  - Quiver chord-diagram availability (`11_quiver_analyses.md`).
  - Workshop graph rendering — Object Explorer pivot, Vertex embed, or Workshop deep-link (`09_workshop_app_spec.md`).
  - AIP Agent Studio tool-gating semantics matching the intended legal-entity-only boundary (`10_aip_agent_spec.md`, `13_risks_ethics_governance.md`).
- All `> ⚠️ TODO:` callouts (RIDs, API keys, dataset path placeholders, indicative findings post-execution) must be filled in as the work progresses.
- Re-read [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md) before the first demo. The framing is the credibility anchor.
