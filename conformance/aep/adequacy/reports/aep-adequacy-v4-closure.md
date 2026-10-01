# AEP adequacy closure — H2 classification and exact-SHA consumer lane

`aep-adequacy-v4-closure` · frozen 2026-10-01 · machine record:
[aep-adequacy-v4-closure.json](./aep-adequacy-v4-closure.json)

This is the finite closure record of the AEP internal hardening generation:
the H2 reclassification (PR #258) and the exact-SHA consumer adequacy CI lane
(PR #259), plus the certified-target trigger reclassification taken from the
**actual merged deltas**, not the superseded plan.

## #258 — H2 reclassification ratified

- PR: https://github.com/WasmAgent/wasmagent-protocol/pull/258
  (head `101028f4624198ecca07028de50b2fc593cd03d0`)
- Maintainer decision:
  https://github.com/WasmAgent/wasmagent-protocol/pull/258#issuecomment-5925191371
- Merge SHA: `239e9af1431532c883ef1fde1f458cdc80b5007b` (2026-10-01T05:13:21Z)
- Delta: `aep-adequacy-v4-h2-investigation.{json,md}` only — no schema,
  corpus, manifest, verifier-contract, or authority change.
- Closure interpretation:
  - H2 historical v3: `corpus-discrimination-gap` (immutable historical
    evidence; v1/v2/v3 reports byte-unchanged);
  - H2 current structural assessment at AEP v0.5: `equivalent-mutant`
    (canonical AEP record schema declares zero `pattern` constraints, so the
    strip-`pattern` mutation is an identity transform).

## #259 — exact-SHA consumer lane, freshly revalidated then merged

- PR: https://github.com/WasmAgent/wasmagent-protocol/pull/259
- Revalidated against post-#258 `main` (branch head
  `11cac81b86f4a45b3553dbbea5059f9069512e9f`); the pre-#258 green run was not
  used.
- Pinned consumer SHA (unchanged):
  `47ae05f3baca5a198b40b17e310e3d117228fbd8` — pinned == resolved.
- Merge SHA: `5dc52960daa67b8d326ae22caa2ac05af56dcbcb` (2026-10-01T05:17:24Z)
- Protocol final `main`: `5dc52960daa67b8d326ae22caa2ac05af56dcbcb`
- Fresh lane results (conformance run 36818798626, L2/L3 job 110229652849;
  Gate C run 36818798653):
  - controls: CTL-POS-01 `detected`, CTL-INERT-01 `inert-ok`;
  - L2-1…L2-7: **7/7 detected**;
  - L3-1…L3-5: **5/5 detected**;
  - unexpected survivors 0, crash 0, missing-result 0, harness-defect 0;
  - LC-01…LC-10: **PASS** (exact-SHA checkout, result vocabulary, counts,
    claim ceiling verbatim).
- Claim ceiling of the lane (unchanged): project-owned cross-repository
  adequacy ≠ independent semantic verification ≠ independent authenticity
  verification ≠ certification.

## Certified-target trigger reclassification

Policy used: `docs/aep-assurance-language.md` § "Certified-target lifecycle
trigger policy", machine-enforced by `scripts/verify-certified-target.mjs`
(`ALLOWED_REASONS`: schema-change, semantic-rule-change,
verifier-contract-change, signing-profile-change, chain-semantics-change,
corpus-change, security-repair; `FORBIDDEN_REASONS`: latest-main,
docs-refresh, external-run-merged, README-update).

- #258 merged delta: investigation/classification record only → **no
  trigger**.
- #259 merged delta: CI/adequacy enforcement infrastructure only → **no
  trigger** (not stretched onto `verifier-contract-change`).

**Conclusion (Case A):** this hardening round improved project-owned adequacy
classification and CI enforcement without changing the certified
protocol/corpus/verifier authority. Therefore no certified-target successor
was generated.

- Current certified target retained: `aep-certified-2026-09-16-01`
  (`scripts/verify-certified-target.mjs` → VALID on
  `5dc52960daa67b8d326ae22caa2ac05af56dcbcb`, predecessor publication
  resolved).
- Successor generated: **no**. No reason was invented; the earlier
  `certification_reason=["corpus-change"]` assumption of the superseded plan
  is retired.

## Freeze

This AEP internal hardening generation is FROZEN at closure: no further
mutants or fixtures are added in this generation. The next substantive
engineering work belongs in `WasmAgent/wasmagent-js` (IF-07a
provenance-preserving information-flow gate) as a separate project.

## Claim ceiling

Project-owned adequacy hardening — not independent semantic verification, not
independent authenticity verification, not external certification, not proof
of corpus completeness, not proof of capture completeness.
