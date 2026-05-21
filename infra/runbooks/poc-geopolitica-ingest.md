# PoC Geopolítica — sample-data ingest runbook

Operator runbook for fetching the sample-data subset and triggering
the bronze ingest into OpenFoundry. The subset spec is declared in
`PoC/geopolitica/assets/sample-data-manifest.yaml`; this runbook
walks the steps that bring the subset live.

Prerequisites: Items 1 (ingest framework), 2 (pipeline transforms),
and 3 (markings + 7 SeedConnections) must be closed. Verify with:

```sh
# Connections seeded (Gap 3)
curl -s "$API/api/v1/sources" | jq '.items[] | select(.name | startswith("GDELT") or contains("ACLED") or contains("OFAC") or contains("EU Consolidated") or contains("OpenSanctions") or contains("Wikidata")) | {id, name}'
# Markings registered
curl -s "$API/api/v1/policies/v1/markings" | jq '.items[].display_name'
```

You should see 7 connection rows and the 8 markings from
`PoC/geopolitica/assets/markings-geopolitica.yaml`.

## 1. Provision API keys

| Variable | Required for | How to get it |
|---|---|---|
| `ACLED_API_KEY` | ACLED REST API | Free academic registration at acleddata.com/data-access |
| `OPENSANCTIONS_API_KEY` | OpenSanctions (optional — free tier works without) | opensanctions.org/account |
| `EU_SANCTIONS_TOKEN_URL` | EU Consolidated XML | EU Council token URL — operator-supplied per the SeedConnection runtime hint |

Export these in the operator shell (or sourcing from
`.openfoundry/poc-geopolitica.env`, gitignored). Missing keys cause
the matching source to **skip with a warning**; the runbook still
produces a useful demo, just with one fewer source.

## 2. Fetch the subset

```sh
infra/scripts/poc-geopolitica/fetch-sample-data.sh
```

Tunables (env vars, all optional):

| Variable | Default | Effect |
|---|---|---|
| `POC_DATA_ROOT` | `infra/poc-data/geopolitica` | Output root (must be gitignored) |
| `POC_WINDOW_DAYS` | `7` | GDELT events + GKG window |
| `POC_ACLED_WINDOW_DAYS` | `365` | ACLED window |
| `POC_WIKIDATA_COUNTRIES` | `UA RU SD SY IL PS YE MX CO VE` | ISO-2 country list |

Expected wall-clock on a workstation with good network: 30–90 min,
dominated by GDELT (~672 shards for a 7-day window × ~5 MB each).

## 3. Upload to MinIO

The bronze ingest in OpenFoundry reads from MinIO, not the local
disk. After `fetch-sample-data.sh` finishes:

```sh
aws --endpoint-url "$MINIO_URL" s3 sync \
  infra/poc-data/geopolitica/ s3://openfoundry-poc-geopolitica/raw/
```

## 4. Trigger sync per source

For each SeedConnection, POST to `ingestion-replication-service` with
the MinIO prefix as the input. The connection IDs were captured in
step "Prerequisites".

```sh
for slug in gdelt-events gdelt-gkg acled ofac-sdn eu-consolidated opensanctions wikidata; do
  conn_id="$(curl -s "$API/api/v1/sources" | jq -r --arg s "$slug" '.items[] | select(.name | ascii_downcase | contains($s)) | .id' | head -n1)"
  [ -z "$conn_id" ] && { echo "skip: no connection for $slug"; continue; }
  curl -fsS -X POST "$API/api/v1/sources/$conn_id/sync" \
    -H 'Content-Type: application/json' \
    -d "{\"input_prefix\": \"s3://openfoundry-poc-geopolitica/raw/\"}"
done
```

This produces an `ingest_spec` per source, which `ingestion-replication-service`
forwards through the bronze → silver → gold transforms registered in
`pipeline-build-service` (Item 2).

## 5. Verify

Each acceptance check in `sample-data-manifest.yaml §acceptance`
should pass. Quick verification queries:

```sh
# 5a — at least one successful transaction per bronze dataset
for ds in bronze.gdelt_events bronze.gdelt_gkg bronze.acled_events \
          bronze.sanctions_ofac bronze.sanctions_eu \
          bronze.sanctions_opensanctions bronze.wikidata_actors; do
  rid="$(curl -fsS "$API/api/v1/datasets?name=$ds" | jq -r '.items[0].rid')"
  count="$(curl -fsS "$API/api/v1/datasets/$rid/transactions?status=committed" | jq '.items | length')"
  printf '%-40s tx=%s\n' "$ds" "$count"
done

# 5b — Object Explorer round-trip on a known multi-source Actor
curl -fsS -X POST "$API/api/v1/objects/Actor/search" \
  -H 'Content-Type: application/json' \
  -d '{"name_contains": "Vladimir Putin", "limit": 5}' \
  | jq '.results[] | {actor_id, display_name, source_ids}'
# Expected: exactly 1 row whose source_ids covers OFAC + EU + Wikidata.

# 5c — markings sampling per bronze dataset
for ds in bronze.gdelt_events bronze.sanctions_ofac bronze.sanctions_eu; do
  curl -fsS "$API/api/v1/datasets/$(curl -fsS "$API/api/v1/datasets?name=$ds" | jq -r '.items[0].rid')/rows?limit=100" \
    | jq -r '.rows[].marking' | sort -u
done
# Expected: bronze.gdelt_events → MARKING:GDELT-RAW + MARKING:OPEN-SOURCE; etc.
```

## 6. Attribution

The Workshop module footer and Quiver dashboard footer MUST render
the seven license strings from `sample-data-manifest.yaml §sources[*].attribution`.
Missing any of these is a demo blocker (CC-BY / ACLED ToU / etc.).

## 7. Cleanup

```sh
# After the demo (or to free disk before a new rehearsal):
rm -rf infra/poc-data/geopolitica/
aws --endpoint-url "$MINIO_URL" s3 rm s3://openfoundry-poc-geopolitica/raw/ --recursive
```

Note: do NOT delete the bronze/silver/gold datasets in OpenFoundry
between rehearsals unless you want to re-run the full pipeline.
Transaction history on those datasets is the live demo of "every
write is a transaction" (per the Foundry-native contract).
