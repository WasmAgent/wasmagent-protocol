# Terminology

- **AEP (Agent Evidence Protocol)** — portable, schema-versioned evidence of
  agent actions. Records are signable, not necessarily signed: unsigned
  records are representable, and when evidence is signed under the current
  conformance target, the supported signing profile is DSSE-only.
- **Evidence** — verifiable records of agent behavior; distinct from logs
  (append-only but unverified) and from telemetry (observability data).
- **DSSE** — Dead Simple Signing Envelope; the signature envelope of the
  certified signing profile `aep-dsse-ed25519-decoded-body-v1`.
- **Certified target** — a published tuple of exact component SHAs plus the
  manifest naming them; see conformance/aep/README.md for component vs
  publication identity.
- **Layer (verification axis)** — one of the five axes of the logical
  verifier result contract: L0 structural, L1 semantic, L2 authenticity /
  payload binding, L3 chain / run status, L4 capture completeness. L4 is not
  provable from producer-selected signed records alone; capture may only
  appear as `evaluated=true, status=complete-evidenced` when an independent
  witness profile exists. The current corpus does not establish capture
  completeness.
- **Chain** — a linked sequence of evidence records; integrity of links is
  evaluated per link, never inferred from a single record.
