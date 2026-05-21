#!/usr/bin/env bash
# Register the "Geopolitical Intel Workbench" Workshop module.
#
# Source of truth:
#   PoC/geopolitica/assets/workshop-module.json
#
# Translates the asset JSON into the body the application-composition-service
# accepts. The service's NormalizeAppContract validates the contract;
# any drift between the JSON and the schema is surfaced as a structured
# ValidationError with a JSON pointer.
#
# Prereqs (per the asset's _comment_header):
#   1. Items 1–6 closed (ontology, markings, ER, sample data, agent-config)
#   2. The "Actor neighborhood" saved Vertex graph created in the
#      Vertex-equivalent app. Its RID MUST be exported as
#      VERTEX_ACTOR_GRAPH_RID before running this script — the
#      placeholder in the JSON's vertexGraphRid default will not
#      render the embed.
#
# Inputs (env):
#   API                       — application-composition-service base URL
#   AUTH_BEARER               — JWT for an operator with app:write
#   VERTEX_ACTOR_GRAPH_RID    — saved Vertex graph RID (replaces the placeholder)
#   PUBLISH_AFTER_REGISTER    — "1" to immediately POST /publish after the
#                               create succeeds. Defaults to "0".
#
# Exit codes:
#   0 — the app was created (and published, if requested)
#   1 — any POST returned non-2xx, or the asset JSON failed validation
#
# The script is idempotent in spirit but NOT idempotent against the
# service: a second run creates a second app with a slug suffix unless
# the operator deletes the first. The runbook covers cleanup.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ASSET="$ROOT_DIR/PoC/geopolitica/assets/workshop-module.json"

API="${API:-http://localhost:9410}"
AUTH_BEARER="${AUTH_BEARER:?must export AUTH_BEARER with a JWT for an operator with app:write}"
VERTEX_ACTOR_GRAPH_RID="${VERTEX_ACTOR_GRAPH_RID:-}"
PUBLISH_AFTER_REGISTER="${PUBLISH_AFTER_REGISTER:-0}"

log()  { printf '[register-workshop] %s\n' "$*" >&2; }
warn() { printf '[register-workshop] WARN: %s\n' "$*" >&2; }
fail() { printf '[register-workshop] FAIL: %s\n' "$*" >&2; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "missing command '$1'"; }
require_cmd curl
require_cmd jq
[ -f "$ASSET" ] || fail "asset not found: $ASSET"

# ─────────────────────────────────────────────────────────────────────
# 1. Patch the Vertex RID into the variable default before posting.
#    Without this, the vertex_graph_embed renders the incomplete_inputs
#    placeholder instead of the graph.
# ─────────────────────────────────────────────────────────────────────
if [ -z "$VERTEX_ACTOR_GRAPH_RID" ]; then
    warn "VERTEX_ACTOR_GRAPH_RID is unset — the vertex_graph_embed will render the placeholder until you patch it."
fi

# Drop the JSON-comment helper fields the schema rejects, and patch the
# vertexGraphRid default if the operator supplied a real RID.
BODY="$(jq --arg rid "$VERTEX_ACTOR_GRAPH_RID" '
    del(._comment_header)
    | del(._acceptance)
    | if ($rid | length) > 0 then
        .settings.workshop_variables |= map(
            if .id == "vertexGraphRid" then .default_value = $rid else . end
        )
      else . end
' "$ASSET")"

# ─────────────────────────────────────────────────────────────────────
# 2. Create the app. The service returns the persisted row with an id.
# ─────────────────────────────────────────────────────────────────────
log "POST /api/v1/apps (slug=geopolitical-intel-workbench)"
RESP="$(curl --silent --show-error --fail-with-body \
    -X POST "$API/api/v1/apps" \
    -H "Authorization: Bearer $AUTH_BEARER" \
    -H 'Content-Type: application/json' \
    --data "$BODY")" || fail "create failed: $RESP"

APP_ID="$(printf '%s' "$RESP" | jq -r '.id')"
[ -n "$APP_ID" ] && [ "$APP_ID" != "null" ] || fail "create succeeded but no id in response: $RESP"
log "  → app id $APP_ID"

# ─────────────────────────────────────────────────────────────────────
# 3. Optional: publish so /apps/public/{slug} returns the module.
# ─────────────────────────────────────────────────────────────────────
if [ "$PUBLISH_AFTER_REGISTER" = "1" ]; then
    log "POST /api/v1/apps/$APP_ID/publish"
    PUB="$(curl --silent --show-error --fail-with-body \
        -X POST "$API/api/v1/apps/$APP_ID/publish" \
        -H "Authorization: Bearer $AUTH_BEARER" \
        -H 'Content-Type: application/json' \
        --data '{"notes": "Initial publish of Geopolitical Intel Workbench."}')" || fail "publish failed: $PUB"
    log "  → version $(printf '%s' "$PUB" | jq -r '.version_number // .id')"
fi

log "done — app_id=$APP_ID slug=geopolitical-intel-workbench"
log "  inspect:    GET  $API/api/v1/apps/$APP_ID"
log "  preview:    GET  $API/api/v1/apps/$APP_ID/preview"
log "  public:     GET  $API/api/v1/apps/public/geopolitical-intel-workbench"
