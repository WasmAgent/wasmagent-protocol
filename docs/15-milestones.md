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

AEP today covers execution evidence (`aep-record`). Memory / Replay / Checkpoint
/ Artifact each enter the protocol as a **new evidence record under AEP** sharing
one signature envelope — not a rename to "ARP" (rejected: dilutes the provable
positioning and forces an org-wide breaking rename). Each bullet below is a
single self-contained schema deliverable; land one only after the runtime
feature it describes is real (protocol is sedimented, not designed up front).

- [ ] Add `schemas/aep/evidence-envelope.schema.json` — shared base (schema_version, signature{alg,key_id,sig}, trace_id, created_at_ms) that every evidence record `$ref`s; register in `schemas/index.json` with a valid+invalid fixture under `tests/fixtures/`.
- [ ] Refactor `schemas/aep/aep-record.schema.json` to `$ref` the shared `evidence-envelope` for its signature/version fields; keep field set identical (no breaking change), add fixture proving equivalence.
- [ ] Add `schemas/aep/memory-evidence.schema.json` — tamper-evident memory read/write record (keys: mem_ref, op enum[read,write], digest, prior_digest, timestamp_ms); register in index + valid/invalid fixtures.
- [ ] Add `schemas/aep/replay-evidence.schema.json` — deterministic-replay attestation (keys: run_id, seed, input_digests[], output_digest, engine_version); register in index + valid/invalid fixtures.
- [ ] Add `schemas/aep/checkpoint-evidence.schema.json` — signed checkpoint/fork record (keys: checkpoint_id, parent_run_id, fork_of, state_digest, created_at_ms); register in index + valid/invalid fixtures.
- [ ] Add `schemas/aep/artifact-attestation.schema.json` — produced-artifact provenance (keys: artifact_uri, digest, produced_by_run_id, tool_name, signature); register in index + valid/invalid fixtures.
- [ ] Update README + `docs/CONTRACT-CHANGE-PROCESS.md` to list the new evidence types and their consumer repos once each ships.
