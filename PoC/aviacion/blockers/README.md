# PoC blockers — Foundry-native parity references

> Date: 2026-05-20 (inventory frozen) — Phase 1 closure landed on the same
> date and shifted the actual severity of B01/B02/B04/B06; see the
> per-blocker *Status as of 2026-05-20* sections and the **Current
> severity** column in the index table below.
>
> Each blocker below is a service-level gap that prevents the
> Aviation/MRO PoC ([../README.md](../README.md)) from being executed
> end-to-end against the Foundry-native contract
> ([../00-contrato-foundry-native.md](../00-contrato-foundry-native.md)).
> The earliest entries (severity in the original inventory) are kept for
> traceability; the platform-level work has progressed since and the
> *current* severity is what an executing agent should plan against.

This folder gives an AI agent — or a senior engineer — a **single jump-off
point per blocker** that combines:

1. The exact OpenFoundry service and launcher app affected
   ([../../docs/reference/launcher-app-mapping.md](../../../docs/reference/launcher-app-mapping.md)).
2. The PoC act(s) that break because of it
   ([../11-guion-demo.md](../11-guion-demo.md)).
3. The existing OpenFoundry 1-to-1 parity checklist for the area
   ([../../docs/migration/](../../../docs/migration/)).
4. **The public Palantir Foundry documentation** that defines the target
   behavior, both as live URLs *and* as locally scraped Markdown + full-page
   screenshots (so the agent can `Read` the PNGs and the MD without network).
5. The acceptance criteria the OpenFoundry implementation must satisfy
   to unblock the PoC.

Parity scope is governed by
[../../docs/reference/foundry-public-docs-parity-policy.md](../../../docs/reference/foundry-public-docs-parity-policy.md):
public docs are reference material, not copy-paste source.

---

## How the scraped material is generated

The scraper at [../../docs_original_palantir_foundry/scraper.py](../../../docs_original_palantir_foundry/scraper.py)
accepts a `--seed-urls` flag (added 2026-05-20) so we can mirror **only** the
pages relevant to these blockers, instead of the whole Foundry docs tree.

```sh
# 1. Install deps once
pip install playwright requests beautifulsoup4 markdownify
playwright install chromium

# 2. Mirror only the URLs listed in seed-urls.txt (~30-50 pages, 5-10 min)
python docs_original_palantir_foundry/scraper.py \
  --output docs_original_palantir_foundry/foundry-docs \
  --seed-urls PoC/blockers/seed-urls.txt \
  --workers 4 \
  --delay 1.0
```

Output layout (all paths in B0X files use this convention):

```
docs_original_palantir_foundry/foundry-docs/
  Seed URLs/
    Workshop/
      Overview.md
      Overview.screenshot.png            ← full-page PNG (Read-able by AI)
      Overview_assets/                   ← inline images of the page
        img_001.png
        …
    Ontology Manager/
      Overview.md
      Overview.screenshot.png
    …
  README.md                              ← auto-generated index
```

If a B0X file references a path that does not yet exist on disk, it means the
scraper has not been run with the latest `seed-urls.txt`. Re-run the command
above and the paths will resolve.

---

## Blocker index

