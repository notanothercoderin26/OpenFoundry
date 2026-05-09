#!/usr/bin/env python3
"""tools/online-retail/convert_and_upload.py

Download the UCI Online Retail II dataset, combine the two sheets
(2009-2010 + 2010-2011), normalise types, write a tidy CSV, and upload it
to the Ceph S3 bucket the OpenFoundry pipeline expects as raw input.

Idempotent: if the CSV already exists locally and the S3 key already
exists with the same size, the upload is skipped.

Usage:
  python3 tools/online-retail/convert_and_upload.py \
      --bucket openfoundry-iceberg \
      --key   raw/online_retail.csv \
      --endpoint http://localhost:8080
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import boto3
import pandas as pd
import requests

UCI_URL = "https://archive.ics.uci.edu/static/public/502/online+retail+ii.zip"
DEFAULT_LOCAL = Path("tools/online-retail/online_retail.csv")
DEFAULT_XLSX = Path("tools/online-retail/online_retail_II.xlsx")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--bucket", default="openfoundry-iceberg")
    p.add_argument("--key", default="raw/online_retail.csv")
    p.add_argument("--endpoint", default="http://localhost:8080",
                   help="S3 endpoint URL (Ceph RGW or MinIO)")
    p.add_argument("--access-key", default=os.environ.get("AWS_ACCESS_KEY_ID", ""))
    p.add_argument("--secret-key", default=os.environ.get("AWS_SECRET_ACCESS_KEY", ""))
    p.add_argument("--region", default="us-east-1")
    p.add_argument("--csv", default=str(DEFAULT_LOCAL))
    p.add_argument("--xlsx", default=str(DEFAULT_XLSX))
    p.add_argument("--skip-download", action="store_true",
                   help="Reuse local xlsx if present")
    p.add_argument("--rows", type=int, default=0,
                   help="Cap rows for dev (0 = all)")
    return p.parse_args()


def download_xlsx(target: Path) -> None:
    if target.exists() and target.stat().st_size > 0:
        print(f"[ingest] reusing existing {target} ({target.stat().st_size} bytes)")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    print(f"[ingest] downloading {UCI_URL} → {target} (large file, ~10 MiB)")
    zip_path = target.with_suffix(".zip")
    with requests.get(UCI_URL, stream=True, timeout=300) as r:
        r.raise_for_status()
        with zip_path.open("wb") as f:
            for chunk in r.iter_content(chunk_size=2 ** 20):
                f.write(chunk)
    import zipfile
    with zipfile.ZipFile(zip_path) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".xlsx")]
        if not names:
            raise SystemExit(f"no .xlsx inside {zip_path}: {zf.namelist()}")
        with zf.open(names[0]) as src, target.open("wb") as dst:
            dst.write(src.read())
    zip_path.unlink(missing_ok=True)
    print(f"[ingest] extracted → {target} ({target.stat().st_size} bytes)")


def normalise_to_csv(xlsx_path: Path, csv_path: Path, row_cap: int) -> int:
    print(f"[ingest] reading both sheets from {xlsx_path}")
    sheets = pd.read_excel(xlsx_path, sheet_name=None, engine="openpyxl")
    frames: list[pd.DataFrame] = []
    for name, df in sheets.items():
        df = df.copy()
        df["sheet"] = name
        frames.append(df)
    combined = pd.concat(frames, ignore_index=True)
    print(f"[ingest] combined raw rows={len(combined)}")

    rename = {
        "Invoice": "invoice",
        "StockCode": "stockcode",
        "Description": "description",
        "Quantity": "quantity",
        "InvoiceDate": "invoice_date",
        "Price": "price",
        "Customer ID": "customer_id",
        "Country": "country",
    }
    combined = combined.rename(columns=rename)

    combined["invoice"] = combined["invoice"].astype(str).str.strip()
    combined["stockcode"] = combined["stockcode"].astype(str).str.strip()
    combined["description"] = combined["description"].fillna("").astype(str).str.strip()
    combined["country"] = combined["country"].fillna("").astype(str).str.strip()

    combined["quantity"] = pd.to_numeric(combined["quantity"], errors="coerce").astype("Int64")
    combined["price"] = pd.to_numeric(combined["price"], errors="coerce").astype(float)
    combined["customer_id"] = pd.to_numeric(combined["customer_id"], errors="coerce").astype("Int64")
    combined["invoice_date"] = pd.to_datetime(combined["invoice_date"], errors="coerce", utc=False)

    combined = combined.dropna(subset=["invoice_date", "quantity", "price"])
    combined["invoice_date"] = combined["invoice_date"].dt.strftime("%Y-%m-%dT%H:%M:%S")

    if row_cap > 0:
        print(f"[ingest] capping rows to first {row_cap}")
        combined = combined.head(row_cap)

    combined = combined[[
        "invoice", "stockcode", "description", "quantity",
        "invoice_date", "price", "customer_id", "country",
    ]]

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(csv_path, index=False)
    print(f"[ingest] wrote {csv_path} rows={len(combined)} bytes={csv_path.stat().st_size}")
    return len(combined)


def upload(args: argparse.Namespace, csv_path: Path) -> None:
    s3 = boto3.client(
        "s3",
        endpoint_url=args.endpoint,
        aws_access_key_id=args.access_key,
        aws_secret_access_key=args.secret_key,
        region_name=args.region,
    )
    head = None
    try:
        head = s3.head_object(Bucket=args.bucket, Key=args.key)
    except Exception:
        head = None
    local_size = csv_path.stat().st_size
    if head and head.get("ContentLength") == local_size:
        print(f"[ingest] s3://{args.bucket}/{args.key} already up-to-date ({local_size} bytes)")
        return
    print(f"[ingest] uploading {csv_path} → s3://{args.bucket}/{args.key}")
    s3.upload_file(str(csv_path), args.bucket, args.key)
    print(f"[ingest] done")


def main() -> int:
    args = parse_args()
    if not args.access_key or not args.secret_key:
        print("ERROR: set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (or --access-key/--secret-key)")
        return 1
    xlsx = Path(args.xlsx)
    csv = Path(args.csv)

    if not args.skip_download:
        download_xlsx(xlsx)
    rows = normalise_to_csv(xlsx, csv, args.rows)
    upload(args, csv)
    print(f"[ingest] OK rows={rows} csv={csv} s3=s3://{args.bucket}/{args.key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
