# Pytest wrapper around the conformance harness.
# The conformance script is a standalone CLI; this module lets
# `pytest tests/` discover and run it as a test.

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFORMANCE = ROOT / "tests" / "conformance.py"
CONSUMERS_JSON = ROOT / "consumers.json"


def test_conformance_script_passes():
    """Run the conformance harness; it must exit 0."""
    result = subprocess.run(
        [sys.executable, str(CONFORMANCE)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"conformance.py failed (exit {result.returncode}):\n"
        f"stdout: {result.stdout}\n"
        f"stderr: {result.stderr}"
    )


def test_consumers_json_exists_and_is_valid():
    """consumers.json must exist and be valid JSON with required fields."""
    assert CONSUMERS_JSON.is_file(), "consumers.json does not exist"
    doc = json.loads(CONSUMERS_JSON.read_text(encoding="utf-8"))

    # Top-level shape
    assert "consumers" in doc, "missing 'consumers' key"
    assert "supportedBand" in doc, "missing 'supportedBand' key"

    # supportedBand must have min and max
    band = doc["supportedBand"]
    assert "min" in band, "supportedBand missing 'min'"
    assert "max" in band, "supportedBand missing 'max'"

    # At least one consumer entry
    assert isinstance(doc["consumers"], list), "'consumers' must be a list"
    assert len(doc["consumers"]) >= 1, "consumers list must have >= 1 entry"

    # Each consumer must have 'repo' and 'packageJsonPath'
    for entry in doc["consumers"]:
        assert "repo" in entry, f"consumer entry missing 'repo': {entry}"
        assert "packageJsonPath" in entry, (
            f"consumer entry missing 'packageJsonPath': {entry}"
        )
