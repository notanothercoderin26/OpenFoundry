# Data Sources

One section per public source the PoC ingests, with the verified URL, licence, cadence, format, schema highlights, known limitations, and the citation requirement. The order matches the ingestion order recommended in [`05_ingestion_plan.md`](05_ingestion_plan.md), with the simplest sources first.

## 1. IGN — Spanish seismic catalogue

- **Authority:** Instituto Geográfico Nacional (IGN), Spain.
- **URL:** `https://www.ign.es/web/sis-catalogo-terremotos`
- **Access:** public web form with CSV export. No API key.
- **Update frequency / latency:** events typically published within ~1 hour of occurrence.
- **Format / volume:** CSV. PoC scope is tens to low hundreds of events per month for Spain and nearby areas (Maghreb, Atlantic, Western Mediterranean).
- **Schema highlights the PoC depends on:** event id, datetime (UTC), latitude, longitude, depth (km), magnitude (Mw or mbLg), max observed intensity (EMS-98), location text.
- **Known limitations:** the CSV export endpoint is a **Liferay portlet, not a stable API**. URL parameters may change without notice between catalogue revisions. The pragmatic fallback is a manual CSV download from the web form, uploaded into the raw dataset on a documented cadence. See the manual-fallback note in [`05_ingestion_plan.md`](05_ingestion_plan.md).
- **Citation / attribution:** Instituto Geográfico Nacional, DOI `10.7419/162.03.2022`.

## 2. AEMET CAP warnings

- **Authority:** Agencia Estatal de Meteorología (AEMET), Spain.
- **Key signup URL:** `https://opendata.aemet.es/centrodedescargas/altaUsuario`
- **API base:** `https://opendata.aemet.es/opendata/api/`
- **Key warning endpoint:** `/avisos_cap/ultimoelaborado/area/esp`
- **Access pattern — the two-step metadata-then-`datos` flow.** AEMET OpenData does not return the payload directly. The first call to the warning endpoint returns a JSON metadata wrapper containing a `datos` URL (and sometimes a `metadatos` URL). The client then issues a second GET to the `datos` URL to retrieve the actual payload. This two-step is mandatory; any ingestion plan that hits only the first URL gets metadata, not warnings.
- **Format / volume:** the `datos` URL returns a **TAR archive of CAP-format XML files** (Common Alerting Protocol — ITU/OASIS XML standard). One CAP XML per warning per affected area. PoC scope is on the order of tens of active warnings per day across the Spanish territory, with steep spikes during severe-weather episodes.
- **Update frequency / latency:** the warning bulletin is rebuilt every 15–30 minutes; new warnings can appear at any time during a severe-weather episode.
- **Schema highlights the PoC depends on:** the CAP fields `identifier`, `sender`, `sent`, `status`, `msgType`, `scope`, and per `info` block `category`, `event`, `urgency`, `severity`, `certainty`, `effective`, `onset`, `expires`, `senderName`, `headline`, `description`, `instruction`, plus the `area` block with `areaDesc`, `geocode`, and either `polygon` or `circle`. The CAP severity / certainty / urgency labels are AEMET's authoritative vocabulary and **must not be paraphrased** — they pass through unchanged into the unified event row's `payload_json` and the Workshop displays them verbatim. See [`06_pipeline_design.md`](06_pipeline_design.md).
- **Known limitations:** Spanish territory only. The TAR-of-CAP structure forces a Code Repository transform for unpacking and XML parsing (see [`05_ingestion_plan.md`](05_ingestion_plan.md)). CAP supports multiple `info` blocks per alert (different languages, different audiences); the parser keeps one row per `info` × `area`.
- **Licence:** free use under AEMET resolution published in the **BOE de 5 de enero de 2016**.
- **Authentication:** free API key, **3-month validity, renewable**.

## 3. NVD — National Vulnerability Database (CVEs)

