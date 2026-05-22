#!/usr/bin/env python3
"""Verify that relative markdown links in docs point to real files.

Scans every ``*.md`` file outside the excluded trees and resolves every
``[text](relative/path)`` link against the filesystem. External links
(``http://``, ``https://``, ``mailto:``, …), in-page anchors
(``#section``), and links into excluded trees are skipped.

Pre-existing broken links are baselined in ``tools/doc_links_allowlist.txt``
so this check can land without an upfront cleanup of the whole tree.
Regenerate that file (after fixing or accepting more links) with
``python3 tools/check_doc_links.py --write-allowlist``.

Wired into ``make docs-drift-check`` so renames or removals that leave
new dangling references fail CI.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]

# Trees we intentionally do not police:
#   - docs/archive: superseded migration logs (CLAUDE.md flags as "do not read")
#   - docs_original_palantir_foundry: third-party reference scrape
#   - tools/Seed URLs: scraped Palantir docs used as input to scraping tools
#   - PoC: proof-of-concept material with intentional refs to the scrape
#   - docs/.vitepress/{cache,dist}: build artifacts
EXCLUDE_PREFIXES: tuple[str, ...] = (
    "docs/archive/",
    "docs/.vitepress/cache/",
    "docs/.vitepress/dist/",
    "docs_original_palantir_foundry/",
    "tools/Seed URLs/",
    "PoC/",
    ".git/",
)

EXCLUDE_DIR_NAMES: frozenset[str] = frozenset({"node_modules", ".git"})

EXTERNAL_PREFIXES: tuple[str, ...] = (
    "http://",
    "https://",
    "mailto:",
    "ftp://",
    "tel:",
    "data:",
)

# Matches `[text](target)` and `![alt](target)`; tolerates an optional
# ``"title"`` suffix inside the parens. The non-greedy `[^)\s]+?` keeps
# us from swallowing trailing whitespace or the close paren.
LINK_RE = re.compile(r"!?\[([^\]]*?)\]\(\s*([^)\s]+?)(?:\s+\"[^\"]*\")?\s*\)")


def _is_excluded(rel_path: str) -> bool:
    if any(rel_path.startswith(p) for p in EXCLUDE_PREFIXES):
        return True
    parts = rel_path.split("/")
    return any(part in EXCLUDE_DIR_NAMES for part in parts)


def _iter_md_files() -> list[Path]:
    out: list[Path] = []
    for p in ROOT.rglob("*.md"):
        rel = p.relative_to(ROOT).as_posix()
        if _is_excluded(rel):
            continue
        out.append(p)
    return out


def _line_for(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


DOCS_ROOT = ROOT / "docs"


def _candidates(base: Path) -> list[Path]:
    """Targets that VitePress (and GitHub) consider equivalent.

    A bare ``foo`` or ``foo/`` will resolve to ``foo``, ``foo.md``,
    ``foo/index.md`` or ``foo/README.md``.
    """
    out = [base]
    if base.suffix:
        return out
    out.append(base.with_suffix(".md"))
    out.append(base / "index.md")
    out.append(base / "README.md")
    return out


def _check_file(md_path: Path) -> list[str]:
    text = md_path.read_text(encoding="utf-8")
    rel_md = md_path.relative_to(ROOT).as_posix()
    inside_docs = md_path.is_relative_to(DOCS_ROOT)
    failures: list[str] = []
    for m in LINK_RE.finditer(text):
        target = m.group(2).strip()
        if not target or target.startswith("#") or target.startswith(EXTERNAL_PREFIXES):
            continue
        target_path = unquote(target.split("#", 1)[0].split("?", 1)[0])
        if not target_path:
            continue
        if target_path.startswith("/"):
            # VitePress treats `/` as rooted at docs/; outside the docs
            # tree, treat it as repo-root-absolute (GitHub README style).
            base = (DOCS_ROOT if inside_docs else ROOT) / target_path.lstrip("/")
        else:
            base = md_path.parent / target_path
        try:
            base.resolve().relative_to(ROOT)
        except ValueError:
            # Link escapes the repo (e.g. ../../etc); skip.
            continue
        if not any(c.exists() for c in _candidates(base)):
            line = _line_for(text, m.start())
            failures.append(f"{rel_md}:{line}: broken link -> {target}")
    return failures


ALLOWLIST_FILE = ROOT / "tools" / "doc_links_allowlist.txt"


def _load_allowlist() -> set[tuple[str, str]]:
    if not ALLOWLIST_FILE.exists():
        return set()
    out: set[tuple[str, str]] = set()
    for raw in ALLOWLIST_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or " -> " not in line:
            continue
        path, _, target = line.partition(" -> ")
        out.add((path.strip(), target.strip()))
    return out


def _gather_failures() -> tuple[list[tuple[str, int, str]], int]:
    """Return ``(failures, files_scanned)``.

    Each failure is ``(rel_md, line, target)`` so callers can format or
    diff them without re-parsing string output.
    """
    failures: list[tuple[str, int, str]] = []
    files = _iter_md_files()
    for md_path in files:
        for raw in _check_file(md_path):
            # _check_file currently formats as "<rel>:<line>: broken link -> <target>"
            head, _, target = raw.partition(" -> ")
            rel_md, _, line = head.partition(":")
            line_num, _, _ = line.partition(":")
            failures.append((rel_md, int(line_num), target))
    return failures, len(files)


def _write_allowlist(failures: list[tuple[str, int, str]]) -> None:
    pairs = sorted({(rel, target) for rel, _, target in failures})
    body = [
        "# Pre-existing broken internal markdown links accepted by",
        "# tools/check_doc_links.py. Each line is '<source.md> -> <target>'.",
        "# Regenerate with: python3 tools/check_doc_links.py --write-allowlist",
        "# Shrink this file as docs are cleaned up.",
        "",
    ]
    body.extend(f"{rel} -> {target}" for rel, target in pairs)
    ALLOWLIST_FILE.write_text("\n".join(body) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write-allowlist",
        action="store_true",
        help="Rewrite tools/doc_links_allowlist.txt from the current state.",
    )
    args = parser.parse_args()

    failures, files_scanned = _gather_failures()

    if args.write_allowlist:
        _write_allowlist(failures)
        print(
            f"wrote {len(failures)} entr{'y' if len(failures) == 1 else 'ies'} "
            f"to {ALLOWLIST_FILE.relative_to(ROOT)}"
        )
        return 0

    allowlist = _load_allowlist()
    new_failures = [(r, ln, t) for r, ln, t in failures if (r, t) not in allowlist]
    stale_allowlist = sorted(
        allowlist - {(r, t) for r, _, t in failures}
    )

    if new_failures:
        print("Broken internal markdown links:", file=sys.stderr)
        for rel_md, line, target in new_failures:
            print(f"- {rel_md}:{line}: broken link -> {target}", file=sys.stderr)
        print(
            f"\n{len(new_failures)} new broken link(s) across {files_scanned} "
            "markdown files. Fix the link, archive the doc, or "
            "(if accepted) run 'python3 tools/check_doc_links.py "
            "--write-allowlist' to baseline it.",
            file=sys.stderr,
        )
        return 1

    if stale_allowlist:
        print(
            f"warn: {len(stale_allowlist)} allowlisted link(s) are no longer broken; "
            "run 'python3 tools/check_doc_links.py --write-allowlist' to prune.",
            file=sys.stderr,
        )

    baselined = len(allowlist) - len(stale_allowlist)
    print(
        f"all internal markdown links ok across {files_scanned} files "
        f"({baselined} pre-existing failure(s) allowlisted)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
