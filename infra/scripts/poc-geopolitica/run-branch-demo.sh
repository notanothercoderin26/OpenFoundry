#!/usr/bin/env bash
# Run the Geopolitical PoC Global Branch demo (UC-6).
#
# Source of truth:
#   PoC/geopolitica/assets/branch-demo-geopolitica.yaml
#
# Walks the demo crescendo: create branch → register participants →
# submit 12 propose-sanctions-extension actions → re-run the
# sanctions-aggregator on branch → trigger preview hooks → discard.
#
# Inputs (env):
#   BRANCH_API                — global-branch-service base URL
#   ACTIONS_API               — ontology-actions-service base URL
#   PIPELINES_API             — pipeline-build-service base URL (preview rerun)
#   AUTH_BEARER               — JWT for an operator with workflow:write + actions:execute + branch:write
#   PROPOSE_ACTION_TYPE_ID    — UUID of the propose-sanctions-extension action_type
#                                (lookup with: GET $ACTIONS_API/api/v1/ontology/actions?name=propose-sanctions-extension)
#   FINALISE_MODE             — overrides finalisation.mode in the asset
#                                ("discard" default; "merge" for a real merge demo)
#   DRY_RUN                   — "1" to stop after candidates are submitted (skip
#                                preview + finalisation). Useful for rehearsal.
#
# Exit codes:
#   0 — branch fully exercised; finalisation completed
#   1 — any step returned non-2xx
#
# The script is NOT idempotent against the service: a second run with
# the same branch name 409s on create. The cleanup is implicit via
# finalisation=discard.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ASSET="$ROOT_DIR/PoC/geopolitica/assets/branch-demo-geopolitica.yaml"

BRANCH_API="${BRANCH_API:-http://localhost:9416}"
ACTIONS_API="${ACTIONS_API:-http://localhost:9404}"
PIPELINES_API="${PIPELINES_API:-http://localhost:9402}"
AUTH_BEARER="${AUTH_BEARER:?must export AUTH_BEARER}"
PROPOSE_ACTION_TYPE_ID="${PROPOSE_ACTION_TYPE_ID:-}"
FINALISE_MODE="${FINALISE_MODE:-}"
DRY_RUN="${DRY_RUN:-0}"

log()  { printf '[branch-demo] %s\n' "$*" >&2; }
warn() { printf '[branch-demo] WARN: %s\n' "$*" >&2; }
fail() { printf '[branch-demo] FAIL: %s\n' "$*" >&2; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "missing command '$1'"; }
require_cmd curl
require_cmd jq
require_cmd yq
[ -f "$ASSET" ] || fail "asset not found: $ASSET"

post() {
    local api="$1" path="$2" body="$3"
    curl --silent --show-error --fail-with-body \
        -X POST "$api$path" \
        -H "Authorization: Bearer $AUTH_BEARER" \
        -H 'Content-Type: application/json' \
        --data "$body"
}

# ─────────────────────────────────────────────────────────────────────
# 1. Create the branch
# ─────────────────────────────────────────────────────────────────────
BRANCH_NAME="$(yq -r '.branch_demo.branch.name' "$ASSET")"
BRANCH_BASE="$(yq -r '.branch_demo.branch.base_ref' "$ASSET")"
BRANCH_DESC="$(yq -r '.branch_demo.branch.description' "$ASSET")"

log "creating branch $BRANCH_NAME (base=$BRANCH_BASE)"
RESP="$(post "$BRANCH_API" /api/v1/global-branches "$(jq -nc \
    --arg n "$BRANCH_NAME" --arg b "$BRANCH_BASE" --arg d "$BRANCH_DESC" \
    '{name:$n, base_ref:$b, description:$d}')")" \
    || fail "create branch failed: $RESP"
BRANCH_ID="$(printf '%s' "$RESP" | jq -r '.id')"
log "  → branch_id=$BRANCH_ID"

# ─────────────────────────────────────────────────────────────────────
# 2. Register participants
# ─────────────────────────────────────────────────────────────────────
PARTICIPANT_COUNT="$(yq '.branch_demo.participants | length' "$ASSET")"
log "registering $PARTICIPANT_COUNT participants"
for i in $(seq 0 $((PARTICIPANT_COUNT-1))); do
    svc="$(yq -r ".branch_demo.participants[$i].service_name" "$ASSET")"
    ref="$(yq -r ".branch_demo.participants[$i].local_branch_ref" "$ASSET")"
    body="$(jq -nc --arg s "$svc" --arg r "$ref" '{service_name:$s, local_branch_ref:$r}')"
    if ! resp="$(post "$BRANCH_API" "/api/v1/global-branches/$BRANCH_ID/participants" "$body" 2>&1)"; then
        warn "  participant $svc registration failed: $resp"
    else
        log "  → $svc"
    fi
done

# ─────────────────────────────────────────────────────────────────────
# 3. Submit the 12 propose-sanctions-extension actions on the branch.
#    The branch context is carried via X-Of-Branch header (operator
#    wiring; documented in the runbook).
# ─────────────────────────────────────────────────────────────────────
if [ -z "$PROPOSE_ACTION_TYPE_ID" ]; then
    fail "PROPOSE_ACTION_TYPE_ID is unset — lookup with: curl -s $ACTIONS_API/api/v1/ontology/actions | jq -r '.[] | select(.name==\"propose-sanctions-extension\") | .id'"