| ID | Title | OpenFoundry service | Launcher app(s) | PoC act(s) | 1-to-1 checklist | Original severity | Current severity (post 2026-05-20) |
|---|---|---|---|---|---|---|---|
| [B01](B01-workshop-backend.md) | Workshop backend (app composition) is a stub | `application-composition-service` | #28 Workshop (`/apps`) | Act 4 | [foundry-workshop-pipeline-1to1-checklist.md](../../../docs/migration/foundry-workshop-pipeline-1to1-checklist.md) | Critical | **Medium** — platform durable storage, publish lifecycle and `?branch=` shipped (`apps` / `app_versions` tables, `PublishApp` endpoint, migration `20260520120000_app_branches.sql`); remaining gaps are AC#6 action-button → action-type wiring and AC#7 aviation demo module. See the *Status as of 2026-05-20* section inside [B01](B01-workshop-backend.md). |
| [B02](B02-ontology-definition.md) | Ontology definition + outbox events on the data bus | `ontology-definition-service` (+ `ontology-actions-service`) | #2 Ontology Manager (`/ontology-manager`) | Act 2 | [foundry-ontology-manager-object-views-1to1-checklist.md](../../../docs/migration/foundry-ontology-manager-object-views-1to1-checklist.md) | Critical | **✅ Closed (Phase 1)** — 9/9 acceptance criteria done: outbox table `0008_ontology_schema_outbox.sql`, 12 outbox sites in `batch_save.go`, Debezium connector wired, action-type CRUD lifted, integration tests pass. See *Status as of 2026-05-20 (Phase 1 closure)* in [B02](B02-ontology-definition.md). |
| [B03](B03-ontology-indexer.md) | Ontology indexer is a stub | `ontology-indexer` | #2 Ontology Manager → "Ontology Indexing" tab, impacts #3 Object Explorer | Act 2, Act 4 | [foundry-ontology-manager-object-views-1to1-checklist.md](../../../docs/migration/foundry-ontology-manager-object-views-1to1-checklist.md) | High | **High** — producer side done platform-wide; read path (`POST /ontology/search` + Workshop pushdown + indexing status surface) still missing. Geopolitics PoC tracks this at ~25 % PoC readiness; aviation tolerates more degradation, urbana fits in Postgres + pgvector. |
| [B04](B04-llm-catalog.md) | LLM catalog service is a stub | `llm-catalog-service` | #27 Model Catalog (`/model-catalog`), feeds #19-#26 AI family | Act 5 | [foundry-aip-document-analyst-catalog-1to1-checklist.md](../../../docs/migration/foundry-aip-document-analyst-catalog-1to1-checklist.md) | Critical | **✅ Closed** — 6/6 acceptance criteria done: quotas + features migration, provider Prober (Ollama/OpenAI/Azure/Anthropic), `LlmCatalogPage`, `ChatbotModelPicker`, edge-gateway routing. See *Status as of 2026-05-20* in [B04](B04-llm-catalog.md). |
| [B05](B05-notifications.md) | Notification & alerting service is a stub | `notification-alerting-service` | Cross-cutting: #36 Operational Rules, #37 Dynamic Schedules, #38 Approvals | Act 5, Act 6 | [foundry-automate-rules-1to1-checklist.md](../../../docs/migration/foundry-automate-rules-1to1-checklist.md) | High | High (unchanged in this snapshot — no Phase 1 *Status* section). |
| [B06](B06-iceberg-e2e.md) | Iceberg end-to-end is in Phase A/B | `pipeline-runtime` lib + `iceberg-catalog-service` + `pipeline-runner-spark` | #5 Pipeline Builder (`/pipelines`), Iceberg Tables tab, #7 Data Lineage | Act 1, Act 3 | [foundry-workshop-pipeline-1to1-checklist.md](../../../docs/migration/foundry-workshop-pipeline-1to1-checklist.md) | High | **✅ Mostly closed** — AC#1/#2/#3/#5 done (`IcebergHTTPWriter`, `IcebergHTTPReader`, `LineageWriter`, `iceberg_table_rows` table + `InsertRowsForSnapshot`, `dataset_health_events` + `CheckEventsPanel`). AC#4 (Spark transactional read/write) and AC#6 (≤90 s cold-time benchmark) explicitly *out of scope* of this commit. See *Status as of 2026-05-20* in [B06](B06-iceberg-e2e.md). |
| [B07](B07-agent-runtime-tool-routing.md) | Agent runtime is partial: tool routing depends on stub ontology | `agent-runtime-service` + `retrieval-context-service` | #20 AI Assist, #21 AI Analyst, #22 AI Threads, #26 AI Operator | Act 5 | [foundry-aip-agents-threads-assist-1to1-checklist.md](../../../docs/migration/foundry-aip-agents-threads-assist-1to1-checklist.md) | Critical | Critical (unchanged in this snapshot — no Phase 1 *Status* section). |

Severity legend:

- **Critical** — the PoC narrative cannot continue past this gap.
- **High** — the gap can be worked around with degraded behavior but the
  "Foundry-native" claim breaks.
- **Medium** — platform-level work landed; only PoC-specific content
  (demo module authoring, last-mile wiring) is still outstanding.
- **✅ Closed** — every acceptance criterion the file lists is done and
  the *Status as of …* section enumerates the supporting evidence.

The *Original severity* column is the inventory at the time this folder
was first written; the *Current severity (post 2026-05-20)* column is
what an executing agent should plan against. When a B0X file does not
have a *Status as of …* section the two columns agree.

---

## How to use one of these files (AI-agent contract)

When an agent is asked to *implement* or *audit* a blocker, the expected loop
is:

1. **Read the B0X file** for the high-level mapping (service ↔ app ↔ act ↔ checklist).
2. **Read the locally scraped MD and PNG** referenced under "Palantir
   reference" — the PNGs are full-page screenshots and are loadable by the
   `Read` tool. Use them to understand the *visual* shape of the feature, not
   just the text behavior.
3. **Cross-check the existing 1-to-1 checklist** for already-tracked items
   inside the parity matrix.
4. **Compare against the OpenFoundry source paths** under "Current OpenFoundry
   surface" to see what is wired vs. what is a stub.
5. **Implement only against the acceptance criteria** at the bottom of the
   file — those are the demo-blocking requirements, not a wish list.

If the agent finds that the live Palantir page has drifted from the locally
scraped copy, the canonical action is to re-run the scraper against
`seed-urls.txt`, not to silently update the B0X file.
