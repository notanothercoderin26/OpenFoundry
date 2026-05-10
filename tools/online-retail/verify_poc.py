#!/usr/bin/env python3
"""
PoC Online Retail — agent-driven end-to-end verifier.

This is the "AI-agent friendly" PoC harness. It hits the same HTTP API
the React runtime hits, with no browser involved. Use it both as:
  * a regression smoke before merging app fixture changes, and
  * a worked example of how an autonomous agent can drive an OpenFoundry
    app through its public/runtime contract (publish → query → action →
    re-query → assert side effect).

Exit code 0 means PoC is healthy. Non-zero means something regressed.

Usage:
    JWT=$(cat /tmp/of-jwt) python3 tools/online-retail/verify_poc.py \\
        --gateway http://192.168.105.2 \\
        --slug    poc-anomaly-review

Optional flags:
    --execute-action     Actually execute mark_as_reviewed on one anomaly
                         and assert the needs_review count drops by 1.
                         Off by default to keep the verifier idempotent.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

GREEN = "\033[1;32m"
RED = "\033[1;31m"
YELLOW = "\033[1;33m"
DIM = "\033[2m"
RESET = "\033[0m"


def ok(msg: str) -> None:
    print(f"{GREEN}✔{RESET} {msg}")


def fail(msg: str) -> None:
    print(f"{RED}✘{RESET} {msg}")


def info(msg: str) -> None:
    print(f"{DIM}…{RESET} {msg}")


def warn(msg: str) -> None:
    print(f"{YELLOW}!{RESET} {msg}")


def http(method: str, url: str, token: str, body: Any | None = None) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, method=method, data=data)
    req.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body_text = e.read().decode(errors="replace")
        raise SystemExit(
            f"HTTP {e.code} {method} {url}\n  body: {body_text[:500]}"
        ) from e


def envelope_items(payload: Any) -> list[dict]:
    """Normalise list responses: {items: []} | {data: []} | []."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        return payload.get("items") or payload.get("data") or []
    return []


def envelope_total(payload: Any, fallback_items: list) -> int:
    if isinstance(payload, dict):
        t = payload.get("total")
        if isinstance(t, int):
            return t
    return len(fallback_items)


