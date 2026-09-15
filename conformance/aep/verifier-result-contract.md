# AEP verifier result contract (normative)

**Status:** normative for any implementation claiming AEP verifier-contract
conformance (JS, Rust, Python, or future languages).
**Enforcement:** `scripts/verifier-result-contract.mjs` (library + CLI);
regression tests in `scripts/verify-assurance-invariants.mjs` (R6–R10).
**Scope:** wasmagent-protocol#214 remaining scope — verifier obligations,
result contracts, layer boundaries. Nothing here changes `aep/v0.5`, the
certified component tuple, the DSSE profile, or corpus semantics.

## 1. The two orthogonal vocabularies (R6)

An external integration once compared:

```text
corpus manifest:  authenticity = not-checked
direct JS API:    unsigned
```

and treated the difference as a verifier mismatch. It is not. The two
strings live in **different vocabularies on different axes**:

| Axis | Vocabulary | Question answered |
|------|-----------|-------------------|
| **Evaluation state** | `not-evaluated` / `evaluated` | Did THIS pipeline invoke this evaluation for this record? |
| **Record outcome** (per axis) | axis status enums below | What did the evaluation conclude about the record? |

Constraints:

```text
evaluation = not-evaluated  →  outcome MUST be absent
evaluation = evaluated      →  outcome MUST be present
```

`not-checked` is therefore an **evaluation state**; `unsigned` is an
**authenticity outcome**. No adapter may normalize one into the other, and no
result model may merge both into a single enum.

## 2. The five verifier layers

| Layer | Name | Evaluable from supplied artifacts/context? |
|-------|------|--------------------------------------------|
| L0 | structural / schema acceptance | yes |
| L1 | record semantic conformance | yes |
| L2 | cryptographic authenticity + payload binding | yes |
| L3 | chain / run status | yes |
| L4 | capture completeness | **no** — not provable from the signed record set alone |

L0–L3 are evaluation layers. L4 is a **no-go boundary**: see §5.

## 3. The logical result envelope

Implementations keep their native APIs. Anything claiming conformance must be
able to produce this envelope, and must never produce a decision that
contradicts it:

```json
{
  "structural":  { "evaluated": true,  "status": "pass" },
  "semantic":    { "evaluated": true,  "status": "pass", "violations": [] },
  "authenticity": { "evaluated": true, "status": "valid", "binding": "exact" },
  "chain":       { "evaluated": true,  "status": "intact" },
  "capture":     { "evaluated": false }
}
```

Axis outcome vocabularies:

| Axis | Statuses |
|------|----------|
| `structural` | `pass`, `fail` |
| `semantic` | `pass`, `fail` |
| `authenticity` | `unsigned`, `valid`, `invalid`, `unsupported-legacy`, `binding-mismatch` |
| `chain` | `intact`, `broken` |
| `capture` | `complete-evidenced`, `unknown` |

Rules:

1. Every axis is **explicitly** present — absence would silently default an
   axis to "fine", which is the collapse this contract forbids.
2. `evaluated=false` carries **no outcome** (R6).
3. `evaluated=true` requires an outcome from the axis vocabulary.
4. There is deliberately **no aggregate verdict field**. Consumers compose
   their own decision per deployment policy; the contract refuses to
   re-merge the axes into one boolean.
5. Top-level `complete` / `capture_complete` keys are **forbidden** (R10).

## 4. Axis independence (R7 / R8)

No axis implies another. All of the following must be representable and are
tested:

- semantic `fail` alongside authenticity `valid` (R7)
- semantic `pass` alongside authenticity `unsigned` (R8)
- chain `intact` alongside capture `evaluated=false` (R9)

## 5. Capture-completeness no-go boundary (R9 / R10)

Given a record set chosen and signed by the producer:

```text
authentic records                 != complete event capture
valid chain over observed records != proof that no event was omitted
```

A `capture_complete: true` — or any completeness flag — carried by records
the producer itself signs is a **signed claim of completeness**, not
**proof of completeness**. Consequences:

- The `capture` axis can only reach `evaluated=true, status=complete-evidenced`
  with a reference to an **independent witness profile** (observer receipt,
  gateway sequence witness, append-only transparency log, TEE attestation
  stream). Any future such work is a separate **AEP Capture Witness
  Profile** — never a field in `aep/v0.5`.
- A bare `complete: true` anywhere in a result envelope is invalid by
  construction.

## 6. Relation to other boundaries

- Component identity vs publication identity: `conformance/aep/README.md`
- External evidence vs certification: `conformance/aep/external-evidence/`
- Assurance vocabulary: `docs/aep-assurance-language.md`
