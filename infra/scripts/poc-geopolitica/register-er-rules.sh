#!/usr/bin/env bash
# Register the Geopolitical PoC entity-resolution rules.
#
# Source of truth:
#   PoC/geopolitica/assets/er-rules-geopolitica.yaml
#
# This script translates the YAML into the three POST sequences the
# entity-resolution-service expects and captures the IDs the API
# returns so the FusionJob can be created with the right
# match_rule_id and merge_strategy_id.
#
# Inputs (env):
#   API                — entity-resolution-service base URL
#   AUTH_BEARER        — JWT for an operator with er.admin role
#   RUN_AFTER_REGISTER — "1" to immediately POST /jobs/{id}/run after
#                        creating each job. Defaults to "0" so the
#                        register step is independently inspectable.
#
# Exit codes:
#   0 — every POST succeeded
#   1 — at least one POST returned non-2xx
#
# This intentionally writes per-source JSON literals inline rather
# than parsing the YAML with yq — keeps the script dependency-free
# and makes the literals readable when an operator opens it. If the
# YAML drifts from this script, the YAML wins and the script must be
# patched.

set -uo pipefail

API="${API:-http://localhost:9408}"
AUTH_BEARER="${AUTH_BEARER:?must export AUTH_BEARER with a JWT for an operator with er.admin}"
RUN_AFTER_REGISTER="${RUN_AFTER_REGISTER:-0}"

log()  { printf '[register-er-rules] %s\n' "$*" >&2; }
warn() { printf '[register-er-rules] WARN: %s\n' "$*" >&2; }
fail() { printf '[register-er-rules] FAIL: %s\n' "$*" >&2; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "missing command '$1'"; }
require_cmd curl
require_cmd jq

post() {
    local path="$1"; shift
    local body="$1"; shift
    local resp
    resp="$(curl --silent --show-error --fail-with-body \
        -X POST "$API$path" \
        -H "Authorization: Bearer $AUTH_BEARER" \
        -H 'Content-Type: application/json' \
        --data "$body")" || fail "POST $path failed: $resp"
    printf '%s' "$resp"
}

# ─────────────────────────────────────────────────────────────────────
# 1. Match rules
# ─────────────────────────────────────────────────────────────────────
log "creating match rule: actor-person-cross-source"
PERSON_RULE_ID="$(post /api/v1/fusion/rules '{
  "name": "actor-person-cross-source",
  "description": "Resolve Person candidates across OFAC / EU / OpenSanctions / Wikidata.",
  "entity_type": "person",
  "status": "active",
  "blocking_strategy": {
    "strategy_type": "sorted-neighborhood",
    "key_fields": ["country_iso3", "display_name"],
    "window_size": 8,
    "bucket_count": 24
  },
  "conditions": [
    {"field": "wikidata_qid", "comparator": "exact",        "weight": 1.0, "threshold": 1.0,  "required": false},
    {"field": "display_name", "comparator": "jaro_winkler", "weight": 0.4, "threshold": 0.92, "required": true},
    {"field": "birth_date",   "comparator": "exact",        "weight": 0.3, "threshold": 1.0,  "required": false},
    {"field": "country_iso3", "comparator": "exact",        "weight": 0.1, "threshold": 1.0,  "required": false}
  ],
  "review_threshold": 0.75,
  "auto_merge_threshold": 0.92
}' | jq -r '.id')"
log "  → $PERSON_RULE_ID"

log "creating match rule: actor-organization-cross-source"
ORG_RULE_ID="$(post /api/v1/fusion/rules '{
  "name": "actor-organization-cross-source",
  "description": "Resolve Organization / ArmedGroup / GovernmentBody candidates across the same four sources.",
  "entity_type": "organization",
  "status": "active",
  "blocking_strategy": {
    "strategy_type": "sorted-neighborhood",
    "key_fields": ["country_iso3", "display_name"],
    "window_size": 12,
    "bucket_count": 24
  },
  "conditions": [
    {"field": "wikidata_qid", "comparator": "exact",        "weight": 1.0, "threshold": 1.0,  "required": false},
    {"field": "display_name", "comparator": "jaro_winkler", "weight": 0.5, "threshold": 0.90, "required": true},
    {"field": "country_iso3", "comparator": "exact",        "weight": 0.2, "threshold": 1.0,  "required": false}
  ],
  "review_threshold": 0.75,
  "auto_merge_threshold": 0.92
}' | jq -r '.id')"
log "  → $ORG_RULE_ID"

