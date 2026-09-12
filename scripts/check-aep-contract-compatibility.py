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
EXCEPTIONS = REPO_ROOT / "scripts" / "aep-contract-exceptions.json"

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


def load_exceptions(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return [
        {"match": rule["match"], "class": rule.get("class", "unclassified"),
         "reason": rule.get("reason", "")}
        for rule in data.get("exceptions", [])
    ]


def classify(drifts: list[dict[str, object]],
             rules: list[dict[str, str]]) -> list[dict[str, object]]:
    """Attach the first matching exception rule to each drift, if any."""
    for d in drifts:
        d["allowlisted"] = False
        d["exception_class"] = None
        d["exception_reason"] = None
        for rule in rules:
            if str(d["path"]).startswith(rule["match"]):
                d["allowlisted"] = True
                d["exception_class"] = rule["class"]
                d["exception_reason"] = rule["reason"]
                break
    return drifts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--canonical", type=Path, default=CANONICAL)
    parser.add_argument("--consumer", action="append", default=[],
                        metavar="NAME=PATH",
                        help="consumer schema to compare (repeatable); "
                             "default: " + ", ".join(sorted(DEFAULT_CONSUMERS)))
    parser.add_argument("--exceptions", type=Path, default=EXCEPTIONS,
                        help="classified-exception rules (prefix match)")
    parser.add_argument("--no-exceptions", action="store_true",
                        help="ignore the exception allowlist entirely")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--strict", action="store_true",
                        help="exit 1 when any UNCLASSIFIED drift is found "
                             "(allowlisted exceptions do not fail the gate)")
    args = parser.parse_args()

    rules = [] if args.no_exceptions else load_exceptions(args.exceptions)

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
            all_drifts[name] = classify(
                [{"path": "<file>", "kind": "missing-file",
                  "canonical": str(args.canonical), "consumer": str(path)}], rules)
            continue
        consumer = resolve_root(json.loads(path.read_text(encoding="utf-8")))
        all_drifts[name] = classify(compare(canonical_norm, normalize(consumer)), rules)

    if args.json:
        print(json.dumps(all_drifts, indent=2, sort_keys=True))
    else:
        unclassified = 0
        for name, drifts in all_drifts.items():
            print(f"[{name}] {len(drifts)} drift(s) vs {args.canonical.name}")
            for d in drifts:
                if d.get("allowlisted"):
                    print(f"  ALLOWLISTED [{d['exception_class']}]: {d['path']} ({d['kind']})")
                else:
                    unclassified += 1
                    print(f"  DRIFT: {d['path']} ({d['kind']})")
                    if d.get("canonical") is not None:
                        print(f"    canonical: {json.dumps(d['canonical'], sort_keys=True)}")
                    if d.get("consumer") is not None:
                        print(f"    consumer:  {json.dumps(d['consumer'], sort_keys=True)}")
        if unclassified == 0:
            print("no unclassified structural drift — "
                  f"{sum(len(v) for v in all_drifts.values())} drift(s) covered by exception rules")
        else:
            print(f"\ntotal unclassified: {unclassified} — classify each as bug / "
                  f"intentional extension / compatibility exception, then extend "
                  f"{args.exceptions.name}")

    if args.strict and unclassified > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
