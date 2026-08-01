"""Protocol-side conformance guards for the open-agent-audit adapter contract."""

from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parent.parent


def _load(relative_path: str) -> dict:
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


def test_canonical_event_is_a_unique_registered_aep_member() -> None:
    index = _load("schemas/index.json")
    entry = next(item for item in index["schemas"] if item["id"] == "canonical-event")
    family_members = index["families"]["aep"]["members"]

    assert entry["path"] == "schemas/aep/canonical-event.schema.json"
    assert family_members.count("canonical-event") == 1
    assert set(family_members) <= {item["id"] for item in index["schemas"]}


def test_sample_aep_record_validates_against_canonical_schema() -> None:
    schema = _load("schemas/aep/aep-record.schema.json")
    sample = _load("tests/fixtures/valid/aep-record/example.json")

    Draft202012Validator.check_schema(schema)
    errors = sorted(Draft202012Validator(schema).iter_errors(sample), key=lambda error: error.path)

    assert not errors, "; ".join(error.message for error in errors)
