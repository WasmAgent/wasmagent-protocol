# AEP Conformance Corpus Adequacy

Seeded-fault mutation adequacy for the AEP conformance corpus and its verifier
stack. The question measured here is **not** "does the verifier pass the
corpus" — it is the inverse: **can the corpus distinguish deliberately broken
verifier logic?** A fixture set that every plausible verifier bug passes is a
guard that guards nothing.

This work is deliberately scoped OUT of the completed verifier-contract effort
(wasmagent-protocol#214) and OUT of the certified-target authority chain:

- it is **project-owned mutation adequacy against the declared fault set**
  (`faults-v1.json`) — nothing more;
- it is **not** independent semantic verification, certification, proof of
  corpus completeness, or proof of generalisation;
- it **never** rewrites or masquerades as a certified-target run (see
  `frozen-authority.json` for the B0 freeze and the non-invasiveness contract).

## Layout

| file | role |
| --- | --- |
| `frozen-authority.json` | B0 freeze: tested SHA, manifest/contract SHA-256, certified-target identity, non-invasiveness contract |
| `faults-v1.json` | declarative seeded-fault manifest (`known` set + `heldout` set, hashed before repair) |
| `run-adequacy.mjs` | non-invasive harness: builds temporary patched verifier copies, runs them against the frozen corpus, scores per-fault outcomes |
| `envelopes/*.json` | result-contract envelope inputs for the contract-validator adapter |
| `reports/` | frozen published run reports ONLY (raw JSON + generated Markdown) |

## Verifier adapters

| adapter | exercises | mechanism |
| --- | --- | --- |
| `python-corpus` | L0 structural (jsonschema) + L1 semantic (reference checker) | patched copy of `scripts/run-aep-conformance-corpus.py` + `src/wasmagent_protocol/conformance.py` + canonical schema, run against the frozen corpus |
| `result-contract` | R6–R10 result-envelope invariants | patched copy of `scripts/verifier-result-contract.mjs` against `envelopes/` inputs |
| `consumer-js` | L2 authenticity (DSSE + binding) + L3 chain | patched copy of `WasmAgent/wasmagent-js` `scripts/verify-corpus.mjs` + `packages/aep/src` (optional; requires `--consumer-js <path>` pointing at a local wasmagent-js checkout) |

The JS mirror (`index.js` `checkSemanticReference`) implements the same
reference rules as the Python checker and is exercised indirectly through the
installed-kit self-check; faults in v1 target the Python reference directly.
The Rust/pytest consumer adapters (wasmagent-proxy, trace-pipeline) are not run
here; `consumer-js` covers the same corpus layers on one real consumer.

## Scoring (B2)

```
targeted result changed as expected  → detected
process crash / non-zero exit ≥ 2    → crash (reported separately, never counted as detection)
no output                            → missing-result (reported separately)
unchanged targeted result            → survivor
```

Survivors are classified — never silently dropped from the denominator — as one
of `corpus-discrimination-gap`, `equivalent-mutant`, `outside-stated-contract`,
`harness-defect`, `needs-review`.

## Controls (B2)

- **positive control** — a fault that the current corpus MUST detect
  (`CTL-POS-01`, the weakest-floor rule); if it is not detected the run is
  INVALID end to end.
- **inert control** — a documentation-only mutation that must leave every
  outcome unchanged (`CTL-INERT-01`); if anything changes the harness itself
  is defective.

## Usage

```sh
# known-fault round against the protocol repo alone (L0/L1/result-contract):
node conformance/aep/adequacy/run-adequacy.mjs --known

# including the consumer-JS adapter (L2/L3) against a local wasmagent-js:
node conformance/aep/adequacy/run-adequacy.mjs --known \
  --consumer-js /path/to/wasmagent-js

# held-out round (run only AFTER the repaired corpus is frozen):
node conformance/aep/adequacy/run-adequacy.mjs --heldout \
  --consumer-js /path/to/wasmagent-js
```

The harness refuses to start if `manifest.json` / `verifier-result-contract.md`
no longer match the frozen hashes (corpus drift), unless `--allow-drift` is
passed — in which case the drift is recorded prominently in the report.
