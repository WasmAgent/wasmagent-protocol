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
- [ ] Strip `trace-pipeline` local schema copies (`schemas/*.schema.json`) and depend on `wasmagent-protocol` (PyPI); rename `repair-trace-entry` usage to `repair-trace`. (tracked: WasmAgent/trace-pipeline#17)

## Milestone 2 — AEP as the authoritative evidence contract

- [ ] Add a CI step in `wasmagent-proxy` that validates emitted AEP records against `@wasmagent/protocol`'s `schemas/aep/aep-record.schema.json` (vendor the schema from the published package at a pinned version). (tracked: WasmAgent/wasmagent-proxy#294)
- [x] Point `wasmagent-train-replay` `EpochEvidenceBundle` at the shared AEP
      record schema for its evidence envelope.
- [ ] In `open-agent-audit`, add an adapter mapping `schemas/v0.1/canonical-event.schema.json` onto `@wasmagent/protocol` `aep-record`, with a conformance test proving a sample AEP record validates. (tracked: WasmAgent/open-agent-audit#94)
- [ ] Add `scripts/check-consumer-versions.mjs` + a CI job here that reads each consumer repo's declared `@wasmagent/protocol` range and fails if any is out of the supported band.

## Milestone 3 — Stability & conformance

- [ ] Promote `aep-record` to `stable` in `schemas/index.json` and document the versioning guarantee in `docs/GOVERNANCE.md` (precondition for the planned `wasmagent-py` runtime).
- [ ] Add `scripts/gen-types.mjs` that generates a `types/` TypeScript `.d.ts` surface from the JSON Schemas, wired into the build and exported from `package.json`.
- [ ] Publish an `aep-conformance/` fixture set in the package (valid+invalid AEP records) plus a `bin/aep-conformance` runner consumers can point at their own emitter output.

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
