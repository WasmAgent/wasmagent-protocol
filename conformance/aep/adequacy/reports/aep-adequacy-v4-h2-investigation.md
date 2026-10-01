# AEP Adequacy v4 — H2 Closure Investigation (frozen; NOT a repair round)

**Investigation ID:** `aep-adequacy-v4-h2-investigation` · **Frozen at:** 2026-10-01
**Machine record:** [`aep-adequacy-v4-h2-investigation.json`](./aep-adequacy-v4-h2-investigation.json)
**Predecessor:** [`v3 held-out`](./aep-adequacy-v3-heldout.md) (byte-unchanged)

> **Outcome up front: the planned v4 H2 additive repair could not be executed,
> and this round refuses to manufacture one.** The canonical AEP record schema
> declares **zero** `pattern` constraints, so the planned "fixture invalid
> solely via a `pattern` violation" cannot exist without a **breaking**
> canonical-schema change, which is outside this closure round's scope. This
> record freezes the evidence and the decision analysis instead.

> This is **project-owned mutation-adequacy engineering analysis** against the
> declared fault set. It is **not** independent semantic verification,
> **not** certification, **not** proof of corpus completeness, and **not**
> proof of generalisation. It is never promotion evidence.

## What was investigated

The v3 held-out round classified fault **H2** ("strip every `pattern` keyword
from the canonical schema") as a survivor with class
`corpus-discrimination-gap`, prescribing: *"Future repair candidate (next
additive round, as a new KNOWN fault first)."* The planned v4 round followed
that prescription and stopped at its first precondition.

## Evidence (all re-executed at protocol `3270b83c…`)

| check | result |
| --- | --- |
| `pattern` keywords in `schemas/aep/aep-record.schema.json` | **0** (only mcp-posture / rollout-wire / agentbom schemas declare `pattern`; none is the corpus canonical schema) |
| H2's injected transform (recursive `pattern` pop) applied to the canonical schema | **identity** — canonical-form JSON equality holds |
| H2 reproduction, `run-adequacy.mjs --heldout` | `survivor` (as in v3) |
| known gate, `run-adequacy.mjs --known` | CHECK-KNOWN OK — 15 detected, CTL-INERT-01 inert, survivors exactly the classified `L0-5` / `L1-2` |
| corpus manifest SHA-256 | `1b0b2204…` — still equals the frozen-authority value (no drift) |
| historical reports v1 / v2 / v3 | byte-unchanged (each touched only by its creating commit) |

**Reading:** the H2 mutant computes exactly the same function as the honest
verifier on **every** input, not merely on the corpus. Under the declared
survivor vocabulary that is the `equivalent-mutant` class (the class of L1-2),
not a corpus discrimination gap: the corpus is not missing a fixture — the
contract is missing the feature. The v3 file itself remains immutable
historical evidence; the reclassification proposed here is a new statement of
this record and needs maintainer ratification.

## Why the planned repair is blocked

A fixture that is invalid *solely* via a `pattern` violation requires a
`pattern` constraint in the canonical schema. Adding one (e.g. a non-empty
`run_id` pattern) tightens schema acceptance. Per
`docs/CONTRACT-CHANGE-PROCESS.md` §1, *"Tighten a constraint (narrow enum,
stricter pattern)"* is a **breaking** change: major version bump, new schema
version, org RFC, release-ledger announcement before merge, consumer tracking
issues — and the consumer schema copy
(`wasmagent-js/packages/aep/schemas/aep-record.schema.json`) must gain the
identical constraint to stay Gate-B clean. A finite closure round cannot carry
that, and labeling the schema edit as a corpus-only change would make a later
`certification_reason=["corpus-change"]` dishonest.

## Resolution options (maintainer decision — needs-review)

1. **Ratify `equivalent-mutant` for H2 at contract version aep/v0.5.** The gap
   closes as a classification correction, not a repair. If a future
   breaking-contract round adds real `pattern` constraints, H2 becomes a live
   known fault again and the planned additive fixture path opens.
2. **Schedule the breaking schema change as its own round** (full
   `CONTRACT-CHANGE-PROCESS.md` §3 path), then run the v4 repair exactly as
   planned and certify with an honestly broader reason set
   (`schema-change` + `corpus-change`).

Per the round's stop conditions this investigation reports the blocker instead
of normalizing it away; no repair manifest (`faults-v2.json`) was created
because no repair exists to record.

## Nothing else changed

No fixture, no `manifest.json` entry, no schema, no fault manifest, no
frozen-authority refreeze, no authority artifact. `certified-target.json` and
the publication chain are untouched.

## Claim ceiling

Project-owned mutation adequacy against the declared fault set — not
independent semantic verification, not certification, not proof of corpus
completeness or generalisation. This investigation record is engineering
analysis frozen as evidence; it is never promotion evidence.
