# AEP Adequacy v2 — Known-Fault Round After Additive Corpus Repair (frozen)

**Run ID:** `aep-adequacy-v2-known-post-repair` · **Frozen at:** 2026-10-01
**Raw machine result:** [`aep-adequacy-v2-known-post-repair.json`](./aep-adequacy-v2-known-post-repair.json)
**Predecessor report:** [`aep-adequacy-v1-known.md`](./aep-adequacy-v1-known.md) (preserved unmodified)

> This is **project-owned mutation adequacy against the declared fault set**
> (`../faults-v1.json`, additive witness amendments recorded in-file). It is
> **not** independent semantic verification, **not** certification, **not**
> proof of corpus completeness, and **not** proof of generalisation.

## Repair applied (additive only — no fixture modified or removed)

| new fixture | derived from | repairs |
| --- | --- | --- |
| `invalid-schema/missing-required-field.json` | `valid/minimal-v05.json` minus required `run_id` | **L0-1** (required-field validation had no discriminating fixture; `invalid-schema/` was reserved but empty) |
| `dsse/tampered-created-at.json` | `dsse/js-signed-v05.json` with `created_at_ms` mutated after signing | **L2-7** (predicate/record digest binding was masked by the subject-name↔run_id binding for the run_id tamper) |

Corpus: 30 → **32** conformance-target entries. Protocol-side corpus gate:
`32 fixture(s), 64 check(s) executed, 0 failure(s)`. Consumer-js gate:
`19 verdict(s) checked, 0 failure(s)`. Old fixtures and the v1 report are
untouched; the v1 run remains reproducible at its commit.

## Provenance

| field | value |
| --- | --- |
| protocol repo SHA | `b0fd2abc…` tree + this repair (manifest SHA-256 `1b0b2204…`, re-frozen in `../frozen-authority.json` with a refreeze_log entry) |
| fault manifest | `aep-adequacy-faults-v1` (28 known faults; L0-1/L2-7 gained repair-round witnesses, amendments recorded in-file) |
| consumer-js adapter | `WasmAgent/wasmagent-js` @ `0a9b8d21…` |
| controls | `CTL-POS-01` detected ✓ · `CTL-INERT-01` inert ✓ |

## Results (28 known faults)

**27 detected · 2 survivors · 0 crash · 0 missing-result**

| fault | v1 | v2 |
| --- | --- | --- |
| **L0-1** required-field stripped | survivor (gap) | **detected** |
| **L2-7** predicate/record digest binding removed | survivor (masked) | **detected** |
| L0-2/3/4, L1-1/3/4/5/6, L2-1…2-6, L3-1…3-5, RC-1…RC-5 | detected | detected (unchanged) |
| L0-5 dialect check bypassed | survivor | survivor — `outside-stated-contract` (schema meta-validation; no fixture can express it) |
| L1-2 floor-membership removed | survivor | survivor — `equivalent-mutant` (subsumed by the weakest-floor check; layered redundancy documented) |

## Authority-chain note

Adding corpus fixtures is a corpus semantic change: per the certified-target
trigger policy this leads to a **`corpus-change` generation at the next
certification event** through the normal path. This repository edit does NOT
create a new certified target, does not touch `certified-target.json`, and the
`aep-certified-2026-09-16-01` tag/publication chain stays byte-frozen
(historical verification reads the manifest from the tag).

## Claim ceiling

Same as v1: project-owned mutation adequacy against the declared fault set —
not independent semantic verification, not certification, not proof of corpus
completeness or generalisation. The held-out set (`H1–H5`) remains unrun until
this repaired corpus is frozen (v3 report).
