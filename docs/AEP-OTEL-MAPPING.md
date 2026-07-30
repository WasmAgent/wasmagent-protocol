# AEP ↔ OpenTelemetry GenAI Mapping

> **Positioning.** The Agent Evidence Protocol (AEP) is **not** a competing
> telemetry protocol. It is an **evidence-integrity layer that sits on top of
> OpenTelemetry GenAI**. If your agents already emit OTel GenAI spans, this
> document shows — field by field — what AEP reuses from OTel and what it adds
> that OTel does not model: signing, tamper-evidence, capability decisions,
> budget ledgers, and side-effect provenance.
>
> Read this as: *keep your OTel pipeline; AEP is the signed, auditable record
> that references the same run.*

The canonical AEP schema is [`schemas/aep/aep-record.schema.json`](../schemas/aep/aep-record.schema.json)
(envelope fields in [`schemas/aep/evidence-envelope.schema.json`](../schemas/aep/evidence-envelope.schema.json)).
OTel attribute names follow the [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/).

---

## 1. Fields AEP shares with OTel GenAI

These AEP fields have a direct or near-direct OTel GenAI / trace-context
equivalent. A team already on OTel can populate them from existing spans.

| AEP field | OTel GenAI / trace attribute | Notes |
|---|---|---|
| `trace_id` | trace context `trace_id` | Same correlation identity; AEP records reference the OTel trace. |
| `parent_trace_id` | parent span/trace `trace_id` | Links delegated / sub-agent runs. |
| `run_id` | (custom) `gen_ai.agent.run.id` / span attribute | AEP's run identity; carry as a span attribute if not already present. |
| `model_provider` | `gen_ai.system` (a.k.a. `gen_ai.provider.name`) | e.g. `anthropic`, `openai`. |
| `model_id` | `gen_ai.request.model` / `gen_ai.response.model` | Model identifier. |
| `actions[].tool_name` | `gen_ai.tool.name` | One AEP action ≈ one tool-execution span. |
| `actions[].action_id` | span `span_id` of the tool call | AEP action ↔ OTel span. |
| `actions[].timestamp_ms` | span start time | AEP uses epoch ms. |
| `budget_ledger.token_budget.spent` | `gen_ai.usage.input_tokens` + `gen_ai.usage.output_tokens` | AEP aggregates per-run; OTel reports per-call usage. |
| `budget_ledger.latency_budget.actual_ms` | span duration (sum) | Per-run aggregate latency. |
| `run_context.agent_id` | `gen_ai.agent.id` | Agent identity. |
| `run_context.agent_version` | `gen_ai.agent.version` (or resource attr) | — |
| `created_at_ms` | span/record timestamp | UTC epoch ms. |

---

## 2. Fields AEP adds — no OTel GenAI equivalent

This is the **delta**: what makes an AEP record *provable* rather than merely
*observable*. OTel GenAI has no semantic convention for any of the following, by
design — telemetry answers "what happened", AEP answers "prove it, and prove it
wasn't tampered with".

### 2.1 Integrity / tamper-evidence (the core of "provable")

| AEP field | Why OTel has no equivalent |
|---|---|
| `signature.alg` / `signature.key_id` / `signature.sig` | OTel spans are unsigned telemetry; AEP records are cryptographically signed so an auditor can detect tampering. |
| `signature.bundle` / `signature.transparency_log_ref` | Sigstore bundle + transparency-log reference — verifiable provenance, outside OTel's scope. |
| `repo_commit`, `runtime_version`, `environment_digest`, `dependency_lock_digest` | Reproducibility/provenance digests binding the run to exact code + environment. |
| `policy_bundle_digest`, `tool_manifest_digest`, `mcp_server_card_digest`, `tool_descriptor_digest`, `server_card_digest` | Digests of the policy/tooling the run was bound to — proves *which* rules were in force. |

### 2.2 Capability decisions & admission

| AEP field | Why OTel has no equivalent |
|---|---|
| `capability_decisions[]` (`capability`, `subject`, `resource`, `decision`, `reason_code`) | Allow/deny/ask_user/dry_run admission decisions per capability — a governance record, not telemetry. |
| `actions[].scope_lease_id`, `actions[].approval_context_hash` | Lease + human-approval binding for a state-changing action. |

### 2.3 Side-effect provenance & taint

| AEP field | Why OTel has no equivalent |
|---|---|
| `side_effect_class`, `run_side_effect_class_max` | `read` / `mutate-local` / `mutate-external` / `network-egress` classification — an auditable blast-radius record. |
| `actions[].state_changing`, `pre_state_digest`, `post_state_digest` | Before/after state digests proving what a mutation changed. |
| `input_refs[].taint_labels`, `actions[].input_taint_labels` / `output_taint_labels` | Data-flow taint tracking. |
| `actions[].memory_read_refs` / `memory_write_refs` | Tamper-evident memory access record. |

### 2.4 Verification & drift

| AEP field | Why OTel has no equivalent |
|---|---|
| `verifier_results[]` (`verifier_id`, `passed`, `score`, `claim_ids`) | Outcome of formal/heuristic verifiers over the run — the "was it correct" evidence. |
| `argument_drift` (`declared_digest`, `actual_digest`, `drifted_args`) | Detected drift between declared and runtime tool arguments. |
| `recording_mode` (`full` / `delta` / `validation`) | How the evidence itself was captured. |

### 2.5 Budgets beyond token usage

| AEP field | Why OTel has no equivalent |
|---|---|
| `budget_ledger.risk_budget`, `retry_budget`, `human_approval_budget`, `tool_budget` | Governance budgets; OTel usage metrics only cover tokens/latency. |

---

## 3. How to adopt

1. Keep emitting OTel GenAI spans as you do today.
2. At run boundaries, produce an AEP record: copy the §1 fields from your spans,
   populate the §2 fields from your runtime's policy / admission / verification
   layers, and **sign** the record (`signature`).
3. The signed AEP record — not the OTel span — is what an auditor verifies.
   OTel remains your live observability surface; AEP is the durable, provable
   evidence trail that references it.

> The `signature` block is **optional** in `aep/v0.3` and stays optional —
> tightening it to required is a breaking change (see
> [`docs/CONTRACT-CHANGE-PROCESS.md`](CONTRACT-CHANGE-PROCESS.md)).
