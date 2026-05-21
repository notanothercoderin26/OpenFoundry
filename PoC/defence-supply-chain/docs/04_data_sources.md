# Data Sources

This file catalogues every public source the PoC ingests, in the order they enter the pipeline. For each source: name and issuing authority, verified URLs (copied from the canonical decisions document), licence and terms of use, update frequency, format and approximate volume, schema highlights the PoC depends on, known limitations, and attribution requirement. Anything uncertain is marked with `> ⚠️ VERIFY:` or `> ⚠️ TODO:` callouts.

Ingestion mechanics for each source — connector type, sprint-1 vs sprint-2 paths, dataset paths — are in [`05_ingestion_plan.md`](05_ingestion_plan.md).

## 1. TED — Tenders Electronic Daily

**Authority.** The Publications Office of the European Union, operating TED as the official EU procurement-notice channel.

**Verified URLs.**

- Search API v3: `https://api.ted.europa.eu/v3/notices/search` (POST, JSON body)
- API documentation: `https://docs.ted.europa.eu/api/latest/index.html`
- SPARQL endpoint: `https://data.ted.europa.eu/`
- Bulk XML archive: FTP `ftp://ted.europa.eu/` (guest/guest), monthly packages since 1993
- CSV subset (2006–2021): on `data.europa.eu`

**Licence and terms.** TED data is published under the EU's open-data policy and is reusable, including for commercial use, under the standard re-use notice. Attribution to the Publications Office is expected on any derived product.

**Update frequency.** Daily for the live API and FTP archive; the CSV subset is a static historical bundle.

**Formats and volume.** XML (TED eForms and legacy TED schema), JSON (Search API v3 responses), CSV (the historical subset). For the PoC's bounded time window and the nine defence CPV codes the volume is in the low tens of thousands of award notices.

**Schema highlights the PoC depends on.**

- Notice identifier and notice type (the PoC filters to contract-award notices).
- Contracting authority (name, country, identifier).
- Award lots, each carrying CPV code, value, currency, award date, and one or more awarded supplier records.
- Supplier records: legal name, national identifier where present, country, address.

**Known limitations.**

- Supplier names are free text with national legal-form suffixes, spelling variants, transliteration, and historical name changes.
- Some notices are aggregated at notice level, others at lot level — the pipeline has to handle both shapes.
- Coverage of below-threshold defence procurement is incomplete; sensitive contracts may be withheld lawfully.

> ⚠️ VERIFY: The TED Search API v3 may require a non-empty `User-Agent` header and rate-limit-friendly batch sizes. Consult the API documentation at `https://docs.ted.europa.eu/api/latest/index.html` before configuring any HTTP source.

**Attribution.** "Source: TED — Tenders Electronic Daily, Publications Office of the European Union."

## 2. Defence-relevant CPV codes (reference)

CPV is the EU's Common Procurement Vocabulary. The PoC filters TED notices on the following nine codes; these are the canonical defence-relevant codes already fixed in [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md) and the canonical decisions document. No additional codes are invented.

| Code | Description |
|---|---|
| 35000000 | Security, fire-fighting, police and defence equipment (parent) |
| 35300000 | Weapons, ammunition and associated parts |
| 35400000 | Military vehicles |
| 35411000 | Battle tanks |
| 35513200 | Auxiliary research vessel |
| 50630000 | Repair/maintenance of military vehicles |
| 50640000 | Repair/maintenance of warships |
| 50650000 | Repair/maintenance of military aircraft, missiles, spacecraft |
| 50660000 | Repair/maintenance of military electronic systems |

This is a reference list, not a source. CPV definitions themselves are part of the EU CPV Regulation; the PoC takes the codes as fixed inputs and does not redistribute the CPV nomenclature.

## 3. OpenSanctions — Consolidated Sanctions

**Authority.** OpenSanctions.org, an independent open-data project aggregating ~85 sanctions and watchlists published by governments and international bodies (UN, EU, OFAC, UK, and others).

**Verified URLs.**

