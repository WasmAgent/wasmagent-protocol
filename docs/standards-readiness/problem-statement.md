# Problem Statement

Agent systems exchange tool-call evidence across organizational boundaries.
Today that evidence is either proprietary telemetry (not portable, not
verifiable by the receiving party) or ad-hoc logs (no integrity, no schema).
There is no widely adopted, portable, verifiable format for *what an agent
did* that a third party can independently verify.

The Agent Evidence Protocol (AEP) addresses this: portable, schema-versioned,
DSSE-signed agent-action evidence with a conformance corpus and published
certified targets.

## What exists today

- AEP evidence schema (versioned, canonical-JSON).
- DSSE signing profiles with JS and Rust producers/verifiers.
- A conformance corpus with layered semantics (structural / semantic /
  authenticity / chain) and an exact-SHA certified-target publication model.
- Reference consumers in three language runtimes.

## What does not exist yet

- Formal multi-party standardization or a standards-body work item.
- An independent (non-author) second native verifier implementation.
- Capture-completeness guarantees (an independent witness is required —
  see security-considerations.md).
