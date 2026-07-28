"""AEP record type + sample-instantiation tests (wasmagent-protocol #138).

Covers the acceptance criterion that a sample AEP record can be instantiated
using the exported protocol types and that it validates against the canonical
``aep-record`` JSON Schema.
"""

from __future__ import annotations

import pytest

from wasmagent_protocol import AepRecord, get_schema

# Full schema validation needs jsonschema (the [dev] extra). Skip the module if
# it is unavailable rather than failing collection.
jsonschema = pytest.importorskip("jsonschema")
from jsonschema import Draft202012Validator  # noqa: E402


def _sample_aep_record() -> AepRecord:
    """A minimal-but-realistic AEP record constructed via the protocol type."""
    return {
        "schema_version": "aep/v0.3",
        "run_id": "run-abc123",
        "trace_id": "trace-001",
        "runtime_version": "wasmagent-js@1.20.0",
        "created_at_ms": 1737600000000,
        "capability_decisions": [
            {
                "capability": "fs.write",
                "subject": "agent-1",
                "resource": "/tmp/out.txt",
                "decision": "allow",
            }
        ],
        "actions": [
            {
                "action_id": "a1",
                "tool_name": "write_file",
                "state_changing": True,
                "timestamp_ms": 1737600000100,
            }
        ],
    }


def test_aep_record_type_is_exported():
    import wasmagent_protocol as w

    assert hasattr(w, "AepRecord")
    assert "AepRecord" in w.__all__
    # The three schema-required keys are modelled on the type.
    for key in ("schema_version", "run_id", "created_at_ms"):
        assert key in AepRecord.__annotations__


def test_sample_aep_record_is_instantiable_via_protocol_type():
    record: AepRecord = _sample_aep_record()
    assert record["run_id"] == "run-abc123"
    assert record["schema_version"] == "aep/v0.3"


def test_sample_aep_record_validates_against_schema():
    record = _sample_aep_record()
    validator = Draft202012Validator(get_schema("aep-record"))
    errors = sorted(validator.iter_errors(record), key=lambda e: list(e.path))
    assert not errors, "sample AepRecord should validate against the schema: " + "; ".join(
        e.message for e in errors
    )


def test_canonical_event_schema_registered_and_validates():
    # Sanity check for the canonical-event schema added by the same change.
    schema = get_schema("canonical-event")
    assert schema["$id"] == "https://wasmagent.dev/schemas/v0.1/canonical-event.schema.json"
    event = {
        "schema_version": "open-agent-audit/v0.1",
        "run_id": "run-abc123",
        "agent_id": "agent-1",
        "model_id": "claude-opus-4-8",
        "event_id": "evt-0001",
        "timestamp": "2026-07-28T14:03:22Z",
        "type": "tool_call",
        "actor": "agent",
        "tool": {"name": "write_file"},
    }
    validator = Draft202012Validator(schema)
    assert not list(validator.iter_errors(event))
