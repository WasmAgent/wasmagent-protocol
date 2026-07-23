"""Pytest bridge for the conformance harness.

The canonical conformance checks live in ``conformance.py`` and are invoked
directly (``python3 tests/conformance.py``, per ``CLAUDE.md`` and CI). This
module re-exposes them under ``pytest tests/`` so the package's standard test
command runs the full schema conformance suite instead of exiting with "no
tests ran" (pytest exit code 5).
"""
import subprocess
import sys
from pathlib import Path


def test_conformance_harness_passes():
    harness = Path(__file__).parent / "conformance.py"
    result = subprocess.run(
        [sys.executable, str(harness)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"conformance.py exited {result.returncode}\n"
        f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
