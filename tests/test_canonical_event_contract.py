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

    Draft202012Validator.check_schema(schema)
    resources = []
    for schema_path in (ROOT / "schemas").rglob("*.schema.json"):
        resource_schema = json.loads(schema_path.read_text(encoding="utf-8"))
        resources.append(
            (resource_schema["$id"], Resource.from_contents(resource_schema))
        )
    registry = Registry().with_resources(resources)
    return Draft202012Validator(schema, registry=registry)


def test_aep_compatibility_references_the_authoritative_schema() -> None:
    canonical_event_schema = _load("schemas/aep/canonical-event.schema.json")
    aep_record_schema = _load("schemas/aep/aep-record.schema.json")

    assert "$defs" not in canonical_event_schema
    assert canonical_event_schema["oneOf"][1] == {"$ref": aep_record_schema["$id"]}


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


def test_aep_compatibility_does_not_apply_canonical_event_constraints() -> None:
    sample = _load("tests/fixtures/valid/aep-record/example.json")
    sample["event_type"] = "native.audit.event"
    errors = sorted(
        _canonical_event_validator().iter_errors(sample),
        key=lambda error: error.path,
    )

    assert not errors, "; ".join(error.message for error in errors)


def test_canonical_event_fixtures_validate_against_canonical_schema() -> None:
    validator = _canonical_event_validator()

    for fixture_name in ("minimal.json", "example.json"):
        errors = list(
            validator.iter_errors(
                _load(f"tests/fixtures/valid/canonical-event/{fixture_name}")
            )
        )
        assert not errors, f"{fixture_name}: " + "; ".join(
            error.message for error in errors
        )

    invalid = _load("tests/fixtures/invalid/canonical-event/example.json")
    assert list(validator.iter_errors(invalid))


@pytest.mark.parametrize("value", [None, "canonical event", []])
def test_canonical_event_schema_rejects_non_object_values(value: object) -> None:
    assert list(_canonical_event_validator().iter_errors(value))


@pytest.mark.parametrize(
    ("schema_version", "record"),
    [
        pytest.param(
            "aep/v0.1",
            {
                "event_id": "evt-1",
                "event_type": "action",
                "timestamp_ms": 1737600000000,
            },
            id="v0.1-canonical-shaped-but-missing-aep-envelope",
        ),
        pytest.param(
            "aep/v0.2",
            {
                "event_id": "evt-1",
                "event_type": "action",
                "timestamp_ms": 1737600000000,
            },
            id="v0.2-canonical-shaped-but-missing-aep-envelope",
        ),
        pytest.param(
            "aep/v0.3",
            {
                "event_id": "evt-1",
                "event_type": "action",
                "timestamp_ms": 1737600000000,
            },
            id="v0.3-canonical-shaped-but-missing-aep-envelope",
        ),
        pytest.param(
            "aep/v0.3",
            {
                "run_id": "run-1",
                "created_at_ms": 1737600000000,
                "actions": [
                    {
                        "action_id": "action-1",
                        "tool_name": "write_file",
                        "state_changing": True,
                    }
                ],
            },
            id="v0.3-aep-record-with-malformed-action",
        ),
        pytest.param(
            "aep/v0.4",
            {
                "run_id": "run-1",
                "created_at_ms": 1737600000000,
            },
            id="unsupported-aep-version",
        ),
    ],
)
def test_malformed_or_unsupported_aep_records_are_rejected_by_canonical_schema(
    schema_version: str,
    record: dict,
) -> None:
    errors = list(
        _canonical_event_validator().iter_errors(
            {"schema_version": schema_version, **copy.deepcopy(record)}
        )
    )

    assert errors
