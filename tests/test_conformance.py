"""Pytest wrapper around the conformance harness.

The canonical conformance logic lives in conformance.py (runnable as a
standalone script).  This thin adapter re-exports its exit-code check
as a pytest-collectable test so that ``pytest tests/ -x -q`` discovers
and runs it.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def test_conformance() -> None:
    """Run tests/conformance.py and fail if it returns non-zero."""
    script = Path(__file__).resolve().parent / "conformance.py"
    result = subprocess.run(
        [sys.executable, str(script)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stdout, file=sys.stdout)
        print(result.stderr, file=sys.stderr)
    assert result.returncode == 0, (
        f"conformance.py exited {result.returncode}"
    )
