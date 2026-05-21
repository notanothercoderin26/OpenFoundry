# Ingestion Plan

How each public source enters Foundry, in the order the author should implement them. Source-side details (URLs, licences, schema) live in [`04_data_sources.md`](04_data_sources.md); this file is strictly about the Foundry-side ingestion approach: connector type, schedule, dataset placeholders, and the gotchas worth surfacing before the author opens Data Connection.

## NVD — vulnerability advisories

- **Connector:** Foundry Data Connection HTTP source.
- **Endpoint:** `https://services.nvd.nist.gov/rest/json/cves/2.0`
- **Schedule:** daily.
- **Strategy:** an initial backfill bounded to a recent window (e.g. last 12 months at CRITICAL + HIGH using `cvssV3Severity`), then daily **delta loads** using `pubStartDate` and `pubEndDate` parameters covering the previous 24 hours. The delta pattern keeps the payload small and respects the NVD rate-limit guidance.
- **Authentication:** none required for low cadence, but recommended.
  - `> ⚠️ TODO: register an NVD API key (optional, raises rate limits). Sign-up: https://nvd.nist.gov/developers/request-an-api-key`
- **Raw dataset:** `raw/nvd/cves_v0`
  - `> ⚠️ TODO: record the actual Foundry RID once created.`
- **Why this source first:** NVD is the simplest of the five — a flat REST endpoint returning JSON, with stable schema, public-domain licence, and no archive-format unpacking. Ingesting it first proves that the Foundry HTTP-source pattern works end-to-end on the tenancy before the author commits to the harder sources.
- **Rough time:** half a working day including the backfill.

## IGN — seismic catalogue

- **Connector:** Foundry Data Connection HTTP source.
- **Endpoint:** the public web-form URL with the CSV export parameters from `https://www.ign.es/web/sis-catalogo-terremotos`. Because the CSV export endpoint is a Liferay portlet, the exact URL with query parameters has to be captured from the browser network panel during a feasibility test before the connector can be configured.
  - `> ⚠️ TODO: record the actual portlet URL parameters captured during your feasibility test.`
