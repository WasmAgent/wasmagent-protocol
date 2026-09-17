"""Locate and self-check the packaged AEP conformance corpus.

The corpus under ``conformance/aep`` ships inside both published packages
(npm ``files`` and the wheel ``force-include``), so a third-party implementer
can pin and verify the corpus without cloning this repository.

``check_semantic`` is the single implementation of the normative semantic
reference rules (attribution floor / vocabulary / count invariants); the
protocol-side runner ``scripts/run-aep-conformance-corpus.py`` imports it from
here, and the installed self-check executes it against the packaged corpus.

This module verifies corpus integrity and the project-owned reference
layers only. It is NOT an independent semantic verifier — see
``conformance/aep/IMPLEMENTER.md``.
"""

from __future__ import annotations

import json
from importlib import resources
from pathlib import Path
from typing import Any

__all__ = [
    "get_aep_conformance_dir",
    "get_aep_conformance_manifest",
    "check_semantic",
    "run_self_check",
]

_PACKAGE = "wasmagent_protocol"
_CORPUS_PACKAGE_REL = ("conformance", "aep")
# Editable / source-checkout fallback: mirrors the _SOURCE_SCHEMAS pattern in
# __init__.py (src/wasmagent_protocol/conformance.py -> <repo>/conformance/aep).
_SOURCE_CORPUS = Path(__file__).resolve().parents[2] / "conformance" / "aep"

SUPPORTED_SIGNING_PROFILE = "aep-dsse-ed25519-decoded-body-v1"
MANIFEST_SCHEMA_VERSION = 2

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


def _corpus_root():
    """Locate the AEP conformance corpus directory as a Traversable."""
    try:
        node = resources.files(_PACKAGE)
        for part in _CORPUS_PACKAGE_REL:
            node = node.joinpath(part)
        if node.joinpath("manifest.json").is_file():
            return node
    except Exception:  # pragma: no cover - depends on install layout
        pass
    if (_SOURCE_CORPUS / "manifest.json").is_file():
        return _SOURCE_CORPUS
    raise FileNotFoundError(
        "AEP conformance corpus not found: neither the packaged "
        "wasmagent_protocol.conformance.aep resource nor the source checkout at "
        f"{_SOURCE_CORPUS} contains manifest.json"
    )


def get_aep_conformance_dir() -> Path:
    """Return a filesystem Path to the installed AEP conformance corpus.

    Works from an installed wheel (force-include mapping) and from a source
    checkout; callers never need to guess site-packages paths.
    """
    node = _corpus_root()
    if isinstance(node, Path):
        return node
    with resources.as_file(node) as p:
        return Path(p)


def get_aep_conformance_manifest() -> dict[str, Any]:
    """Return the parsed AEP conformance corpus manifest (verdict authority)."""
    return json.loads((get_aep_conformance_dir() / "manifest.json").read_text(encoding="utf-8"))


def check_semantic(record: dict) -> tuple[bool, str]:
    """Reference semantic checker — mirrors the normative floor rules.

    Returns ``(ok, reason)``. This is the shared implementation used by the
    protocol-side corpus runner and by the installed-package self-check.
    """
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


def _records_in(fixture: Path) -> list[dict]:
    """Load one fixture; .jsonl files carry one record per non-empty line."""
    if fixture.suffix == ".jsonl":
        return [
            json.loads(line)
            for line in fixture.read_text(encoding="utf8").splitlines()
            if line.strip()
        ]
    return [json.loads(fixture.read_text(encoding="utf-8"))]


