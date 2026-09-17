"""Tests for the installable AEP conformance kit (wasmagent_protocol.conformance).

These run against the source checkout's corpus; tests/clean-install/ covers the
installed-wheel layout. The kit's self-check must agree with the manifest and
with scripts/run-aep-conformance-corpus.py, which imports the same reference
rules from this module.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from wasmagent_protocol import get_aep_conformance_dir, get_aep_conformance_manifest
from wasmagent_protocol.conformance import check_semantic, run_self_check

REPO_ROOT = Path(__file__).resolve().parents[1]


# --- corpus discovery -------------------------------------------------------

def test_get_aep_conformance_dir_locates_corpus():
    corpus = get_aep_conformance_dir()
    assert (corpus / "manifest.json").is_file()
    assert (corpus / "certified-target.json").is_file()


def test_get_aep_conformance_manifest_is_verdict_authority():
    manifest = get_aep_conformance_manifest()
    assert manifest["schema_version"] == 2
    assert len(manifest["conformance_target"]) == 30
    assert manifest["signing_profile_id"] == "aep-dsse-ed25519-decoded-body-v1"


# --- semantic reference checker (shared with the protocol-side runner) ------

def test_check_semantic_accepts_floor_weakest_of_observed():
    ok, reason = check_semantic(
        {
            "run_attribution_backing_floor": "unknown",
            "run_attribution_backing_observed": ["unknown", "operator_asserted"],
        }
    )
    assert ok, reason


def test_check_semantic_rejects_floor_stronger_than_observed():
    ok, reason = check_semantic(
        {
            "run_attribution_backing_floor": "qualified_signature",
            "run_attribution_backing_observed": ["unknown"],
        }
    )
    assert not ok
    assert reason


def test_check_semantic_rejects_half_pair():
    ok, reason = check_semantic({"run_attribution_backing_floor": "unknown"})
    assert not ok

    ok, reason = check_semantic({"run_attribution_backing_observed": ["unknown"]})
    assert not ok


def test_check_semantic_rejects_unknown_grade_and_negative_count():
    assert not check_semantic(
        {
            "run_attribution_backing_floor": "telepathy",
            "run_attribution_backing_observed": ["telepathy"],
        }
    )[0]
    assert not check_semantic({"authorization_evidence_count": -1})[0]


# --- self-check -------------------------------------------------------------

def test_self_check_passes_on_source_corpus():
    ok, report = run_self_check()
    assert ok, "\n".join(report)
    joined = "\n".join(report)
    assert "30/30" in joined
    assert "NOT independent semantic verification" in joined


def test_self_check_fails_on_missing_fixture(tmp_path):
    import shutil

    corpus = tmp_path / "aep"
    shutil.copytree(REPO_ROOT / "conformance" / "aep", corpus)
    (corpus / "valid" / "minimal-v05.json").unlink()
    ok, report = run_self_check(corpus)
    assert not ok
    assert any("minimal-v05.json" in line for line in report)


def test_self_check_fails_on_tampered_manifest(tmp_path):
    import shutil

    corpus = tmp_path / "aep"
    shutil.copytree(REPO_ROOT / "conformance" / "aep", corpus)
    manifest = json.loads((corpus / "manifest.json").read_text(encoding="utf-8"))
    manifest["conformance_target"][0]["semantic"] = "bogus-label"
    (corpus / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    ok, report = run_self_check(corpus)
    assert not ok


# --- CLI --------------------------------------------------------------------

def test_cli_aep_conformance_path(capsys):
    from wasmagent_protocol.cli import main

    assert main(["aep-conformance", "path"]) == 0
    assert capsys.readouterr().out.strip() == str(get_aep_conformance_dir())


def test_cli_aep_conformance_self_check_exit_zero(capsys):
    from wasmagent_protocol.cli import main

    assert main(["aep-conformance", "self-check"]) == 0
    assert "self-check" in capsys.readouterr().out


@pytest.mark.parametrize(
    "argv",
    [["aep-conformance"], ["aep-conformance", "bogus-action"]],
)
def test_cli_aep_conformance_rejects_bad_action(argv):
    from wasmagent_protocol.cli import main

    with pytest.raises(SystemExit) as exc:
        main(argv)
    assert exc.value.code != 0
