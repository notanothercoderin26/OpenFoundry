#!/usr/bin/env bash
# Aggregate code quality metrics into a single Markdown report.
#
# Usage:
#   tools/quality-report.sh                 # writes ./quality-report.md
#   QUALITY_REPORT_OUT=foo.md tools/quality-report.sh
#   SKIP_TESTS=1 tools/quality-report.sh    # skip the (slow) race+coverage run
#   SKIP_FRONTEND=1 tools/quality-report.sh # skip pnpm tsc on apps/web
#
# Missing optional tools are reported as SKIP rather than FAIL, so the
# script completes even on a fresh clone. The exit code is always 0 —
# the goal is a report, not a gate. Pipe through `grep -E '\| FAIL'`
# on the summary table if you want a non-zero gate.

set -u
set -o pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

OUT="${QUALITY_REPORT_OUT:-quality-report.md}"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

GO="${GO:-go}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
status_dir="$TMPDIR/status"
mkdir -p "$status_dir"

record() {
  # record <slug> <PASS|FAIL|SKIP>
  printf '%s' "$2" >"$status_dir/$1"
}

run_check() {
  # run_check <slug> <human label> <cmd...>
  local slug="$1" label="$2"; shift 2
  local log="$TMPDIR/${slug}.log"
  printf '### %s\n\n' "$label"
  printf '```\n'
  if "$@" >"$log" 2>&1; then
    tail -200 "$log"
    printf '```\n\n**Status:** PASS\n\n'
    record "$slug" PASS
  else
    local rc=$?
    tail -200 "$log"
    printf '```\n\n**Status:** FAIL (exit %d)\n\n' "$rc"
    record "$slug" FAIL
  fi
}

skip_check() {
  # skip_check <slug> <label> <reason>
  printf '### %s\n\n_Skipped: %s_\n\n' "$2" "$3"
  record "$1" SKIP
}

# ---------------------------------------------------------------------------
# Report body (written to a temp file then concatenated with summary)
# ---------------------------------------------------------------------------
body="$TMPDIR/body.md"

{
  echo "# Code Quality Report"
  echo
  echo "- **Generated:** $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo "- **Branch:** $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo n/a)"
  echo "- **Commit:** $(git rev-parse --short HEAD 2>/dev/null || echo n/a)"
  echo "- **Repo:** \`$REPO_ROOT\`"
  echo

  echo "## Static analysis"
  echo
  run_check "vet" "go vet ./..." "$GO" vet ./...

  if command -v golangci-lint >/dev/null 2>&1; then
    run_check "golangci-lint" "golangci-lint (full backlog, --new-from-rev=)" \
      golangci-lint run --new-from-rev= --timeout 5m ./...
  else
    skip_check "golangci-lint" "golangci-lint" "not installed — run \`make tools\`"
  fi

  echo "## Tests & coverage"
  echo
  if [[ "${SKIP_TESTS:-}" == "1" ]]; then
    skip_check "tests" "go test -race + coverage" "SKIP_TESTS=1"
  else
    local_cover="$TMPDIR/cover.out"
    printf '### go test -race + coverage\n\n```\n'
    if "$GO" test -race -count=1 -coverprofile="$local_cover" -covermode=atomic ./... \
        >"$TMPDIR/tests.log" 2>&1; then
      tail -100 "$TMPDIR/tests.log"
      printf '```\n\n'
      total=$("$GO" tool cover -func="$local_cover" 2>/dev/null | awk '/^total:/ {print $3}')
      printf '**Total coverage:** %s\n\n**Status:** PASS\n\n' "${total:-unknown}"
      record "tests" PASS
    else
      rc=$?
      tail -200 "$TMPDIR/tests.log"
      printf '```\n\n**Status:** FAIL (exit %d)\n\n' "$rc"
      record "tests" FAIL
    fi
  fi

  echo "## Security"
  echo
  if command -v govulncheck >/dev/null 2>&1; then
    run_check "govulncheck" "govulncheck ./..." govulncheck ./...
  else
    skip_check "govulncheck" "govulncheck" \
      "not installed — \`go install golang.org/x/vuln/cmd/govulncheck@latest\`"
  fi

  echo "## Complexity & duplication"
  echo
  if command -v gocyclo >/dev/null 2>&1; then
    run_check "gocyclo" "gocyclo (functions with complexity > 15)" \
      gocyclo -over 15 .
  else
    skip_check "gocyclo" "gocyclo" \
      "not installed — \`go install github.com/fzipp/gocyclo/cmd/gocyclo@latest\`"
  fi

  if command -v dupl >/dev/null 2>&1; then
    run_check "dupl" "dupl (duplicated blocks > 50 tokens)" \
      dupl -threshold 50 ./...
  else
    skip_check "dupl" "dupl" \
      "not installed — \`go install github.com/mibk/dupl@latest\`"
  fi

  echo "## Module hygiene"
  echo
  run_check "tidy-drift" "go mod tidy (drift check)" bash -c '
    cp go.mod "'"$TMPDIR"'/go.mod.bak"
    cp go.sum "'"$TMPDIR"'/go.sum.bak"
    "'"$GO"'" mod tidy
    rc=0
    diff -q go.mod "'"$TMPDIR"'/go.mod.bak" >/dev/null || rc=1
    diff -q go.sum "'"$TMPDIR"'/go.sum.bak" >/dev/null || rc=1
    cp "'"$TMPDIR"'/go.mod.bak" go.mod
    cp "'"$TMPDIR"'/go.sum.bak" go.sum
    [ $rc -eq 0 ] && echo "go.mod / go.sum are tidy" || echo "go mod tidy would modify go.mod or go.sum"
    exit $rc
  '

  echo "## Contracts drift"
  echo
  run_check "contracts" "make contracts-check" make --no-print-directory contracts-check

  echo "## Frontend (apps/web)"
  echo
  if [[ "${SKIP_FRONTEND:-}" == "1" ]]; then
    skip_check "frontend" "pnpm --filter @open-foundry/web check" "SKIP_FRONTEND=1"
  elif command -v pnpm >/dev/null 2>&1; then
    run_check "frontend" "pnpm --filter @open-foundry/web check" \
      pnpm --filter @open-foundry/web check
  else
    skip_check "frontend" "pnpm tsc" "pnpm not installed"
  fi
} >"$body"

# ---------------------------------------------------------------------------
# Summary table
# ---------------------------------------------------------------------------
summary="$TMPDIR/summary.md"
{
  echo "## Summary"
  echo
  echo "| Check | Status |"
  echo "|---|---|"
  for f in "$status_dir"/*; do
    [ -f "$f" ] || continue
    slug="${f##*/}"
    state=$(cat "$f")
    case "$state" in
      PASS) marker="PASS" ;;
      FAIL) marker="FAIL" ;;
      SKIP) marker="SKIP" ;;
      *)    marker="$state" ;;
    esac
    printf '| %s | %s |\n' "$slug" "$marker"
  done
  echo
  pass=$(grep -l '^PASS$' "$status_dir"/* 2>/dev/null | wc -l | tr -d ' ')
  fail=$(grep -l '^FAIL$' "$status_dir"/* 2>/dev/null | wc -l | tr -d ' ')
  skip=$(grep -l '^SKIP$' "$status_dir"/* 2>/dev/null | wc -l | tr -d ' ')
  printf '**Totals:** %s PASS, %s FAIL, %s SKIP\n' "$pass" "$fail" "$skip"
} >"$summary"

# ---------------------------------------------------------------------------
# Emit final report
# ---------------------------------------------------------------------------
cat "$summary" "$body" >"$OUT"
cat "$summary"
echo
echo "Full report written to: $OUT"
