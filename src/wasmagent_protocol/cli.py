"""``wasmagent-protocol`` command-line entry point.

Usage::

    # Compare one vendored schema file against the canonical version.
    wasmagent-protocol check path/to/aep-record.schema.json --id aep-record

    # Scan a whole repo for drift, re-declared canonical ids without a package
    # dependency, and competing schemas/index.json registries.
    wasmagent-protocol check --scan --root .

    # Locate / inspect / self-check the packaged AEP conformance corpus.
    wasmagent-protocol aep-conformance path
    wasmagent-protocol aep-conformance manifest
    wasmagent-protocol aep-conformance self-check

Exits non-zero on any drift or violation, so this is safe to wire into CI.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import drift
from .conformance import get_aep_conformance_dir, get_aep_conformance_manifest, run_self_check


def _format(finding: drift.Finding) -> str:
    return f"{finding.severity.upper():5} [{finding.code}] {finding.path}: {finding.message}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="wasmagent-protocol",
        description=(
            "Cross-repo schema drift gate for the WasmAgent protocol family. "
            "Fails if a vendored schema differs from the canonical version."
        ),
    )
    parser.add_argument("--version", action="version", version="wasmagent-protocol drift gate")
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser(
        "check",
        help="Detect schema drift against the canonical package schemas.",
        description=(
            "With an explicit PATH, compare that one file to the canonical "
            "schema for --id. Without PATH (or with --scan), walk the repo "
            "root and fail on any drifted or competing canonical schema."
        ),
    )
    check.add_argument(
        "path",
        nargs="?",
        help="Path to a vendored *.schema.json file. Omit to scan the repo root.",
    )
    check.add_argument(
        "--id",
        dest="schema_id",
        help="Canonical schema id (e.g. aep-record). Required with an explicit PATH.",
    )
    check.add_argument("--root", default=".", help="Repo root to scan (default: current directory).")
    check.add_argument(
        "--scan",
        action="store_true",
        help="Scan the repo root for vendored canonical schemas and competing registries.",
    )
    check.add_argument(
        "--allow-canonical-source",
        action="store_true",
        help=(
            "Treat the repo as the canonical wasmagent-protocol source (skips the "
            "no-package-dep and competing-registry checks). Auto-detected normally."
        ),
    )

    aep = sub.add_parser(
        "aep-conformance",
        help="Locate, inspect, or self-check the packaged AEP conformance corpus.",
        description=(
            "The AEP conformance corpus ships inside this package. Use `path` to "
            "locate it, `manifest` to print the verdict-authority manifest, and "
            "`self-check` to verify the installed corpus against the manifest and "
            "the project-owned reference layers. Self-check is NOT independent "
            "semantic verification."
        ),
    )
    aep.add_argument(
        "action",
        choices=["path", "manifest", "self-check"],
        help="path: print the corpus directory. manifest: print manifest.json. "
        "self-check: verify the installed corpus.",
    )
    aep.add_argument(
        "--corpus",
        default=None,
        help="Optional corpus directory override (defaults to the packaged corpus).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.command == "aep-conformance":
        if args.action == "path":
            print(get_aep_conformance_dir() if args.corpus is None else Path(args.corpus).resolve())
            return 0
        if args.action == "manifest":
            manifest = (
                get_aep_conformance_manifest()
                if args.corpus is None
                else json.loads((Path(args.corpus) / "manifest.json").read_text(encoding="utf-8"))
            )
            print(json.dumps(manifest, indent=2, ensure_ascii=False))
            return 0
        ok, report = run_self_check(args.corpus)
        for line in report:
            print(line)
        return 0 if ok else 1

    if args.command != "check":
        return 2

    if args.path:
        if not args.schema_id:
            print("error: --id is required when checking an explicit path", file=sys.stderr)
            return 2
        try:
            finding = drift.check_file(args.path, args.schema_id)
        except FileNotFoundError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        except KeyError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        print(_format(finding))
        return 1 if finding.is_error else 0

    root = Path(args.root).resolve()
    findings = drift.scan(root, allow_canonical_source=args.allow_canonical_source)
    for finding in findings:
        print(_format(finding))

    errors = [f for f in findings if f.is_error]
    if errors:
        print(
            f"\n{len(errors)} drift/violation(s) found under {root}",
            file=sys.stderr,
        )
        return 1
    checked = [f for f in findings if f.code == "match"]
    print(
        f"no drift detected under {root} ({len(checked)} canonical schema file(s) verified)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
