"""Tests for the cross-repo schema drift gate (wasmagent_protocol.drift + cli).

These build synthetic consumer checkouts under tmp_path and assert each failure
mode the gate must catch: drift, no-package-dep, and competing-registry.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from wasmagent_protocol import get_schema
from wasmagent_protocol import cli, drift

AEP_CANONICAL_ID = "https://wasmagent.dev/schemas/aep/aep-record.schema.json"
REPO_ROOT = Path(__file__).resolve().parents[1]


# --- normalization ---------------------------------------------------------

def test_normalize_schema_is_key_order_independent():
    a = drift.normalize_schema('{"b": 1, "a": 2}')
    b = drift.normalize_schema('{"a": 2, "b": 1}')
    assert a == b


def test_canonical_ids_includes_registered_schemas():
    ids = drift.canonical_ids()
    assert AEP_CANONICAL_ID in ids
    assert len(ids) >= 1


def test_schema_id_for_canonical_round_trip():
    assert drift.schema_id_for_canonical(AEP_CANONICAL_ID) == "aep-record"
    assert drift.schema_id_for_canonical("https://nope.invalid/x") is None


# --- check_file ------------------------------------------------------------

def _write(path: Path, obj: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj), encoding="utf-8")
    return path


def test_check_file_match(tmp_path):
    f = _write(tmp_path / "aep-record.schema.json", get_schema("aep-record"))
    finding = drift.check_file(f, "aep-record")
    assert finding.is_error is False
    assert finding.code == "match"


def test_check_file_drift(tmp_path):
    drifted = dict(get_schema("aep-record"))
    drifted["title"] = "DRIFTED-FORK"
    f = _write(tmp_path / "aep-record.schema.json", drifted)
    finding = drift.check_file(f, "aep-record")
    assert finding.is_error
    assert finding.code == "drift"


def test_check_file_unknown_id(tmp_path):
    f = _write(tmp_path / "aep-record.schema.json", get_schema("aep-record"))
    with pytest.raises(KeyError):
        drift.check_file(f, "no-such-id")


# --- scan ------------------------------------------------------------------

def _consumer_with_vendored(tmp_path, schema_obj, *, dep=False, name="consumer-repo"):
    """Build a minimal consumer checkout with one vendored aep-record schema."""
    if dep:
        _write(tmp_path / "package.json", {
            "name": name,
            "dependencies": {"@wasmagent/protocol": "0.1.6"},
        })
    else:
        _write(tmp_path / "package.json", {"name": name})
    return _write(tmp_path / "schemas" / "aep" / "aep-record.schema.json", schema_obj)


def test_scan_clean_consumer_with_dep(tmp_path):
    _consumer_with_vendored(tmp_path, get_schema("aep-record"), dep=True)
    findings = drift.scan(tmp_path)
    assert not drift.has_drift(findings)
    assert any(f.code == "match" for f in findings)


def test_scan_flags_drift(tmp_path):
    drifted = dict(get_schema("aep-record"))
    drifted["description"] = "a forked description"
    _consumer_with_vendored(tmp_path, drifted, dep=True)
    findings = drift.scan(tmp_path)
    codes = {f.code for f in findings if f.is_error}
    assert "drift" in codes


def test_scan_flags_redeclared_id_without_dep(tmp_path):
    # Content matches canonical, but the repo does not depend on the package.
    _consumer_with_vendored(tmp_path, get_schema("aep-record"), dep=False)
    findings = drift.scan(tmp_path)
    codes = {f.code for f in findings if f.is_error}
    assert "no-package-dep" in codes


def test_scan_flags_competing_registry(tmp_path):
    _consumer_with_vendored(tmp_path, get_schema("aep-record"), dep=True)
    _write(tmp_path / "schemas" / "index.json", {
        "schemas": [{"id": "aep-record", "canonical_id": AEP_CANONICAL_ID}],
    })
    findings = drift.scan(tmp_path)
    codes = {f.code for f in findings if f.is_error}
    assert "competing-registry" in codes


def test_scan_canonical_source_is_exempt(tmp_path):
    # The wasmagent-protocol repo may legitimately ship a canonical registry.
    _write(tmp_path / "package.json", {"name": "@wasmagent/protocol"})
    _write(tmp_path / "schemas" / "aep" / "aep-record.schema.json", get_schema("aep-record"))
    _write(tmp_path / "schemas" / "index.json", {
        "schemas": [{"id": "aep-record", "canonical_id": AEP_CANONICAL_ID}],
    })
    findings = drift.scan(tmp_path)
    assert not drift.has_drift(findings)


def test_scan_ignores_non_canonical_schemas(tmp_path):
    _write(tmp_path / "package.json", {"name": "consumer-repo"})
    # A repo-private schema with a non-canonical $id must be left alone.
    _write(tmp_path / "schemas" / "private.schema.json", {
        "$id": "https://example.invalid/private.schema.json",
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
    })
    findings = drift.scan(tmp_path)
    assert not drift.has_drift(findings)


def test_scan_still_scans_when_root_path_contains_ignored_dir_name(tmp_path):
    # Regression: the ignore list applies to path components *below* the scan
    # root only. A repo checked out under .../tests/myrepo must not be skipped.
    repo = tmp_path / "tests" / "my-consumer-repo"
    _consumer_with_vendored(repo, get_schema("aep-record"), dep=True)
    findings = drift.scan(repo)
    assert not drift.has_drift(findings)
    assert any(f.code == "match" for f in findings)


# --- cli -------------------------------------------------------------------

def test_cli_explicit_match_returns_zero(tmp_path, capsys):
    f = _write(tmp_path / "aep-record.schema.json", get_schema("aep-record"))
    assert cli.main(["check", str(f), "--id", "aep-record"]) == 0


def test_cli_explicit_drift_returns_nonzero(tmp_path, capsys):
    drifted = dict(get_schema("aep-record"))
    drifted["title"] = "DRIFTED"
    f = _write(tmp_path / "aep-record.schema.json", drifted)
    assert cli.main(["check", str(f), "--id", "aep-record"]) == 1


def test_cli_scan_clean_returns_zero(tmp_path, capsys):
    _consumer_with_vendored(tmp_path, get_schema("aep-record"), dep=True)
    assert cli.main(["check", "--scan", "--root", str(tmp_path)]) == 0


def test_cli_scan_drift_returns_nonzero(tmp_path, capsys):
    drifted = dict(get_schema("aep-record"))
    drifted["title"] = "DRIFTED"
    _consumer_with_vendored(tmp_path, drifted, dep=True)
    assert cli.main(["check", "--scan", "--root", str(tmp_path)]) == 1


def test_cli_requires_id_for_explicit_path(tmp_path):
    f = _write(tmp_path / "aep-record.schema.json", get_schema("aep-record"))
    assert cli.main(["check", str(f)]) == 2


# --- published CLI (process-level) ----------------------------------------
# The issue quotes `wasmagent-protocol check <path> --id <schema-id>` as the
# published check tooling. Exercise it as a real subprocess via the installed
# console entry (`python -m wasmagent_protocol`), not just in-process, so the
# exact published invocation form is covered for the PyPI package. The running
# interpreter always has the package importable (these tests import it), so
# `sys.executable -m wasmagent_protocol` is the faithful console-script path.
def _run_cli(args):
    return subprocess.run(
        [sys.executable, "-m", "wasmagent_protocol", *args],
        capture_output=True,
        text=True,
    )


def test_cli_process_explicit_match(tmp_path):
    f = _write(tmp_path / "aep-record.schema.json", get_schema("aep-record"))
    res = _run_cli(["check", str(f), "--id", "aep-record"])
    assert res.returncode == 0, res.stderr


def test_cli_process_explicit_drift(tmp_path):
    drifted = dict(get_schema("aep-record"))
    drifted["title"] = "DRIFTED"
    f = _write(tmp_path / "aep-record.schema.json", drifted)
    res = _run_cli(["check", str(f), "--id", "aep-record"])
    assert res.returncode == 1


def test_cli_process_scan_clean(tmp_path):
    _consumer_with_vendored(tmp_path, get_schema("aep-record"), dep=True)
    res = _run_cli(["check", "--scan", "--root", str(tmp_path)])
    assert res.returncode == 0, res.stderr


def test_cli_process_scan_drift(tmp_path):
    drifted = dict(get_schema("aep-record"))
    drifted["title"] = "DRIFTED"
    _consumer_with_vendored(tmp_path, drifted, dep=True)
    res = _run_cli(["check", "--scan", "--root", str(tmp_path)])
    assert res.returncode == 1


# --- adopt the drift gate --------------------------------------------------
# Consumers "adopt the drift gate" by calling the reusable workflow. Guard that
# the shipped workflow is actually a workflow_call gate (so consumers can
# `uses:` it), that it runs the drift scan, and that the docs show the one-line
# adoption snippet — so adoption stays possible and documented.
def test_reusable_drift_workflow_is_adoptable():
    wf = REPO_ROOT / ".github" / "workflows" / "schema-drift.yml"
    assert wf.is_file(), "reusable schema-drift workflow must ship from this repo"
    text = wf.read_text(encoding="utf-8")
    assert "workflow_call:" in text, "workflow must be callable via workflow_call"
    assert "check --scan" in text, "workflow must run the drift scan"
    for doc_name in ("README.md", "docs/CONTRACT-CHANGE-PROCESS.md"):
        doc = (REPO_ROOT / doc_name).read_text(encoding="utf-8")
        assert "schema-drift.yml@" in doc, f"{doc_name} must show the uses: adoption snippet"