def run_self_check(corpus: Path | str | None = None) -> tuple[bool, list[str]]:
    """Self-check the packaged AEP conformance corpus.

    Verifies: corpus completeness against the manifest, manifest coherence
    (schema version, signing profile, label vocabularies), verifying-key and
    canonical-schema presence, and agreement between the project-owned
    semantic reference checker and every manifest semantic label. When
    ``jsonschema`` is installed the project-owned structural layer runs too;
    otherwise that layer is reported as skipped, never silently downgraded.

    Returns ``(ok, report_lines)``. The last line always states that a
    self-check is not independent semantic verification.
    """
    dir_path = Path(corpus) if corpus is not None else get_aep_conformance_dir()
    lines: list[str] = []
    failures: list[str] = []

    def fail(msg: str) -> None:
        failures.append(msg)
        lines.append(f"FAIL {msg}")

    manifest_path = dir_path / "manifest.json"
    if not manifest_path.is_file():
        fail(f"missing manifest: {manifest_path}")
        return False, lines
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"manifest does not parse: {exc}")
        return False, lines
    lines.append(f"OK   manifest parsed ({manifest_path})")

    if manifest.get("schema_version") != MANIFEST_SCHEMA_VERSION:
        fail(f"schema_version {manifest.get('schema_version')!r} != {MANIFEST_SCHEMA_VERSION}")
    if manifest.get("signing_profile_id") != SUPPORTED_SIGNING_PROFILE:
        fail(f"unsupported signing_profile_id {manifest.get('signing_profile_id')!r}")

    canonical_rel = manifest.get("canonical_schema")
    canonical_path = None
    if not isinstance(canonical_rel, str) or not canonical_rel:
        fail("canonical_schema missing from manifest")
    else:
        # The manifest stores the canonical schema repo-root-relative (the
        # protocol-side runner resolves it against REPO_ROOT). Both layouts
        # satisfy parents[1] / rel: source checkout aep/ -> conformance/ ->
        # <repo>/, installed wheel conformance/aep -> wasmagent_protocol/.
        for candidate in (dir_path / canonical_rel, dir_path.parents[1] / canonical_rel):
            if candidate.is_file():
                canonical_path = candidate
                break
        if canonical_path is None:
            fail(f"canonical schema missing: {canonical_rel}")
        else:
            try:
                json.loads(canonical_path.read_text(encoding="utf-8"))
                lines.append(f"OK   canonical schema parses ({canonical_path.name})")
            except (OSError, json.JSONDecodeError) as exc:
                fail(f"canonical schema does not parse: {exc}")
                canonical_path = None

    entries = manifest.get("conformance_target", [])
    if not entries:
        fail("manifest declares no conformance_target entries")

    checked = 0
    for entry in entries:
        rel = entry.get("path")
        if not rel:
            fail(f"entry missing path: {entry}")
            continue
        fixture = dir_path / str(rel)
        if not fixture.is_file():
            fail(f"manifest fixture missing on disk: {rel}")
            continue
        checked += 1
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

        try:
            records = _records_in(fixture)
        except (OSError, json.JSONDecodeError) as exc:
            fail(f"{rel}: fixture does not parse: {exc}")
            continue

        semantic = entry.get("semantic")
        if semantic in SEMANTIC:
            for r in records:
                ok, reason = check_semantic(r)
                if ok is not (semantic == "valid"):
                    fail(f"{rel}: semantic expected {semantic}, checker said {ok} ({reason})")
                    break

    lines.append(f"OK   corpus complete: {checked}/{len(entries)} manifest fixture(s) present")

    for key_id, key_rel in (manifest.get("verifying_keys") or {}).get("by_keyid", {}).items():
        key_path = dir_path / str(key_rel)
        if not key_path.is_file():
            fail(f"verifying key missing: {key_id} -> {key_rel}")
    if not any((dir_path / "dsse").glob("*verify-key*.hex")):
        fail("no verify keys found under dsse/")
    lines.append("OK   verifying keys present")

    for entry in manifest.get("historical", []):
        rel = str(entry.get("path", ""))
        if entry.get("conformance_target") is not False:
            fail(f"historical entry {rel!r} must declare conformance_target: false")
        if "historical/" not in rel:
            fail(f"historical entry {rel!r} must live under historical/")

    structural_note = "skipped (jsonschema not installed)"
    try:
        import jsonschema  # noqa: F401

        has_jsonschema = True
    except ImportError:
        has_jsonschema = False
    if has_jsonschema and canonical_path is None:
        structural_note = "skipped (canonical schema unavailable)"
        has_jsonschema = False
    if has_jsonschema:
        executed = 0
        canonical = json.loads(canonical_path.read_text(encoding="utf-8"))
        Validator = jsonschema.validators.validator_for(canonical)
        Validator.check_schema(canonical)
        validator = Validator(canonical)
        structural_failures = 0
        for entry in entries:
            structural = entry.get("structural")
            if structural not in STRUCTURAL:
                continue
            fixture = dir_path / str(entry["path"])
            if not fixture.is_file():
                continue
            try:
                records = _records_in(fixture)
            except (OSError, json.JSONDecodeError):
                continue
            error_count = sum(len(list(validator.iter_errors(r))) for r in records)
            ok = (structural == "valid" and not error_count) or (
                structural == "invalid" and error_count
            )
            if not ok:
                structural_failures += 1
                fail(f"{entry['path']}: structural expected {structural}, got {error_count} error(s)")
            else:
                executed += 1
        structural_note = f"executed ({executed} fixture(s), {structural_failures} failure(s))"
    lines.append(f"INFO structural layer: {structural_note}")

    ok = not failures
    lines.append(
        f"{'OK' if ok else 'FAIL'}  aep conformance self-check: {len(entries)} current target(s), "
        f"{len(failures)} failure(s)"
    )
    lines.append(
        "NOTE self-check verifies corpus integrity and the project-owned reference layers; "
        "it is NOT independent semantic verification (see conformance/aep/IMPLEMENTER.md)"
    )
    return ok, lines


if __name__ == "__main__":  # pragma: no cover - manual smoke run
    import sys

    ok, report = run_self_check(sys.argv[1] if len(sys.argv) > 1 else None)
    for line in report:
        print(line)
    raise SystemExit(0 if ok else 1)
