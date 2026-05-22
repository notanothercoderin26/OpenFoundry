#!/usr/bin/env python3
"""Verify each services/X follows the skeleton baseline or is an accepted variant.

Per CLAUDE.md, every service in ``services/`` must ship the three
hard-baseline pieces:

  services/<svc>/cmd/<svc>/
  services/<svc>/internal/server/
  services/<svc>/internal/config/

A service may omit any of those only if it appears in one of the
"Accepted variants" bullets in CLAUDE.md ("Protocol services",
"Adapter / driver services", "Sink / worker services"). Patterns in
that section may include shell wildcards like ``*-sink``.

CLAUDE.md is the single source of truth for the variant list — this
script parses it directly so updating one file (the doc) updates the
gate.
"""

from __future__ import annotations

import fnmatch
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLAUDE_MD = ROOT / "CLAUDE.md"
SERVICES_DIR = ROOT / "services"

# These three are the hard baseline. internal/handlers/ and
# internal/models/ are "always" in spirit but not enforced because the
# variant exemptions already cover services that legitimately omit them
# (sinks have neither, protocol services restructure them).
BASELINE_DIRS: tuple[str, ...] = ("internal/server", "internal/config")


def _load_variant_patterns() -> set[str]:
    """Parse the 'Accepted variants' bullets in CLAUDE.md.

    Returns the union of service names (and shell wildcard patterns)
    listed in the first parenthesised group of each variant bullet.
    Subpackage references like ``internal/oidc/`` are excluded.
    """
    text = CLAUDE_MD.read_text(encoding="utf-8")
    start = text.find("Accepted variants")
    if start == -1:
        raise RuntimeError(
            "CLAUDE.md: 'Accepted variants' section not found; "
            "did the per-service-shape section move?"
        )
    rest = text[start:]
    # Stop at the next paragraph that isn't part of the bullet list.
    end_markers = ("\nWhen in doubt", "\n## ", "\n```")
    ends = [rest.find(m) for m in end_markers if rest.find(m) != -1]
    end = min(ends) if ends else len(rest)
    section = rest[:end]

    bullets = re.findall(
        r"^-\s+\*\*[^*]+\*\*\s*\(([^)]+)\)",
        section,
        flags=re.MULTILINE | re.DOTALL,
    )
    patterns: set[str] = set()
    for bullet in bullets:
        for name in re.findall(r"`([^`]+)`", bullet):
            if "/" in name:  # ignore subpath examples like `internal/oidc/`
                continue
            patterns.add(name)
    return patterns


def _is_variant(name: str, patterns: set[str]) -> bool:
    return any(fnmatch.fnmatchcase(name, p) for p in patterns)


def _missing_baseline(svc_dir: Path) -> list[str]:
    name = svc_dir.name
    missing: list[str] = []
    if not (svc_dir / "cmd" / name).is_dir():
        missing.append(f"cmd/{name}")
    for d in BASELINE_DIRS:
        if not (svc_dir / d).is_dir():
            missing.append(d)
    return missing


def main() -> int:
    patterns = _load_variant_patterns()
    if not patterns:
        print(
            "warn: no variant patterns extracted from CLAUDE.md; "
            "every service will be held to the strict baseline",
            file=sys.stderr,
        )

    failures: list[str] = []
    services: list[Path] = sorted(
        p for p in SERVICES_DIR.iterdir() if p.is_dir() and not p.name.startswith(".")
    )
    for svc_dir in services:
        missing = _missing_baseline(svc_dir)
        if not missing:
            continue
        if _is_variant(svc_dir.name, patterns):
            continue
        failures.append(
            f"services/{svc_dir.name}: missing {', '.join(missing)} and not "
            "listed in the 'Accepted variants' section of CLAUDE.md"
        )

    if failures:
        print("Service skeleton conformance failures:", file=sys.stderr)
        for f in failures:
            print(f"- {f}", file=sys.stderr)
        print(
            f"\n{len(failures)} service(s) violate the skeleton. Either add the "
            "missing dirs (see docs/templates/service-skeleton/) or extend the "
            "'Accepted variants' bullets in CLAUDE.md to cover this service.",
            file=sys.stderr,
        )
        return 1

    print(
        f"service skeleton ok: {len(services)} services checked "
        f"against baseline + {len(patterns)} variant pattern(s)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
