# Entity Resolution

Entity resolution is where this PoC succeeds or fails. It is the load-bearing chapter: roughly 60–70 % of the technical effort sits here, and the quality of every downstream signal — sanctions hits, jurisdiction overlays, consortium concentration — depends on the quality of the matches produced in this step. Stage 5 of the pipeline ([`06_pipeline_design.md`](06_pipeline_design.md)) is the home of this work; the alert queue that consumes its output is described in [`09_workshop_app_spec.md`](09_workshop_app_spec.md); the ontology actions that confirm or dismiss candidate matches are in [`08_ontology_design.md`](08_ontology_design.md).

This document is prose-only. No PySpark code appears here. The intent is to specify the behaviour the Code Repository transform must implement, not to dictate its line-by-line shape.

## Why it is hard

Supplier names in TED — and to a lesser extent in the EDF factsheets — are **free text**. There is no shared identifier across TED, EDF, OpenCorporates, and OpenSanctions. A handful of intrinsic problems compound:

- **Legal-form suffixes vary by jurisdiction.** "GmbH" (Germany), "S.A." (France, Spain, Belgium, Switzerland), "Ltd" / "Limited" (UK, Ireland, Cyprus), "Sp. z o.o." (Poland), "A/S" (Denmark, Norway), "AB" (Sweden), "Oy" (Finland), "AG" (Germany, Switzerland), "BV" (Netherlands), "S.r.l." (Italy), "SAS" (France) and many more. The same legal entity appears in different datasets with the suffix sometimes present, sometimes absent, sometimes abbreviated.
- **Transliteration.** Names from Cyrillic, Greek, and Arabic script are transliterated inconsistently across lists — "Rosoboronexport" / "Rosoboronexport JSC" / "Rosoboronexport OAO" / "ОАО Рособоронэкспорт" are the same entity reported four ways.
- **Subsidiary vs parent.** A TED award goes to "Acme Defence GmbH"; the OpenSanctions hit is on "Acme Holdings AG". Without ownership data — explicitly out of scope for this PoC — the resolver cannot fuse them. The honest behaviour is to leave them separate and surface both.
- **Name changes after M&A.** Historical TED contracts award to a name that no longer exists; a successor entity holds the live OpenCorporates record. The resolver sees two strings and must not silently fuse them either.
- **Common-word collisions.** "Defence Systems Ltd", "European Industries SA", "Atlas Engineering GmbH" — generic tokens produce many false-positive candidate pairs unless the scoring is careful.

The honest position: the resolver will produce both false positives and false negatives by construction. The mitigation is not to suppress them but to **surface every candidate to a human reviewer** before it counts as a finding.

## Techniques

The Code Repository transform combines four ideas in sequence: normalize, block, score, threshold.

### Normalization

Each supplier name is reduced to a canonical form before any comparison:

- Lower-case the entire string and strip leading / trailing whitespace.
- Remove accents and diacritics by Unicode normalization (NFKD) followed by stripping combining marks. "Müller" becomes "muller"; "Société" becomes "societe".
- Strip legal-form suffixes from a curated list. The list is maintained as a static reference dataset inside Foundry so the analyst can grow it as new suffixes surface. Stripping is suffix-anchored, not substring — "Ltd" at the end of the name is stripped; "Ltd" inside the name is not.
- Collapse internal whitespace into single spaces.
- Replace punctuation (commas, dots, ampersands) with whitespace, then re-collapse whitespace.

The output is `name_normalized`. Both the OpenSanctions targets dataset and the supplier master are normalized with the same function, so a comparison operates on like inputs.

### Candidate generation (blocking)

A naive all-pairs comparison between the supplier master (tens of thousands of rows) and the OpenSanctions legal-entity set (tens of thousands of rows) is an O(N²) join — wasteful, and dominated by pairs that cannot plausibly match. Blocking reduces the search space:

- The block key is the concatenation of the supplier's ISO-3166 alpha-2 `country_code` and the **first trigram of `name_normalized`** (the first three non-whitespace characters).
- Only pairs whose block keys agree are considered for scoring.

The block is intentionally coarse. A finer block (e.g. first four characters) would miss matches where the leading characters differ — common with transliteration. Country agreement is enforced because cross-country matches are almost always false positives in this domain and the cost of missing the rare legitimate cross-country case is acceptable for v1.

### Scoring

Each candidate pair receives two sub-scores and one composite score:

- **Jaro-Winkler similarity** on the two `name_normalized` strings. Jaro-Winkler weights leading-character agreement and behaves well on names of similar length with minor edit-distance differences.
- **Token-set ratio.** Each name is split on whitespace, the resulting tokens are turned into sets, and the score reflects the size of the intersection relative to the union. This sub-score is robust to word reordering — "Acme Defence Systems" vs "Defence Systems Acme" — and to token insertion or deletion.
- **Composite score.** A weighted combination of the two — the exact weights are a tuning parameter, with a sensible starting point of equal weight. The composite is what the threshold is applied to.

