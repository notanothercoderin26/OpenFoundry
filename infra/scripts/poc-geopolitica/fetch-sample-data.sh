#!/usr/bin/env bash
# Fetch the Geopolitical Intelligence PoC sample-data subset.
#
# Source of truth for the subset spec:
#   PoC/geopolitica/assets/sample-data-manifest.yaml
#
# This script ONLY downloads payloads into infra/poc-data/geopolitica/
# (gitignored). It does NOT POST to connector-management-service —
# that's the next step, documented in
# infra/runbooks/poc-geopolitica-ingest.md.
#
# Behaviour:
#   - Each source is fetched in its own block; a missing API key
#     causes the BLOCK to skip with a warning, never the whole script.
#   - All payloads are stored compressed where the source already
#     ships compressed (GDELT .zip stays .zip; API JSON is gzipped).
#   - Rate limits documented in the manifest are honoured via `sleep`
#     between requests — no exotic scheduling.
#
# Exit codes:
#   0 — at least one source fetched successfully
#   1 — every source failed (e.g. no network at all)
#
# Required env vars (per-source — see manifest):
#   ACLED_API_KEY              — ACLED REST API
#   OPENSANCTIONS_API_KEY      — OpenSanctions REST API (optional; free tier works without)
#   EU_SANCTIONS_TOKEN_URL     — operator-supplied token-gated URL

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_ROOT="${POC_DATA_ROOT:-$ROOT_DIR/infra/poc-data/geopolitica}"
WINDOW_DAYS="${POC_WINDOW_DAYS:-7}"
ACLED_WINDOW_DAYS="${POC_ACLED_WINDOW_DAYS:-365}"
SUCCESS_COUNT=0
SKIP_COUNT=0
FAIL_COUNT=0

mkdir -p "$OUT_ROOT"

log()  { printf '[fetch-sample-data] %s\n' "$*" >&2; }
warn() { printf '[fetch-sample-data] WARN: %s\n' "$*" >&2; }
skip() { printf '[fetch-sample-data] SKIP %s — %s\n' "$1" "$2" >&2; SKIP_COUNT=$((SKIP_COUNT+1)); }
ok()   { printf '[fetch-sample-data] OK  %s\n' "$*" >&2; SUCCESS_COUNT=$((SUCCESS_COUNT+1)); }
fail() { printf '[fetch-sample-data] FAIL %s — %s\n' "$1" "$2" >&2; FAIL_COUNT=$((FAIL_COUNT+1)); }

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || { warn "missing command '$1' — install before re-running"; return 1; }
}

require_cmd curl || exit 1
require_cmd gzip || exit 1

# ─────────────────────────────────────────────────────────────────────
# 1. GDELT events — N-day window of 15-minute drops
# ─────────────────────────────────────────────────────────────────────
fetch_gdelt() {
    local feed="$1"     # "events" or "gkg"
    local suffix="$2"   # ".export.CSV.zip" or ".gkg.csv.zip"
    local outdir="$OUT_ROOT/gdelt/$feed"
    mkdir -p "$outdir"

    local now_epoch
    now_epoch="$(date -u +%s)"
    local start_epoch=$((now_epoch - WINDOW_DAYS * 86400))
    # GDELT publishes at HH:00, HH:15, HH:30, HH:45 — align start to a 15-min boundary.
    start_epoch=$((start_epoch - start_epoch % 900))

    local fetched=0
    local ts_epoch=$start_epoch
    while [ "$ts_epoch" -lt "$now_epoch" ]; do
        local ts
        ts="$(date -u -d "@$ts_epoch" +%Y%m%d%H%M%S 2>/dev/null || date -u -r "$ts_epoch" +%Y%m%d%H%M%S)"
        local url="http://data.gdeltproject.org/gdeltv2/${ts}${suffix}"
        local dest="$outdir/${ts}${suffix}"
        if [ ! -s "$dest" ]; then
            if curl --fail --silent --show-error --location --max-time 30 --output "$dest" "$url"; then
                fetched=$((fetched+1))
            else
                # GDELT occasionally has gaps; do not fail-hard on a single 404.
                rm -f "$dest"
            fi
        fi
        ts_epoch=$((ts_epoch + 900))
    done

    if [ "$fetched" -gt 0 ] || [ -n "$(ls -A "$outdir" 2>/dev/null)" ]; then
        ok "gdelt-$feed — $fetched new shards (cumulative: $(ls "$outdir" | wc -l))"
    else
        fail "gdelt-$feed" "no shards fetched and output dir empty"
    fi
}