- Dataset landing page: `https://www.opensanctions.org/datasets/sanctions/`
- Bulk JSON (FollowTheMoney format, ~323 MB): `https://data.opensanctions.org/datasets/latest/sanctions/entities.ftm.json`
- Simplified CSV (~62 MB): `https://data.opensanctions.org/datasets/latest/sanctions/targets.simple.csv`
- API matching endpoint: `https://api.opensanctions.org/match/sanctions` (free tier exists)

**Licence and terms.** Creative Commons **BY-NC 4.0**. Non-commercial use only; commercial use requires a paid licence from OpenSanctions. Attribution to OpenSanctions is required. The PoC, as an academic exercise, falls within non-commercial use; a production deployment would need to re-evaluate.

**Update frequency.** Daily for both the bulk files and the API.

**Formats and volume.** FollowTheMoney JSON (~323 MB) and a simplified CSV (~62 MB). Total entities ~281,414; targets ~69,951; aggregating ~85 source lists.

**Schema highlights.** OpenSanctions uses the **FollowTheMoney** schema. The schemas the PoC relies on:

- `Person`
- `Company`
- `Organization`
- `LegalEntity`
- `Ownership`
- `Sanction`
- `Address`

(plus nested references between them). Natural-person records (`Person`) are excluded from the PoC's screening pipeline by design — see [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md) and [`07_entity_resolution.md`](07_entity_resolution.md).

**Known limitations.** Eighty-five source lists with heterogeneous reporting practices, alias coverage, and transliteration conventions. False positives on common names; false negatives on transliteration variants. Threshold tuning during entity resolution is mandatory.

**Attribution.** "Includes data from OpenSanctions.org, licensed CC BY-NC 4.0."

## 4. EU Consolidated Sanctions XML

**Authority.** European Commission, DG FISMA — the EU Financial Sanctions Database (FSD).

**Verified URL.**

- `https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content`

**Licence and terms.** EU public-sector information, reusable under the Commission's standard re-use notice with attribution.

**Update frequency.** Daily.

**Format and volume.** XML; full list of currently-designated entities and persons under EU restrictive measures. Volume is modest — single-digit megabytes — but the schema is detailed (designation reasons, legal basis, aliases, addresses).

**Schema highlights for the PoC.**

- Entity record with designation reason and EU legal basis (regulation reference).
- Aliases (preferred names, spelling variants, transliterations).
- Addresses and identifiers where present.

**Known limitations.** Aliases are present but uneven. The EU XML is one of the lists OpenSanctions already aggregates, so the two will overlap heavily; the PoC keeps both because the EU XML carries the authoritative legal basis and designation reason directly, which the operational console surfaces verbatim on confirmed matches.

> ⚠️ TODO: Decide whether the EU XML is the primary screening list (with OpenSanctions as supplementary breadth) or vice versa. The current default is OpenSanctions as the primary breadth source, EU XML as the authoritative-EU-law reference.

**Attribution.** "Source: EU Consolidated List of Persons, Groups and Entities Subject to EU Financial Sanctions, European Commission."

## 5. European Defence Fund (EDF)

**Authority.** Directorate-General for Defence Industry and Space (DG DEFIS), European Commission.

**Verified URLs.**

- 2021 results: `https://defence-industry-space.ec.europa.eu/funding-and-grants/calls-proposals/european-defence-fund-2021-calls-proposals-results_en`
- 2024 results: `https://defence-industry-space.ec.europa.eu/funding-opportunities/calls-proposals/result-edf-2024-calls-proposals_en`
- FRS consolidated analysis: `https://www.frstrategie.org/en/publications/defense-et-industries/european-defence-fund-assessment-after-four-calls-proposals-2021-2024-2025`

**Licence and terms.** DG DEFIS pages and factsheets are EU public-sector information, re-usable with attribution. The FRS analysis is published by the Fondation pour la recherche stratégique; reuse should respect FRS's terms — attribution and a link back are the conservative default for an academic PoC.

**Update frequency.** Annual call cycle; results are published per call. The PoC covers four years (2021–2024), ~250+ projects, ~€4B in total funding.

**Format and volume.** The DG DEFIS data is published as **PDF factsheets**, one per project per call, each listing the consortium members and affiliated entities. The FRS document is a single consolidated PDF analysis covering the four call rounds. There is no public structured-data download.

