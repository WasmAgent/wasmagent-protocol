"""Pytest entry for the conformance harness.

`tests/conformance.py` is a runnable script (`python3 tests/conformance.py`)
with a ``main()`` but no ``test_*`` functions, so ``pytest tests/`` collects
nothing from it directly. This module surfaces that harness as a single pytest
test so the bot/CI pytest gate actually exercises the schema + fixture
invariants — the same checks documented in CLAUDE.md.
"""
from __future__ import annotations

import sys
from pathlib import Path

# tests/ is not a package; make conformance.py importable whether pytest runs
# from the repo root or collects this file directly.
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import conformance  # noqa: E402


def test_conformance_harness() -> None:
    """Every registered schema is well-formed, $refs resolve, and fixtures
    pass/fail as expected. Mirrors ``python3 tests/conformance.py``'s exit code.
    """
    conformance.errors.clear()
    rc = conformance.main()
    assert rc == 0, (
        "conformance harness reported failures:\n"
        + "\n".join(f"  - {e}" for e in conformance.errors)
    )


def test_evidence_envelope_schema() -> None:
    """Verify evidence-envelope schema registration, canonical $id, and signature shape."""
    import wasmagent_protocol

    assert "evidence-envelope" in wasmagent_protocol.schema_ids()
    envelope = wasmagent_protocol.get_schema("evidence-envelope")
    assert envelope["$id"] == "https://wasmagent.dev/schemas/aep/evidence-envelope.schema.json"
    assert envelope["title"] == "EvidenceEnvelope"
    assert set(envelope["required"]) == {"schema_version", "created_at_ms"}

    # Signature field properties must match aep-record signature fields
    aep_record = wasmagent_protocol.get_schema("aep-record")
    env_sig = envelope["properties"]["signature"]
    aep_sig = aep_record["properties"]["signature"]

    assert set(env_sig["required"]) == set(aep_sig["required"])
    assert set(env_sig["properties"].keys()) == set(aep_sig["properties"].keys())
    assert env_sig["properties"]["bundle"] == aep_sig["properties"]["bundle"]

