#!/usr/bin/env python3
# seed_object_database.py — PoC stand-in for the production indexer.
#
# What this is:  a one-shot Python helper that reads a slice of the
# Online Retail II CSV that was already loaded into Iceberg by the Spark
# pipeline, projects rows into the SPA's ObjectInstance shape, and PUTs
# them through the gateway into object-database-service. The bridge
# handler at `/api/v1/ontology/types/{id}/objects` (added in the same
# commit) translates onto the canonical ObjectStore put.
#
# What this is NOT:  the production indexer. The production design is in
# docs/poc-online-retail/RUNTIME-INDEXER.md — it's a Go control-plane
# service that dispatches a Spark Application CR per Iceberg table and
# runs in-cluster. This script exists so the dashboard can show real
# rows in the PoC environment without waiting on that service to land.
#
# Usage:
#   GATEWAY=http://localhost:18080 TOKEN=$(cat /tmp/of-jwt) \
#     python3 seed_object_database.py [--limit 500]

import argparse
import csv
import json
import math
import os
import sys
import time
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError

CSV_PATH = Path(__file__).with_name("online_retail.csv")

# Type IDs come from the metadata bootstrap — see bootstrap_ontology.sh.
TYPE_TRANSACTION = "678b55fe-db5f-4d3a-bbf2-8cb643af8d32"
TYPE_PRODUCT     = "616c7a42-6522-4f94-b696-ddb056cf9b11"
TYPE_CUSTOMER    = "46e2598c-0d11-4ab2-a4aa-301f3e8fb5a7"


def http_post(url: str, token: str, body: dict) -> dict:
    req = urllib_request.Request(
        url,
        method="POST",
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "x-of-tenant": "default",
        },
    )
    try:
        with urllib_request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode() or "{}")
    except HTTPError as e:
        sys.stderr.write(f"HTTP {e.code} on {url}: {e.read().decode()[:200]}\n")
        raise
    except URLError as e:
        sys.stderr.write(f"URL error on {url}: {e}\n")
        raise


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=500,
                   help="Cap on raw CSV rows considered (drives object counts).")
    p.add_argument("--gateway", default=os.environ.get("GATEWAY", "http://localhost:18080"))
    p.add_argument("--token", default=os.environ.get("TOKEN", ""))
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if not args.token:
        sys.stderr.write("ERROR: pass --token <jwt> or set TOKEN env var\n")
        return 2
    if not CSV_PATH.exists():
        sys.stderr.write(f"ERROR: CSV not found: {CSV_PATH}\n")
        return 2

    # Read N rows. Build deduped products and customers in pass-1.
    products: "OrderedDict[str, dict]" = OrderedDict()
    customers: "OrderedDict[str, dict]" = OrderedDict()
    transactions: list[dict] = []
    skipped = 0

    with CSV_PATH.open(newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i >= args.limit:
                break
            stockcode = (row.get("stockcode") or "").strip()
            customer_id = (row.get("customer_id") or "").strip()
            if not stockcode or not customer_id:
                skipped += 1
                continue
            try:
                qty = int(row["quantity"])
                price = float(row["price"])
            except (KeyError, ValueError):
                skipped += 1
                continue
            invoice_date = (row.get("invoice_date") or "").replace(" ", "T")

            products.setdefault(stockcode, {
                "stockcode": stockcode,
                "description": (row.get("description") or "").strip(),
                # `price` is the canonical fixture name (see
                # tools/online-retail/sql/03-properties-and-link-types.sql).
                "price": price,
            })

            cust_entry = customers.setdefault(customer_id, {
                "customer_id": customer_id,
                "country": (row.get("country") or "").strip(),
                "first_seen": invoice_date,
                "transaction_count": 0,
                "total_revenue": 0.0,
            })
            cust_entry["transaction_count"] += 1
            cust_entry["total_revenue"] = round(
                cust_entry["total_revenue"] + qty * price, 2,
            )

            tx_id = f"{row['invoice']}-{stockcode}"
            transactions.append({
                # Canonical fixture names — keep aligned with
                # tools/online-retail/sql/03-properties-and-link-types.sql
                # and tools/online-retail/dashboard-app-definition.json so
                # the property_list / table widgets don't render "—".
                "transaction_id": tx_id,
                "invoice": (row.get("invoice") or "").strip(),
                "stockcode": stockcode,
                "description": (row.get("description") or "").strip(),
                "customer_id": customer_id,
                "quantity": qty,
                "price": price,
                "revenue": round(qty * price, 2),
                "invoice_date": invoice_date,
                "country": (row.get("country") or "").strip(),
                # `revenue_zscore` and `is_anomaly` are filled in below
                # once the per-stockcode population is known.
                "revenue_zscore": 0.0,
                "is_anomaly": False,
                # The dashboard "Anomalies" widget filters on review_status.
                # The Spark anomaly transform flagged a subset; for the seed
                # we mark high-quantity rows as needs_review so the widget
                # has rows.
                "review_status": "needs_review" if qty >= 12 else "clean",
            })

    # Compute revenue z-score per stockcode and flag |z| > 3 as is_anomaly.
    # Mirrors the Spark anomaly transform contract documented in the
    # fixture (`abs(z) > 3`).
    by_sku: "dict[str, list[float]]" = defaultdict(list)
    for t in transactions:
        by_sku[t["stockcode"]].append(t["revenue"])
    sku_stats: dict[str, tuple[float, float]] = {}
    for sku, rev in by_sku.items():
        n = len(rev)
        mean = sum(rev) / n
        var = sum((r - mean) ** 2 for r in rev) / n if n > 1 else 0.0
        sku_stats[sku] = (mean, math.sqrt(var))
    for t in transactions:
        mean, sd = sku_stats[t["stockcode"]]
        z = (t["revenue"] - mean) / sd if sd > 0 else 0.0
        t["revenue_zscore"] = round(z, 4)
        t["is_anomaly"] = abs(z) > 3

    print(f"parsed: {len(transactions)} transactions, "
          f"{len(products)} products, {len(customers)} customers "
          f"(skipped {skipped} rows)")

    base = f"{args.gateway.rstrip('/')}/api/v1/ontology/types"
    started = time.time()

    def post(type_id: str, properties: dict) -> None:
        # Retry with exponential back-off when the gateway throttles us.
        delay = 0.25
        for attempt in range(6):
            try:
                http_post(f"{base}/{type_id}/objects", args.token, {"properties": properties})
                return
            except HTTPError as e:
                if e.code == 429 and attempt < 5:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise
        # Light throttle to stay under the gateway's per-IP token bucket.
        time.sleep(0.01)

    for stockcode, p in products.items():
        post(TYPE_PRODUCT, p)
    print(f"  products    OK ({len(products)})")
    for customer_id, c in customers.items():
        post(TYPE_CUSTOMER, c)
    print(f"  customers   OK ({len(customers)})")
    for t in transactions:
        post(TYPE_TRANSACTION, t)
    print(f"  transactions OK ({len(transactions)})")

    print(f"\nseeded in {time.time() - started:.1f}s — gateway={args.gateway}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
