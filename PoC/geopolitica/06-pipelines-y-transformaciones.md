# 06 — Pipelines and transformations

> All pipelines must be authored and visible as Foundry **Pipeline Builder** transforms (or **Code Repositories** transforms where SQL is more natural). The DAG must be visible to the customer; failed runs surface in **Data Health**; lineage propagates to the ontology. OpenFoundry implementation lives in `pipeline-build-service` + `pipeline-runner-spark` + `pipeline-expression` library.

This file lists every pipeline node, its inputs, outputs, schedule, and the Data Health checks that must pass before the dataset is considered production-ready.

---

## 🗺️ DAG overview (bronze → silver → gold → ontology)

```
                       RAW                      STAGING                         CURATED                  ONTOLOGY (materialized views)
┌─────────────────────────────────┐   ┌────────────────────────────┐   ┌─────────────────────────┐   ┌────────────────────────────┐
│ raw.gdelt.events                │──▶│ stg.gdelt.events           │──▶│ curated.event           │──▶│ Event object backing      │
│ raw.gdelt.gkg                   │──▶│ stg.gdelt.gkg              │──▶│ curated.news_article    │──▶│ NewsArticle object         │
│ raw.acled                       │──▶│ stg.acled                  │──▶│ curated.event (union)   │──▶│                            │
│ raw.ofac_sdn                    │──▶│ stg.sanctions.ofac         │──┐                                                          
│ raw.eu_sanctions                │──▶│ stg.sanctions.eu           │──┤                                                          
│ raw.opensanctions               │──▶│ stg.sanctions.opensanctions│──┴─▶ curated.sanctions_entry ─▶ SanctionsEntry              │
│ raw.wikidata                    │──▶│ stg.wikidata               │──┐                                                          
│ raw.synthetic.actor_tradecraft  │──▶│ stg.synthetic.tradecraft   │──┤                                                          
│ stg.gdelt.events.actors         │──┐                              ┌─┴─▶  ENTITY RESOLUTION  ──▶ curated.actor  ─▶ Actor / Person / Org
│ stg.acled.actors                │──┴──────────────────────────────┘                                                          
│ raw.gdelt + raw.acled locations │──▶│ stg.locations              │──▶│ curated.location, country│──▶ Location / Country       │
└─────────────────────────────────┘   └────────────────────────────┘   └─────────────────────────┘   └────────────────────────────┘
```

---

## 1️⃣ Bronze layer — raw → staging

| Pipeline | Inputs | Outputs | Schedule | Engine |
|---|---|---|---|---|
| `gdelt-event-decoder` | `raw.gdelt.events` (CSV) | `stg.gdelt.events` (Parquet, typed) | Streaming (15-min) | Spark structured streaming |
| `gdelt-gkg-decoder` | `raw.gdelt.gkg` | `stg.gdelt.gkg` | Streaming | Spark structured streaming |
| `acled-decoder` | `raw.acled` | `stg.acled` | Daily 03:00 UTC | Spark batch |
| `ofac-decoder` | `raw.ofac_sdn` (XML) | `stg.sanctions.ofac` | Daily 02:00 UTC | Spark batch |
| `eu-sanctions-decoder` | `raw.eu_sanctions` | `stg.sanctions.eu` | Daily 02:15 UTC | Spark batch |
| `opensanctions-decoder` | `raw.opensanctions` | `stg.sanctions.opensanctions` | Daily 02:30 UTC | Spark batch |
| `wikidata-decoder` | `raw.wikidata` | `stg.wikidata` | Weekly | Spark batch |
| `tradecraft-decoder` | `raw.synthetic.actor_tradecraft` | `stg.synthetic.tradecraft` | One-shot | Spark batch |

### Data Health checks (per bronze pipeline)
- **Schema check:** explicit Parquet schema versus a recorded baseline (`schema_version` column in the dataset metadata). Drift fails the run.
- **Freshness check:** the staging dataset must have a successful build in the last X hours (X = 1 h for streaming GDELT, 25 h for ACLED, 48 h for sanctions).
- **Row-count check:** ±50% vs the rolling 7-day median. Sudden 10× spikes or 10× drops fail the run (catches GDELT outages and ACLED publication holidays).
- **Null-rate check:** primary-key columns must be 0% null.

---

## 2️⃣ Silver layer — staging → curated

### `event-union-and-normalize`
- **Inputs:** `stg.gdelt.events`, `stg.acled`
- **Output:** `curated.event` (matches the `Event` ontology object).
- **Logic:**
  - Cast both sources into a unified schema (`event_id`, `source`, `event_datetime_utc`, `cameo_event_code`, `acled_event_type`, `actor1_id`, `actor2_id`, `location_id`, `country_iso2`, `fatalities`, `tone`, `goldstein_scale`, `source_url`).
  - Generate `event_id` = `"GDELT-<global_event_id>"` or `"ACLED-<data_id>"`.
  - Resolve `actor1_id` / `actor2_id` via a join with `curated.actor` (the ER output).
  - Resolve `location_id` via the `geocode-locations` transform output.
