"""Pytest entry point for the conformance harness.

`tests/conformance.py` is a standalone script (run via `python3 tests/conformance.py`
in CLAUDE.md / CI). This thin wrapper re-exposes it under pytest so `pytest tests/`
collects and runs the same invariants — every schema well-formed, refs resolve,
index entries match on-disk `$id`s, and each registered schema has VALID fixtures
that pass plus INVALID fixtures that fail. It owns no logic of its own.
"""
from __future__ import annotations

import sys
from pathlib import Path

# tests/ is not a package; put it on sys.path so `import conformance` works
# regardless of pytest's invocation cwd.
TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

import conformance  # noqa: E402


def test_conformance_harness_passes() -> None:
    assert conformance.main() == 0