- **Schedule:** hourly. IGN typically publishes events within ~1 hour of occurrence; hourly polling keeps lag bounded without hammering the portal.
- **Strategy:** pull the rolling recent catalogue and let the downstream pipeline deduplicate by IGN event id. The catalogue is small (tens to low hundreds of events per month in the PoC's geographic scope), so polling the full recent window is acceptable.
- **Manual-CSV-upload fallback — document this explicitly.** Because the portlet URL is not a stable API and may change between catalogue revisions without notice, the ingestion plan **must include a fallback path**: a manual CSV export from the IGN web form, uploaded into the same raw dataset on a documented manual cadence (e.g. once per working day during the demo window if the automated connector breaks). The downstream pipeline does not distinguish between automated-pull rows and manual-upload rows.
- **Raw dataset:** `raw/ign/quakes_v0`
  - `> ⚠️ TODO: record the actual Foundry RID once created.`
- **Rough time:** half a working day for the automated connector plus the manual-fallback runbook.

## AEMET — CAP warnings

- **Connector:** Foundry Data Connection HTTP source for the **first** of the two HTTP calls (the metadata call), plus a Code Repository transform that performs the **second** call and unpacks the TAR.
- **Schedule:** every 15–30 minutes.
- **Strategy — the two-step metadata-then-`datos` pattern.** The first call hits `https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/area/esp` and returns a JSON metadata wrapper containing a `datos` URL. The second call (against the `datos` URL) returns a **TAR archive of CAP-format XML files**. The HTTP source lands the metadata wrapper into a small staging dataset; a downstream Code Repository Python transform reads the staging dataset, performs the second HTTP call, downloads the TAR, unpacks it, and parses each CAP XML inside into one row per active warning per area.
- **Why a Code Repository here:** Pipeline Builder is declarative and excellent for column-shape work, but it does not express *"unpack a TAR and walk an XML tree per entry"* cleanly. Keeping this transform in a Code Repository, narrowly scoped, is the right tradeoff. The transform implementation is described in prose in [`06_pipeline_design.md`](06_pipeline_design.md).
- **Authentication:** required.
  - `> ⚠️ TODO: register an AEMET OpenData API key (free, 3-month renewable). Sign-up: https://opendata.aemet.es/centrodedescargas/altaUsuario`
  - A calendar reminder to renew the AEMET key every 90 days is part of the runbook.
- **Raw dataset:** `raw/aemet/cap_warnings_v0` (with a `raw/aemet/cap_metadata_v0` staging dataset for the first call's metadata wrapper).
  - `> ⚠️ TODO: record the actual Foundry RID once created.`
- **Rough time:** one to one-and-a-half working days, mostly the CAP parser. CAP is a rich ITU/OASIS schema and the parser must preserve the AEMET severity / certainty / urgency labels verbatim (see [`06_pipeline_design.md`](06_pipeline_design.md)).

## OpenSky — ADS-B state vectors

- **Connector:** Foundry Data Connection HTTP source.
- **Endpoint:** `https://opensky-network.org/api/states/all` with the Spanish bbox parameters `lamin=27.0`, `lamax=44.0`, `lomin=-19.0`, `lomax=5.0`.
- **Schedule:** every 1–2 minutes **during demo windows only**. Outside demo windows the connector is paused — the PoC does not pretend to a 24/7 capture cadence and the anonymous rate limit would not support one.
- **Strategy — the bbox-snapshot strategy.** Each scheduled pull retrieves the full set of state vectors currently visible inside the Spanish bbox; the downstream pipeline treats each row as an **observation at the pull timestamp**, not as a continuous track. There is no per-aircraft trajectory reconstruction.
- **Rate-limit constraint and recommendation.** OpenSky's anonymous tier limits both cadence and bbox query frequency. The author should sign up for a free OpenSky account before the demo to raise the limit; without it, the demo-window cadence may have to drop below the 1–2-minute target.
- **Raw dataset:** `raw/opensky/states_v0`
  - `> ⚠️ TODO: record the actual Foundry RID once created.`
- **Rough time:** half a working day for the connector plus the account signup.

## AISStream — AIS positions (WebSocket bridge)

This is the source that does NOT fit the HTTP-first connector model. The pragmatic pattern is an **external WebSocket bridge**.

- **Connector:** Foundry HTTP **ingest endpoint** (the inbound counterpart of the HTTP source), fed by a small bridging process running outside Foundry.
- **External bridge — what it does:** a small process (a single-file Python or Node service running on the author's workstation, a cheap VM, or a container) opens the WebSocket `wss://stream.aisstream.io/v0/stream`, sends the subscribe message documented in [`04_data_sources.md`](04_data_sources.md), buffers incoming JSON messages, and **POSTs batched messages to a Foundry HTTP ingest endpoint every N seconds** (N = 30 is a reasonable starting point). Batching is essential — per-message POSTs would create a row-storm.
- **Schedule:** the bridge runs only during demo windows. There is no historical archive on the AISStream free tier, so capture is bounded to what the bridge collects while it is running.
- **Why a bridge rather than a Foundry-native WebSocket connector:**
  - `> ⚠️ VERIFY: confirm whether Foundry's Data Connection has a native WebSocket source on the demo plan. If not, use the external bridge described above. Reference the Foundry-capability uncertainty list in the canonical-decisions document.`
- **What the bridge is NOT:** the bridge is not an opportunity to enrich, filter, or model the data. It validates the JSON shape, attaches a receipt timestamp, batches, and POSTs. All semantic work happens inside Foundry. Keeping the bridge dumb keeps the auditable surface inside Foundry.
- **Raw dataset:** `raw/aisstream/positions_v0`
  - `> ⚠️ TODO: record the actual Foundry RID once created.`
- **Rough time:** one to one-and-a-half working days — the WebSocket-to-HTTP bridge is small but the operational fiddliness (reconnect logic, key rotation, batching window tuning) eats time.

## Ingestion sequence — recommended order

1. **NVD first.** Simplest source. JSON over REST, no archive unpacking, public-domain licence. Proves the HTTP-source pattern on the tenancy. ~½ day.
2. **IGN next.** Same HTTP-source pattern, slightly more awkward because of the Liferay-portlet URL instability. Forces the author to write the manual-fallback runbook early, while there is still time to do it properly. ~½ day.
3. **AEMET third.** Introduces the two-step metadata-then-`datos` flow and the first Code Repository transform (TAR unpack + CAP XML parse). Doing AEMET after NVD and IGN means the two simpler sources are already feeding the substrate when the author starts wrestling with CAP. ~1 to 1½ days.
4. **OpenSky fourth.** Reuses the HTTP-source pattern but adds the rate-limit-aware sampling discipline and the demo-window-only schedule. ~½ day.
5. **AISStream last.** The external WebSocket bridge is the most fiddly part of the ingestion plan and should be tackled when every other source is already landing — that way the author is not blocked from progressing on pipelines, ontology, or Workshop work while the bridge is being shaken out. ~1 to 1½ days.

Total realistic ingestion-and-raw-landing budget: **~4 working days part-time**, matching the estimate in [`00_README.md`](00_README.md).

> 🎯 FRAMING: Even the streams that carry per-vessel and per-aircraft identifiers (AISStream MMSIs, OpenSky `icao24`) are ingested with the discipline that those identifiers are **aggregated to context** before they reach any surface a user touches. The raw datasets retain them for traceability and audit; the normalization step in [`06_pipeline_design.md`](06_pipeline_design.md) filters them out so they never appear in the clean event datasets, the Ontology, the Workshop, or the AIP Agent's tool scope. The bridge does not pre-filter — semantic work happens inside Foundry where it can be reviewed.

## Where to go next

- [`06_pipeline_design.md`](06_pipeline_design.md) — the normalization transforms that turn raw payloads into the unified event schema.
- [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md) — H3 bucketing, time windows, density rollups.
- [`08_ontology_design.md`](08_ontology_design.md) — how the clean event datasets become Ontology objects.
