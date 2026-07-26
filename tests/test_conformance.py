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
