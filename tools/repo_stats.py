#!/usr/bin/env python3
"""Regenerate or verify inventory counts (services/libs/proto) across docs.

Single source of truth for the count of ``services/``, ``libs/`` and
``proto/`` directories embedded in the canonical docs. The same FACTS
table powers two modes:

  python3 tools/repo_stats.py check   # fail if any doc is out of date
  python3 tools/repo_stats.py write   # rewrite every doc in place

``check`` is wired into ``make docs-drift-check`` (CI gate); ``write`` is
exposed as ``make docs-stats`` so contributors who add or remove a
service/lib/proto domain can refresh every doc in one shot.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class DocFact:
    """One spot in one doc that embeds a count.

    ``pattern`` must contain exactly one capture group around the digits
    so ``write`` mode can substitute without touching the prose around
    it. The non-digit context in the pattern is what disambiguates this
    occurrence from any other digit in the file.
    """

    path: str
    pattern: str
    kind: str  # "services" | "libs" | "proto"


FACTS: tuple[DocFact, ...] = (
    DocFact("README.md", r"\*\*(\d+) service directories\*\*", "services"),
    DocFact("README.md", r"\*\*(\d+) shared libraries\*\*", "libs"),
    DocFact("ARCHITECTURE.md", r"with (\d+) service directories under", "services"),
    DocFact("ARCHITECTURE.md", r"and (\d+)\s+shared libraries under", "libs"),
    DocFact("CLAUDE.md", r"services/\s+(\d+) service directories", "services"),
    DocFact("CLAUDE.md", r"libs/\s+(\d+) shared Go libraries", "libs"),
    DocFact(
        "docs/reference/repository-layout.md",
        r"`services/` contains (\d+) service directories",
        "services",
    ),
    DocFact(
        "docs/reference/repository-layout.md",
        r"`libs/` contains (\d+) cross-cutting Go packages",
        "libs",
    ),
    DocFact(
        "docs/reference/repository-layout.md",
        r"\| `proto/` \| (\d+) Protobuf domains;",
        "proto",
    ),
    DocFact(
        "docs/reference/documentation-code-gap-analysis.md",
        r"\| `find services .*` \| (\d+) service directories \|",
        "services",
    ),
    DocFact(
        "docs/reference/documentation-code-gap-analysis.md",
        r"\| `find libs .*` \| (\d+) library directories \|",
        "libs",
    ),
    DocFact(
        "docs/reference/documentation-code-gap-analysis.md",
        r"\| `find proto .*` \| (\d+) protobuf domains \|",
        "proto",
    ),
    DocFact(
        "docs/reference/documentation-code-gap-analysis.md",
        r"current filesystem inventory is (\d+) service directories",
        "services",
    ),
    DocFact(
        "docs/reference/documentation-code-gap-analysis.md",
        r"service directories and (\d+) shared-library directories",
        "libs",
    ),
)


def count_dirs(name: str) -> int:
    base = ROOT / name
    return sum(
        1 for child in base.iterdir() if child.is_dir() and not child.name.startswith(".")
    )


def gather_counts() -> dict[str, int]:
    return {
        "services": count_dirs("services"),
        "libs": count_dirs("libs"),
        "proto": count_dirs("proto"),
    }


def check(counts: dict[str, int]) -> int:
    failures: list[str] = []
    for fact in FACTS:
        path = ROOT / fact.path
        text = path.read_text(encoding="utf-8")
        matches = re.findall(fact.pattern, text, flags=re.MULTILINE)
        if not matches:
            failures.append(f"{fact.path}: pattern {fact.pattern!r} did not match")
            continue
        expected = str(counts[fact.kind])
        wrong = [m for m in matches if m != expected]
        if wrong:
            failures.append(
                f"{fact.path}: expected {fact.kind}={expected}, "
                f"found {sorted(set(wrong))} via {fact.pattern!r}"
            )
    if failures:
        print("Documentation inventory drift detected:", file=sys.stderr)
        for f in failures:
            print(f"- {f}", file=sys.stderr)
        print(
            "\nRun 'make docs-stats' to refresh, or revise tools/repo_stats.py "
            "if a canonical docs location intentionally changed.",
            file=sys.stderr,
        )
        return 1
    print(
        f"docs inventory ok: services={counts['services']}, "
        f"libs={counts['libs']}, proto={counts['proto']}"
    )
    return 0


def write(counts: dict[str, int]) -> int:
    edited: list[str] = []
    failures: list[str] = []
    by_path: dict[str, list[DocFact]] = {}
    for fact in FACTS:
        by_path.setdefault(fact.path, []).append(fact)

    for rel_path, facts in by_path.items():
        path = ROOT / rel_path
        original = path.read_text(encoding="utf-8")
        text = original
        for fact in facts:
            expected = str(counts[fact.kind])
            new_text, n = re.subn(
                fact.pattern,
                lambda m, v=expected: m.group(0).replace(m.group(1), v, 1),
                text,
                flags=re.MULTILINE,
            )
            if n == 0:
                failures.append(f"{rel_path}: pattern {fact.pattern!r} did not match")
            text = new_text
        if text != original:
            path.write_text(text, encoding="utf-8")
            edited.append(rel_path)

    for f in failures:
        print(f"warn: {f}", file=sys.stderr)
    if edited:
        for rel_path in edited:
            print(f"updated {rel_path}")
    else:
        print("no changes needed")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("check", "write"))
    args = parser.parse_args()
    counts = gather_counts()
    if args.mode == "check":
        return check(counts)
    return write(counts)


if __name__ == "__main__":
    raise SystemExit(main())