fi

CANDIDATE_COUNT="$(yq '.branch_demo.candidates | length' "$ASSET")"
log "submitting $CANDIDATE_COUNT candidate actions on branch $BRANCH_NAME"
SUBMITTED=0
for i in $(seq 0 $((CANDIDATE_COUNT-1))); do
    actor_id="$(yq -r ".branch_demo.candidates[$i].actor_id" "$ASSET")"
    display_name="$(yq -r ".branch_demo.candidates[$i].display_name" "$ASSET")"
    country="$(yq -r ".branch_demo.candidates[$i].country_iso3" "$ASSET")"
    qid="$(yq -r ".branch_demo.candidates[$i].wikidata_qid" "$ASSET")"
    rationale="$(yq -r ".branch_demo.candidates[$i].rationale" "$ASSET")"

    body="$(jq -nc \
        --arg actor "$actor_id" --arg dn "$display_name" \
        --arg c "$country" --arg q "$qid" --arg r "$rationale" '{
        parameters: {
            actor_id:        $actor,
            display_name:    $dn,
            country_iso3:    $c,
            wikidata_qid:    $q,
            program:         "PROPOSED-2026Q3",
            proposed_status: "PROPOSED",
            rationale:       $r
        },
        justification: "Demo branch UC-6 — fictitious candidate batch."
    }')"

    if resp="$(curl --silent --show-error --fail-with-body \
                -X POST "$ACTIONS_API/api/v1/ontology/actions/$PROPOSE_ACTION_TYPE_ID/execute" \
                -H "Authorization: Bearer $AUTH_BEARER" \
                -H "X-Of-Branch: $BRANCH_NAME" \
                -H 'Content-Type: application/json' \
                --data "$body" 2>&1)"; then
        SUBMITTED=$((SUBMITTED+1))
        log "  → $display_name ($country)"
    else
        warn "  $display_name submission failed: $resp"
    fi
done
log "submitted $SUBMITTED / $CANDIDATE_COUNT actions"

if [ "$DRY_RUN" = "1" ]; then
    log "DRY_RUN=1 — stopping before preview hooks and finalisation. Branch left in place."
    log "Clean up later with: curl -X POST $BRANCH_API/api/v1/global-branches/$BRANCH_ID/abandon -H 'Authorization: Bearer ...'"
    exit 0
fi

# ─────────────────────────────────────────────────────────────────────
# 4. Re-run the sanctions-aggregator on the branch so the 12 PROPOSED
#    rows fan out into the canonical Actor table.
# ─────────────────────────────────────────────────────────────────────
log "re-running sanctions-aggregator on branch"
if ! resp="$(curl --silent --show-error --fail-with-body \
                -X POST "$PIPELINES_API/api/v1/pipelines/sanctions-aggregator/run" \
                -H "Authorization: Bearer $AUTH_BEARER" \
                -H "X-Of-Branch: $BRANCH_NAME" \
                -H 'Content-Type: application/json' \
                --data '{}' 2>&1)"; then
    warn "  pipeline re-run failed: $resp (continuing — preview will reflect only the row-level adds)"
else
    log "  → pipeline run started"
fi

# ─────────────────────────────────────────────────────────────────────
# 5. Finalise: dry-run merge first (for the ActionLog), then discard.
# ─────────────────────────────────────────────────────────────────────
mode="$FINALISE_MODE"
if [ -z "$mode" ]; then
    mode="$(yq -r '.branch_demo.finalisation.mode' "$ASSET")"
fi
dry_first="$(yq -r '.branch_demo.finalisation.dry_run_merge_first' "$ASSET")"

if [ "$dry_first" = "true" ]; then
    log "performing dry-run merge for the audit trail"
    if ! resp="$(post "$BRANCH_API" "/api/v1/global-branches/$BRANCH_ID/merge" '{"strategy":"coordinated","dry_run":true}' 2>&1)"; then
        warn "  dry-run merge failed (service may not yet support dry_run): $resp"
    fi
fi

case "$mode" in
    discard)
        log "discarding branch (demo-script default)"
        if ! resp="$(post "$BRANCH_API" "/api/v1/global-branches/$BRANCH_ID/abandon" '{}' 2>&1)"; then
            fail "discard failed: $resp"
        fi
        log "  → branch abandoned; main is unchanged"
        ;;
    merge)
        log "MERGING branch into main (FINALISE_MODE=merge)"
        if ! resp="$(post "$BRANCH_API" "/api/v1/global-branches/$BRANCH_ID/merge" '{"strategy":"coordinated"}' 2>&1)"; then
            fail "merge failed: $resp"
        fi
        log "  → branch merged into main"
        ;;
    *)
        fail "unknown finalisation mode: $mode"
        ;;
esac

log "done — branch_id=$BRANCH_ID submitted=$SUBMITTED mode=$mode"
