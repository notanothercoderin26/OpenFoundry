# 04 — Infrastructure and deployment

> Two deployment shapes are supported: **(A) cloud / online** (one VM + managed object storage + Azure OpenAI for the AIP copilot) and **(B) single-box / air-gapped** (workstation + local MinIO + Ollama for the AIP copilot). The air-gapped variant exists specifically because public-safety customers will ask about it within the first 5 minutes — see [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md).

The deployment plane is otherwise identical: same compose / Helm chart, same ~14-service subset from [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md). Only the LLM provider and the object-store backend flip. Both variants target the same single-node footprint because the urban dataset is ~80 GB, not TB — see [`03-datasets-y-fuentes-de-datos.md`](03-datasets-y-fuentes-de-datos.md).

---

## 🅰️ Cloud / online layout (default for in-room demo with reliable network)

| Resource | Spec | Notes |
|---|---|---|
| Compute | 1 × VM, 16 vCPU / 64 GiB RAM / 500 GB NVMe SSD | E.g. AWS `m6i.4xlarge`, Azure `D16s v5`, GCP `n2-standard-16`. |
| Object storage | S3-compatible (real S3 in AWS, Blob in Azure, GCS in GCP) | Bucket: `bcn-publicsafety-poc`. Region close to the demo location. |
| Catalog | `iceberg-catalog-service` on the same VM | Backed by Postgres on the same host. |
| Streaming | Redpanda single-node | Kafka-compatible; deployed via compose. |
| Metadata DB + search + vectors | Postgres 15 + **pgvector** | Single instance, daily dump backup. Replaces the dedicated Vespa node used in the geopolitical PoC — the urban dataset fits comfortably in Postgres. |
| Identity | Keycloak | Anna (`commander`, `OPS-CORE`) + Jordi (`analyst`, `ANALYST-CORE`) accounts, role + marking claims. |
| LLM | **Azure OpenAI** (default) or **Anthropic Claude 4.x** | Provider configured in `llm-catalog-service`. |
| Egress | Outbound to Open Data BCN, AEMET, INE, LLM provider | Allowlist documented in compose env. |
| TLS | Let's Encrypt via Caddy reverse proxy | Demo URL: `https://poc-seguridad-urbana.openfoundry.dev/`. |

### Compose bring-up (cloud)

```bash
git clone https://github.com/DioCrafts/OpenFoundry.git
cd OpenFoundry
cp .env.example .env  # fill in: AEMET_API_KEY,
                       #          AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT,
                       #          S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY,
                       #          KEYCLOAK_ADMIN_PASSWORD

# Bring up the ~14-service subset declared for this PoC
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/poc-seguridad-urbana.override.yml \
               up -d
```

> The override file `infra/compose/poc-seguridad-urbana.override.yml` **does not exist yet**; it is to be created at execution time and must declare only the services in [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md) plus their dependencies (Postgres + pgvector, Redpanda, Keycloak, Caddy). Note the absence of Vespa compared to the geopolitical override.

---

## 🅱️ Air-gapped single-box layout (for "what about classified / internal-police data?" customers)

The narrative on air-gapped: *"this is the exact same OpenFoundry, the exact same ontology and Workshop module — only the LLM is local and the data lake is on a local MinIO. If your environment is air-gapped — and any pilot on real internal-police data will be — this is what we ship."*

| Resource | Spec | Notes |
|---|---|---|
| Compute | 1 × workstation, 16 CPU / 64 GiB RAM / 1 TB NVMe SSD | A modern Ryzen 9 / Threadripper or Mac Studio M-series works. |
| Object storage | **MinIO** local single-node | Replaces S3. Mount on the NVMe. |
| Catalog / DB / streaming | Same as cloud (compose) | All on the same box. Postgres + pgvector handles metadata + search + embeddings. |
| Identity | Keycloak | Same. |
| LLM | **Ollama** running a local instruction-tuned model | A 14B-class instruction model is sufficient for this domain — explicitly smaller than the 70B-class model used for the geopolitical PoC because urban-public-safety prompts are shorter and more structured (briefing template, zone-summary template, alert acknowledgement). |
| Vector store | pgvector | Same as cloud. |
| Egress | **None during demo.** All sources pre-downloaded into MinIO before the customer arrives. | The AEMET hourly drop is replayed from a captured fixture. See [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md). |

### Compose bring-up (air-gapped)

```bash
# Same repo, different override
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/poc-seguridad-urbana.override.yml \
               -f infra/compose/poc-seguridad-urbana.airgapped.override.yml \
               up -d
```

