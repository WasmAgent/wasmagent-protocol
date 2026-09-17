# Conformance Model

- **Corpus**: fixtures with layered expected outcomes (structural, semantic,
  authenticity, chain, capture), each traceable to a pinned producer commit.
- **Certified target**: an exact four-repo component tuple that passed Gate C,
  published with a manifest naming the tuple (component identity ≠
  publication identity — see conformance/aep/README.md).
- **Layers are independent evidence**: a native-verifier pass says nothing
  about semantic validity; a semantic pass says nothing about authenticity.
  Consumers and external testers report layers separately (see the APS #92
  layered-run framing).
- **Claim ceiling**: reproduction of published behavior for a pinned tuple.
  Absent an external certifying body, the project MUST NOT claim official,
  accredited, third-party, Linux Foundation, OWASP, or industry certification
  or endorsement. "Project-published certified target" remains the controlled
  internal term for the project's own Gate-C-backed publication lifecycle; it
  is not a certification of any kind by an external body.
