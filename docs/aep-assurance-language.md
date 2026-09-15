# AEP assurance language

**Purpose: assurance type safety.** Every assurance claim in this repository,
its documentation, and its public communication must name the exact kind of
evidence that exists — no more, no less. The terms below are binding for
READMEs, docs, issues, PR descriptions, release notes, and CI-visible files.
`scripts/check-assurance-language.mjs` enforces the forbidden patterns in
docs lint.

## The invariant

```text
artifact identity
  != semantic validity
  != cryptographic authenticity
  != chain integrity
  != capture completeness
  != publication identity
  != external evidence
  != certification / endorsement
```

No implementation, document, test, marketing claim, or external integration
may collapse these axes into a single `verified = true`.

## Allowed terms (with their exact meaning)

| Term | Meaning |
|------|---------|
| project-published certified target | The project itself ran Gate C on an exact component tuple and published the manifest |
| internal Gate C pass | Gate C verdict on the exact tuple, run by the project's own CI |
| versioned exact-SHA target | A certified target pinned to full 40-hex component SHAs |
| component identity | The Gate-C-exercised repository SHAs (WHAT WAS TESTED) |
| publication identity | The protected-main revision + immutable tag carrying the manifest naming that tuple |
| independent layered run | An external party executed their own layered evaluation and published results |
| external reproduction of exercised targets | An external run reported the same outcomes on targets the project already certified |
| lab-authored semantic recomputation | An external lab recomputed semantic invariants with their own code |
| JS/Rust native verifier agreement | The native JS and Rust verifiers agreed on the same exact fixtures |
| evidence ledger entry | A fact-only registration in `conformance/aep/external-evidence/` |

## Forbidden without genuinely new evidence

These patterns MUST NOT appear in any repository file (docs lint enforces
the quoted strings). They are not stylistic preferences — each one asserts an
assurance type that does not exist:

| Forbidden pattern | Why |
|-------------------|-----|
| "Linux Foundation certified" / "LF certified" | An LF lab hosting a conformance suite is not a certification body for this project |
| "OWASP certified" / "OWASP approved" | An OWASP discussion or PR is not an approval program |
| "official conformance certification" | No such program exists for AEP |
| "industry certified" / "third-party certification" | No accredited third party has certified AEP |
| "complete capture proof" / "proves complete capture" | Capture completeness is a documented no-go boundary (see below) |
| "fully certified" | Implies an assurance program that does not exist |

## Correct external-evidence phrasing

> An independent layered AEP run was published in the
> Agent-Authority-Conformance conformance repository, an LF Decentralized
> Trust lab.

Incorrect (each collapses an assurance axis): "LF certified WasmAgent",
"passed LF certification", "Linux Foundation endorsed AEP", "OWASP approved
the AEP design".

## Capture-completeness no-go boundary

Given a set of AEP records chosen and signed by the producer:

```text
authentic records               != complete event capture
valid chain over observed records != proof that no event was omitted
```

A `capture_complete: true` field signed by the producer would be a **signed
claim of completeness**, not **proof of completeness**. Do not add such a
field to `aep/v0.5`. Any future capture-assurance work belongs in a separate
**AEP Capture Witness Profile** (observer receipts, gateway sequence
witnesses, append-only transparency logs, TEE attestation streams) — never in
the record semantic layer.

## Certified-target lifecycle trigger policy

Creating a new certified target (`-04` and beyond) requires at least one
semantic/runtime trigger:

```text
schema-change | semantic-rule-change | verifier-contract-change |
signing-profile-change | chain-semantics-change | corpus-change |
security-repair
```

Explicitly NOT triggers (machine-enforced for future manifests — these values
must never appear in `certification_reason`):

```text
latest-main | docs-refresh | external-run-merged | README-update
```

Documentation-only movement, external-evidence merges, README changes, issue
wording, and publication-index changes MUST NOT create a new certified target.

## Related documents

- `conformance/aep/README.md` — component identity vs publication identity (normative)
- `scripts/verify-publication-record.mjs` — PC-01..PC-07
- `scripts/verify-external-evidence.mjs` — EE-01..EE-06
- `scripts/check-assurance-language.mjs` — this policy, enforced
