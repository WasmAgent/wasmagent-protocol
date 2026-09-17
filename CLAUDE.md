# wasmagent-protocol — CLAUDE.md

Canonical source of truth for cross-repository contracts in the
[WasmAgent](https://github.com/WasmAgent) org: the schema families listed in
`schemas/index.json` (AEP, compliance, AgentBOM, MCP Posture, Trust Passport),
plus the conformance, publication, provenance, and assurance-verification
tooling that keeps those contracts machine-checkable. No production runtime,
no gateway enforcement engine, no product business logic.

| | |
|---|---|
| **Status** | Alpha |
| **Contract stability** | Evolving (additive minor; breaking = major + new schema `version`) |
| **Recommended for** | Cross-repo schema definitions consumed by ≥2 repositories |
| **Not recommended for** | Repo-private schemas; runtime code; validation engines |

## Repository Boundaries

### This repository owns
- Canonical JSON Schemas for AEP (`aep-record`) and the compliance family
  (`constraint-ir`, `constraint-violation`, `repair-trace`, `task-spec`,
  `compliance-eval-record`, `rollout-wire`)
- The machine-readable registry (`schemas/index.json`) and each schema's
  `version` + canonical `$id` (`https://wasmagent.dev/schemas/...`)
- Publishing the schemas as `@wasmagent/protocol` (npm) and `wasmagent-protocol` (PyPI)
- The contract-change process and conformance fixtures (`tests/`)

### Other repositories own — do not implement here

| Capability | Owner |
|---|---|
| AEP evidence **emission** at runtime | `wasmagent-js` (`@wasmagent/aep`) |
| Runtime, MCP firewall/gateway, agent orchestration | `wasmagent-js` |
| Symbolic **verification** engine (CEL / wazero / Z3) | `symkernel` |
| Gateway-level HTTP evidence (Proxy-Wasm) | `wasmagent-proxy` |
| Training-data pipeline + repo-private `*-training-record` schemas | `trace-pipeline` |
| AgentBOM / MCP Posture / Trust Passport specs | `agent-trust-infra` / `open-agent-audit` |

### Rules
- **A schema belongs here only when ≥2 repositories must agree on it.** A schema
  a single repo consumes stays in that repo (e.g. trace-pipeline's
  `*-training-record`).
- **Do not add production runtime or policy-enforcement logic.** Engines that
  evaluate the contracts live in `symkernel` (verification) or the consuming
  runtime. Protocol/conformance validation, assurance-contract verification,
  publication verification, provenance verification, schema compatibility
  checks, and related contract-governance tooling belong here when they protect
  canonical cross-repository contracts (e.g. `verify-certified-target.mjs`,
  `verify-gate-provenance.mjs`, `verify-publication-record.mjs`,
  `verify-external-evidence.mjs`, `verifier-result-contract.mjs`).
- **Protocol is sedimented, not designed up front.** Schemas are extracted from
  shipping products; shape changes are recorded as RFCs in the org-level
  registry `WasmAgent/.github` (`https://github.com/WasmAgent/.github/tree/main/docs/RFC`)
  first (see `docs/CONTRACT-CHANGE-PROCESS.md`).
- **Consumers depend on the published package**, never copy schema JSON.

## Tech stack & commands
- JSON Schema 2020-12; thin JS (`index.js`) + Python (`src/wasmagent_protocol`)
  loaders. Apache-2.0.
- Conformance: `python3 tests/conformance.py` (schemas well-formed, `$ref`
  resolve, valid/invalid fixtures per schema) and `node --test` (JS loader).
- Release: OIDC trusted publishing on `v*` tags → npm + PyPI, no tokens.

## Governance
See `docs/GOVERNANCE.md` (maintainer, versioning, exit condition) and the org
[repository boundary policy](https://github.com/WasmAgent/.github/blob/main/docs/repository-boundaries.md).


## Schema Addition Checklist (MANDATORY — CI will fail without all steps)

The conformance test (`tests/conformance.py`) enforces four invariants.
Every new schema MUST satisfy all four or `merge gate: test failed` will block the PR.

### Steps for every new `schemas/aep/<name>.schema.json`:

**1.** Create the schema file with `$id`: `"https://wasmagent.dev/schemas/aep/<name>.schema.json"`
**2.** Register in `schemas/index.json` with id, path, canonical_id, version, stability, owners, summary
**3.** Create VALID fixture: `tests/fixtures/valid/<name>/example.json` (must pass schema validation)
**4.** Create INVALID fixture: `tests/fixtures/invalid/<name>/example.json` (must fail validation)

Verify: `python3 tests/conformance.py && node --test` — both must exit 0.

Common failures: missing `$id`, not in index.json, fixture directory name != index id, wrong fixture validity.
