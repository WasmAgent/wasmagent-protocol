"""Pytest harness for the published ``aep-conformance/`` fixture corpus.

Issue #13 / #25 ship a versioned corpus of valid + invalid ``aep-record``
instances *inside the published package* so any Agent Evidence Protocol emitter
can self-check its output against the canonical contract. These tests lock that
contract in:

- every fixture named in ``manifest.json`` behaves exactly as the manifest
  claims (valid -> passes; invalid -> fails, and the failing JSON Schema keyword
  matches ``expect_keyword``);
- the manifest and the on-disk fixtures stay in sync (no missing or orphan
  files);
- the manifest's own ``schema`` block points at the real canonical
  ``aep-record`` schema;
- the corpus is actually declared as shipped package data in both ``package.json``
  and ``pyproject.toml``.

This complements ``tests/conformance.py`` (the repo-internal per-schema harness,
run as a script) by exercising the richer, consumer-facing ``aep-record`` corpus.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "aep-conformance"

MANIFEST = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))
FIXTURES = MANIFEST["fixtures"]

SCHEMA_PATH = ROOT / "schemas" / "aep" / "aep-record.schema.json"
SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(SCHEMA)


def _load_fixture(rel: str) -> object:
    return json.loads((CORPUS / rel).read_text(encoding="utf-8"))


# --- per-fixture validation ---------------------------------------------------

VALID_FIXTURES = [f for f in FIXTURES if f["valid"]]
INVALID_FIXTURES = [f for f in FIXTURES if not f["valid"]]


@pytest.mark.parametrize("fixture", VALID_FIXTURES, ids=lambda f: f["path"])
def test_valid_fixture_passes(fixture: dict) -> None:
    """Every valid fixture MUST validate against the canonical aep-record schema."""
    errors = list(VALIDATOR.iter_errors(_load_fixture(fixture["path"])))
    assert not errors, (
        f"valid fixture {fixture['path']} was rejected: {errors[0].message}"
    )


@pytest.mark.parametrize("fixture", INVALID_FIXTURES, ids=lambda f: f["path"])
def test_invalid_fixture_fails_with_expected_keyword(fixture: dict) -> None:
    """Each invalid fixture MUST fail, and on the keyword the manifest predicts."""
    errors = list(VALIDATOR.iter_errors(_load_fixture(fixture["path"])))
    assert errors, (
        f"invalid fixture {fixture['path']} was accepted (should have failed)"
    )
    keywords = {error.validator for error in errors}
    expected = fixture["expect_keyword"]
    assert expected in keywords, (
        f"invalid fixture {fixture['path']} tripped {sorted(keywords)}, "
        f"but manifest expected {expected!r}"
    )


# --- corpus completeness ------------------------------------------------------

def test_corpus_has_both_valid_and_invalid_fixtures() -> None:
    """The published set must carry at least one valid and one invalid record."""
    assert VALID_FIXTURES, "manifest lists no valid fixtures"
    assert INVALID_FIXTURES, "manifest lists no invalid fixtures"


def test_manifest_and_files_are_in_sync() -> None:
    """Every manifest path exists, and every on-disk fixture is listed."""
    listed = {f["path"] for f in FIXTURES}

    for rel in sorted(listed):
        assert (CORPUS / rel).is_file(), f"manifest names a missing fixture: {rel}"

    on_disk = {
        str(p.relative_to(CORPUS))
        for p in (CORPUS / "valid").glob("*.json")
    } | {
        str(p.relative_to(CORPUS))
        for p in (CORPUS / "invalid").glob("*.json")
    }
    unlisted = on_disk - listed
    assert not unlisted, f"fixtures on disk but absent from manifest: {sorted(unlisted)}"


def test_invalid_fixtures_each_violate_exactly_one_keyword() -> None:
    """An invalid fixture isolates one constraint region — assert it fails for
    exactly the keyword family its description claims (no accidental coverage)."""
    for fixture in INVALID_FIXTURES:
        errors = list(VALIDATOR.iter_errors(_load_fixture(fixture["path"])))
        keywords = {error.validator for error in errors}
        assert keywords == {fixture["expect_keyword"]}, (
            f"{fixture['path']} tripped {sorted(keywords)}; "
            f"expected only {fixture['expect_keyword']!r}"
        )


# --- manifest metadata + package publication ----------------------------------

def test_manifest_schema_block_matches_canonical_record() -> None:
    """The manifest's ``schema`` block must point at the real canonical schema."""
    block = MANIFEST["schema"]
    assert block["id"] == "aep-record"
    assert block["canonical_id"] == SCHEMA["$id"]
    assert block["path"] == "schemas/aep/aep-record.schema.json"

    index = json.loads((ROOT / "schemas" / "index.json").read_text(encoding="utf-8"))
    entry = next(s for s in index["schemas"] if s["id"] == "aep-record")
    assert block["version"] == entry["version"]


def test_corpus_is_published_in_npm_package() -> None:
    """package.json must ship aep-conformance/ and expose it under exports."""
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert "aep-conformance/" in pkg["files"], (
        "package.json 'files' does not ship aep-conformance/"
    )
    assert any(
        k.startswith("./aep-conformance") for k in pkg["exports"]
    ), "package.json 'exports' does not expose aep-conformance/*"


def test_corpus_is_published_in_python_package() -> None:
    """pyproject.toml must force-include aep-conformance into the wheel."""
    text = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    assert re.search(
        r'"aep-conformance"\s*=\s*"wasmagent_protocol/aep_conformance"',
        text,
    ), "pyproject.toml does not force-include aep-conformance into the wheel"