- **Schedule:** Streaming (15-min for GDELT segment), daily union with ACLED.
- **Health checks:** uniqueness of `event_id`; FK presence rate ≥ 95% for `actor1_id`; geocoder success rate ≥ 90%.

### `geocode-locations`
- **Inputs:** `stg.gdelt.events` (`ActionGeo_*` columns), `stg.acled` (`latitude`, `longitude`, `location` name).
- **Output:** `curated.location` and `curated.country`.
- **Logic:** dedupe by `(round(lat,2), round(lon,2), admin1_name)`; resolve `country_iso2` via OurAirports-style country file (also seeded into Wikidata Q-IDs).
- **Health checks:** every `Event` row's `location_id` resolves; ≥ 99.5% of locations have a non-null `country_iso2`.

### `sanctions-aggregator`
- **Inputs:** `stg.sanctions.ofac`, `stg.sanctions.eu`, `stg.sanctions.opensanctions`.
- **Output:** `curated.sanctions_entry` (matches `SanctionsEntry` ontology object).
- **Logic:** flatten each source into a common row schema (`entry_id`, `program`, `jurisdiction`, `listed_entity_name`, `listed_at`, `delisted_at`, `source_dataset`). Preserve source-row IDs in a `provenance` map.
- **Health checks:** OFAC entries from prior snapshot must be either still present or have `delisted_at` set; no silent drops.

### `news-article-projector`
- **Inputs:** `stg.gdelt.gkg`.
- **Output:** `curated.news_article` (matches `NewsArticle` ontology object).
- **Logic:** pick one row per `article_id`, parse `themes`, `tone`, `actors_mentioned` (V2 person, organization, location lists).
- **Health checks:** uniqueness of `article_id`; ≥ 95% rows have a non-null `outlet`.

### `actor-seed-extractor`
- **Inputs:** `stg.gdelt.events` (actor columns), `stg.acled` (actor1/2 columns), `stg.sanctions.*` (listed entity names + Q-IDs), `stg.wikidata`.
- **Output:** `stg.actor_seeds` — the input for entity resolution.
- **Logic:** union actor names + types + provenance source-row IDs; carry through Wikidata Q-IDs whenever present.

---

## 3️⃣ The headline transform: **entity resolution** for `Actor`

This transform is the **most important pipeline in the PoC**. It is the place where OpenFoundry has to show it can do the same thing a Foundry team would do: a versioned, lineage-aware, Data-Health-monitored ER step that produces the canonical `Actor` table.

> The match rules, merge strategy, and FusionJob configs are the declarative SOT in [`assets/er-rules-geopolitica.yaml`](assets/er-rules-geopolitica.yaml). The operator registers them via [`infra/scripts/poc-geopolitica/register-er-rules.sh`](../../infra/scripts/poc-geopolitica/register-er-rules.sh). Where the engine does not support a primitive the PoC narrative wants (e.g. `union_unique`, `weighted_average`), the YAML's `engine_mapping_notes` section documents the gap and the stand-in — that file wins on drift.

### Inputs
- `stg.actor_seeds`

### Output
- `curated.actor` (PK: `actor_id` — synthetic stable ID).

### Resolution strategy
1. **Blocking** by: normalized name prefix (3 chars), country (where known), and Wikidata Q-ID (exact when available).
2. **Pairwise scoring** within each block, using:
   - Jaro–Winkler name similarity.
   - Alias overlap (Jaccard).
   - Date-of-birth match (if both available; Wikidata + Sanctions).
   - Country match.
   - Wikidata Q-ID exact match (hard rule: if both rows have a Q-ID and they agree, score = 1.0; if they disagree, score = 0).
3. **Decision threshold:** ≥ 0.85 → merge; 0.65 ≤ score < 0.85 → flagged for manual review (becomes a Data Health warning, not a failure); < 0.65 → distinct actors.
4. **Provenance:** preserve `source_ids` as `map<source_dataset, source_row_id>` for every merged actor.

### Acceptance / Data Health checks
- **ER precision check:** on a fixed evaluation set of 500 hand-labeled pairs (committed under `tools/poc-geopolitica/eval/`), precision ≥ 0.95.
- **ER recall check:** on the same set, recall ≥ 0.90.
- **Provenance check:** for every row in `curated.actor`, the union of `source_ids.values()` must non-empty and each ID must resolve back to a row in the corresponding `stg.*` dataset (proves lineage is not lying).
- **Uniqueness check:** each input source-row ID appears in exactly one `actor_id`.

