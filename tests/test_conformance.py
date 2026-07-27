"""pytest entry point for wasmagent-protocol.

Wraps the canonical conformance harness (``tests/conformance.py``) so the
schema/fixture invariants run under ``pytest tests/``, and asserts the
``@wasmagent/protocol`` package-structure + version-band invariants (issue #96).
Run with: ``pytest tests/ -x -q``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))

import conformance  # noqa: E402  (tests/conformance.py — canonical harness)


def test_conformance_harness_passes() -> None:
    """Every schema is well-formed, $refs resolve, fixtures pass/fail as expected."""
    conformance.errors.clear()
    rc = conformance.main()
    assert rc == 0, "conformance.py reported failures:\n" + "\n".join(conformance.errors)


def test_package_json_declares_version_band_mechanism() -> None:
    """package.json must initialize @wasmagent/protocol with a version band."""
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert pkg["name"] == "@wasmagent/protocol"
    assert isinstance(pkg["version"], str) and pkg["version"].count(".") >= 2

    # Runtime band: engines.node declares the supported Node line.
    assert pkg.get("engines", {}).get("node"), "engines.node runtime band must be declared"

    # Version band: tracks the current minor line and recommends an in-band range.
    major, minor, *_ = pkg["version"].split(".")
    band = pkg["versionBand"]
    assert band["band"] == f"{major}.{minor}", "declared band tracks the version line"
    assert band["summary"], "versionBand has a summary"
    assert band["policy"], "versionBand has a policy"
    recommended = band["supportedRanges"]["recommended"]
    assert recommended.startswith("~"), "recommended range pins a single band"
    assert recommended.split("~")[1].split(".")[0] == major, "recommended range matches the band major"
    also = band["supportedRanges"]["alsoAccepted"]
    assert isinstance(also, list) and len(also) >= 1, "at least one additional accepted range"


def test_pyproject_declares_python_package_structure() -> None:
    """The Python distribution (wasmagent-protocol) mirrors the package metadata
    and declares its own runtime band via requires-python."""
    text = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    assert 'name = "wasmagent-protocol"' in text, "Python dist name is declared"
    assert "version" in text, "Python dist declares a version"
    assert "requires-python" in text, "Python dist declares a runtime band"
    assert "Apache-2.0" in text, "Python dist carries the license"
