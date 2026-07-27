"""TypedDict definitions for the canonical AEP record schema.

These types mirror ``schemas/aep/aep-record.schema.json`` and provide static
type-checking for consumers. Use :func:`get_schema` for runtime JSON Schema
validation; use these TypedDicts for IDE/mypy support.

.. code-block:: python

    from wasmagent_protocol.types import AEPRecord

    record: AEPRecord = {
        "schema_version": "aep/v0.3",
        "run_id": "run-abc",
        "created_at_ms": 1737600000000,
    }
"""

from __future__ import annotations

from typing import Literal, NotRequired, TypedDict


# ---------------------------------------------------------------------------
# Sub-structure types
# ---------------------------------------------------------------------------


class AEPInputRef(TypedDict):
    uri: str
    digest: NotRequired[str]
    taint_labels: NotRequired[list[str]]


class AEPOutputRef(TypedDict):
    uri: str
    digest: NotRequired[str]
    redaction_profile: NotRequired[str]


class AEPCapabilityDecision(TypedDict):
    capability: str
    subject: str
    resource: str
    decision: Literal["allow", "deny", "ask_user", "dry_run"]
    reason_code: NotRequired[str]


class AEPAction(TypedDict):
    action_id: str
    tool_name: str
    state_changing: bool
    timestamp_ms: int | float
    precondition_digest: NotRequired[str]
    result_digest: NotRequired[str]
    evidence_refs: NotRequired[list[str]]
    parent_action_id: NotRequired[str]
    causal_chain_id: NotRequired[str]
    tool_descriptor_digest: NotRequired[str]
    server_card_digest: NotRequired[str]
    scope_lease_id: NotRequired[str]
    approval_context_hash: NotRequired[str]
    input_taint_labels: NotRequired[list[str]]
    output_taint_labels: NotRequired[list[str]]
    memory_read_refs: NotRequired[list[str]]
    memory_write_refs: NotRequired[list[str]]
    pre_state_digest: NotRequired[str]
    post_state_digest: NotRequired[str]


class AEPVerifierResult(TypedDict):
    verifier_id: str
    passed: bool
    score: NotRequired[int | float]
    claim_ids: NotRequired[list[str]]


class AEPBudgetEntry(TypedDict):
    limit: NotRequired[int | float]
    spent: int | float


class AEPBudgetLedger(TypedDict):
    token_budget: NotRequired[AEPBudgetEntry]
    latency_budget: NotRequired[TypedDict("LatencyBudget", {"limit_ms": NotRequired[int | float], "actual_ms": int | float})]
    tool_budget: NotRequired[AEPBudgetEntry]
    risk_budget: NotRequired[AEPBudgetEntry]
    retry_budget: NotRequired[AEPBudgetEntry]
    human_approval_budget: NotRequired[AEPBudgetEntry]


class AEPRunContext(TypedDict):
    agent_id: NotRequired[str]
    agent_version: NotRequired[str]
    subagent_id: NotRequired[str]
    delegation_chain: NotRequired[list[str]]
    environment_digest: NotRequired[str]
    dependency_lock_digest: NotRequired[str]


SideEffectClass = Literal[
    "read", "mutate-local", "mutate-external", "network-egress", "unknown"
]

RecordingMode = Literal["full", "delta", "validation"]


class AEPArgumentDrift(TypedDict, total=False):
    """Detected drift between declared and actual runtime arguments.

    The JSON Schema allows ``additionalProperties``, so any extra keys are
    accepted at runtime.
    """
    tool_name: str
    declared_digest: str
    actual_digest: str
    diff_summary: str
    drifted_args: list[str]


class AEPSignature(TypedDict):
    alg: str
    key_id: str
    sig: str
    bundle: NotRequired[dict]
    transparency_log_ref: NotRequired[str]


# ---------------------------------------------------------------------------
# Top-level record
# ---------------------------------------------------------------------------

AEPRecordSchemaVersion = Literal["aep/v0.1", "aep/v0.2", "aep/v0.3"]


class AEPRecord(TypedDict):
    """Agent Evidence Protocol record.

    Mirrors ``schemas/aep/aep-record.schema.json``. Use
    :func:`~wasmagent_protocol.get_schema` for runtime JSON Schema validation;
    use this TypedDict for static type-checking.
    """
    schema_version: AEPRecordSchemaVersion
    run_id: str
    created_at_ms: int | float
    trace_id: NotRequired[str]
    parent_trace_id: NotRequired[str | None]
    repo_commit: NotRequired[str]
    runtime_version: NotRequired[str]
    model_provider: NotRequired[str]
    model_id: NotRequired[str]
    policy_bundle_digest: NotRequired[str]
    tool_manifest_digest: NotRequired[str]
    mcp_server_card_digest: NotRequired[str | None]
    input_refs: NotRequired[list[AEPInputRef]]
    output_refs: NotRequired[list[AEPOutputRef]]
    capability_decisions: NotRequired[list[AEPCapabilityDecision]]
    actions: NotRequired[list[AEPAction]]
    verifier_results: NotRequired[list[AEPVerifierResult]]
    budget_ledger: NotRequired[AEPBudgetLedger]
    run_context: NotRequired[AEPRunContext]
    user_id: NotRequired[str]
    subject_id: NotRequired[str]
    side_effect_class: NotRequired[SideEffectClass]
    run_side_effect_class_max: NotRequired[SideEffectClass]
    recording_mode: NotRequired[RecordingMode]
    argument_drift: NotRequired[AEPArgumentDrift]
    signature: NotRequired[AEPSignature]


__all__ = [
    "AEPRecord",
    "AEPRecordSchemaVersion",
    "AEPInputRef",
    "AEPOutputRef",
    "AEPCapabilityDecision",
    "AEPAction",
    "AEPVerifierResult",
    "AEPBudgetEntry",
    "AEPBudgetLedger",
    "AEPRunContext",
    "SideEffectClass",
    "RecordingMode",
    "AEPArgumentDrift",
    "AEPSignature",
]
