"""Protocol-side conformance guards for the open-agent-audit adapter contract."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parent.parent


def _load(relative_path: str) -> dict:
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


def _canonical_event_validator() -> Draft202012Validator:
    schema = _load("schemas/aep/canonical-event.schema.json")
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def test_embedded_aep_branch_matches_aep_record_schema() -> None:
    canonical_schema = _load("schemas/aep/canonical-event.schema.json")
    aep_record_schema = _load("schemas/aep/aep-record.schema.json")
    expected = {
        key: value
        for key, value in aep_record_schema.items()
        if key not in {"$schema", "$id", "title", "description"}
    }

    assert canonical_schema["$defs"]["aep_record"] == expected


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