> The air-gapped override forces `llm-catalog-service` to expose **only** the Ollama provider, and `connector-management-service` to use MinIO endpoints + replay-from-fixture for the AEMET hourly poll.

---

## 🧱 Resource layout on the demo box (both variants)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Demo VM (cloud) / Workstation (air-gapped)                                  │
│                                                                             │
│   docker network: openfoundry-poc-seguridad-urbana                          │
│                                                                             │
│   ┌────────────────────────┐   ┌────────────────────────┐                   │
│   │  apps/web (Caddy)      │   │  Keycloak              │                   │
│   └────────────────────────┘   └────────────────────────┘                   │
│   ┌────────────────────────┐   ┌────────────────────────┐                   │
│   │  ~14 OpenFoundry       │   │  Postgres              │                   │
│   │  services per          │   │  (metadata + search    │                   │
│   │  02-arquitectura       │   │   + pgvector)          │                   │
│   └────────────────────────┘   └────────────────────────┘                   │
│   ┌────────────────────────┐   ┌────────────────────────┐                   │
│   │  Redpanda (Kafka)      │   │  MinIO (air-gapped)    │                   │
│   │                        │   │  — or S3 (cloud)       │                   │
│   └────────────────────────┘   └────────────────────────┘                   │
│   ┌────────────────────────┐                                                │
│   │  Spark runner          │   (no Vespa node on this PoC — pgvector covers │
│   │  (forecast training)   │    object-search + AIP retrieval)              │
│   └────────────────────────┘                                                │
│   ┌──────────────────────────────────────────────────────┐                  │
│   │  Ollama (air-gapped) or Azure OpenAI (cloud) client  │                  │
│   └──────────────────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🌐 Network policy (air-gapped variant)

The air-gapped variant is enforced by the docker network. Only the following egress is needed and only at **provisioning time**:

| Destination | Purpose | Allowed window |
|---|---|---|
| `opendata-ajuntament.barcelona.cat` | BCN incidents + accidents + barris + districtes | Provisioning only |
| `opendata.aemet.es` | AEMET hourly observation bulk pull | Provisioning only |
| `www.ine.es` | INE census sections | Provisioning only |
| `ollama.com` (registry) | Pull the local LLM weights | Provisioning only |
| **Demo time** | **all egress blocked** | Demo only |

A capture of the AEMET hourly drop is recorded during provisioning and replayed against the relevant Kafka topic during the demo to simulate "new weather observations arriving live". This is openly disclosed in the demo script and is **not** sold as "we have outbound to AEMET in production air-gapped".

---

## 🔁 Backups and rehearsal snapshots

Per [`12-checklist-preparacion.md`](12-checklist-preparacion.md), the engineer takes a snapshot of the **whole disk** (or the equivalent S3/MinIO + Postgres dump) **after** the final rehearsal. This snapshot is the rollback point if the live demo wedges. The plan-B path in [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md) assumes this snapshot exists.

Specific to this PoC, the snapshot must contain:
- The full curated `Incident` + `TrafficAccident` Iceberg tables.
- The trained XGBoost + Poisson GLM forecast artefacts.
- The Keycloak realm export (Anna + Jordi + markings).
- The `assets/sample-data-manifest.yaml` referenced by [`03-datasets-y-fuentes-de-datos.md`](03-datasets-y-fuentes-de-datos.md).
- The captured AEMET fixture window (≥ 24 h of hourly drops) for the air-gapped replay.

---

## ✅ Concrete actions (when the PoC is executed)

1. Pick the layout (A or B) with the customer **at least 5 working days before** the demo. For Guàrdia Urbana / public-safety customers, default to (B) air-gapped — it is the conversation they expect.
2. Provision the VM (A) or workstation (B) at the 16 vCPU / 64 GiB / NVMe target.
3. Write `infra/compose/poc-seguridad-urbana.override.yml` declaring only the ~14 services in [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md); for (B) also write `infra/compose/poc-seguridad-urbana.airgapped.override.yml` flipping the LLM and object store.
4. Bring up the stack; confirm `/healthz` green on every service and the KPI panel reads green.
5. Run the data downloads per [`03-datasets-y-fuentes-de-datos.md`](03-datasets-y-fuentes-de-datos.md) — including the synthetic AVL + CAD generators (seed = 42).
6. Capture an AEMET hourly window (≥ 24 hours of drops) for replay if (B), and snapshot the box after rehearsal.
