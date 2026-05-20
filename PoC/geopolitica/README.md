# 🌍 OpenFoundry PoC — Geopolitical intelligence network

> **Status:** documentation ready. The PoC **is not being executed yet** — we are waiting for the OpenFoundry MVP to reach a viable level. The PoC is governed by the Foundry-native contract in [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md): user-visible behavior must match how the workflow would be built in Palantir Foundry.
>
> **Chosen vertical:** Geopolitical intelligence — actors (persons, organizations, armed groups), events (CAMEO-coded incidents, conflicts, protests, media coverage), locations, and sanctions/PEP enrichment.
>
> **Target customer:** a national intelligence agency, a sanctions/financial-intelligence unit (FIU), a defense analyst team, or an NGO conflict-monitoring desk that already recognizes the "Foundry / Gotham" use case and wants an open-source, self-hosted alternative with a clear migration path from public to classified data.

---

## 🎯 PoC objective

Demonstrate to a customer, in a **45–60 minute** session, that OpenFoundry can:

1. **Ingest** heterogeneous open-source data (GDELT, ACLED, OFAC SDN, EU Consolidated, OpenSanctions, Wikidata) as Foundry Data Connection syncs into raw datasets.
2. **Model** a geopolitical operational ontology (`Actor`, `Person`, `Organization`, `ArmedGroup`, `Event`, `Location`, `Country`, `NewsArticle`, `SanctionsEntry`, `Watchlist`) with resolved entities and link types.
3. **Build** versioned bronze→silver→gold pipelines with end-to-end **lineage**, entity-resolution joins, and automated **Data Health** checks.
4. **Visualize** the operational picture in a *Workshop* module that combines map, timeline, object table and **graph (link analysis)** widgets.
5. **Reason with AI** through an AIP Chatbot that answers questions over the ontology (e.g. *"Summarize activity of OFAC-listed entities in eastern Ukraine in the last 72 h"*).
6. **Coordinate** through Action Types: from an insight, create a `Watchlist` entry, raise an `ActorAlert`, or open an `InvestigationCase` with SLA + notification side effect.
7. **Govern** with role-based access, markings/policies, Action Log audit, and Global Branching for "what-if" scenarios (e.g. *"preview what changes if we add 12 new entities to a sanctions list"*).

The **single message** for the customer: *"in two weeks I modeled an ontology that tomorrow accepts your internal classified feeds without rewriting anything — what you are seeing on public data is the same Data Connection → Dataset → Pipeline → Ontology → Action → Workshop → AIP loop a Foundry team would assemble. The investment is in the model and the governance, not in the visualization."*

> The visualization is not what we sell. **Ontology + lineage + governance** is what we sell.

---

## 📚 Document index

| # | Document | Purpose |
|---|---|---|
| 00 | [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md) | Non-negotiable Foundry-native parity contract, public documentation baseline, gaps, and OpenFoundry code adaptation checklist |
| 01 | [`01-vision-y-caso-de-uso.md`](01-vision-y-caso-de-uso.md) | Vertical, personas, business KPIs, scope |
| 02 | [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md) | Which microservices to spin up from the 50 current service directories (~16 subset; see [`docs/reference/repository-layout.md`](../../docs/reference/repository-layout.md)) |
| 03 | [`03-datasets-y-fuentes-de-datos.md`](03-datasets-y-fuentes-de-datos.md) | How to obtain ≥ 1 TB of real, legal public-intelligence data |
| 04 | [`04-infraestructura-y-despliegue.md`](04-infraestructura-y-despliegue.md) | Hardware, cloud, deployment with compose/k8s, air-gapped variant |
| 05 | [`05-ontologia-geopolitica.md`](05-ontologia-geopolitica.md) | Entities, properties, relationships, actions, link analysis |
| 06 | [`06-pipelines-y-transformaciones.md`](06-pipelines-y-transformaciones.md) | Batch + streaming pipelines, entity resolution, quality, lineage |
| 07 | [`07-dashboards-y-app-workshop.md`](07-dashboards-y-app-workshop.md) | UI: operations dashboard + analyst Workshop app (map + timeline + graph) |
| 08 | [`08-aip-copiloto-prompts.md`](08-aip-copiloto-prompts.md) | Exact copilot prompts and *system prompts* for the analyst agent |
| 09 | [`09-workflows-y-acciones.md`](09-workflows-y-acciones.md) | Watchlist, alerts, investigation case workflow, notifications |
| 10 | [`10-seguridad-y-gobierno.md`](10-seguridad-y-gobierno.md) | RBAC/ABAC, markings, audit, branches, retention, "public → classified" migration |
| 11 | [`11-guion-demo.md`](11-guion-demo.md) | Minute-by-minute script for the customer session |
| 12 | [`12-checklist-preparacion.md`](12-checklist-preparacion.md) | Actionable checklist at T-30, T-7, T-1, T-0 |
| 13 | [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md) | Risks, possible failures, recorded plan B |
| — | [`blockers/`](blockers/) | Per-vertical delta on the platform-level blockers tracked under [`../aviacion/blockers/`](../aviacion/blockers/). Currently: [B02 — ontology definition + outbox](blockers/B02-ontology-definition.md). |