fetch_gdelt events ".export.CSV.zip"
fetch_gdelt gkg    ".gkg.csv.zip"

# ─────────────────────────────────────────────────────────────────────
# 2. ACLED — last 12 months, page through the REST API
# ─────────────────────────────────────────────────────────────────────
fetch_acled() {
    if [ -z "${ACLED_API_KEY:-}" ]; then
        skip "acled" "ACLED_API_KEY unset"
        return 0
    fi
    local outdir="$OUT_ROOT/acled"
    mkdir -p "$outdir"
    local since
    since="$(date -u -d "$ACLED_WINDOW_DAYS days ago" +%Y-%m-%d 2>/dev/null || date -u -v -"${ACLED_WINDOW_DAYS}"d +%Y-%m-%d)"
    local page=1
    local got=0
    while :; do
        local dest="$outdir/page-$(printf '%05d' "$page").json.gz"
        if [ -s "$dest" ]; then
            page=$((page+1))
            continue
        fi
        local body
        body="$(curl --fail --silent --show-error --max-time 60 \
            -H "Authorization: Bearer $ACLED_API_KEY" \
            --get "https://api.acleddata.com/acled/read" \
            --data-urlencode "limit=5000" \
            --data-urlencode "page=$page" \
            --data-urlencode "event_date=$since|" \
            --data-urlencode "event_date_where=>=")" || break
        # If the API returns an empty data array, we're done.
        if printf '%s' "$body" | grep -q '"data":\[\]'; then
            break
        fi
        printf '%s' "$body" | gzip -c > "$dest"
        got=$((got+1))
        page=$((page+1))
        sleep 1   # 1 rps per manifest
    done
    if [ "$got" -gt 0 ] || [ -n "$(ls -A "$outdir" 2>/dev/null)" ]; then
        ok "acled — $got new pages (cumulative: $(ls "$outdir" | wc -l))"
    else
        fail "acled" "no pages fetched"
    fi
}
fetch_acled

# ─────────────────────────────────────────────────────────────────────
# 3. OFAC SDN — single XML snapshot
# ─────────────────────────────────────────────────────────────────────
fetch_ofac() {
    local outdir="$OUT_ROOT/sanctions/ofac"
    mkdir -p "$outdir"
    local dest="$outdir/sdn-$(date -u +%Y%m%d).xml.gz"
    if curl --fail --silent --show-error --location --max-time 120 \
        "https://www.treasury.gov/ofac/downloads/sdn.xml" | gzip -c > "$dest"; then
        ok "ofac-sdn — snapshot $(basename "$dest")"
    else
        rm -f "$dest"
        fail "ofac-sdn" "treasury.gov download failed"
    fi
}
fetch_ofac

# ─────────────────────────────────────────────────────────────────────
# 4. EU Consolidated — token-gated URL operator-supplied
# ─────────────────────────────────────────────────────────────────────
fetch_eu() {
    if [ -z "${EU_SANCTIONS_TOKEN_URL:-}" ]; then
        skip "eu-consolidated" "EU_SANCTIONS_TOKEN_URL unset"
        return 0
    fi
    local outdir="$OUT_ROOT/sanctions/eu"
    mkdir -p "$outdir"
    local dest="$outdir/eu-consolidated-$(date -u +%Y%m%d).xml.gz"
    if curl --fail --silent --show-error --location --max-time 120 \
        "$EU_SANCTIONS_TOKEN_URL" | gzip -c > "$dest"; then
        ok "eu-consolidated — snapshot $(basename "$dest")"
    else
        rm -f "$dest"
        fail "eu-consolidated" "operator-supplied URL failed"
    fi
}
fetch_eu