# ─────────────────────────────────────────────────────────────────────
# 2. Merge strategy
# ─────────────────────────────────────────────────────────────────────
log "creating merge strategy: actor-golden-record"
MERGE_ID="$(post /api/v1/fusion/merge-strategies '{
  "name": "actor-golden-record",
  "description": "Survivorship for the canonical Actor row.",
  "entity_type": "person",
  "status": "active",
  "default_strategy": "highest_confidence",
  "rules": [
    {"field": "display_name",  "strategy": "source_priority",     "source_priority": ["wikidata", "ofac", "eu", "opensanctions"], "fallback": "longest_non_empty"},
    {"field": "country_iso3",  "strategy": "most_common",          "source_priority": [],                                          "fallback": ""},
    {"field": "is_sanctioned", "strategy": "source_priority",     "source_priority": ["ofac", "eu", "opensanctions"],            "fallback": ""},
    {"field": "aliases",       "strategy": "source_priority",     "source_priority": ["wikidata", "opensanctions", "ofac", "eu"], "fallback": "longest_non_empty"},
    {"field": "confidence",    "strategy": "highest_confidence",  "source_priority": [],                                          "fallback": ""},
    {"field": "birth_date",    "strategy": "source_priority",     "source_priority": ["wikidata", "ofac", "eu", "opensanctions"], "fallback": ""},
    {"field": "wikidata_qid",  "strategy": "source_priority",     "source_priority": ["wikidata", "opensanctions", "ofac", "eu"], "fallback": ""}
  ]
}' | jq -r '.id')"
log "  → $MERGE_ID"

# ─────────────────────────────────────────────────────────────────────
# 3. Fusion jobs
# ─────────────────────────────────────────────────────────────────────
log "creating fusion job: actor-canonical-resolution-person"
PERSON_JOB_ID="$(post /api/v1/fusion/jobs "$(jq -nc \
    --arg rule "$PERSON_RULE_ID" --arg merge "$MERGE_ID" '{
  name: "actor-canonical-resolution-person",
  description: "Person canonical resolution across OFAC / EU / OpenSanctions / Wikidata.",
  entity_type: "person",
  match_rule_id: $rule,
  merge_strategy_id: $merge,
  config: {
    source_labels: ["ofac", "eu", "opensanctions", "wikidata"],
    record_count: 50000,
    review_sampling_rate: 0.25,
    sources: [
      {source_label: "ofac",          object_type_id: "Person", display_property: "name",    default_confidence: 0.95},
      {source_label: "eu",            object_type_id: "Person", display_property: "name",    default_confidence: 0.92},
      {source_label: "opensanctions", object_type_id: "Person", display_property: "caption", default_confidence: 0.80},
      {source_label: "wikidata",      object_type_id: "Person", display_property: "label",   record_id_property: "wikidata_qid", default_confidence: 0.98}
    ]
  }
}')" | jq -r '.id')"
log "  → $PERSON_JOB_ID"

log "creating fusion job: actor-canonical-resolution-organization"
ORG_JOB_ID="$(post /api/v1/fusion/jobs "$(jq -nc \
    --arg rule "$ORG_RULE_ID" --arg merge "$MERGE_ID" '{
  name: "actor-canonical-resolution-organization",
  description: "Organization canonical resolution across the same four sources.",
  entity_type: "organization",
  match_rule_id: $rule,
  merge_strategy_id: $merge,
  config: {
    source_labels: ["ofac", "eu", "opensanctions", "wikidata"],
    record_count: 30000,
    review_sampling_rate: 0.25,
    sources: [
      {source_label: "ofac",          object_type_id: "Organization", display_property: "name",    default_confidence: 0.95},
      {source_label: "eu",            object_type_id: "Organization", display_property: "name",    default_confidence: 0.92},
      {source_label: "opensanctions", object_type_id: "Organization", display_property: "caption", default_confidence: 0.80},
      {source_label: "wikidata",      object_type_id: "Organization", display_property: "label",   record_id_property: "wikidata_qid", default_confidence: 0.98}
    ]
  }
}')" | jq -r '.id')"
log "  → $ORG_JOB_ID"

# ─────────────────────────────────────────────────────────────────────
# 4. Optional: run immediately
# ─────────────────────────────────────────────────────────────────────
if [ "$RUN_AFTER_REGISTER" = "1" ]; then
    for job in "$PERSON_JOB_ID" "$ORG_JOB_ID"; do
        log "running job $job"
        summary="$(post "/api/v1/fusion/jobs/$job/run" '{}' \
            | jq -c '{cluster_ids: (.cluster_ids|length), golden_record_ids: (.golden_record_ids|length), review_queue_item_ids: (.review_queue_item_ids|length)}')"
        log "  → $summary"
    done
fi

log "done — person_rule=$PERSON_RULE_ID org_rule=$ORG_RULE_ID merge=$MERGE_ID person_job=$PERSON_JOB_ID org_job=$ORG_JOB_ID"