---

## 🧭 How to use this documentation

1. **When the MVP is ready**, read [`00-contrato-foundry-native.md`](00-contrato-foundry-native.md) first, then the documents in order 01 → 13.
2. Each document is **self-contained** and has a "Concrete actions" section at the end.
3. The **literal prompts** for the copilot, the pipelines, and the service `curl` calls are in copy-paste code blocks.
4. Before the demo, fully complete [`12-checklist-preparacion.md`](12-checklist-preparacion.md).
5. If something fails live, follow [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md).

---

## ⏱️ Effort estimate (indicative, depends on the MVP)

| Block | Effort |
|---|---|
| Infra provisioning, public-source registration (OpenSanctions/ACLED), dataset download | 4–6 days |
| Modeling the ontology and loading data through pipelines (entity resolution is the long pole) | 6–9 days |
| Building the Workshop app (map + timeline + **graph** + object table) | 4–6 days |
| Integrating the AIP Chatbot and validating prompts | 3 days |
| End-to-end rehearsals + plan B recording | 2 days |
| **Realistic total** | **~3.5–4 weeks** of focused work by 1 senior engineer (graph + entity resolution adds ~1 week vs. aviation) |

---

## 📌 Decisions already made

- **Vertical:** Geopolitical intelligence / sanctions monitoring / conflict observation (analogous to Foundry/Gotham deployments at intelligence and defense customers).
- **Data:** combination of fully-public, attribution-friendly sources (**GDELT 2.0**, **ACLED**, **OFAC SDN**, **EU Consolidated Sanctions**, **OpenSanctions**, **Wikidata**) + deterministic synthetic enrichment for tradecraft-style fields.
- **Target volume:** 1.0–1.3 TB in object storage, ~3 billion analyzable rows (GDELT events alone exceed 1 B records).
- **Storage:** S3-compatible (MinIO locally, S3 in cloud), **Apache Iceberg** over Parquet, partitioned by event date.
- **Compute:** Spark 3.5 or Apache DataFusion for batch; Kafka/Redpanda for the GDELT 15-minute drop stream + sanctions delta polling.
- **Copilot LLM:** two modes — **Ollama (Llama 3.1 70B)** local for offline / air-gapped demo, **Azure OpenAI GPT-4o** for online demo.
- **Frontend:** `apps/web` from the repo + specific extensions for the analyst app (graph widget is the new piece).
- **Foundry-native constraint:** every customer-facing artifact must map to a public Foundry concept; OpenFoundry service names are implementation details only.
- **Differentiator vs. aviation PoC:** this PoC stresses the **graph / link analysis** side of the ontology and the **entity-resolution** quality of the pipelines, which is where intelligence customers compare us against Foundry's Gotham heritage.

---

## 🆚 Why a public-data PoC is *not* the value pitch

Honest framing the engineer running the demo must internalize before opening the laptop:

- A PoC built on GDELT + ACLED has a **low ceiling** on its own. A capable customer will respond *"this I can do with Elastic + Kibana + Neo4j"*.
- The real value of Foundry — and what we must claim for OpenFoundry — appears when **classified, heterogeneous internal data** is integrated *on top of* the public layer, **without redoing the ontology**.
- The demo therefore must show that the **ontology** is the durable asset. Adding a new classified source is a Data Connection sync + a transform + a link type, **not** a re-design.
- The narrative the customer must take home: *"in 2 weeks I modeled an ontology that tomorrow accepts our internal feeds. The investment is in the model and the governance — open-source, self-hosted, auditable, no lock-in."*

---

## 🚧 What this PoC does **not** do

To be honest with the customer:

- It does not replace certified intelligence systems (Palantir Gotham, i2 Analyst's Notebook, classified link analysis platforms).
- It does not claim accreditation for handling classified information — it is a platform proof on open sources.
- It does not demonstrate all 50 current service directories from [`docs/reference/repository-layout.md`](../../docs/reference/repository-layout.md); only the subset documented in [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md).
- It does not use customer data — it uses public sources. The next phase would be a *pilot* with their data, optionally air-gapped.
- It does not perform autonomous decision-making about persons or sanctions; every write goes through an Action Type with human-in-the-loop confirmation and full Action Log audit.