### Foundry-native exposure
In Workshop, the ER transform appears as a single node in the Pipeline Builder graph. Clicking it shows:
- Input / output dataset references.
- Last 5 builds with row counts.
- The 4 Data Health checks above, with current pass/fail state.
- A "View flagged pairs" deep-link to the `stg.actor_seeds_flagged` dataset for manual review.

> If any of those four checks is failing on the demo morning, the engineer must rollback to the last green build before the customer arrives. See [`12-checklist-preparacion.md`](12-checklist-preparacion.md).

---

## 4️⃣ Gold / ontology materialization

| Pipeline | Inputs | Outputs | Notes |
|---|---|---|---|
| `actor-gold` | `curated.actor`, `stg.synthetic.tradecraft`, `curated.sanctions_entry` | `ontology.actor` (materialized for `object-database-service`) | Computes `is_sanctioned` (any `SANCTIONED_BY` link), `event_count_30d`, `last_seen_at_utc`. |
| `event-gold` | `curated.event` | `ontology.event` | Joins location + country labels. |
| `link.mentioned_in` | `curated.news_article`, `stg.gdelt.gkg` | `ontology.link.mentioned_in` | Per-link-type materialization. |
| `link.involved_in` | `curated.event` | `ontology.link.involved_in` | |
| `link.sanctioned_by` | `curated.sanctions_entry` | `ontology.link.sanctioned_by` | |
| `link.member_of` | `stg.wikidata`, `stg.sanctions.*` | `ontology.link.member_of` | |
| `link.associated_with` | `ontology.link.mentioned_in`, `ontology.link.involved_in` | `ontology.link.associated_with` | **Computed link type** — co-occurrence ≥ 3 in last 30 days. |

---

## 5️⃣ Streaming details (GDELT 15-min drop)

The streaming path is the one that lets the demo say *"new events are landing while we talk"*.

```
gdelt-live (connector) ──▶ Kafka topic gdelt.events.live ──▶ gdelt-event-decoder (Spark structured streaming)
                                                                       │
                                                                       ▼
                                                      stg.gdelt.events (Iceberg append every 15 min)
                                                                       │
                                                                       ▼
                                            event-union-and-normalize (incremental, every 15 min)
                                                                       │
                                                                       ▼
                                                            curated.event (Iceberg append)
                                                                       │
                                                                       ▼
                                                  event-gold (incremental projection to ontology)
                                                                       │
                                                                       ▼
                                                          Workshop map + timeline refresh
```

End-to-end target: **< 10 min** from a GDELT drop to a visible new dot on the map. This is the bound we put on the demo KPI panel; if we miss it, we say so explicitly.

---

## 6️⃣ Lineage propagation

`lineage-service` consumes the build events from each pipeline and emits Foundry-style lineage edges. By acceptance, the customer can click in Workshop on the `Event` object type → "Show lineage" → see the chain `event-gold ← event-union-and-normalize ← {gdelt-event-decoder, acled-decoder} ← {raw.gdelt.events, raw.acled}`. The same path works from `Actor.is_sanctioned` back to the three sanctions sources via `actor-gold ← actor (ER) ← sanctions-aggregator ← {raw.ofac_sdn, raw.eu_sanctions, raw.opensanctions}`.

---

## 7️⃣ Branch-aware execution (UC-6)

When a Global Branch is created (e.g. `sanctions-extension-2026Q3`), the pipeline service must:
1. Materialize branched outputs **only** for downstream nodes the branch touches (in our case: `sanctions-aggregator`, `actor-gold`, `link.sanctioned_by`).
2. Leave all other datasets reading from `main`.
3. Expose a branch-aware view to Workshop so the same module shows the branched object set side by side with `main`.

This is the OpenFoundry implementation target of the [`Global Branching`](https://www.palantir.com/docs/foundry/foundry-branching/overview/) Foundry capability.

---

## ✅ Concrete actions (when the PoC is executed)

1. Author each pipeline as a transform in `pipeline-build-service` (Pipeline Builder UI) or as a Code Repositories Spark transform; commit the YAML/SQL under `tools/poc-geopolitica/pipelines/`.
2. Schedule per the table above.
3. Wire Data Health checks; confirm all check IDs appear in `telemetry-governance-service`.
4. Manually hand-label the 500-pair ER evaluation set; commit under `tools/poc-geopolitica/eval/er_pairs.csv` (do **not** include real PII beyond the public sanctions / Wikidata layer).
5. Run a full bronze→gold build; confirm row counts hit the KPIs in [`01-vision-y-caso-de-uso.md`](01-vision-y-caso-de-uso.md).
6. Capture lineage screenshots for the demo backup deck (plan B).
