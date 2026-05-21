# Ingestion Plan

This file describes how each source from [`04_data_sources.md`](04_data_sources.md) enters Foundry. Two passes are planned: a sprint-1 path that minimises connector assumptions and gets the PoC moving with manual uploads, and a sprint-2 path that introduces live HTTP sources where the connector behaviour is supported. Foundry capabilities that are not unambiguously documented are wrapped in `> ⚠️ VERIFY:` callouts.

Dataset path placeholders are recorded throughout. Every `raw/*` path is a placeholder for the actual Foundry RID that the author records once the dataset is created.

## TED — Tenders Electronic Daily

**Sprint-1: manual sample upload.**

The sprint-1 path is the safest: download a TED CSV or XML sample covering the bounded time window for the defence CPV codes, then upload it as a Foundry dataset via the Dataset upload UI. This requires no Foundry connector assumptions and produces a deterministic, dated snapshot suitable for the rest of the pipeline to be built against.

The sample is collected by issuing the following JSON payload against the TED Search API v3 (see [`04_data_sources.md`](04_data_sources.md) for the verified endpoint URL and API docs). The payload filters by the nine defence-relevant CPV codes, restricts to contract-award notices, and bounds the date window. Tune the date window to fit the PoC's sample-size budget.

```json
{
  "query": "(classification-cpv = \"35000000\" OR classification-cpv = \"35300000\" OR classification-cpv = \"35400000\" OR classification-cpv = \"35411000\" OR classification-cpv = \"35513200\" OR classification-cpv = \"50630000\" OR classification-cpv = \"50640000\" OR classification-cpv = \"50650000\" OR classification-cpv = \"50660000\") AND notice-type = \"contract-award\" AND publication-date >= \"2022-01-01\" AND publication-date <= \"2024-12-31\"",
  "fields": [
    "publication-number",
    "publication-date",
    "notice-type",
    "buyer-name",
    "buyer-country",
    "classification-cpv",
    "lot-info",
    "winner",
    "contract-value"
  ],
  "limit": 100,
  "page": 1,
  "scope": "ALL"
}
```

Paginate the request with increasing `page` values; the exact field names and operator syntax are governed by the API documentation referenced in [`04_data_sources.md`](04_data_sources.md), and the payload above may require adjustment to match the version in effect at the time of ingestion. Save the consolidated JSON or CSV export, then upload to Foundry as `raw/ted/notices_v0`.

> ⚠️ TODO: Record the actual Foundry RID for `raw/ted/notices_v0` once created.

**Sprint-2: live HTTP source.**

> ⚠️ VERIFY: confirm Foundry's HTTP source connector supports POST with an arbitrary JSON body before relying on this path; if not, sprint-2 falls back to scheduled CSV upload.

The sprint-2 path is a Data Connection HTTP source pointed at `https://api.ted.europa.eu/v3/notices/search`, issuing POST requests with the JSON payload above, scheduled daily, writing to the same `raw/ted/notices_v0` dataset on an append basis. The fallback, if the connector does not support POST with a JSON body or arbitrary headers, is a scheduled job that fetches a CSV export and uploads it on the same cadence — functionally equivalent at PoC scale, less elegant.

## OpenSanctions — Consolidated

**Sprint-1: manual CSV upload.**

Download the simplified CSV (~62 MB; URL in [`04_data_sources.md`](04_data_sources.md)) and upload it as `raw/opensanctions/targets_simple_v0`. The simplified CSV is sufficient for the screening layer; the FollowTheMoney JSON is reserved for future deeper modelling and is not loaded in sprint-1.

> ⚠️ TODO: Record the actual Foundry RID for `raw/opensanctions/targets_simple_v0` once created.

**Sprint-2: API integration via Code Repository.**

A Code Repository PySpark transform calls `https://api.opensanctions.org/match/sanctions` for each candidate entity coming out of the upstream pipeline (TED suppliers + EDF beneficiaries). Responses are written to `raw/opensanctions/matches_v0`, which becomes a Foundry-managed cache. Match scores and matched entity payloads are kept verbatim for downstream re-evaluation; the cache key is the normalized supplier name plus jurisdiction.

> ⚠️ TODO: register an OpenSanctions API key (free tier exists) and record where it is stored as a Foundry secret.
> ⚠️ TODO: Record the actual Foundry RID for `raw/opensanctions/matches_v0` once created.

## EU Consolidated Sanctions XML

**Sprint-1: HTTP source pointed at the daily XML endpoint.**

A Data Connection HTTP source pulls `https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content` daily, landing the XML as `raw/eu_sanctions/full_list_v0`.

