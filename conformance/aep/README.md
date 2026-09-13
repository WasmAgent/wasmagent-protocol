# AEP conformance corpus

Shared fixtures for every AEP verifier (JS, Rust, and the Python consumer
in `trace-pipeline`). Owned by `wasmagent-protocol` — the canonical contract — so
producers, verifiers, and external drivers (e.g. the LF Decentralized Trust
conformance lab, [aps-conformance-suite#92](https://github.com/Agent-Authority-Conformance/aps-conformance-suite/issues/92))
test against the same bytes.

## Signing profile: DSSE only

**DSSE (Ed25519 over the PAE encoding, payload bound to the record) is the
only signing profile in the conformance target.** The historical inline
signature constructions were removed from both runtimes and are NOT part of
this corpus's conformance target — see `historical/`.

Layout:

```text
valid/             protocol-valid records (incl. unsigned and proto-key preservation)
invalid-semantic/  structurally valid, but violating derived invariants (floor rules)
invalid-schema/    reserved — structurally invalid records
dsse/              DSSE-signed records + tamper negatives
chain/             inter-record hash-chain sequences (intact / missing / partial / broken)
historical/        UNSUPPORTED historical artifacts — evidence, not conformance
manifest.json      expected verdict per fixture per verification layer
                   (machine-readable signing_profile_id + verifying_keys.by_keyid)
certified-target.json  exact four-repo SHA tuple of the latest passing Gate C
```

Everything in `dsse/` was produced by the REAL emitter signing paths — never
hand-written signatures:

- JS fixtures: `wasmagent-js` `packages/aep/scripts/gen-conformance-fixtures.ts`
  (documented corpus seed `c0ffee00` × 8, key id `conformance-seed-key-01`).
- The pinned cross-language pair (`dsse/js-signed-v05.json`,
  `dsse/rust-signed-v05.json`, key id `ci-sample-key`, seed `deadbeef` × 8)
  is byte-identical to what all three CI consumer gates verify.
- `certified-target.json` pins the exact four-repo SHA tuple of the latest
  PASSING Gate C run — cross-repo closure claims reference it, never
  "latest main".

`historical/` documents the two retired inline-signature constructions —
JS (Ed25519 over raw sorted-canonical bytes) and the Rust gateway
(Ed25519 over SHA-256 of its struct-order JSON). They were never one
profile, which is exactly why they were retired instead of maintained:
`NOT PART OF THE CURRENT CONFORMANCE TARGET — UNSUPPORTED HISTORICAL
ARTIFACTS`. New signed evidence is DSSE only.

Layer semantics in `manifest.json`:

- `structural` — canonical JSON Schema acceptance.
- `semantic` — derived invariants (floor ∈ observed, floor = weakest observed).
- `authenticity` — DSSE signature / payload binding outcome; `unsigned` is
  distinct from `invalid`.
- `chain` — `intact` / `not-present` / `partial` / `orphaned` / `broken`:
  absent links are counted (partial), never read as tamper-evidence, and a
  vacuous chain cannot masquerade as intact (high-assurance consumers
  require `intact`).

Adding a fixture: append the file, extend `manifest.json`, and state which
emitter produced it. Hand-written signatures are rejected in review —
fixtures must be reproducible from a pinned producer commit.