# ─────────────────────────────────────────────────────────────────────
# 5. OpenSanctions — paginate, respect 500/day free-tier cap
# ─────────────────────────────────────────────────────────────────────
fetch_opensanctions() {
    local outdir="$OUT_ROOT/sanctions/opensanctions"
    mkdir -p "$outdir"
    local auth_header=()
    if [ -n "${OPENSANCTIONS_API_KEY:-}" ]; then
        auth_header=(-H "Authorization: ApiKey $OPENSANCTIONS_API_KEY")
    fi
    local offset=0
    local page=1
    local got=0
    local max_pages=400   # safety cap; 400 × 1000 = 400k rows headroom
    while [ "$page" -le "$max_pages" ]; do
        local dest="$outdir/page-$(printf '%05d' "$page").json.gz"
        if [ -s "$dest" ]; then
            offset=$((offset+1000))
            page=$((page+1))
            continue
        fi
        local body
        body="$(curl --fail --silent --show-error --max-time 60 "${auth_header[@]}" \
            --get "https://api.opensanctions.org/search/sanctions" \
            --data-urlencode "limit=1000" \
            --data-urlencode "offset=$offset" \
            --data-urlencode "scope=peps-plus-sanctions")" || break
        if printf '%s' "$body" | grep -q '"results":\[\]'; then
            break
        fi
        printf '%s' "$body" | gzip -c > "$dest"
        got=$((got+1))
        offset=$((offset+1000))
        page=$((page+1))
        sleep 2   # 0.5 rps per manifest
    done
    if [ "$got" -gt 0 ] || [ -n "$(ls -A "$outdir" 2>/dev/null)" ]; then
        ok "opensanctions — $got new pages (cumulative: $(ls "$outdir" | wc -l))"
    else
        fail "opensanctions" "no pages fetched"
    fi
}
fetch_opensanctions

# ─────────────────────────────────────────────────────────────────────
# 6. Wikidata — country-bounded SPARQL, one query per country
# ─────────────────────────────────────────────────────────────────────
fetch_wikidata() {
    local outdir="$OUT_ROOT/wikidata"
    mkdir -p "$outdir"
    local countries="${POC_WIKIDATA_COUNTRIES:-UA RU SD SY IL PS YE MX CO VE}"
    local ua="OpenFoundry-PoC-Geopolitica/1.0 (https://github.com/openfoundry; contact: openfoundry@example.org)"
    local got=0
    for cc in $countries; do
        local dest="$outdir/actors-$cc.json.gz"
        if [ -s "$dest" ]; then
            continue
        fi
        # Actors = humans (Q5) OR organizations (Q43229) with citizenship/country = ?cc
        local sparql="SELECT ?item ?itemLabel ?countryLabel ?kindLabel WHERE { VALUES ?cc { \"$cc\" } . ?country wdt:P297 ?cc . { ?item wdt:P31 wd:Q5 ; wdt:P27 ?country . BIND(\"PERSON\" AS ?kindLabel) } UNION { ?item wdt:P31 wd:Q43229 ; wdt:P17 ?country . BIND(\"ORG\" AS ?kindLabel) } SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\" } } LIMIT 5000"
        if curl --fail --silent --show-error --max-time 90 \
            -H "User-Agent: $ua" \
            -H "Accept: application/sparql-results+json" \
            --get "https://query.wikidata.org/sparql" \
            --data-urlencode "query=$sparql" | gzip -c > "$dest"; then
            got=$((got+1))
        else
            rm -f "$dest"
            warn "wikidata: $cc query failed"
        fi
        sleep 1   # well under the 5 rps soft cap, leaves headroom for the query planner
    done
    if [ "$got" -gt 0 ] || [ -n "$(ls -A "$outdir" 2>/dev/null)" ]; then
        ok "wikidata — $got new countries (cumulative: $(ls "$outdir" | wc -l))"
    else
        fail "wikidata" "no countries fetched"
    fi
}
fetch_wikidata

# ─────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────
log "summary: ok=$SUCCESS_COUNT skip=$SKIP_COUNT fail=$FAIL_COUNT root=$OUT_ROOT"
if [ "$SUCCESS_COUNT" -eq 0 ]; then
    exit 1
fi
