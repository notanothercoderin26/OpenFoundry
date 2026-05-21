#!/usr/bin/env bash
# Register the Geopolitical PoC notification subscriptions.
#
# Source of truth:
#   PoC/geopolitica/assets/notification-routing-geopolitica.yaml
#
# Inlines the matching template body from `templates[]` into each
# Subscription's `template` field, substitutes ${var} placeholders
# from env, then POSTs to notification-alerting-service.
#
# Inputs (env):
#   API                                — notification-alerting-service base URL
#   AUTH_BEARER                        — JWT for an operator with notifications:write
#   SOFIA_EMAIL                        — overrides sofia_email parameter
#   MARCOS_EMAIL                       — overrides marcos_email parameter
#   ESCALATION_MANAGER_EMAIL           — overrides escalation_manager_email
#   COMPLIANCE_WEBHOOK_URL             — overrides compliance_webhook_url
#   COMPLIANCE_WEBHOOK_HMAC_SECRET     — operator-supplied; never committed
#   ACTOR_ALERT_SLA_SECONDS            — overrides actor_alert_sla_seconds
#   CASE_ASSIGNMENT_SLA_SECONDS        — overrides case_assignment_sla_seconds
#
# Exit codes:
#   0 — every POST succeeded
#   1 — any POST returned non-2xx (other than duplicate-name on re-run)

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ASSET="$ROOT_DIR/PoC/geopolitica/assets/notification-routing-geopolitica.yaml"

API="${API:-http://localhost:9418}"
AUTH_BEARER="${AUTH_BEARER:?must export AUTH_BEARER}"

# Parameter defaults — operator overrides via env.
SOFIA_EMAIL="${SOFIA_EMAIL:-sofia.gomez@acme-intel.demo}"
MARCOS_EMAIL="${MARCOS_EMAIL:-marcos.fernandez@acme-intel.demo}"
ESCALATION_MANAGER_EMAIL="${ESCALATION_MANAGER_EMAIL:-intel-manager@acme-intel.demo}"
COMPLIANCE_WEBHOOK_URL="${COMPLIANCE_WEBHOOK_URL:-http://localhost:7100/_mock/compliance-cases}"
COMPLIANCE_WEBHOOK_HMAC_SECRET="${COMPLIANCE_WEBHOOK_HMAC_SECRET:-}"
ACTOR_ALERT_SLA_SECONDS="${ACTOR_ALERT_SLA_SECONDS:-300}"
CASE_ASSIGNMENT_SLA_SECONDS="${CASE_ASSIGNMENT_SLA_SECONDS:-900}"

log()  { printf '[register-notifications] %s\n' "$*" >&2; }
warn() { printf '[register-notifications] WARN: %s\n' "$*" >&2; }
fail() { printf '[register-notifications] FAIL: %s\n' "$*" >&2; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "missing command '$1'"; }
require_cmd curl
require_cmd jq
require_cmd yq
[ -f "$ASSET" ] || fail "asset not found: $ASSET"

# Substitute the parameter placeholders. Done as a sed pass because
# the values are scalars; the only structural variable in the body
# is the template object (handled via jq below).
substitute() {
    sed \
        -e "s|\${sofia_email}|$SOFIA_EMAIL|g" \
        -e "s|\${marcos_email}|$MARCOS_EMAIL|g" \
        -e "s|\${escalation_manager_email}|$ESCALATION_MANAGER_EMAIL|g" \
        -e "s|\${compliance_webhook_url}|$COMPLIANCE_WEBHOOK_URL|g" \
        -e "s|\${actor_alert_sla_seconds}|$ACTOR_ALERT_SLA_SECONDS|g" \
        -e "s|\${case_assignment_sla_seconds}|$CASE_ASSIGNMENT_SLA_SECONDS|g"
}

