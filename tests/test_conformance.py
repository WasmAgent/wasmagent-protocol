"""Pytest entry-point for the conformance harness.

conformance.py is a standalone script (exits 0/1).  This thin wrapper exposes
it as a pytest test so that ``pytest tests/ -x -q`` discovers and runs it
without duplicating the logic.
"""
from __future__ import annotations

from conformance import main


def test_conformance() -> None:
    assert main() == 0, "conformance harness reported errors"