def find_first(items: list[dict], **kv: Any) -> dict | None:
    for it in items:
        if all(it.get(k) == v for k, v in kv.items()):
            return it
    return None


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--gateway", default=os.environ.get("GATEWAY", "http://192.168.105.2"))
    p.add_argument("--slug", default="poc-anomaly-review")
    p.add_argument("--token", default=os.environ.get("JWT", ""))
    p.add_argument("--execute-action", action="store_true",
                   help="Execute mark_as_reviewed on one anomaly and assert KPI drops by 1")
    args = p.parse_args()

    if not args.token:
        token_file = "/tmp/of-jwt"
        if os.path.exists(token_file):
            args.token = open(token_file).read().strip()
        else:
            fail("Missing JWT — pass --token or export JWT or write /tmp/of-jwt")
            return 2

    g = args.gateway.rstrip("/")
    failures = 0

    # ── 1. Published app reachable + has expected pages ────────────────────
    info(f"GET /api/v1/apps/public/{args.slug}")
    try:
        published = http("GET", f"{g}/api/v1/apps/public/{args.slug}", args.token)
    except SystemExit as e:
        fail(str(e))
        return 1
    app = published["app"]
    ok(f"Published app: {app['name']} v{published.get('published_version_number')}")

    page_names = [p["name"] for p in app.get("pages", [])]
    expected_pages = {"Overview", "Anomalies", "Customer drilldown"}
    missing = expected_pages - set(page_names)
    if missing:
        fail(f"Missing pages: {missing}")
        failures += 1
    else:
        ok(f"All 3 pages present: {page_names}")

    # ── 2. Discover the transaction object type ────────────────────────────
    info("GET /api/v1/ontology/types")
    types_resp = http("GET", f"{g}/api/v1/ontology/types", args.token)
    type_items = envelope_items(types_resp)
    tx_type = find_first(type_items, name="transaction")
    if not tx_type:
        fail("No 'transaction' object type found")
        return 1
    tx_type_id = tx_type["id"]
    ok(f"Transaction type id = {tx_type_id[:12]}…")

    # ── 3. KPI: count anomalies (review_status = needs_review) ─────────────
    info("POST /api/v1/ontology/types/{tx}/objects/query  equals={review_status:needs_review}")
    q = http(
        "POST",
        f"{g}/api/v1/ontology/types/{tx_type_id}/objects/query",
        args.token,
        {"equals": {"review_status": "needs_review"}, "per_page": 5000},
    )
    q_items = envelope_items(q)
    needs_review = envelope_total(q, q_items)
    if needs_review > 0:
        ok(f"KPI 'needs_review' = {needs_review}")
    else:
        fail("KPI 'needs_review' = 0 (expected >0 after seed)")
        failures += 1

    # ── 4. Country breakdown (chart_xy data shape) ─────────────────────────
    info("Computing country distribution (mirror of chart_xy)")
    by_country: dict[str, int] = {}
    for obj in q_items:
        c = (obj.get("properties", {}) or {}).get("country", "?")
        by_country[c] = by_country.get(c, 0) + 1
    if by_country:
        top = sorted(by_country.items(), key=lambda x: -x[1])[:3]
        ok("Top 3 countries: " + ", ".join(f"{c}={n}" for c, n in top))
    else:
        warn("No country data on anomalies")

    # ── 5. Discover actions ────────────────────────────────────────────────
    info("GET /api/v1/ontology/actions")
    actions = http("GET", f"{g}/api/v1/ontology/actions", args.token)
    action_items = envelope_items(actions)
    mark = find_first(action_items, name="mark_as_reviewed")
    escalate = find_first(action_items, name="escalate_anomaly")
    if mark and escalate:
        ok(f"Actions registered: mark_as_reviewed, escalate_anomaly")
    else:
        fail(f"Missing actions: mark={bool(mark)} escalate={bool(escalate)}")
        failures += 1

    # ── 6. (optional) Execute action and assert KPI drops by 1 ─────────────
    if args.execute_action and mark and needs_review > 0:
        target = q_items[0]
        target_id = target["id"]
        info(f"POST /api/v1/ontology/actions/{mark['id'][:8]}…/execute  target={target_id[:12]}…")
        try:
            exec_resp = http(
                "POST",
                f"{g}/api/v1/ontology/actions/{mark['id']}/execute",
                args.token,
                {"target_object_id": target_id, "parameters": {}},
            )
            ok(f"Action executed; deleted={exec_resp.get('deleted')}")
        except SystemExit as e:
            fail(f"Action execution failed: {e}")
            failures += 1
        else:
            q2 = http(
                "POST",
                f"{g}/api/v1/ontology/types/{tx_type_id}/objects/query",
                args.token,
                {"equals": {"review_status": "needs_review"}, "per_page": 5000},
            )
            q2_items = envelope_items(q2)
            after = envelope_total(q2, q2_items)
            if after == needs_review - 1:
                ok(f"KPI dropped: {needs_review} → {after} (Δ=-1) ✔ end-to-end action loop verified")
            else:
                fail(f"KPI did not drop by exactly 1: {needs_review} → {after}")
                failures += 1

    # ── 7. Customers + products sanity ─────────────────────────────────────
    for type_search, label, expected_min in [
        ("customer", "customers", 20),
        ("product", "products", 100),
    ]:
        t = find_first(type_items, name=type_search)
        if not t:
            warn(f"No '{type_search}' type")
            continue
        ls = http(
            "POST",
            f"{g}/api/v1/ontology/types/{t['id']}/objects/query",
            args.token,
            {"per_page": 5000},
        )
        ls_items = envelope_items(ls)
        n = envelope_total(ls, ls_items)
        if n >= expected_min:
            ok(f"{label}: {n} (≥ {expected_min})")
        else:
            warn(f"{label}: {n} (< expected {expected_min})")

    print()
    if failures == 0:
        ok(f"PoC verification PASSED — every contract held green")
        return 0
    fail(f"PoC verification FAILED — {failures} assertion(s) regressed")
    return 1


if __name__ == "__main__":
    sys.exit(main())
