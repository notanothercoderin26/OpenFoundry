# Pipeline Design

This chapter describes, transform by transform, how raw landed data is shaped into the consolidated dataset that feeds the Foundry Ontology. It is the technical heart of the PoC. Entity resolution is detailed in [`07_entity_resolution.md`](07_entity_resolution.md); the object and link model that consumes the final dataset is in [`08_ontology_design.md`](08_ontology_design.md).

The design rule across all seven stages: prefer Pipeline Builder for declarative shape-and-join work, and reach for Code Repository (PySpark) only where the logic requires functions Pipeline Builder does not expose natively — primarily string-similarity scoring and API-driven enrichment with caching.

All stage descriptions are prose. No PySpark code appears in this document; the code itself lives in the Code Repository the author creates and is reviewed in pull requests.

## Stage 1 — TED raw to TED normalized

- **Input:** `raw/ted/notices_<window>` (the landed TED CSV / XML extract from [`05_ingestion_plan.md`](05_ingestion_plan.md)).
- **Tool:** Pipeline Builder. Every operation in this stage is a standard column transform, type cast, or row explode — Pipeline Builder handles all of them.
- **Logic:** parse `award_date` and `publication_date` into proper date types; coerce `value_eur` to numeric and fail rows where the value is non-numeric or negative (route them to a side-output for the analyst to inspect); explode lot-level rows so the grain is one row per (notice, lot, awarded supplier); extract `supplier_name_raw` from the eForms / legacy-XML supplier block; normalize `contracting_authority_country` and `supplier_country` to ISO-3166 alpha-2 and alpha-3 against a static reference table; filter the result to the defence-relevant CPV codes listed in [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md).
- **Output:** `clean/ted/awards_normalized_v0`.
- **Quality checks:** total row count within ±5 % of the raw row count after lot explode (the multiplier is the average lots-per-notice ratio, which the author records on first build); null rate on `award_date`, `supplier_name_raw`, `supplier_country`, `value_eur`, `cpv_code` all below 2 %; cardinality check that `cpv_code` only contains values from the in-scope list; side-output row count surfaced as a build metric.

> ⚠️ TODO: record the baseline row count and null-rate numbers from the first successful build so subsequent builds can be compared against them.

## Stage 2 — EDF raw to EDF normalized

- **Input:** `raw/edf/factsheets_<call_year>` — the CSV produced out-of-Foundry from the DG DEFIS factsheet PDFs, optionally seeded by the FRS consolidated analysis.
- **Tool:** Pipeline Builder.
- **Logic:** the input is already partly structured (one row per consortium member per project). Normalize the country code of each consortium member to ISO-3166; trim and lower-case the member legal name into `name_normalized` while keeping `name_original`; coerce `total_funding_eur` and `member_funding_eur` to numeric; tag each row with the `call_year` (2021–2024) and `topic_code`; derive `is_coordinator` as a boolean from the role column. No record-level deduplication here — duplicates across factsheets are kept and resolved later in stage 4.
- **Output:** `clean/edf/consortium_members_v0`.
- **Quality checks:** approximately 250+ distinct `edf_project_id` values across the four call years; null rate on `member_country` below 2 %; sum of `member_funding_eur` per project equal to `total_funding_eur` per project within a rounding tolerance.

## Stage 3 — OpenSanctions raw to sanctions normalized

- **Input:** `raw/opensanctions/entities_<snapshot_date>` (FollowTheMoney JSON, or the simplified CSV).
- **Tool:** Pipeline Builder.
- **Logic:** flatten the FollowTheMoney nesting into a tabular row per target with name, alias list, country (ISO-3166), sanction program, designation date, source list, entity_type. **Filter natural-person records out**: keep only entities of FollowTheMoney type `Company`, `Organization`, or `LegalEntity`. This filter is the PoC's principled exclusion of natural-person data (see [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md)) and must be enforced upstream of any matching step.
- **Output:** `clean/sanctions/targets_legal_entity_v0`.
- **Quality checks:** row count materially lower than the upstream ~70k consolidated targets (because natural-person rows are removed); `entity_type` cardinality strictly limited to the three allowed values; null rate on `name` and `sanction_program` below 1 %.

> ⚠️ TODO: record the post-filter legal-entity row count on the first build as the new baseline.

## Stage 4 — Supplier master

- **Input:** `clean/ted/awards_normalized_v0` and `clean/edf/consortium_members_v0`.
- **Tool:** Pipeline Builder.
- **Logic:** union the supplier-side projection of TED awards (one row per supplier × country) with the consortium-member-side projection of EDF (one row per beneficiary × country). Deduplicate on the pair `(name_normalized, country_iso2)`. Generate a stable surrogate key `supplier_id` as a deterministic hash (SHA-256, truncated, lower-case hex) of the canonical string `name_normalized + "|" + country_iso2`. Carry forward an `appears_in` array tagging whether the supplier is seen in TED, EDF, or both, and aggregate `first_seen_award_date`, `last_seen_award_date`, `n_contracts`, `n_edf_projects`, `total_award_value_eur` from the inputs.
- **Output:** `master/supplier_v0`.
- **Quality checks:** `supplier_id` strictly unique; no nulls on `supplier_id`, `name_normalized`, `country_iso2`; row count within an expected range that the author records after the first build; the count of suppliers with `appears_in = ['TED','EDF']` is non-trivial (the PoC is meaningful only if there is overlap).