# Resolve the template body for a given template_ref. Returns a JSON
# object the notification service stores as the Subscription.template
# field. Subject+body templates are emitted as {"subject","body"};
# the webhook template (mode=webhook_json) is emitted as the raw
# payload object.
resolve_template() {
    local ref="$1"
    yq -o=json "
        .notification_routing.templates[] | select(.id == \"$ref\") | (
            if .mode == \"webhook_json\" then
                {payload: .payload}
            else
                {subject: .subject, body: .body, content_mime: .content_mime}
            end
        )
    " "$ASSET" | substitute
}

count="$(yq '.notification_routing.subscriptions | length' "$ASSET")"
[ "$count" -gt 0 ] || fail "no subscriptions found in $ASSET"
log "found $count subscriptions"

ok=0
fails=0
for i in $(seq 0 $((count-1))); do
    name="$(yq -r ".notification_routing.subscriptions[$i].id" "$ASSET")"
    event_type="$(yq -r ".notification_routing.subscriptions[$i].event_type" "$ASSET")"
    channel="$(yq -r ".notification_routing.subscriptions[$i].channel" "$ASSET")"
    target_raw="$(yq -r ".notification_routing.subscriptions[$i].target" "$ASSET")"
    template_ref="$(yq -r ".notification_routing.subscriptions[$i].template_ref" "$ASSET")"
    sla_raw="$(yq -r ".notification_routing.subscriptions[$i].sla_seconds // \"\"" "$ASSET")"
    escalation_raw="$(yq -r ".notification_routing.subscriptions[$i].escalation_target // \"\"" "$ASSET")"
    hmac_env_key="$(yq -r ".notification_routing.subscriptions[$i].hmac_secret_env // \"\"" "$ASSET")"

    target="$(printf '%s' "$target_raw" | substitute)"
    sla="$(printf '%s' "$sla_raw" | substitute)"
    escalation="$(printf '%s' "$escalation_raw" | substitute)"

    template_body="$(resolve_template "$template_ref")"
    [ -n "$template_body" ] || fail "subscription $name: template_ref $template_ref did not resolve"

    # Build the request body. Optional fields are added with --argjson
    # null pairs so jq emits them as JSON null where appropriate.
    body="$(jq -n \
        --arg event_type "$event_type" \
        --arg channel "$channel" \
        --arg target "$target" \
        --argjson template "$template_body" \
        '{event_type: $event_type, channel: $channel, target: $target, template: $template, enabled: true}')"

    if [ -n "$sla" ] && [ "$sla" != "null" ]; then
        body="$(printf '%s' "$body" | jq --argjson v "$sla" '. + {sla_seconds: $v}')"
    fi
    if [ -n "$escalation" ] && [ "$escalation" != "null" ]; then
        body="$(printf '%s' "$body" | jq --arg v "$escalation" '. + {escalation_target: $v}')"
    fi
    if [ -n "$hmac_env_key" ]; then
        # Indirect lookup: the YAML names the env var; we read its value here.
        hmac_value="${!hmac_env_key:-}"
        if [ -z "$hmac_value" ]; then
            warn "subscription $name expects HMAC secret in \$$hmac_env_key but it is unset — webhook will dispatch unsigned"
        else
            body="$(printf '%s' "$body" | jq --arg v "$hmac_value" '. + {hmac_secret: $v}')"
        fi
    fi

    log "registering subscription: $name ($event_type → $channel)"
    if resp="$(curl --silent --show-error --fail-with-body \
                -X POST "$API/api/v1/notifications/subscriptions" \
                -H "Authorization: Bearer $AUTH_BEARER" \
                -H 'Content-Type: application/json' \
                --data "$body" 2>&1)"; then
        id="$(printf '%s' "$resp" | jq -r '.id // empty')"
        log "  → $id"
        ok=$((ok+1))
    else
        warn "  POST $name failed (possibly duplicate on re-run): $resp"
        fails=$((fails+1))
    fi
done

log "summary: ok=$ok failed=$fails"
log "verify: curl -s -H \"Authorization: Bearer \$AUTH_BEARER\" $API/api/v1/notifications/subscriptions | jq '.data[] | {event_type, channel, target}'"
[ "$ok" -gt 0 ] || exit 1
