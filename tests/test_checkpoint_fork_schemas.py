"""Tests for the checkpoint/fork core data structures and their evidence schema.

Covers wasmagent-protocol#169 acceptance criteria:

- docs/checkpoint-fork-architecture.md exists and defines checkpoint, fork,
  checkpoint_id, parent_run_id, fork_of, and state_digest.
- schemas/aep/checkpoint.schema.json validates representative valid/invalid
  fixture objects.
- schemas/aep/fork.schema.json validates representative valid/invalid fixture
  objects.
- schemas/aep/checkpoint-evidence.schema.json resolves its $refs into the
  checkpoint schema and validates representative fixtures.
- schemas/index.json registers the checkpoint and fork schemas.

The project convention for schema validation is the conformance harness
(tests/conformance.py); these tests make the checkpoint/fork coverage explicit
so the criterion is verifiable under ``pytest`` as well.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pytest

pytest.importorskip("jsonschema")
from jsonschema import Draft202012Validator  # noqa: E402
from referencing import Registry, Resource  # noqa: E402

from wasmagent_protocol import get_schema  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = REPO_ROOT / "schemas"
FIXTURES = REPO_ROOT / "tests" / "fixtures"

CHECKPOINT_SCHEMA_ID = "https://wasmagent.dev/schemas/aep/checkpoint.schema.json"

REQUIRED_DOC_CONCEPTS = (
    "checkpoint",
    "fork",
    "checkpoint_id",
    "parent_run_id",
    "fork_of",
    "state_digest",
)


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def _reference_registry() -> Registry:
    """Build a referencing.Registry keyed by $id and bare filename so cross-file
    $refs like checkpoint-evidence -> checkpoint.schema.json resolve."""
    resources = []
    for path in sorted(SCHEMAS.rglob("*.schema.json")):
        doc = _load(path)
        res = Resource.from_contents(doc)
        sid = doc.get("$id")
        if isinstance(sid, str):
            resources.append((sid, res))
        resources.append((path.name, res))
    return Registry().with_resources(resources)


def _validator(schema_id: str) -> Draft202012Validator:
    return Draft202012Validator(
        get_schema(schema_id),
        registry=_reference_registry(),
    )


def _fixture_paths(kind: str, schema_id: str) -> list[Path]:
    return sorted((FIXTURES / kind / schema_id).glob("*.json"))


@pytest.mark.parametrize("schema_id", ["checkpoint", "fork", "checkpoint-evidence"])
def test_valid_fixtures_validate(schema_id: str) -> None:
    validator = _validator(schema_id)
    paths = _fixture_paths("valid", schema_id)
    assert paths, f"no valid fixtures for {schema_id}"
    for f in paths:
        errs = list(validator.iter_errors(_load(f)))
        assert not errs, f"{f.relative_to(REPO_ROOT)} should validate: {errs[0].message}"


@pytest.mark.parametrize("schema_id", ["checkpoint", "fork", "checkpoint-evidence"])
def test_invalid_fixtures_are_rejected(schema_id: str) -> None:
    validator = _validator(schema_id)
    paths = _fixture_paths("invalid", schema_id)
    assert paths, f"no invalid fixtures for {schema_id}"
    for f in paths:
        errs = list(validator.iter_errors(_load(f)))
        assert errs, f"{f.relative_to(REPO_ROOT)} should be rejected"


def test_checkpoint_evidence_refs_resolve_into_checkpoint_schema() -> None:
    schema = get_schema("checkpoint-evidence")
    props = schema["properties"]
    for field in ("checkpoint_id", "parent_run_id", "fork_of", "state_digest"):
        ref = props[field]["$ref"]
        assert ref.startswith(f"{CHECKPOINT_SCHEMA_ID}#/$defs/"), f"{field} must $ref checkpoint $defs"
    # Resolve end-to-end: every valid evidence fixture must still validate.
    validator = _validator("checkpoint-evidence")
    for f in _fixture_paths("valid", "checkpoint-evidence"):
        errs = list(validator.iter_errors(_load(f)))
        assert not errs, f"{f.relative_to(REPO_ROOT)}: {errs[0].message}"


def test_index_registers_checkpoint_and_fork() -> None:
    index = _load(SCHEMAS / "index.json")
    by_id = {entry["id"]: entry for entry in index["schemas"]}
    for sid in ("checkpoint", "fork"):
        entry = by_id.get(sid)
        assert entry, f"{sid} missing from schemas/index.json"
        assert (REPO_ROOT / entry["path"]).is_file()
        assert _load(REPO_ROOT / entry["path"])["$id"] == entry["canonical_id"]


def test_architecture_docs_cover_required_concepts() -> None:
    doc = (REPO_ROOT / "docs" / "checkpoint-fork-architecture.md").read_text(encoding="utf-8")
    for concept in REQUIRED_DOC_CONCEPTS:
        assert concept in doc, f"docs must define {concept!r}"
