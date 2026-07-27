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


def check_index(index: dict) -> list[dict]:
    """Validate the flat registry: every listed schema exists on disk and its
    file $id matches the index's canonical_id. Returns the schemas array
    (possibly empty on failure)."""
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


def _resolve_local_def(node, defs: dict) -> dict | None:
    """Follow a single ``{"$ref": "#/$defs/<name>"}`` pointer to its target in
    ``defs``; return ``node`` unchanged otherwise. Only single-hop local refs
    are resolved — the idiomatic way AEP schemas reuse shared definitions."""
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/$defs/"):
            target = defs.get(ref[len("#/$defs/"):])
            if isinstance(target, dict):
                return target
    return node


def _check_base_envelope(path: Path, base: dict) -> None:
    """The AEP base envelope must declare Draft 2020-12, define the common
    provenance/timestamp fields, and define produced_by_run_id as a non-empty
    string reused by every downstream evidence schema."""
    rel = path.relative_to(ROOT)
    if base.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        err(f"{rel}: base envelope $schema must be Draft 2020-12")
    props = base.get("properties") if isinstance(base.get("properties"), dict) else {}
    defs = base.get("$defs") if isinstance(base.get("$defs"), dict) else {}
    prid = _resolve_local_def(props.get("produced_by_run_id"), defs)
    if not isinstance(prid, dict):
        prid = defs.get("produced_by_run_id")
    if not isinstance(prid, dict):
        err(f"{rel}: base envelope must define produced_by_run_id")
    else:
        if prid.get("type") != "string":
            err(f"{rel}: produced_by_run_id must be a JSON string")
        if prid.get("minLength", 0) < 1:
            err(f"{rel}: produced_by_run_id must be non-empty (minLength >= 1)")
    for field in ("schema_version", "evidence_type", "created_at_ms"):
        if field not in props and field not in defs:
            err(f"{rel}: base envelope must define the common field {field!r}")


def _run_aep_fixtures_if_present(
    path: Path, doc: dict, fixture_id: str, ref_registry
) -> None:
    """Run VALID/INVALID fixtures for an AEP schema when its fixture dirs exist.

    No error is raised when fixtures are absent — discovery must still succeed
    (a newly-added schema with no fixtures still loads cleanly).
    """
    valid_dir = FIXTURES / "valid" / fixture_id
    invalid_dir = FIXTURES / "invalid" / fixture_id
    valids = sorted(valid_dir.glob("*.json")) if valid_dir.is_dir() else []
    invalids = sorted(invalid_dir.glob("*.json")) if invalid_dir.is_dir() else []
    if not valids and not invalids:
        return
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


def check_aep_family(index: dict, registry: dict[str, dict]) -> None:
    """Discover every schemas/aep/*.schema.json and enforce the shared AEP
    base-envelope contract (issue #122 bootstrap).

    Discovery is tolerant: a schema with no fixtures still loads without error.
    Strict fixture coverage for *registered* schemas is enforced separately by
    check_fixtures; this function adds the AEP-family invariants:

    - schemas/index.json carries an 'aep' family section whose 'base' names a
      schema registered in the flat schemas array, with a 'members' id list.
    - schemas/aep/_base.schema.json exists and satisfies the base-envelope
      contract (Draft 2020-12, produced_by_run_id as a non-empty string, and the
      common provenance/timestamp fields).
    - Every schemas/aep/*.schema.json is discovered and loadable; any fixtures
      present for a discovered-but-unregistered schema are validated.
    """
    aep_dir = SCHEMAS / "aep"
    if not aep_dir.is_dir():
        err("schemas/aep/: AEP family directory missing")
        return

    families = index.get("families") if isinstance(index, dict) else None
    aep_family = families.get("aep") if isinstance(families, dict) else None
    id_by_canonical = {
        e.get("canonical_id"): e.get("id")
        for e in (index.get("schemas") or [])
        if isinstance(e, dict)
    }
    registered_ids = {i for i in id_by_canonical.values() if isinstance(i, str)}

    if not isinstance(aep_family, dict):
        err("schemas/index.json: missing 'aep' family section")
    else:
        base_id = aep_family.get("base")
        if not isinstance(base_id, str) or not base_id:
            err("schemas/index.json: aep family 'base' must name a registered schema id")
        elif base_id not in registered_ids:
            err(f"schemas/index.json: aep family base {base_id!r} is not a registered schema")
        members = aep_family.get("members")
        if not isinstance(members, list) or not all(isinstance(m, str) for m in members):
            err("schemas/index.json: aep family 'members' must be a list of schema ids")

    discovered = sorted(aep_dir.glob("*.schema.json"))
    if not discovered:
        err("schemas/aep/: no *.schema.json schemas discovered")

    base_path = aep_dir / "_base.schema.json"
    if not base_path.is_file():
        err("schemas/aep/_base.schema.json: base envelope schema missing")
    else:
        base = load_json(base_path)
        if base is not None:
            _check_base_envelope(base_path, base)

    # Forward-looking fixture run: validate fixtures for any discovered AEP
    # schema that is NOT yet in the flat registry. Registered schemas are owned
    # by check_fixtures; here we only guarantee loadability + fixture pass/fail
    # for an unregistered schema, tolerating missing fixtures entirely.
    if not HAVE_JSONSCHEMA or not discovered:
        return
    ref_registry = build_reference_registry(registry)
    for path in discovered:
        doc = load_json(path)
        if doc is None:
            continue
        sid = doc.get("$id")
        if isinstance(sid, str) and sid in id_by_canonical:
            continue
        fixture_id = path.name[: -len(".schema.json")]
        _run_aep_fixtures_if_present(path, doc, fixture_id, ref_registry)


def main() -> int:
    if not HAVE_JSONSCHEMA:
        print("WARNING: jsonschema not installed — running structural checks only.")
    registry = build_registry()
    index = load_json(SCHEMAS / "index.json") or {}
    index_entries = check_index(index)
    check_schemas_valid(registry)
    check_refs()
    check_aep_family(index, registry)
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
