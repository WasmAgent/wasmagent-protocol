"""Protocol-side conformance guards for the open-agent-audit adapter contract."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess

import pytest
from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parent.parent


def _load(relative_path: str) -> dict:
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


def _aep_record_validator() -> Draft202012Validator:
    schema = _load("schemas/aep/aep-record.schema.json")
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def test_canonical_event_schema_does_not_accept_aep_records() -> None:
    schema = _load("schemas/aep/canonical-event.schema.json")
    validator = Draft202012Validator(schema)
    sample = _load("tests/fixtures/valid/aep-record/example.json")

    assert list(validator.iter_errors(sample))


@pytest.mark.parametrize(
    ("event_type", "data", "expected_field"),
    [
        (
            "decision",
            {
                "capability": "filesystem.write",
                "subject": "agent-1",
                "resource": "file:///tmp/out.txt",
                "decision": "allow",
                "reason_code": "policy-allow",
            },
            "capability_decisions",
        ),
        (
            "observation",
            {"verifier_id": "policy-check", "passed": True, "score": 0.98},
            "verifier_results",
        ),
        ("error", {"verifier_id": "tool-check"}, "verifier_results"),
        ("lifecycle", {}, "provenance"),
    ],
)
def test_adapter_maps_non_action_events_to_aep_fields(
    event_type: str, data: dict, expected_field: str
) -> None:
    event = {
        "schema_version": "canonical-event/v0.1",
        "event_id": f"{event_type}-1",
        "event_type": event_type,
        "timestamp_ms": 1737600000000,
        "run_id": "run-1",
        "data": data,
    }
    result = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import { canonicalEventToAEPRecord } from './index.js'; "
            "process.stdout.write(JSON.stringify(canonicalEventToAEPRecord("
            "JSON.parse(process.argv[1]))));",
            json.dumps(event),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    record = json.loads(result.stdout)

    errors = list(_aep_record_validator().iter_errors(record))
    assert not errors, "; ".join(error.message for error in errors)
    assert expected_field in record


def test_adapter_maps_sample_action_event_to_aep_record() -> None:
    event = _load("tests/fixtures/valid/canonical-event/example.json")
    result = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import { canonicalEventToAEPRecord } from './index.js'; "
            "process.stdout.write(JSON.stringify(canonicalEventToAEPRecord("
            "JSON.parse(process.argv[1]))));",
            json.dumps(event),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    record = json.loads(result.stdout)

    errors = list(_aep_record_validator().iter_errors(record))
    assert not errors, "; ".join(error.message for error in errors)
    assert record["actions"] == [
        {
            "action_id": event["event_id"],
            "tool_name": event["tool_name"],
            "state_changing": event["state_changing"],
            "timestamp_ms": event["timestamp_ms"],
            "parent_action_id": event["parent_event_id"],
        }
    ]
    assert record["output_refs"] == [
        {"uri": "file:///tmp/out.txt", "digest": "sha256:deadbeef"}
    ]


def test_adapter_maps_minimal_canonical_event_to_valid_aep_record() -> None:
    event = _load("tests/fixtures/valid/canonical-event/minimal.json")
    result = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import { canonicalEventToAEPRecord } from './index.js'; "
            "process.stdout.write(JSON.stringify(canonicalEventToAEPRecord("
            "JSON.parse(process.argv[1]))));",
            json.dumps(event),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    record = json.loads(result.stdout)

    errors = list(_aep_record_validator().iter_errors(record))
    assert not errors, "; ".join(error.message for error in errors)
    assert record["run_id"] == "canonical-event:evt-minimal"
