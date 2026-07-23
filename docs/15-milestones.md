# wasmagent-protocol — Milestones

Living roadmap for the canonical protocol repository. The bot converts unchecked
bullets into issues. Each bullet is scoped to concrete files.

## Milestone 1 — Extraction & single source of truth

- [x] Extract AEP + compliance schemas from `wasmagent-js` and `trace-pipeline`
      into `schemas/`, reconciling the drift (canonical `$id`, JSON Schema
      2020-12, fixed `title` bug).
- [x] Publish loaders: `@wasmagent/protocol` (npm) and `wasmagent-protocol`
      (PyPI); machine-readable registry at `schemas/index.json`.
- [x] Conformance harness: every schema well-formed, refs resolve, valid/invalid
      fixtures per schema (`tests/conformance.py`).
- [x] Publish `@wasmagent/protocol@0.1.0` to npm and `wasmagent-protocol==0.1.0`
      to PyPI; record both in the org release ledger.
- [x] Strip local schema copies from `wasmagent-js` (`packages/compliance/schemas/`,
      `packages/core/src/ranking/schemas/rollout-wire.schema.json`) and depend on
      the npm package.
- [ ] Strip local schema copies from `trace-pipeline` (`schemas/*.schema.json`)
      and depend on the pip package; rename `repair-trace-entry` usage to
      `repair-trace`.

## Milestone 2 — AEP as the authoritative evidence contract

- [ ] Migrate `wasmagent-proxy` Rust `aep-core` types to generate from / validate
      against `schemas/aep/aep-record.schema.json`.
- [x] Point `wasmagent-train-replay` `EpochEvidenceBundle` at the shared AEP
      record schema for its evidence envelope.
- [ ] Map `open-agent-audit` `schemas/v0.1/*` adapter onto the canonical AEP
      record; document the version-skew adapter.
- [ ] Add a cross-repo compatibility CI check: fail if any consumer pins an
      out-of-range protocol version.

## Milestone 3 — Stability & conformance

- [ ] Promote `aep-record` from `evolving` to `stable` with a documented
      versioning guarantee (precondition for the planned `wasmagent-py` runtime).
- [ ] Provide a generated TypeScript type surface (`.d.ts` from schema) and
      Python `TypedDict`s so consumers get types, not just validation.
- [ ] Add a conformance test suite consumers can run against their own emitters
      (`aep-conformance` fixtures published in the package).

## Milestone 4 — Evidence types beyond execution

AEP today covers **execution** evidence (`aep-record`: actions, capability
decisions, verifier results). As the runtime matures, other agent facets become
things you must be able to *prove*, not just run. Each enters the protocol as a
new **evidence record** under AEP — sharing the signature/trust envelope — rather
than as a rename. **AEP (Agent Evidence Protocol) stays the name**; "Evidence" is
the moat, and these are all evidence of something. (See the boundary note: the
protocol is *sedimented from shipping products*, so each lands only once the
runtime feature it describes is real — not designed up front.)

- [ ] `memory-evidence` — tamper-evident record of agent memory reads/writes
      (provenance of what the agent remembered and when). Sediment from
      wasmagent-js memory work (RFC shared-state epic).
- [ ] `replay-evidence` — deterministic-replay attestation: inputs, seeds, and
      the digest chain that proves a run reproduces.
- [ ] `checkpoint-evidence` — signed checkpoint/fork records so a resumed or
      forked run carries proof of its ancestry.
- [ ] `artifact-attestation` — provenance + signature for produced artifacts
      (files, patches, outputs) linking them back to the run that made them.
- [ ] Shared `EvidenceEnvelope` base schema factored out so every evidence type
      reuses one signature/trust-log/version structure.

Rejected alternative (recorded for posterity): renaming AEP → "ARP / Agent
Runtime Protocol". Rejected — it would dilute the *provable* positioning into a
generic "runtime" one, and trigger an org-wide breaking rename of already-shipped
schema `$id`s, package names, and cross-repo docs. AEP already subsumes these
types.
