#!/usr/bin/env python3
"""Structural contract compatibility gate — canonical AEP schema vs consumers.

This is Gate B of the contract checking strategy (the old check-schema-parity
script, now check-schema-version-references.py, is Gate A: version / $id
sanity only). Gate B compares the *structure* of a consumer's exported
aep-record schema against the canonical schema in schemas/aep/:

    top-level and nested property names
    required fields
    enum values
    type / nullability
    array item types
    object required fields
    additionalProperties (explicitly closed vs unspecified/open)

It is a semantic comparison, not a string diff: wrapper layouts ($ref +
definitions) are resolved, and absent-vs-explicit keys are reported as the
values a validator would actually apply.

Modes (default is report-only so a drift baseline can be reviewed before
the gate starts failing CI):

    report-only (default)  print the drift inventory, always exit 0
    --strict               exit 1 if any drift is found
    --json                 machine-readable drift list on stdout

"Consumer accepts" here means protocol-schema acceptance only. Consumer
security policy, trust scoring, and deployment admission are different
layers and are deliberately not part of this gate.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CANONICAL = REPO_ROOT / "schemas" / "aep" / "aep-record.schema.json"

# Default consumers, compared when no --consumer override is given. Paths are
# relative to this repository root; they match the sibling checkouts the
# schema-parity workflow creates.
DEFAULT_CONSUMERS = {
    "wasmagent-js": "../wasmagent-js/packages/aep/schemas/aep-record.schema.json",
}


def resolve_root(schema: dict) -> dict:
    """Resolve a `$ref` + `definitions` wrapper to the record schema node."""
    ref = schema.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/"):
        node: object = schema
        for part in ref.lstrip("#/").split("/"):
            if not isinstance(node, dict) or part not in node:
                raise SystemExit(f"cannot resolve $ref {ref!r}")
            node = node[part]
        if isinstance(node, dict):
            return node
    return schema


def normalize(node: object) -> object:
    """Reduce a schema node to the semantics this gate compares.

    Anything not listed here (description, title, examples, format hints,
    minimum/maximum guidance) is presentation, not contract.
    """
    if node is True:
        return {"type": "anything"}
    if node is False:
        return {"type": "nothing"}
    if not isinstance(node, dict):
        return node

    out: dict[str, object] = {}
    if "type" in node:
        out["type"] = node["type"]
    if "enum" in node:
        out["enum"] = sorted(json.dumps(v, sort_keys=True) for v in node["enum"])
    if "const" in node:
        out["const"] = node["const"]
    if "required" in node:
        out["required"] = sorted(node["required"])
    if "additionalProperties" in node:
        out["additionalProperties"] = node["additionalProperties"]
    if "items" in node:
        out["items"] = normalize(node["items"])
    if "properties" in node:
        out["properties"] = {
            name: normalize(sub) for name, sub in sorted(node["properties"].items())
        }
    return out


def flatten(node: object, path: str = "") -> dict[str, object]:
    """Flatten a normalized schema into `path -> semantics` pairs."""
    flat: dict[str, object] = {}
    if not isinstance(node, dict):
        flat[path] = node
        return flat
    scalar_keys = ("type", "enum", "const", "additionalProperties")
    scalar = {k: node[k] for k in scalar_keys if k in node}
    if "properties" not in node and scalar:
        flat[path or "<root>"] = scalar
    for key, sub in node.get("properties", {}).items():
        child = f"{path}.{key}" if path else key
        flat.update(flatten(sub, child))
    if "items" in node:
        flat.update(flatten(node["items"], f"{path}[]"))
    # Record container-level facts (required list, openness) even when the
    # node also has children.
    container: dict[str, object] = {}
    if "required" in node:
        container["required"] = node["required"]
    if "additionalProperties" in node and "properties" in node:
        container["additionalProperties"] = node["additionalProperties"]
    if container:
        flat[f"{path}<container>" if path else "<root-container>"] = container
    return flat


def compare(canonical: object, consumer: object) -> list[dict[str, object]]:
    canon_flat = flatten(canonical)
    cons_flat = flatten(consumer)
    drifts: list[dict[str, object]] = []
    for path in sorted(set(canon_flat) | set(cons_flat)):
        in_c, in_s = path in canon_flat, path in cons_flat
        if in_c and not in_s:
            drifts.append({"path": path, "kind": "missing-in-consumer",
                           "canonical": canon_flat[path], "consumer": None})
        elif in_s and not in_c:
            drifts.append({"path": path, "kind": "extra-in-consumer",
                           "canonical": None, "consumer": cons_flat[path]})
        elif canon_flat[path] != cons_flat[path]:
            drifts.append({"path": path, "kind": "semantic-drift",
                           "canonical": canon_flat[path], "consumer": cons_flat[path]})
    return drifts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--canonical", type=Path, default=CANONICAL)
    parser.add_argument("--consumer", action="append", default=[],
                        metavar="NAME=PATH",
                        help="consumer schema to compare (repeatable); "
                             "default: " + ", ".join(sorted(DEFAULT_CONSUMERS)))
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--strict", action="store_true",
                        help="exit 1 when any drift is found (default: report only)")
    args = parser.parse_args()

    canonical = resolve_root(json.loads(args.canonical.read_text(encoding="utf-8")))
    canonical_norm = normalize(canonical)

    consumers: dict[str, Path] = {}
    for spec in args.consumer or []:
        name, _, path = spec.partition("=")
        consumers[name] = Path(path)
    if not consumers:
        for name, rel in DEFAULT_CONSUMERS.items():
            consumers[name] = (REPO_ROOT / rel).resolve()

    all_drifts: dict[str, list[dict[str, object]]] = {}
    for name, path in sorted(consumers.items()):
        if not path.exists():
            all_drifts[name] = [{"path": "<file>", "kind": "missing-file",
                                 "canonical": str(args.canonical), "consumer": str(path)}]
            continue
        consumer = resolve_root(json.loads(path.read_text(encoding="utf-8")))
        all_drifts[name] = compare(canonical_norm, normalize(consumer))

    if args.json:
        print(json.dumps(all_drifts, indent=2, sort_keys=True))
    else:
        total = 0
        for name, drifts in all_drifts.items():
            print(f"[{name}] {len(drifts)} drift(s) vs {args.canonical.name}")
            for d in drifts:
                total += 1
                print(f"  DRIFT: {d['path']} ({d['kind']})")
                if d.get("canonical") is not None:
                    print(f"    canonical: {json.dumps(d['canonical'], sort_keys=True)}")
                if d.get("consumer") is not None:
                    print(f"    consumer:  {json.dumps(d['consumer'], sort_keys=True)}")
        if total == 0:
            print("no structural drift found")
        else:
            print(f"\ntotal: {total} drift(s) — report-only mode; "
                  f"classify each as bug / intentional extension / compatibility "
                  f"exception, then allowlist or fix before enabling --strict")

    if args.strict and any(all_drifts.values()):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