- **Authority:** NIST National Vulnerability Database (US government).
- **API base:** `https://services.nvd.nist.gov/rest/json/cves/2.0`
- **Authentication:** optional API key recommended to raise rate limits. Sign-up: `https://nvd.nist.gov/developers/request-an-api-key`.
- **Update frequency / latency:** continuous publication; delta loads with `pubStartDate` / `pubEndDate` on a daily cadence are sufficient for the PoC.
- **Format / volume:** JSON. ~351,000+ CVEs total; ~50–150 new per week at CRITICAL severity. PoC initial backfill is bounded to a recent window (e.g. last 12 months at CRITICAL + HIGH); steady state is the daily delta.
- **Relevant filters the PoC uses:** `cvssV3Severity` (CRITICAL / HIGH / MEDIUM / LOW), `pubStartDate`, `pubEndDate`, `cpeName` for vendor/product narrowing.
- **Schema highlights the PoC depends on:** CVE id, CVSS v2 / v3 metric vectors and severity, description text (multiple languages where present), CWE references, affected CPE products, and the **CISA known-exploited flag** (`cisaExploitAdd`, `cisaActionDue`, `cisaRequiredAction`, `cisaVulnerabilityName`). The known-exploited flag drives the severity bump documented in [`06_pipeline_design.md`](06_pipeline_design.md).
- **Known limitations:** CPE vendor/product mapping is noisy (multiple CPEs per CVE, multiple versions per CPE). Geographic placement of a CVE is synthetic — a CVE does not have coordinates — and is handled in fusion ([`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md)) as a nation-wide event with no point geometry.
- **Licence:** public domain (US government work).

## 4. OpenSky Network — Aircraft state vectors (ADS-B)

- **Authority:** OpenSky Network (research consortium).
- **REST API:** `https://opensky-network.org/api/states/all` with bounding-box parameters `lamin`, `lamax`, `lomin`, `lomax`.
- **Authentication:** anonymous access is heavily rate-limited; an OpenSky account raises the limit and is recommended.
- **Update frequency / latency:** state vectors update every 5–10 seconds upstream; the PoC samples at the rate the rate limit allows during demo windows.
- **Format / volume:** JSON snapshots of state vectors inside a bbox. PoC scope is snapshots captured during demo windows over the Spanish bbox `lat [27.0, 44.0], lon [-19.0, 5.0]`. Volume is bounded by sampling cadence, not by upstream firehose.
- **Schema highlights the PoC depends on:** `icao24`, `callsign`, `origin_country`, `time_position`, `last_contact`, `longitude`, `latitude`, `baro_altitude`, `on_ground`, `velocity`, `true_track`, `geo_altitude`, `squawk`. The PoC retains `icao24` only inside the raw dataset; it is aggregated out before the clean event layer (see [`06_pipeline_design.md`](06_pipeline_design.md)).
- **Known limitations:**
  - Anonymous rate limit caps polling cadence; without an account the PoC cannot poll faster than the documented anonymous tier.
  - Some aircraft opt out and are filtered upstream by OpenSky.
  - Mode-S-only aircraft transmit no position.
  - **Academic-bulk-historical access via Trino requires an academic-affiliation application that the PoC author does NOT have.** The PoC relies on the REST API and the streaming snapshots captured during execution.
- **Citation / attribution:** Schäfer et al., "Bringing Up OpenSky," IPSN 2014.

## 5. AISStream.io — Maritime AIS positions (WebSocket)

- **Authority:** AISStream.io (community AIS aggregator).
- **Endpoint:** `wss://stream.aisstream.io/v0/stream`
- **Authentication:** free API key via GitHub sign-in.
- **Protocol:** WebSocket. The client opens the connection and sends a JSON subscribe message; the server pushes messages from then on. The subscribe message structure used by the PoC is exactly:

```json
{
  "APIKey": "<aisstream-api-key>",
  "BoundingBoxes": [[[35.0, -10.0], [44.0, 5.0]]],
  "FilterMessageTypes": ["PositionReport"],
  "FiltersShipMMSI": []
}
```

The bounding box `[[35.0, -10.0], [44.0, 5.0]]` covers **Iberian waters** (southwestern corner south of the Strait of Gibraltar, northeastern corner north of the Balearics). `FilterMessageTypes` constrains the firehose to position reports for the PoC. `FiltersShipMMSI` is left empty deliberately — the PoC does not target named vessels (see the framing callout below).

- **Format / volume:** JSON messages, streamed in real time. Volume depends on traffic density in the bbox; expect bursty rates during daylight hours in shipping lanes.
- **Update frequency / latency:** real-time, push.
- **Schema highlights the PoC depends on:** `MetaData` (timestamp, `MMSI`, `ShipName`, `latitude`, `longitude`), and the `PositionReport` body (course, speed, heading, navigation status). As with OpenSky, the `MMSI` and `ShipName` fields are retained only in the raw dataset and are aggregated out before the clean event layer.
- **Known limitations:** real-time only; **no historical archive on the free tier**. The PoC captures only what is observed during demo windows. Some vessels deliberately turn off AIS; the Workshop must not present absence-of-signal as evidence of anything.
- **Licence:** AISStream terms of use; non-commercial use accepted without payment.

## Sources deliberately excluded from v1

> 🎯 FRAMING: The asset-level critical-infrastructure exclusion below is **non-negotiable**. v2 does NOT change this. v2 adds **operator-reported events** (an outage, a flow change, a runway closure) onto the same event-centric substrate — never an inventory of named operator-owned assets. See [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md).

- **REE / ESIOS — Spanish electricity system operator.** Excluded from v1 because the open data is gated behind an email-based token issuance with manual friction not worth the four-week budget, and because the data is operational time series (demand, generation, prices) rather than geo-fine event observations. Deferred to v2 as an operator-event source under proper governance.
- **ENAGAS — Spanish gas transmission system operator.** Excluded from v1 because their public interactive map of flows does not expose a structured open API. Deferred to v2.
- **Asset-level critical-infrastructure inventory.** Excluded by design, not by feasibility. Spain does not openly publish a geo-fine inventory of named operator-owned critical infrastructure, and even where partial inventories exist, the PoC would refuse to ingest them. The unit of analysis is the **event**, not the asset; spatial context is generic (admin boundaries, coastline, population centres from INE). See [`02_framing_and_honest_limits.md`](02_framing_and_honest_limits.md) — this is a framing decision, not a data-availability decision.

## Where to go next

- [`05_ingestion_plan.md`](05_ingestion_plan.md) — per-source Foundry ingestion approach.
- [`06_pipeline_design.md`](06_pipeline_design.md) — normalization transforms and the severity-mapping rules.
- [`07_temporal_spatial_fusion.md`](07_temporal_spatial_fusion.md) — how heterogeneous events become one substrate.
