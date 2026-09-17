# Problem Statement

Agent systems exchange tool-call evidence across organizational boundaries.
Today that evidence is either proprietary telemetry (not portable, not
verifiable by the receiving party) or ad-hoc logs (no integrity, no schema).
There is no widely adopted, portable, verifiable format for *what an agent
did* that a third party can independently verify.

The Agent Evidence Protocol (AEP) addresses this: portable, schema-versioned
agent-action evidence with a conformance corpus and published certified
targets. Records are signable, not necessarily signed — unsigned records are
representable; when evidence is signed under the current conformance target,
the supported signing profile is DSSE-only.

## What exists today

- AEP evidence schema (versioned, canonical-JSON).
- A DSSE-only signing profile (`aep-dsse-ed25519-decoded-body-v1`) with JS and
  Rust producers/verifiers; unsigned records remain valid evidence.
- A conformance corpus with layered semantics (structural / semantic /
  authenticity / chain / capture) and an exact-SHA certified-target
  publication model.
- Reference consumers in three language runtimes.

## What does not exist yet

- Formal multi-party standardization or a standards-body work item.
- An independent (non-author) second native verifier implementation.
- Capture-completeness guarantees (an independent witness is required —
  see security-considerations.md).
