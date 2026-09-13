#!/usr/bin/env python3
"""Executable checks for the AEP conformance corpus (conformance/aep).

This runner enforces the protocol-side layers; it deliberately spawns no
subprocesses. Authenticity verdicts (dsse-valid / invalid) are executed by
EACH implementation repository's own CI against this corpus — the corpus is
a consumer-side gate, not protocol-side data only.

Enforced here:

1. manifest.json vocabulary: label enums, required fields, conformance_target
   flags; retired labels (legacy-valid, dsse-or-legacy-valid) are rejected.
2. fixture existence for every referenced path.
3. structural expectations — jsonschema validation vs the canonical schema.
4. semantic expectations — reference checker for floor / vocabulary / count
   invariants (weakest-grade rule, canonical vocabulary, duplicates,
   non-negative authorization_evidence_count).

Exit 0 only if the manifest is coherent and every executed check agrees.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CORPUS = REPO_ROOT / "conformance" / "aep"
MANIFEST = CORPUS / "manifest.json"

STRUCTURAL = {"valid", "invalid"}
SEMANTIC = {"valid", "invalid"}
AUTHENTICITY = {"unsigned", "dsse-valid", "invalid", "not-checked"}
CHAIN = {"not-present", "intact", "partial", "orphaned", "broken", "not-checked"}
RETIRED_LABELS = {"legacy-valid", "dsse-or-legacy-valid"}

# Canonical grade order for floor semantics (weakest first).
_BACKING_RANK = {
    "unknown": 0,
    "operator_asserted": 1,
    "principal_key_signed": 2,
    "qualified_signature": 3,
}

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)
    print(f"FAIL {msg}")


def check_semantic(record: dict) -> tuple[bool, str]:
    """Reference semantic checker — mirrors the normative floor rules."""
    floor = record.get("run_attribution_backing_floor")
    observed = record.get("run_attribution_backing_observed")

    for key, value in (
        ("attribution_backing", record.get("attribution_backing")),
        ("run_attribution_backing_floor", floor),
    ):
        if value is not None and value not in _BACKING_RANK:
            return False, f"attribution: {key} outside canonical vocabulary"

    count = record.get("authorization_evidence_count")
    if count is not None and (not isinstance(count, int) or isinstance(count, bool) or count < 0):
        return False, "attribution: authorization_evidence_count must be a non-negative integer"

    # Pair-presence symmetry: the floor and observed fields ship together —
    # "reported alongside, never instead of". Any half-pair fails closed:
    #   floor present + observed absent/empty → invalid
    #   observed present (non-list, empty, or floor absent)  → invalid
    observed_is_list = isinstance(observed, list)
    observed_nonempty = observed_is_list and len(observed) > 0
    if floor is not None and not observed_nonempty:
        return False, "attribution: floor provided without a non-empty observed set"
    if observed is not None:
        if not observed_nonempty:
            return False, "attribution: observed provided as an empty set — empty grading claim"
        if floor is None:
            return False, "attribution: observed provided without floor — the pair ships together"

    if floor is not None and observed_nonempty:
        if any(g not in _BACKING_RANK for g in observed):
            return False, "attribution: observed grade outside canonical vocabulary"
        # Independent membership check: the floor must literally be one of the
        # observed grades, not merely tie the minimum by rank arithmetic.
        if floor not in observed:
            return False, "attribution: floor not present in observed"
        if len(set(observed)) != len(observed):
            return False, "attribution: duplicate grade in observed set"
        if _BACKING_RANK[floor] != min(_BACKING_RANK[g] for g in observed):
            return False, "attribution: floor is not the weakest observed grade"
    return True, ""


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    # Optional positional override (used by Gate C / tests to point at any
    # corpus checkout); defaults to this repository's own corpus.
    corpus = Path(args[0]).resolve() if args else CORPUS
    manifest_path = corpus / "manifest.json"
    if not manifest_path.exists():
        fail(f"missing manifest: {manifest_path}")
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = manifest.get("conformance_target", [])
    historical = manifest.get("historical", [])

    # Signing-profile gate (P0-A): refuse to execute a corpus whose profile is
    # not the one this runner implements — a stale manifest must fail loudly,
    # never silently verify fixtures under a retired construction.
    SUPPORTED_PROFILE = "aep-dsse-ed25519-decoded-body-v1"
    if manifest.get("signing_profile_id") != SUPPORTED_PROFILE:
        fail(
            f"unsupported or stale signing_profile_id "
            f"{manifest.get('signing_profile_id')!r} — this runner implements {SUPPORTED_PROFILE!r}"
        )
        return 2

    # Structural conformance requires jsonschema: fail closed when absent
    # instead of silently downgrading the corpus to semantic-only.
    try:
        import jsonschema
    except ImportError:
        print(
            "ERROR: jsonschema is required for structural conformance checks",
            file=sys.stderr,
        )
        return 2

    canonical_path = REPO_ROOT / manifest.get(
        "canonical_schema", "schemas/aep/aep-record.schema.json"
    )
    canonical = json.loads(canonical_path.read_text(encoding="utf-8"))
    # Select the validator from the schema's own $schema dialect (the canonical
    # schema declares Draft 2020-12) — never hard-code a draft.
    Validator = jsonschema.validators.validator_for(canonical)
    Validator.check_schema(canonical)
    validator = Validator(canonical)

    executed = 0

    # 1. manifest vocabulary + paths.
    for entry in entries:
        rel = entry.get("path")
        fixture = corpus / str(rel)
        if not rel:
            fail(f"entry missing path: {entry}")
            continue
        if not fixture.exists():
            fail(f"manifest fixture missing on disk: {rel}")
            continue
        for label, vocab in (("structural", STRUCTURAL), ("semantic", SEMANTIC)):
            if entry.get(label) not in vocab:
                fail(f"{rel}: {label} label {entry.get(label)!r} outside {sorted(vocab)}")
        authenticity = entry.get("authenticity", "not-checked")
        if authenticity not in AUTHENTICITY:
            fail(f"{rel}: authenticity label {authenticity!r} outside {sorted(AUTHENTICITY)}")
        if authenticity in RETIRED_LABELS:
            fail(f"{rel}: retired authenticity label {authenticity!r}")
        chain = entry.get("chain", "not-checked")
        if chain not in CHAIN:
            fail(f"{rel}: chain label {chain!r} outside {sorted(CHAIN)}")
        if chain in RETIRED_LABELS:
            fail(f"{rel}: retired chain label {chain!r}")

        # .jsonl fixtures carry multiple records — every line must satisfy
        # the declared structural/semantic layers.
        if fixture.suffix == ".jsonl":
            records = [
                json.loads(line)
                for line in fixture.read_text(encoding="utf8").splitlines()
                if line.strip()
            ]
        else:
            records = [json.loads(fixture.read_text(encoding="utf-8"))]

        # 2. structural expectations.
        structural = entry.get("structural")
        if structural in STRUCTURAL and validator:
            error_count = sum(len(list(validator.iter_errors(r))) for r in records)
            ok = (structural == "valid" and not error_count) or (structural == "invalid" and error_count)
            if not ok:
                fail(f"{rel}: structural expected {structural}, got {error_count} error(s)")
            else:
                executed += 1

        # 3. semantic expectations.
        semantic = entry.get("semantic")
        if semantic in SEMANTIC:
            all_ok = True
            for r in records:
                ok, reason = check_semantic(r)
                if ok is not (semantic == "valid"):
                    all_ok = False
                    fail(f"{rel}: semantic expected {semantic}, checker said {ok} ({reason})")
                    break
            if all_ok:
                executed += 1

    # 4. historical/ entries must be marked outside the conformance target.
    for entry in historical:
        rel = entry.get("path")
        if entry.get("conformance_target") is not False:
            fail(f"historical entry {rel!r} must declare conformance_target: false")
        if rel and "historical/" not in str(rel):
            fail(f"historical entry {rel!r} must live under historical/")
        for label in ("structural", "semantic", "authenticity", "chain"):
            if label in entry and entry[label] in RETIRED_LABELS:
                fail(f"historical entry {rel!r} uses retired label {entry[label]!r}")
    if any("historical/" not in str(e.get("path", "")) for e in historical):
        fail("manifest historical section contains a non-historical path")

    total = len(entries)
    print(f"\ncorpus: {total} current-target fixture(s), {executed} protocol-side check(s) executed, {len(failures)} failure(s)")
    for f in failures:
        print(f"  - {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
