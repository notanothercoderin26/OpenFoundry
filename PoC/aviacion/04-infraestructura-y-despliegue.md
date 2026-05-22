# 04 — Infrastructure and deployment

> Moving ≥ 1 TB credibly requires proportionate infrastructure. A bare-bones laptop makes the demo slow and unconvincing. Here are the **3 options** (local, dedicated on-prem, cloud), with costs and commands.

---

## 🎚️ Option A — Local on a powerful laptop (rehearsals only)

**Useful for:** development, offline rehearsals, prototypes.
**Not recommended** for the final customer demo.

| Component | Minimum |
|---|---|
| CPU | 12 cores (Apple M2 Max or Ryzen 7) |
| RAM | 64 GB |
| Disk | 2 TB NVMe free |
| OS | macOS 14+ or Linux with kernel ≥ 6 |

Key limitation: **you cannot move 1 TB of NOAA locally in a reasonable time**. In this option, *the TB is a read-only dataset mounted from a pre-loaded USB SSD*.

---

## 🖥️ Option B — Dedicated server (Hetzner / OVH / our own)

**Useful for:** remote demo controlled by us, repeated rehearsals, fixed cost.
**Recommended** if the demo will be remote over screen share.

### Suggested hardware (1 node)
- **Hetzner AX102** or equivalent:
  - AMD Ryzen 9 7950X3D (16C/32T)
  - 128 GB DDR5 ECC
  - 2× NVMe 1.92 TB (RAID-1) for system + 4× SSD 7.68 TB (RAID-10) for data
  - 1 Gbit unmetered
- **Cost:** ~€150/month
- **Location:** Helsinki or Falkenstein (latency OK from Europe).

### Disk layout
```
/data/minio        → 4 TB (RAID-10)  → object storage
/data/postgres     → 200 GB
/data/kafka-logs   → 200 GB
/data/spark-shuffle→ 500 GB
/var/lib/docker    → 100 GB
```

### Deployment
```bash
# Provisión
ssh root@poc-server
apt update && apt install -y docker.io docker-compose-plugin git
git clone https://github.com/DioCrafts/OpenFoundry.git
cd OpenFoundry && cp .env.example .env

# Editar .env con secretos reales (Keycloak admin, MinIO root, OpenSky creds, Azure OpenAI key)
$EDITOR .env

# Levantar stack PoC (overlay a crear cuando ejecutemos)
docker compose -f compose.yaml -f infra/docker-compose.poc-aviation.yml up -d

# Verificar
docker compose ps
```

---

## ☁️ Option C — Cloud (AWS, recommended for the "wow" demo)

**Useful for:** in-person demo with many attendees, repeated demos, maximum network reliability.
**Recommended** for the final customer presentation.

### AWS topology
| Resource | Size | Approx cost/day when on |
|---|---|---|
| 1× EC2 `m6i.2xlarge` (control plane + Postgres + Redis + Keycloak) | 8 vCPU, 32 GB | $9 |
| 3× EC2 `r6i.4xlarge` (Spark workers + heavy services) | 16 vCPU, 128 GB each | $90 |
| EBS gp3, 2 TB total | 16k IOPS | $7 |
| S3 `acme-poc` | 1.5 TB stored | $35/month (not/day) |
| MSK Serverless (managed Kafka) | Low throughput | $20 |
| OpenSearch t3.medium x 2 | | $10 |
| ALB + Route53 + ACM | | $2 |
| **Total on (8h demo)** | | **~$45/day** |
| Total always on (month) | | ~$3,500/month |

> **Turn off between demos**. Stopping EC2 + scale-to-zero MSK cuts cost to ~$50/month (storage only).

### Region
**`us-east-1`** — to avoid paying egress on the `noaa-*-bdp-pds` buckets (they live there).

### Deployment (Terraform + Helm)
> To be built when the PoC is executed. Pending tasks:

1. `infra/terraform/poc-aviation/` with: VPC, subnets, EKS or EC2 ASG, S3, MSK, IAM, Route53.
2. `infra/helm/poc-aviation/values.yaml` that activates only the necessary Helm releases from `infra/helm/apps/` (`of-platform`, `of-data-engine`, `of-ontology`, `of-ml-aip`, `of-apps-ops`, `of-web`) with the subset's services.
3. `make poc-up` and `make poc-down` in the root `Makefile` for idempotency (the monorepo already has `make build-services` and `make ci`).

---

## 🌐 DNS and certificates

For the demo, register two URLs:
- `poc.openfoundry.dev` → main UI (Workshop App + dashboards).
- `keycloak.poc.openfoundry.dev` → login.

Certificates via **Let's Encrypt** (cert-manager if Kubernetes; certbot if compose).

---

## 🔌 Minimum network connectivity

| External endpoint | Why | Recommended minimum |
|---|---|---|
| `opensky-network.org` | Live streaming | latency < 200 ms |
| `*.s3.amazonaws.com` (NOAA) | Batch download | 1 Gbps |
| `transtats.bts.gov` | BTS | 100 Mbps |
| Azure OpenAI (if fallback) | LLM | latency < 500 ms |
| End customer (attendees) | UI access | 10 Mbps per participant |

---

## 📈 Compute sizing (Spark)

So that demo queries respond in < 2 s and pipelines in < 3 min:

| Resource | Configuration |
|---|---|
| `spark.executor.instances` | 12 |
| `spark.executor.memory` | 8g |
| `spark.executor.cores` | 4 |
| `spark.driver.memory` | 8g |
| `spark.sql.shuffle.partitions` | 200 |
| `spark.sql.adaptive.enabled` | `true` |
| `spark.sql.adaptive.coalescePartitions.enabled` | `true` |
| Iceberg `write.target-file-size-bytes` | 134217728 (128 MB) |

---

## 🔐 Secrets

Keep **outside the repo** (use `.env` not committed, AWS Secrets Manager, or Vault if production):
- `OPENSKY_USER`, `OPENSKY_PASS`
- `KEYCLOAK_ADMIN_PASS`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASS`
- `POSTGRES_PASSWORD`
- `AZURE_OPENAI_API_KEY` (if we use the fallback)
- `OLLAMA_HOST` (internal)

Check before the demo: `grep -RIn "PASSWORD\|API_KEY\|SECRET" PoC/ infra/` must return **0 results** except templates with `<placeholder>`.

---

## 📊 Minimum observability

Three Grafana dashboards visible **only to the presenters** (not to the customer, except in Act 6). Metrics come from `/metrics` (lib `observability`, OTel + Prometheus) in each service:

1. **Health overview** — uptime of the subset (~17 services), error rate.
2. **Pipeline throughput** — rows processed/min, Kafka lag (Strimzi), Iceberg partitions (Lakekeeper).
3. **Query latency** — p50/p95/p99 for `ontology-query-service` and `ontology-exploratory-analysis-service` (geospatial + time-series).

Capture screenshots during the final rehearsal — **they are used in Act 7 (close)** to show real numbers.

---

## ✅ Concrete actions (when the PoC is executed)

1. Decide on A vs B vs C based on budget and demo modality.
2. If C: launch Terraform 1 week ahead and have `terraform destroy` ready.
3. If B: provision Hetzner 2 weeks ahead so there's time to reinstall if something fails.
4. Configure DNS and certificates 5 days ahead (low TTLs so we can change on the day).
5. Provision Grafana and confirm the 3 dashboards are receiving data.
6. Save the `terraform.tfstate` or the server snapshot — the night before the demo, take a **full snapshot** so we can restore in 15 min.
