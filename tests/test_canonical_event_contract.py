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


def test_canonical_event_is_a_unique_registered_aep_member() -> None:
    index = _load("schemas/index.json")
    entry = next(item for item in index["schemas"] if item["id"] == "canonical-event")
    family_members = index["families"]["aep"]["members"]

    assert entry["path"] == "schemas/aep/canonical-event.schema.json"
    assert family_members.count("canonical-event") == 1
    assert set(family_members) <= {item["id"] for item in index["schemas"]}


def _validator(relative_path: str) -> Draft202012Validator:
    schema = _load(relative_path)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


@pytest.mark.parametrize("schema_version", ["aep/v0.1", "aep/v0.2", "aep/v0.3"])
def test_sample_aep_record_validates_against_authoritative_schema(
    schema_version: str,
) -> None:
    sample = _load("tests/fixtures/valid/aep-record/example.json")
    sample["schema_version"] = schema_version
    errors = list(
        _validator("schemas/aep/aep-record.schema.json").iter_errors(sample)
    )

    assert not errors, "; ".join(error.message for error in errors)


@pytest.mark.parametrize(
    "record",
    [
        {"schema_version": "aep/v0.4", "run_id": "run-1", "created_at_ms": 1},
        {
            "schema_version": "aep/v0.3",
            "run_id": "run-1",
            "created_at_ms": 1,
            "actions": [{"action_id": "a1", "tool_name": "write_file"}],
        },
    ],
)
def test_authoritative_aep_schema_rejects_malformed_records(record: dict) -> None:
    assert list(_validator("schemas/aep/aep-record.schema.json").iter_errors(record))


def test_canonical_event_fixtures_validate_against_canonical_schema() -> None:
    validator = _validator("schemas/aep/canonical-event.schema.json")

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
    assert list(
        _validator("schemas/aep/canonical-event.schema.json").iter_errors(value)
    )


def test_canonical_event_adapter_produces_a_valid_aep_record() -> None:
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
    errors = list(_validator("schemas/aep/aep-record.schema.json").iter_errors(record))

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


def test_canonical_event_adapter_derives_run_id_for_minimal_event() -> None:
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

    assert not list(_validator("schemas/aep/aep-record.schema.json").iter_errors(record))
    assert record["run_id"] == "canonical-event:evt-minimal"


@pytest.mark.parametrize(
    ("event", "aep_field", "expected"),
    [
        (
            {
                "schema_version": "canonical-event/v0.1",
                "event_id": "decision-1",
                "event_type": "decision",
                "timestamp_ms": 1,
                "run_id": "run-1",
                "subject_id": "agent-1",
                "data": {
                    "capability": "filesystem.write",
                    "resource": "file:///tmp/out.txt",
                    "decision": "allow",
                    "reason_code": "policy-allow",
                },
            },
            "capability_decisions",
            [{
                "capability": "filesystem.write",
                "subject": "agent-1",
                "resource": "file:///tmp/out.txt",
                "decision": "allow",
                "reason_code": "policy-allow",
            }],
        ),
        (
            {
                "schema_version": "canonical-event/v0.1",
                "event_id": "observation-1",
                "event_type": "observation",
                "timestamp_ms": 1,
                "run_id": "run-1",
                "data": {
                    "verifier_id": "policy-check",
                    "passed": True,
                    "score": 0.98,
                    "claim_ids": ["claim-1"],
                },
            },
            "verifier_results",
            [{
                "verifier_id": "policy-check",
                "passed": True,
                "score": 0.98,
                "claim_ids": ["claim-1"],
            }],
        ),
        (
            {
                "schema_version": "canonical-event/v0.1",
                "event_id": "error-1",
                "event_type": "error",
                "timestamp_ms": 1,
                "run_id": "run-1",
                "data": {"verifier_id": "tool-result-check"},
            },
            "verifier_results",
            [{"verifier_id": "tool-result-check", "passed": False}],
        ),
        (
            {
                "schema_version": "canonical-event/v0.1",
                "event_id": "lifecycle-1",
                "event_type": "lifecycle",
                "timestamp_ms": 1,
                "run_id": "run-1",
                "parent_event_id": "lifecycle-0",
                "source": {"system": "open-agent-audit"},
            },
            "provenance",
            {
                "event_id": "lifecycle-1",
                "event_type": "lifecycle",
                "parent_event_id": "lifecycle-0",
                "source": {"system": "open-agent-audit"},
            },
        ),
    ],
)
def test_non_action_canonical_events_map_to_aep_fields(
    event: dict, aep_field: str, expected: object
) -> None:
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

    assert not list(_validator("schemas/aep/aep-record.schema.json").iter_errors(record))
    assert record[aep_field] == expected


def test_canonical_event_adapter_derives_run_id_for_empty_run_id() -> None:
    event = _load("tests/fixtures/valid/canonical-event/minimal.json")
    event["run_id"] = ""
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

    assert record["run_id"] == "canonical-event:evt-minimal"




@pytest.mark.parametrize(
    ("event", "aep_field", "expected"),
    [
        (
            {
                "schema_version": "canonical-event/v0.1",
                "event_id": "decision-1",
                "event_type": "decision",
                "timestamp_ms": 1,
                "run_id": "run-1",
                "subject_id": "agent-1",
                "data": {
                    "capability": "filesystem.write",
                    "resource": "file:///tmp/out.txt",
                    "decision": "allow",
                    "reason_code": "policy-allow",
                },
            },
            "capability_decisions",
            [{
                "capability": "filesystem.write",
                "subject": "agent-1",
                "resource": "file:///tmp/out.txt",
                "decision": "allow",
                "reason_code": "policy-allow",
            }],
        ),
        (
            {
                "schema_version": "canonical-event/v0.1",
                "event_id": "observation-1",
                "event_type": "observation",
                "timestamp_ms": 1,
                "run_id": "run-1",
                "data": {
                    "verifier_id": "policy-check",
                    "passed": True,
                    "score": 0.98,
                    "claim_ids": ["claim-1"],
                },
            },
            "verifier_results",
            [{
                "verifier_id": "policy-check",
                "passed": True,
                "score": 0.98,
                "claim_ids": ["claim-1"],
            }],
        ),
        (
            {
                "schema_version": "canonical-event/v0.1",
                "event_id": "error-1",
                "event_type": "error",
                "timestamp_ms": 1,
                "run_id": "run-1",
                "data": {"verifier_id": "tool-result-check"},
            },
            "verifier_results",
            [{"verifier_id": "tool-result-check", "passed": False}],
        ),
        (
            {
                "schema_version": "canonical-event/v0.1",
                "event_id": "lifecycle-1",
                "event_type": "lifecycle",
                "timestamp_ms": 1,
                "run_id": "run-1",
                "parent_event_id": "lifecycle-0",
                "source": {"system": "open-agent-audit"},
            },
            "provenance",
            {
                "event_id": "lifecycle-1",
                "event_type": "lifecycle",
                "parent_event_id": "lifecycle-0",
                "source": {"system": "open-agent-audit"},
            },
        ),
    ],
)
def test_non_action_canonical_events_map_to_aep_fields(
    event: dict, aep_field: str, expected: object
) -> None:
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

    assert not list(_validator("schemas/aep/aep-record.schema.json").iter_errors(record))
    assert record[aep_field] == expected
