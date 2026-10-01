# AEP Adequacy v3 — Held-Out Fault Round (frozen)

**Run ID:** `aep-adequacy-v3-heldout` · **Frozen at:** 2026-10-01
**Raw machine result:** [`aep-adequacy-v3-heldout.json`](./aep-adequacy-v3-heldout.json)
**Predecessors:** [`v1 known`](./aep-adequacy-v1-known.md) → repair → [`v2 known post-repair`](./aep-adequacy-v2-known-post-repair.md)

> This is **project-owned mutation adequacy against the declared fault set**
> — specifically the held-out subset (`H1–H5`). It is **not** independent
> semantic verification, **not** certification, **not** proof of corpus
> completeness, and **not** proof of generalisation.

## Independence statement (honest labeling)

The held-out set was declared in the same `faults-v1.json` commit as the known
set and **before** any repair fixture was written; it was not used to construct
or tune the repair. But the held-out author and the corpus author are the same
agent in the same session — this is **withheld-from-corpus-author but not
blind**. It is never called "independent". The run executed only after the
repaired corpus (v2) was frozen.

## Provenance

| field | value |
| --- | --- |
| corpus manifest SHA-256 (repaired) | `1b0b2204…` (32 entries) |
| fault manifest | `aep-adequacy-faults-v1`, selection `heldout` (H1–H5) |
| consumer-js adapter | `WasmAgent/wasmagent-js` @ `0a9b8d21…` |
| controls | `CTL-POS-01` detected ✓ · `CTL-INERT-01` inert ✓ (re-run within this invocation) |

## Results (5 held-out faults)

**detected evidence: 2 · survivors: 3 · crash/missing: 0**

| fault | formulation | harness outcome | classification |
| --- | --- | --- | --- |
| **H1** | weakest-floor comparison inverted (false-positive direction) | `unrelated-failure` — the pre-declared witnesses (valid/* flips) did **not** materialize; instead the inverted checker ACCEPTS `invalid-semantic/floor-roundup.json` and the corpus caught exactly that (`FAIL invalid-semantic/floor-roundup.json: semantic expected invalid, checker said True`) | **detected — witness-direction misprediction**; pre-declared witnesses preserved untouched (no post-hoc tuning). Raw output in the JSON record. |
| **H2** | `pattern` constraints stripped | survivor (exit 0) | **`corpus-discrimination-gap`** — no fixture is invalid solely via a pattern violation. Future repair candidate (next additive round, as a new KNOWN fault first). Not repaired here: repairing after seeing held-out results would break the known/held-out separation. |
| **H3** | consumer validity comparison relaxed to `!== "invalid"` | survivor (exit 0) | `outside-stated-contract` — the consumer adapter only asserts `dsse-valid`/`invalid` expectations and deliberately never re-checks `unsigned` entries; the mutant changes no asserted verdict. Documented boundary, consistent with the corpus design. |
| **H4** | observed-vocabulary check removed (redundancy-masking probe) | survivor (exit 0) | **`needs-review` → layered redundancy confirmed**: the fixture is doubly invalid and the structural enum layer alone rejects it, so removing the semantic vocabulary check is masked. The tamper remains contained; attribution to the single rule is impossible by corpus construction. |
| **H5** | witness_profile boundary corrupted (empty string accepted) | detected (`envelopes/h5-empty-witness-profile.json` flipped to ACCEPTED) | detected ✓ |

## What the held-out round adds

1. Evidence on faults **not used to construct the repair**: the two
   result-level reformulations (H1, H5) are both distinguished by the corpus;
   the three survivors are boundary/redundancy findings, not silent gaps in
   already-claimed behavior.
2. One **new repair candidate** (H2, pattern constraints) recorded for a
   future round through the same additive path.
3. A demonstration that the scoring discipline holds: H1's mispredicted
   direction is reported as-is instead of being silently re-labeled.

## Claim ceiling

Project-owned mutation adequacy against the declared held-out set — not
independent semantic verification, not certification, not proof of corpus
completeness or generalisation. The authority chain remains untouched; no
adequacy result is promotion evidence.
