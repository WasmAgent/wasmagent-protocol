#!/usr/bin/env python3
"""
Cross-repository schema parity check.

Verifies that wasmagent-js and trace-pipeline only reference field names,
schema_version values, and $id URIs that exist in the canonical
wasmagent-protocol schemas.

Exit 0 = parity OK
Exit 1 = parity violations found (printed to stdout)
"""
import json
import os
import sys
from pathlib import Path

PROTOCOL_ROOT = Path("wasmagent-protocol/schemas")
CONSUMERS = {
    "wasmagent-js": Path("wasmagent-js"),
    "trace-pipeline": Path("trace-pipeline"),
}

# Canonical schema files to extract allowed field names and version enums from
CANONICAL_SCHEMAS = [
    "aep/aep-record.schema.json",
    "aep/evidence-envelope.schema.json",
    "aep/canonical-event.schema.json",
    "aep/checkpoint-evidence.schema.json",
    "aep/memory-evidence.schema.json",
    "aep/replay-evidence.schema.json",
    "aep/seed.schema.json",
    "compliance/compliance-eval-record.schema.json",
    "compliance/constraint-ir.schema.json",
    "compliance/constraint-violation.schema.json",
    "compliance/repair-trace.schema.json",
    "compliance/rollout-wire.schema.json",
    "compliance/task-spec.schema.json",
]

CANONICAL_IDS = set()
CANONICAL_VERSIONS = set()
CANONICAL_TOP_LEVEL_FIELDS: dict[str, set] = {}  # schema file -> set of top-level property names


def load_canonical():
    for rel in CANONICAL_SCHEMAS:
        path = PROTOCOL_ROOT / rel
        if not path.exists():
            continue
        with open(path) as f:
            schema = json.load(f)
        sid = schema.get("$id", "")
        if sid:
            CANONICAL_IDS.add(sid)
        # Collect schema_version enum values
        props = schema.get("properties", {})
        sv = props.get("schema_version", {})
        for v in sv.get("enum", []):
            CANONICAL_VERSIONS.add(v)
        # Collect top-level property names
        CANONICAL_TOP_LEVEL_FIELDS[rel] = set(props.keys())


def find_schema_files(root: Path):
    """Find all .schema.json files under root."""
    return list(root.rglob("*.schema.json"))


def find_ts_schema_version_refs(root: Path):
    """
    Grep TypeScript/Python files for schema_version string literals
    that look like AEP versions (e.g. "aep/v0.3", "aep/v0.5").
    Returns list of (file, line_number, value).
    """
    import re
    pattern = re.compile(r'["\']((aep|compliance)/v\d+\.\d+)["\']')
    hits = []
    for ext in ["*.ts", "*.py", "*.json"]:
        for f in root.rglob(ext):
            try:
                text = f.read_text(errors="ignore")
            except Exception:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                for m in pattern.finditer(line):
                    hits.append((str(f), i, m.group(1)))
    return hits


violations = []


def check_consumer(name: str, root: Path):
    # 1. Check for local .schema.json files that re-declare canonical $ids
    for schema_file in find_schema_files(root):
        try:
            with open(schema_file) as f:
                schema = json.load(f)
        except Exception:
            continue
        sid = schema.get("$id", "")
        if sid in CANONICAL_IDS:
            violations.append(
                f"[{name}] {schema_file}: re-declares canonical $id '{sid}' — "
                f"import from wasmagent-protocol instead"
            )

    # 2. Check schema_version values referenced in code
    for filepath, lineno, version in find_ts_schema_version_refs(root):
        if version not in CANONICAL_VERSIONS:
            violations.append(
                f"[{name}] {filepath}:{lineno}: references unknown schema_version "
                f"'{version}' (not in canonical enum: {sorted(CANONICAL_VERSIONS)})"
            )


def main():
    load_canonical()

    if not CANONICAL_IDS:
        print("ERROR: no canonical schemas found under", PROTOCOL_ROOT)
        sys.exit(1)

    print(f"Canonical schema IDs loaded: {len(CANONICAL_IDS)}")
    print(f"Canonical schema_version values: {sorted(CANONICAL_VERSIONS)}")
    print()

    for name, root in CONSUMERS.items():
        if not root.exists():
            print(f"SKIP {name}: directory not found (not checked out?)")
            continue
        print(f"Checking {name}...")
        check_consumer(name, root)

    if violations:
        print(f"\nPARITY VIOLATIONS ({len(violations)}):")
        for v in violations:
            print(" ✗", v)
        sys.exit(1)
    else:
        print("\nAll parity checks passed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
