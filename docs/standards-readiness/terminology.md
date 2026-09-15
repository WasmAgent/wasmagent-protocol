# Terminology

- **AEP (Agent Evidence Protocol)** — portable, schema-versioned evidence of
  agent actions, signed with DSSE.
- **Evidence** — verifiable records of agent behavior; distinct from logs
  (append-only but unverified) and from telemetry (observability data).
- **DSSE** — Dead Simple Signing Envelope; the signature envelope used by AEP.
- **Certified target** — a published tuple of exact component SHAs plus the
  manifest naming them; see conformance/aep/README.md for component vs
  publication identity.
- **Layer** — an evaluation axis of a fixture: structural, semantic,
  authenticity, chain.
- **Chain** — a linked sequence of evidence records; integrity of links is
  evaluated per link, never inferred from a single record.
