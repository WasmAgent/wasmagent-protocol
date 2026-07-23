#!/usr/bin/env python3
"""Conformance harness for wasmagent-protocol.

Enforces the invariants that make this repo a trustworthy single source of truth:

1. Every file under schemas/ is well-formed JSON and a valid JSON Schema.
2. Every schema in schemas/index.json exists on disk with a matching canonical $id.
3. Local $ref targets resolve (no dangling cross-file references).
4. Every registered schema has at least one VALID fixture (must pass) and at
   least one INVALID fixture (must fail) under tests/fixtures/.

Exit code 0 on success, 1 on any failure. Requires `jsonschema` (pip install
jsonschema); falls back to structural checks only if it is unavailable.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"
FIXTURES = ROOT / "tests" / "fixtures"

try:
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource
    HAVE_JSONSCHEMA = True
except Exception:  # pragma: no cover - environment without jsonschema
    HAVE_JSONSCHEMA = False

errors: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def load_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        err(f"{path.relative_to(ROOT)}: invalid JSON: {exc}")
        return None


def build_registry() -> dict[str, dict]:
    """Map each schema's $id to its parsed document for $ref resolution."""
    registry: dict[str, dict] = {}
    for path in sorted(SCHEMAS.rglob("*.schema.json")):
        doc = load_json(path)
        if doc is None:
            continue
        sid = doc.get("$id")
        if not sid:
            err(f"{path.relative_to(ROOT)}: missing $id")
            continue
        registry[sid] = doc
    return registry


def check_index(registry: dict[str, dict]) -> list[dict]:
    index_path = SCHEMAS / "index.json"
    index = load_json(index_path)
    if not index or "schemas" not in index:
        err("schemas/index.json missing or has no 'schemas' array")
        return []
    for entry in index["schemas"]:
        p = ROOT / entry["path"]
        if not p.is_file():
            err(f"index entry {entry['id']}: file not found: {entry['path']}")
            continue
        doc = load_json(p)
        if doc and doc.get("$id") != entry["canonical_id"]:
            err(
                f"index entry {entry['id']}: $id mismatch — file has "
                f"{doc.get('$id')!r}, index says {entry['canonical_id']!r}"
            )
    return index["schemas"]


def validator_for(doc: dict, registry) -> "Draft202012Validator":
    return Draft202012Validator(doc, registry=registry)


def check_schemas_valid(registry: dict[str, dict]) -> None:
    if not HAVE_JSONSCHEMA:
        return
    for sid, doc in registry.items():
        try:
            Draft202012Validator.check_schema(doc)
        except Exception as exc:
            err(f"schema {sid}: not a valid Draft 2020-12 schema: {exc}")


def resolve_ref(base: Path, ref: str) -> None:
    if ref.startswith("#") or "://" in ref:
        return  # internal pointer or absolute URI — skip file check
    target = (base.parent / ref).resolve()
    if not target.is_file():
        err(f"{base.relative_to(ROOT)}: dangling $ref -> {ref}")


def check_refs() -> None:
    for path in SCHEMAS.rglob("*.schema.json"):
        doc = load_json(path)
        if not doc:
            continue

        def walk(o):
            if isinstance(o, dict):
                r = o.get("$ref")
                if isinstance(r, str):
                    resolve_ref(path, r)
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)

        walk(doc)


def build_reference_registry(registry: dict[str, dict]):
    """Build a referencing.Registry keyed by both $id and bare filename, so
    relative $refs like "constraint-ir.schema.json" resolve."""
    resources = []
    for path in SCHEMAS.rglob("*.schema.json"):
        doc = load_json(path)
        if not doc:
            continue
        res = Resource.from_contents(doc)
        sid = doc.get("$id")
        if sid:
            resources.append((sid, res))
        resources.append((path.name, res))  # bare filename anchor
    return Registry().with_resources(resources)


def check_fixtures(index_entries: list[dict], registry: dict[str, dict]) -> None:
    ref_registry = build_reference_registry(registry) if HAVE_JSONSCHEMA else None
    for entry in index_entries:
        sid = entry["id"]
        valid_dir = FIXTURES / "valid" / sid
        invalid_dir = FIXTURES / "invalid" / sid
        valids = sorted(valid_dir.glob("*.json")) if valid_dir.is_dir() else []
        invalids = sorted(invalid_dir.glob("*.json")) if invalid_dir.is_dir() else []
        if not valids:
            err(f"schema {sid}: no VALID fixtures under tests/fixtures/valid/{sid}/")
        if not invalids:
            err(f"schema {sid}: no INVALID fixtures under tests/fixtures/invalid/{sid}/")
        if not HAVE_JSONSCHEMA:
            continue
        doc = load_json(ROOT / entry["path"])
        if not doc:
            continue
        validator = Draft202012Validator(doc, registry=ref_registry)
        for f in valids:
            inst = load_json(f)
            errs = list(validator.iter_errors(inst)) if inst is not None else []
            if errs:
                err(f"VALID fixture rejected: {f.relative_to(ROOT)}: {errs[0].message}")
        for f in invalids:
            inst = load_json(f)
            if inst is None:
                continue
            if not list(validator.iter_errors(inst)):
                err(f"INVALID fixture accepted (should fail): {f.relative_to(ROOT)}")


def main() -> int:
    if not HAVE_JSONSCHEMA:
        print("WARNING: jsonschema not installed — running structural checks only.")
    registry = build_registry()
    index_entries = check_index(registry)
    check_schemas_valid(registry)
    check_refs()
    check_fixtures(index_entries, registry)

    if errors:
        print(f"\nconformance FAILED with {len(errors)} error(s):", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    n_schemas = len(index_entries)
    print(
        f"conformance OK: {n_schemas} schemas well-formed, refs resolve, "
        f"fixtures pass/fail as expected"
        + ("" if HAVE_JSONSCHEMA else " (structural only)")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