> ⚠️ VERIFY: confirm Foundry's HTTP source parses the XML directly into a dataset or requires a downstream parse transform. If a parse transform is required, place it in Pipeline Builder immediately after `raw/eu_sanctions/full_list_v0` and write the structured output to `clean/eu_sanctions/full_list_v1`.

> ⚠️ TODO: Record the actual Foundry RID for `raw/eu_sanctions/full_list_v0` once created.

No sprint-2 work is required for this source — the same HTTP source path is the steady-state ingestion mechanism.

## European Defence Fund (EDF)

EDF data is not available as structured downloads. The pragmatic path described in [`04_data_sources.md`](04_data_sources.md) applies: re-use the FRS consolidated analysis as the seed and re-parse individual DG DEFIS factsheets only where gaps remain.

**Sprint-1: out-of-Foundry PDF parsing, then CSV upload.**

PDF parsing is performed outside Foundry. The PoC does not prescribe a parsing tool. The output is a CSV with the schema sketched in [`04_data_sources.md`](04_data_sources.md) (project identifier, call year, coordinator, consortium members, affiliated entities, funding). Upload as `raw/edf/projects_v0`. Where the FRS consolidated analysis covers a project completely, no per-factsheet re-parse is needed; targeted re-parses are appended into the same dataset with a `source = "factsheet"` provenance column distinguishing them from FRS-sourced rows.

> ⚠️ TODO: Record the actual Foundry RID for `raw/edf/projects_v0` once created.

No sprint-2 path is planned because there is no live structured feed to point at. A future iteration that uses Foundry's document-extraction capabilities for the factsheets would be a separate design exercise.

## OpenCorporates

**Sprint-1 and sprint-2: ad-hoc enrichment via API in a Code Repository transform.**

OpenCorporates is queried on demand from a Code Repository PySpark transform, with the entity list coming from the resolved supplier dataset. The transform must respect the free-tier rate limit explicitly: a queue of pending lookups, a rate-limited dispatcher, retry with exponential backoff on `429`, and a hard daily cap aligned with the granted limit. Results are written to a Foundry-managed cache dataset `enrich/opencorporates/cache_v0`, keyed by a normalized supplier name plus jurisdiction hint.

> ⚠️ TODO: apply for OpenCorporates Permitted-User access and record the API key and rate limit.
> ⚠️ TODO: design the cache-key shape and refresh policy — when a cached row is considered stale, when it is re-queried, and how negative results (no match) are stored and not re-queried for some window.
> ⚠️ TODO: Record the actual Foundry RID for `enrich/opencorporates/cache_v0` once created.

The cache is the dataset the ontology's `Jurisdiction` enrichment reads from; downstream consumers never call the OpenCorporates API directly.

## Ingestion sequence

Ingest in this order; later steps depend on the earlier ones being in place.

1. **TED first**, because the supplier register is the spine of the PoC. Until TED is in place, there is no entity list to screen, no consortium to map back to, and no enrichment to perform. Time estimate: roughly one working day for sprint-1 (download a sample, validate the JSON payload above against the API documentation, upload, sanity-check the column shape).
2. **OpenSanctions sprint-1 CSV upload**, in parallel with TED if a second pair of hands is available; otherwise immediately after. Time estimate: half a working day to download, upload, and confirm the row count and licence note are recorded.
3. **EU Sanctions XML** via the HTTP source, with the parse-transform decision resolved by the `> ⚠️ VERIFY:` above. Time estimate: half a working day, plus any time spent on the parse transform if required.
4. **EDF** out-of-Foundry PDF parsing and CSV upload, seeded from the FRS consolidated analysis. Time estimate: one to two working days depending on how many DG DEFIS factsheets require targeted re-parses on top of the FRS seed.
5. **OpenCorporates** as enrichment, last, because it depends on the resolved supplier list — there is no point burning the rate limit on entities the pipeline has not yet committed to. Time estimate: half a working day to wire the transform and the cache, plus the wall-clock time for the rate-limited backfill.

Realistic total for ingestion: three working days, in line with the budget in [`00_README.md`](00_README.md), assuming the `> ⚠️ VERIFY:` items resolve to documented Foundry behaviour. If the sprint-2 HTTP-POST path for TED is not supported, expect a small additional cost for the CSV-upload fallback wiring.

---

Next: [`06_pipeline_design.md`](06_pipeline_design.md) describes the transforms that turn these raw datasets into the clean inputs to the ontology. Back to [`04_data_sources.md`](04_data_sources.md) or [`03_architecture_overview.md`](03_architecture_overview.md), or up to [`00_README.md`](00_README.md).
