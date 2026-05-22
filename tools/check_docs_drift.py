#!/usr/bin/env python3
"""Backwards-compatible shim: delegate to tools/repo_stats.py check.

The drift-check logic now lives in tools/repo_stats.py so the same FACTS
table powers both verification (this script) and regeneration
(`make docs-stats`). Keep this entry point so external callers that
still invoke `python3 tools/check_docs_drift.py` keep working.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from repo_stats import check, gather_counts  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(check(gather_counts()))
