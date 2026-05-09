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
import os
import sys
import time
from collections import OrderedDict
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
                "unit_price": price,
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
                "id": tx_id,
                "invoice": (row.get("invoice") or "").strip(),
                "stockcode": stockcode,
                "customer_id": customer_id,
                "quantity": qty,
                "unit_price": price,
                "line_total": round(qty * price, 2),
                "invoice_date": invoice_date,
                "country": (row.get("country") or "").strip(),
                # The dashboard "Anomalies" widget filters on review_status.
                # The Spark anomaly transform flagged a subset; for the seed
                # we mark high-quantity rows as needs_review so the widget
                # has rows.
                "review_status": "needs_review" if qty >= 12 else "clean",
                "anomaly_reason": "qty>=12" if qty >= 12 else None,
            })

    print(f"parsed: {len(transactions)} transactions, "
          f"{len(products)} products, {len(customers)} customers "
          f"(skipped {skipped} rows)")

    base = f"{args.gateway.rstrip('/')}/api/v1/ontology/types"
    started = time.time()

    def post(type_id: str, properties: dict) -> None:
        http_post(f"{base}/{type_id}/objects", args.token, {"properties": properties})

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
