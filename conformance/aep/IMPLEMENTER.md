# AEP Conformance Kit — Independent Implementer Guide

This corpus ships inside the published packages, so you can implement and test
an AEP verifier or emitter **without cloning the repository**:

```bash
# npm
npm install @wasmagent/protocol
npx wasmagent-protocol aep-conformance path        # locate the installed corpus
npx wasmagent-protocol aep-conformance self-check  # verify the installed corpus

# PyPI
pip install wasmagent-protocol
wasmagent-protocol aep-conformance path
wasmagent-protocol aep-conformance self-check
```

## What the corpus is

`manifest.json` is the **verdict authority**. Every current conformance target
lists a fixture path plus expected verdicts per layer:

| Layer | Meaning | Vocabulary |
|---|---|---|
| `structural` | Conformance to the canonical JSON Schema (`canonical_schema`) | `valid` / `invalid` |
| `semantic` | Derived invariants (attribution floor / vocabulary / count rules) | `valid` / `invalid` |
| `authenticity` | DSSE envelope verification over the pinned profile | `unsigned` / `dsse-valid` / `invalid` / `not-checked` |
| `chain` | Evidence-chain integrity of chained records | `not-present` / `intact` / `partial` / `orphaned` / `broken` / `not-checked` |

- **Signing profile:** `aep-dsse-ed25519-decoded-body-v1` — Ed25519 over the
  DSSE PAE of the *decoded, serialized* in-toto Statement bytes. The envelope
  `payload` field is base64 transport encoding only, not the PAE body. Exactly
  one signature per envelope. See the `dsse` block in `manifest.json`.
- **Verifying keys:** `manifest.json#verifying_keys` maps key ids to key files
  under `dsse/`. The pinned Rust fixture uses its own key (`rust-fixture-verify-key.hex`).
- **Fixture paths** in the manifest are corpus-relative; fixtures may be a
  single JSON document or `.jsonl` (one record per non-empty line).
- **`historical/` fixtures are NOT part of the current target.** They exist for
  backward-compatibility archaeology only — never score your implementation
  against them.

## Rules for claiming an *independent* semantic verifier

The corpus authors ship reference checkers (the `self-check` subcommand and
`scripts/run-aep-conformance-corpus.py` in the repository). Those verify
corpus integrity and the project-owned reference layers. **They are not, and
can never count as, independent verification.** If you want your
implementation to count as an independent semantic verifier:

- **MUST NOT** import or call any WasmAgent semantic evaluator
  (`wasmagent_protocol.conformance.check_semantic`, the `self-check`
  subcommands, or anything in `scripts/`).
- **MUST** implement the semantics yourself from the public spec, the
  canonical JSON Schema, and the manifest verdicts.
- **SHOULD** preserve your first blind run (pass/fail counts plus the raw
  mismatch list) before making any mismatch-specific fixes. Publish the blind
  run, not just the post-fix score.
- **MUST** pin the corpus version / certified target you tested against (for
  example the `target_id` in `certified-target.json` and the package version).

## Recording your first blind run

At minimum, record:

```text
implementation commit
corpus pin (package version / target id)
first-run pass/fail count
mismatch list (fixture path + layer)
free-form reason per mismatch
```

Then share it on the conformance-suite tracker where your run belongs.
A documented blind run with mismatches is worth more than a silent 30/30.
