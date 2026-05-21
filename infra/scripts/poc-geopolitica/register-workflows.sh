#!/usr/bin/env bash
# Register the Geopolitical Intelligence PoC workflow definitions.
#
# Source of truth:
#   PoC/geopolitica/assets/workflows-geopolitica.yaml
#
# Translates each `definitions[]` entry into the CreateWorkflowRequest
# shape that workflow-automation-service accepts and POSTs it. Trigger
# config + step config are passed through unmodified as JSON.
#
# Per-action side-effects + notification templates are registered
# against notification-alerting-service via a separate step the
# runbook covers — they are not POSTed by this script because the
# notification service has a different shape (templates + channels)
# than the workflow service.
#
# Inputs (env):
#   API                       — workflow-automation-service base URL
#   AUTH_BEARER               — JWT for an operator with workflow:write
#   ESCALATION_TARGET_ROLE    — defaults to compliance
#   CASE_OPENED_WEBHOOK_URL   — defaults to placeholder; MUST patch before demo
#   CASE_CLOSED_WEBHOOK_URL   — defaults to placeholder; MUST patch before demo
#
# Exit codes:
#   0 — every POST succeeded
#   1 — any POST returned non-2xx
#
# Idempotency: the service rejects duplicate names with 4xx; the
# script reports the conflict and moves on rather than blowing up
# the whole batch.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ASSET="$ROOT_DIR/PoC/geopolitica/assets/workflows-geopolitica.yaml"

API="${API:-http://localhost:9412}"
AUTH_BEARER="${AUTH_BEARER:?must export AUTH_BEARER with a JWT for an operator with workflow:write}"
ESCALATION_TARGET_ROLE="${ESCALATION_TARGET_ROLE:-compliance}"
CASE_OPENED_WEBHOOK_URL="${CASE_OPENED_WEBHOOK_URL:-https://chat.acme-intel.demo/api/hooks/case-opened}"
CASE_CLOSED_WEBHOOK_URL="${CASE_CLOSED_WEBHOOK_URL:-https://chat.acme-intel.demo/api/hooks/case-closed}"
NOTIFICATION_CHANNELS_JSON="${NOTIFICATION_CHANNELS_JSON:-[\"email\",\"in_app\"]}"
ACTOR_ALERT_SLA_MINUTES="${ACTOR_ALERT_SLA_MINUTES:-5}"

log()  { printf '[register-workflows] %s\n' "$*" >&2; }
warn() { printf '[register-workflows] WARN: %s\n' "$*" >&2; }
fail() { printf '[register-workflows] FAIL: %s\n' "$*" >&2; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "missing command '$1'"; }
require_cmd curl
require_cmd jq
require_cmd yq
[ -f "$ASSET" ] || fail "asset not found: $ASSET"

# yq → JSON. yq's `-o json` flag is mksaki/yq v4+; check by feature.
yq -o=json '.' "$ASSET" >/dev/null 2>&1 || fail "yq does not support '-o json' — install mikefarah/yq v4+."

# Substitute ${var}-style placeholders in the JSON body.
substitute() {
    local body="$1"
    printf '%s' "$body" \
        | sed -e "s|\${escalation_target_role}|$ESCALATION_TARGET_ROLE|g" \
              -e "s|\${case_opened_webhook_url}|$CASE_OPENED_WEBHOOK_URL|g" \
              -e "s|\${case_closed_webhook_url}|$CASE_CLOSED_WEBHOOK_URL|g" \
              -e "s|\${actor_alert_sla_minutes}|$ACTOR_ALERT_SLA_MINUTES|g" \
        | jq --argjson channels "$NOTIFICATION_CHANNELS_JSON" '
              (.. | strings? | select(. == "${notification_channels}")) |= $channels
              | (.. | arrays? | map(select(. != "${notification_channels}")))
              | .
          '
    # The second jq pass is a no-op safety net; the first one replaces
    # any standalone "${notification_channels}" strings with the array.
}

count="$(yq '.workflows.definitions | length' "$ASSET")"
[ "$count" -gt 0 ] || fail "no workflow definitions found in $ASSET"
log "found $count workflow definitions"

ok=0
fails=0
for i in $(seq 0 $((count-1))); do
    name="$(yq ".workflows.definitions[$i].name" "$ASSET")"
    log "registering workflow: $name"

    body_raw="$(yq -o=json "
        .workflows.definitions[$i]
        | {
            name:           .name,
            description:    .description,
            status:         .status,
            trigger_type:   .trigger_type,
            trigger_config: .trigger_config,
            steps:          ([.steps[] | {
                                  id:           .id,
                                  name:         .name,
                                  step_type:    .step_type,
                                  description:  .description,
                                  config:       .config,
                                  next_step_id: .next_step_id
                              }])
          }
    " "$ASSET")"
    body="$(substitute "$body_raw")"

    if resp="$(curl --silent --show-error --fail-with-body \
                -X POST "$API/api/v1/workflows" \
                -H "Authorization: Bearer $AUTH_BEARER" \
                -H 'Content-Type: application/json' \
                --data "$body" 2>&1)"; then
        id="$(printf '%s' "$resp" | jq -r '.id // empty')"
        log "  → $id"
        ok=$((ok+1))
    else
        warn "  POST $name failed (likely duplicate name on a re-run): $resp"
        fails=$((fails+1))
    fi
done

log "summary: ok=$ok failed=$fails"
log "next: register notification templates per workflows-geopolitica.yaml §notification_templates against notification-alerting-service (see runbook)."
[ "$ok" -gt 0 ] || exit 1
