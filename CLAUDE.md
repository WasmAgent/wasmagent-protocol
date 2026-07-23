# wasmagent-protocol — CLAUDE.md

Canonical source of truth for cross-repository contracts in the
[WasmAgent](https://github.com/WasmAgent) org: the Agent Evidence Protocol (AEP)
and the compliance schema family. **Specifications only** — no runtime, no
business logic, no product code.

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
- **Never add runtime/validation logic.** This repo defines contracts; engines
  that evaluate them live in `symkernel` (verification) or the consuming runtime.
- **Protocol is sedimented, not designed up front.** Schemas are extracted from
  shipping products; shape changes are recorded as RFCs in `.github/docs/RFC/`
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