## Stage 5 — Supplier master joined to OpenSanctions

- **Input:** `master/supplier_v0` and `clean/sanctions/targets_legal_entity_v0`.
- **Tool:** Code Repository (PySpark). Pipeline Builder is not used here because the matching logic requires Jaro-Winkler / token-set similarity functions and a blocking strategy keyed on country and trigram — operations that exceed Pipeline Builder's declarative idiom.
- **Logic:** the transform implements the normalization, candidate-generation, scoring, and threshold pipeline described in [`07_entity_resolution.md`](07_entity_resolution.md). The output is the candidate match set: one row per `(supplier_id, opensanctions_id)` pair scoring above the configured threshold, with the composite `match_score` and the individual sub-scores preserved for auditability. No automatic confirmation happens here; every row is a candidate awaiting analyst review.
- **Output:** `master/supplier_sanctions_candidate_v0`.
- **Quality checks:** row count materially lower than the Cartesian product (the blocking strategy is working); distribution of `match_score` skewed toward the high end of the threshold band (the threshold is filtering out noise rather than letting everything through); zero rows where the `entity_type` is anything other than `Company` / `Organization` / `LegalEntity`.

## Stage 6 — Supplier master enriched with OpenCorporates

- **Input:** `master/supplier_v0`.
- **Tool:** Code Repository (PySpark). The choice is driven by the OpenCorporates API: rate-limited, requires keyed HTTP calls with retry and back-off, and benefits from a persistent cache so re-runs do not re-hit the API for suppliers already looked up.
- **Logic:** for each supplier the transform issues an OpenCorporates lookup keyed on `(name_normalized, country_iso2)`, persists the raw API response into a cache dataset, and parses the response into `jurisdiction_code`, `register_name`, and `risk_tier` (one of `EU`, `EEA`, `OECD`, `OTHER`). Suppliers with no match are written through with null jurisdiction fields and a `lookup_status` indicator — the PoC surfaces missing data explicitly rather than silently dropping rows.
- **Output:** `master/supplier_jurisdiction_v0`.
- **Quality checks:** cache hit ratio above 90 % on re-runs; non-null `risk_tier` on the majority of suppliers (with the exact baseline recorded on first build); rate of `lookup_status = "not_found"` documented as a known limit, not treated as a build failure.

## Stage 7 — Final consolidated dataset feeding the Ontology

- **Input:** `master/supplier_v0`, `master/supplier_sanctions_candidate_v0`, `master/supplier_jurisdiction_v0`.
- **Tool:** Pipeline Builder.
- **Logic:** left-join the candidate-sanctions and jurisdiction outputs onto the supplier master on `supplier_id`. Derive two boolean flags: `has_open_sanctions_candidate` (a candidate row exists) and `has_confirmed_sanctions_match` (set by the `confirm_sanctions_match` action in [`08_ontology_design.md`](08_ontology_design.md); on initial build it is uniformly false). Carry through the jurisdiction fields. Project to the exact column set the `Supplier` object type expects.
- **Output:** `ontology/supplier_consolidated_v0`.
- **Quality checks:** row count equal to `master/supplier_v0` row count (a left join must not lose rows); `supplier_id` still unique; the count of suppliers with `has_open_sanctions_candidate = true` matches the distinct `supplier_id` count in `master/supplier_sanctions_candidate_v0`.

## What a "green" build looks like

A green build across all seven stages satisfies, in order: row counts within ±5 % of the recorded baseline at each stage; null rates below 2 % on every primary-key and join-key field; cardinality constraints (CPV in-scope only; entity_type legal-entity only; supplier_id unique) passing; and side-output sizes (rejected rows, lookup-not-found rows) within their documented bands. The first build establishes the baselines; subsequent builds are compared against them.

> ⚠️ TODO: after the first successful end-to-end build, paste the actual row counts, null rates, and cache hit ratios into this section so the rest of the team can spot drift on later builds.

## Versioning and branching discipline

Every stage writes to a versioned dataset suffix — `_v0`, `_v1`, `_v2` — and the suffix increments only when the output schema changes in a way downstream consumers must react to (column rename, type change, semantic change). Bug-fix builds keep the same `_vN` suffix and rely on Foundry's transaction history for traceability.

Development work happens on a Foundry branch. Promotion to `main` is gated on a green build of all seven stages plus a clean run of the quality checks above. Schema changes go through a documented PR-style review on the Code Repository transforms and a sibling note on the Pipeline Builder dataset, so that an analyst reading the dataset description six months later understands why `_v0` was retired.

> 💡 TIP: name your branch after the sprint, e.g. `sprint-er-tuning`, so the lineage tells the story.

## Cross-references

- Entity resolution (stage 5 internals): [`07_entity_resolution.md`](07_entity_resolution.md).
- Object model consuming `ontology/supplier_consolidated_v0`: [`08_ontology_design.md`](08_ontology_design.md).
- Raw landing of each input dataset: [`05_ingestion_plan.md`](05_ingestion_plan.md).
- Source URLs and licences: [`04_data_sources.md`](04_data_sources.md).
