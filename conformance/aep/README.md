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

## Component identity vs publication identity (normative)

A certified target names **two distinct anchors**. Conflating them is the
single most common integration mistake — an external consumer once reasonably
expected the `-03` manifest to exist *at* the pinned protocol component SHA
(it does not, and structurally cannot).

1. **Component identity** — the exact repository SHAs exercised by Gate C:

   ```text
   protocol 35320c567ba02ae30ba441f488952954dd66a4cc
   js       bb71077cbd13051c05e17195d11d16efd0d1c572
   proxy    4b4bde3b2e06eb62b7910cb3f379d75288cc4db1
   trace    5820bf811302a1e202b762792cac6ef44e833ad6
   ```

2. **Publication identity** — the immutable protected-main revision that
   carries the manifest naming that tuple:

   ```text
   manifest source commit  639a611714f70972e6196f56a60c615c9f42ef9d
   publication commit      228db7536094df7f245baf379e0e0aea5e95f33d
                           (PR #227 merge into protected main)
   ```

The split is structural: a manifest stored inside repository R cannot contain
the SHA of the commit that contains that same manifest (self-reference).
External consumers pin **tuple + publication anchor**; publication-only files
(`README.md`, `certified-target.json`) may differ between the component SHA
and the publication anchor, but corpus fixtures and manifests may not —
verify with `scripts/verify-certified-publication.mjs`.

### Publication flow for new certified targets

```text
Gate C exact tuple PASS
        ↓  generate candidate certified-target.json
PR against wasmagent-protocol (protected main)
        ↓  merge → publication commit
create immutable tag aep-certified-YYYY-MM-DD-NN at the merge commit
        ↓
external consumers pin: component tuple + publication tag
```

For `aep-certified-2026-09-13-03` the publication anchors are machine-readable
in `publications/aep-certified-2026-09-13-03.publication.json` (verified by
`scripts/verify-publication-record.mjs`, PC-01..PC-07) and pinned by the
immutable tag `aep-certified-2026-09-13-03`. External runs are registered —
never certified — in `external-evidence/` (verified by
`scripts/verify-external-evidence.mjs`, EE-01..EE-06). Assurance claim
vocabulary is governed by `docs/aep-assurance-language.md` and enforced by
`scripts/check-assurance-language.mjs`.
