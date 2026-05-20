# 04 — Infrastructure and deployment

> Two deployment shapes are supported: **(A) cloud / online** (one VM + managed S3 + Azure OpenAI for the AIP copilot) and **(B) single-box / air-gapped** (laptop or workstation + local MinIO + Ollama for the AIP copilot). The air-gapped variant exists specifically because intelligence customers will ask about it within the first 5 minutes — see [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md).

The deployment plane is otherwise identical: same compose / Helm chart, same 16-service subset from [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md). Only the LLM provider and the object-store backend flip.

---

## 🅰️ Cloud / online layout (default for in-room demo with reliable network)

| Resource | Spec | Notes |
|---|---|---|
| Compute | 1 × VM, 32 vCPU / 128 GiB RAM / 1 TB NVMe SSD | E.g. AWS `m6i.8xlarge`, Azure `D32s v5`, GCP `n2-standard-32`. |
| Object storage | S3-compatible (real S3 in AWS, Blob in Azure, GCS in GCP) | Bucket: `acme-intel-poc`. Region close to the demo location. |
| Catalog | `iceberg-catalog-service` on the same VM | Backed by Postgres on the same host. |
| Streaming | Redpanda single-node | Kafka-compatible; deployed via compose. |
| Metadata DB | Postgres 15 | Single instance, daily dump backup. |
| Search backend (Object Explorer) | Vespa, single-node | Shipped via compose. |
| Identity | Keycloak | Sofía + Marcos accounts, role + marking claims. |
| LLM | **Azure OpenAI GPT-4o** (preferred) or Anthropic Claude 4.x | Provider configured in `llm-catalog-service`. |
| Vector store | pgvector inside the Postgres above | Stores embeddings of `NewsArticle` excerpts. |
| Egress | Outbound to GDELT, ACLED, OFAC, EU, OpenSanctions, Wikidata, LLM provider | Allowlist documented in compose env. |
| TLS | Let's Encrypt via Caddy reverse proxy | Demo URL: `https://poc.openfoundry.dev/`. |

### Compose bring-up (cloud)

```bash
git clone https://github.com/diocrafts/openfoundry.git
cd openfoundry
cp .env.example .env  # fill in: OPENSANCTIONS_TOKEN, ACLED_KEY/EMAIL, EU_FSF_TOKEN,
                       #          AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT,
                       #          S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY,
                       #          KEYCLOAK_ADMIN_PASSWORD

# Bring up the 16-service subset declared for this PoC
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/poc-geopolitica.override.yml \
               up -d
```

> The override file `infra/compose/poc-geopolitica.override.yml` does not exist yet; it is to be created at execution time and must declare only the services in [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md) plus their dependencies (Postgres, Redpanda, Vespa, Keycloak, Caddy).

---

## 🅱️ Air-gapped single-box layout (for "what about classified?" customers)

The narrative on air-gapped: *"this is the exact same OpenFoundry, the exact same ontology and Workshop module — only the LLM is local and the data lake is on a local MinIO. If your environment is air-gapped, this is what we ship."*

| Resource | Spec | Notes |
|---|---|---|
| Compute | 1 × workstation, 24+ CPU / 96+ GiB RAM / 2 TB NVMe SSD | A modern Threadripper or Mac Studio M4 Ultra works. |
| Object storage | **MinIO** local single-node | Replaces S3. Mount on the NVMe. |
| Catalog / DB / streaming | Same as cloud (compose) | All on the same box. |
| Search backend | Vespa, single-node | Same. |
| Identity | Keycloak | Same. |
| LLM | **Ollama** running `llama-3.1-70b-instruct` (or `qwen2.5-72b-instruct`) on GPU(s) | Provider configured in `llm-catalog-service` as the only available provider. |
| Vector store | pgvector | Same. |
| Egress | **None during demo.** All sources pre-downloaded into MinIO before the customer arrives. | The 15-min GDELT live stream is replayed from a captured fixture. See [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md). |

### Compose bring-up (air-gapped)

```bash
# Same repo, different override
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/poc-geopolitica.override.yml \
               -f infra/compose/poc-geopolitica.airgapped.override.yml \
               up -d
```

> The air-gapped override forces `llm-catalog-service` to expose **only** the Ollama provider, and `connector-management-service` to use MinIO endpoints + replay-from-fixture for streaming.

---

## 🧱 Resource layout on the demo box (both variants)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Demo VM (cloud) / Workstation (air-gapped)                                  │
│                                                                             │
│   docker network: openfoundry-poc                                           │
│                                                                             │
│   ┌────────────────────────┐   ┌────────────────────────┐                   │
│   │  apps/web (Caddy)      │   │  Keycloak              │                   │
│   └────────────────────────┘   └────────────────────────┘                   │
│   ┌────────────────────────┐   ┌────────────────────────┐                   │
│   │  16 OpenFoundry        │   │  Postgres (metadata    │                   │
│   │  services per          │   │  + pgvector)           │                   │
│   │  02-arquitectura       │   └────────────────────────┘                   │
│   └────────────────────────┘                                                │
│   ┌────────────────────────┐   ┌────────────────────────┐                   │
│   │  Redpanda (Kafka)      │   │  Vespa (search)        │                   │
│   └────────────────────────┘   └────────────────────────┘                   │
│   ┌────────────────────────┐   ┌────────────────────────┐                   │
│   │  Spark on K8s-in-docker│   │  MinIO  (air-gapped)   │                   │
│   │  or local Spark        │   │  — or S3 (cloud)       │                   │
│   └────────────────────────┘   └────────────────────────┘                   │
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
| `data.gdeltproject.org` | GDELT batch + manifest | Provisioning only |
| `api.acleddata.com` | ACLED bulk pull | Provisioning only |
| `treasury.gov`, `webgate.ec.europa.eu` | OFAC + EU sanctions | Provisioning only |
| `data.opensanctions.org` | OpenSanctions JSON | Provisioning only |
| `query.wikidata.org` | Wikidata subset | Provisioning only |
| `ollama.com` (registry) | Pull the LLM weights | Provisioning only |
| **Demo time** | **all egress blocked** | Demo only |

A capture of the GDELT 15-min stream is recorded during provisioning and replayed against `gdelt.events.live` / `gdelt.gkg.live` Kafka topics during the demo to simulate "new events arriving live". This is openly disclosed in the demo script and is **not** sold as "we have outbound to GDELT in production air-gapped".

---

## 🔁 Backups and rehearsal snapshots

Per [`12-checklist-preparacion.md`](12-checklist-preparacion.md), the engineer takes a snapshot of the **whole disk** (or the equivalent S3 + Postgres + MinIO dump) **after** the final rehearsal. This snapshot is the rollback point if the live demo wedges. The plan-B path in [`13-riesgos-y-plan-b.md`](13-riesgos-y-plan-b.md) assumes this snapshot exists.

---

## ✅ Concrete actions (when the PoC is executed)

1. Pick the layout (A or B) with the customer **at least 5 working days before** the demo.
2. Provision the VM / workstation.
3. Write `infra/compose/poc-geopolitica.override.yml` declaring only the 16 services in [`02-arquitectura-y-servicios.md`](02-arquitectura-y-servicios.md); write `infra/compose/poc-geopolitica.airgapped.override.yml` if (B).
4. Bring up the stack; confirm `/healthz` green on every service.
5. Run the data downloads per [`03-datasets-y-fuentes-de-datos.md`](03-datasets-y-fuentes-de-datos.md).
6. Capture a GDELT 15-min stream window (≥ 4 hours of drops) for replay if (B).
7. Snapshot the box after rehearsal.