Both sub-scores and the composite are persisted on every candidate row so the analyst can see *why* a match was proposed and so the threshold can be re-tuned later without re-running the join.

### Threshold tuning

The threshold governs the precision / recall trade-off:

- A **high threshold** (e.g. 0.95 composite) yields high precision and low recall: fewer false positives in the analyst queue, but real matches missed.
- A **low threshold** (e.g. 0.80 composite) yields high recall and low precision: real matches are caught, but the analyst queue floods with noise and reviewer attention fatigues.

The recommended discipline: start at a conservative high threshold for the first build, work the queue to exhaustion, record how many candidates were confirmed vs dismissed, then lower the threshold incrementally on subsequent builds. Each iteration produces a known precision band and a known false-negative cost. The threshold is parameterised on the transform so iteration does not require code changes.

## Foundry-specific advice

The resolution transform must live in a **Code Repository (PySpark)** transform, not in Pipeline Builder. Pipeline Builder does not natively expose Jaro-Winkler or token-set similarity functions, and the blocking strategy benefits from explicit control over join keys and partitioning that the declarative Pipeline Builder layer abstracts away.

The transform exposes its result as a versioned dataset — `master/supplier_sanctions_candidate_v0` per [`06_pipeline_design.md`](06_pipeline_design.md) stage 5 — with the composite score, the two sub-scores, the matched names, the OpenSanctions program, and the OpenSanctions source list all preserved on each row. The dataset is documented in the Foundry catalogue with a description that includes the threshold, the weights, the normalization rules, and the snapshot date of the OpenSanctions dataset that was used. This documentation is the audit trail.

## Honest false-positive and false-negative behaviour

Both happen. The remedy is **surfacing, not hiding**:

- Every candidate match enters the Workshop alerts queue described in [`09_workshop_app_spec.md`](09_workshop_app_spec.md).
- A reviewer opens each candidate, inspects the supporting evidence — the normalized names side-by-side, the country code, the OpenSanctions program, the source list, the designation date, the OpenSanctions aliases — and decides.
- A confirmation invokes the `confirm_sanctions_match` action in [`08_ontology_design.md`](08_ontology_design.md), upgrading the candidate link to a confirmed link on the Supplier object.
- A dismissal invokes `dismiss_false_positive`, removing the candidate link and recording the dismissal in an audit dataset so the same pair does not re-enter the queue on the next build.

The PoC never auto-confirms. A high score is a strong hint to the reviewer, not a finding.

## Manual-review workflow

The end-to-end loop:

1. Stage 5 of the pipeline writes `master/supplier_sanctions_candidate_v0`.
2. The Workshop alerts-queue screen reads the candidate dataset, sorted by composite score descending and grouped by supplier.
3. The reviewer opens a candidate, sees both normalized names, the country, the OpenSanctions program and source list, the designation date, and the list of aliases.
4. The reviewer either confirms (the candidate link becomes a confirmed link; the Supplier object's `has_confirmed_sanctions_match` flag is set true; an audit-log entry is appended), or dismisses (the candidate link is removed; the pair is appended to the `dismissed_matches` audit dataset; the same pair will be filtered out of future candidate sets).
5. The audit trail is the dataset, not a side channel. Anyone with access can read it.

The AIP Agent ([`10_aip_agent_spec.md`](10_aip_agent_spec.md)) can summarize the contents of the queue, but cannot itself invoke confirm or dismiss — it can only propose.

## Legal-entity-only constraint

Restating the principled exclusion: natural-person records are filtered out upstream at stage 3 of the pipeline ([`06_pipeline_design.md`](06_pipeline_design.md)). The resolver therefore operates exclusively on FollowTheMoney `Company`, `Organization`, and `LegalEntity` types. A `Person` row never enters the matching set, regardless of score. This constraint is enforced at the data level, not at the UI level — that matters because it means an analyst cannot accidentally surface a natural-person match by relaxing a filter in Workshop. The boundary is in the data.

> ⚖️ ETHICS: the legal-entity-only boundary is the single most important ethical guarantee of this PoC. If a future iteration wants to widen the scope to include sanctioned individuals (e.g. for related-party screening on directors), that change requires a Data Protection Impact Assessment and explicit governance sign-off — see [`13_risks_ethics_governance.md`](13_risks_ethics_governance.md).

## Cross-references

- Stage that owns this transform: [`06_pipeline_design.md`](06_pipeline_design.md), stage 5.
- Ontology actions consumed at confirm / dismiss time: [`08_ontology_design.md`](08_ontology_design.md).
- The reviewer surface: [`09_workshop_app_spec.md`](09_workshop_app_spec.md).