**The pragmatic path.** Re-using the FRS consolidated analysis as the seed dataset is faster and less error-prone than re-parsing 250+ factsheets, and the FRS dataset is the only consolidated view publicly available. Targeted re-parses of individual DG DEFIS factsheets are done only where the FRS data has gaps relevant to the PoC's defence-CPV scope. PDF parsing is performed **out of Foundry**; the output is a CSV uploaded to Foundry. The PoC does not prescribe a parsing tool.

**Schema highlights (target CSV).**

- Project identifier (EDF call + project acronym).
- Project topic and call year.
- Consortium coordinator.
- Consortium members (legal name, country, role).
- Affiliated entities where listed.
- Total project funding.

**Known limitations.** PDF parsing is fragile; expect a fraction of projects to require manual cleanup. Affiliated-entity coverage varies. Legal names appear in national languages and legal-form suffixes; the entity-resolution layer ([`07_entity_resolution.md`](07_entity_resolution.md)) treats EDF beneficiaries on the same footing as TED suppliers.

> ⚠️ TODO: Record the exact FRS publication date and version used for the consolidated seed; the FRS page above is the current landing page but the analysis itself is a dated PDF.

**Attribution.** "Source: European Defence Fund call results, DG DEFIS, European Commission; consolidated analysis by Fondation pour la recherche stratégique (FRS)."

## 6. OpenCorporates

**Authority.** OpenCorporates Ltd, an open-data project aggregating company registers worldwide.

**Verified URL.**

- API base: `https://api.opencorporates.com/` (v0.4)

**Licence and terms.** OpenCorporates is free for **Permitted Users** — academics, journalists, and public-interest researchers — under an application process. Commercial use requires a paid subscription. Attribution and respect for the rate limits are conditions of access.

> ⚠️ TODO: Apply for OpenCorporates Permitted-User access for the academic PoC. Record the API key, the granted rate limit, and the renewal date.

**Update frequency.** Continuous, mirroring the underlying national registers, with the freshness varying by jurisdiction.

**Format and volume.** JSON over HTTP. The PoC queries on demand for entities surfaced by the upstream pipeline — supplier names, EDF beneficiaries — rather than bulk-pulling. Expected query volume is in the low thousands across the project.

**Schema highlights the PoC depends on.**

- Company name and previous names.
- Jurisdiction code (country, and sub-national where applicable).
- Company number in the national register.
- Incorporation date and current status.
- Registered address.

**Known limitations.** Jurisdiction coverage is uneven; some registers are stale or only partially mirrored; the free tier is rate-limited. The PoC treats OpenCorporates as an enrichment overlay, not as a primary spine. The absence of an OpenCorporates record must be surfaced explicitly rather than silently dropped — see [`02_scope_and_honest_limits.md`](02_scope_and_honest_limits.md).

**Attribution.** "Includes data from OpenCorporates (opencorporates.com), under Permitted-User access."

## 7. Reference: TED eProcurement Ontology (EPO) v5.2.0

**Authority.** Publications Office of the European Union; the official EU eProcurement ontology.

**Verified URL.**

- `https://docs.ted.europa.eu/EPO/latest/index.html`

**Use in this PoC.** The EPO is **not a runtime dependency**. The PoC does not load the EPO RDF schema into Foundry's ontology and does not query the SPARQL endpoint as part of the pipeline. The EPO is consulted as **design inspiration** for the Foundry ontology in [`08_ontology_design.md`](08_ontology_design.md): it informs the modelling of `Contract`, `ContractingAuthority`, and lot-level award structures, and the vocabulary used to label properties. The PoC's ontology is intentionally a small, opinionated subset, not an EPO clone.

> 💡 TIP: When in doubt about how to name a property or where to break out a sub-object, check the EPO. Naming alignment will make a future v2 — possibly bridging to TED's RDF surface — significantly cheaper.

**Attribution.** Not redistributed; cited only.

---

Next: [`05_ingestion_plan.md`](05_ingestion_plan.md) describes how each of these sources enters Foundry. Back to [`03_architecture_overview.md`](03_architecture_overview.md) or up to [`00_README.md`](00_README.md).
