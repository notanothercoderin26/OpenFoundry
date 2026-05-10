#!/usr/bin/env bash
# build-and-push-wired.sh — build & push only the services listed on stdin
# to the Lima cluster local registry (localhost:30501).
#
# Reads service names (one per line) from /tmp/wired-services.txt and
# runs `docker buildx build --platform linux/arm64 --load` followed by
# `docker push` for each. Parallelism: 6.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

LIST="${1:-/tmp/wired-services.txt}"
LOG=/tmp/wired-build.log
: > "$LOG"

build_one() {
  local svc="$1"
  local image="localhost:30501/${svc}:0.1.0"
  local start=$(date +%s)

  if ! docker buildx build --platform linux/arm64 --load \
       -t "$image" -f "services/${svc}/Dockerfile" . > "/tmp/build-${svc}.log" 2>&1; then
    echo "$(date -Iseconds) FAIL build ${svc} ($(($(date +%s) - start))s)" | tee -a "$LOG"
    return 1
  fi

  if ! docker push "$image" >> "/tmp/build-${svc}.log" 2>&1; then
    echo "$(date -Iseconds) FAIL push  ${svc} ($(($(date +%s) - start))s)" | tee -a "$LOG"
    return 1
  fi

  echo "$(date -Iseconds) OK   ${svc} ($(($(date +%s) - start))s)" | tee -a "$LOG"
}

export -f build_one
export LOG

xargs -P 6 -I{} bash -c 'build_one "$@"' _ {} < "$LIST"

echo
echo "=== Summary ==="
ok=$(grep -c ' OK ' "$LOG" 2>/dev/null | head -1)
fail=$(grep -c ' FAIL ' "$LOG" 2>/dev/null | head -1)
echo "OK:   ${ok:-0}"
echo "FAIL: ${fail:-0}"
if [ "${fail:-0}" -gt 0 ]; then
  echo "Failed services:"
  grep ' FAIL ' "$LOG" | awk '{print $4}' | sort -u
fi
