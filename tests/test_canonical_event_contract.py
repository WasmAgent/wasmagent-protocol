"""Protocol-side conformance guards for the open-agent-audit adapter contract."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource


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


def _canonical_event_validator() -> Draft202012Validator:
    schema = _load("schemas/aep/canonical-event.schema.json")
    aep_record_schema = _load("schemas/aep/aep-record.schema.json")
    registry = Registry().with_resources(
        [
            (schema["$id"], Resource.from_contents(schema)),
            (aep_record_schema["$id"], Resource.from_contents(aep_record_schema)),
        ]
    )

    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, registry=registry)


@pytest.mark.parametrize("schema_version", ["aep/v0.1", "aep/v0.2", "aep/v0.3"])
def test_supported_aep_records_validate_against_canonical_schema(
    schema_version: str,
) -> None:
    sample = _load("tests/fixtures/valid/aep-record/example.json")
    sample["schema_version"] = schema_version
    errors = sorted(
        _canonical_event_validator().iter_errors(sample),
        key=lambda error: error.path,
    )

    assert not errors, "; ".join(error.message for error in errors)


@pytest.mark.parametrize(
    "record",
    [
        {"schema_version": "aep/v0.1", "run_id": "run-1"},
        {
            "schema_version": "aep/v0.2",
            "event_id": "evt-1",
            "event_type": "action",
            "timestamp_ms": 1737600000000,
        },
        {
            "schema_version": "aep/v0.4",
            "run_id": "run-1",
            "created_at_ms": 1737600000000,
        },
    ],
)
def test_malformed_or_unsupported_aep_records_are_rejected_by_canonical_schema(
    record: dict,
) -> None:
    errors = list(_canonical_event_validator().iter_errors(copy.deepcopy(record)))

    assert errors
