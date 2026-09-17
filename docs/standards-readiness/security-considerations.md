# Security Considerations

- **Signing keys**: conformance keys are seeded test keys; production evidence
  requires production key management (out of scope for the corpus).
- **Canonicalization**: the certified signing profile is
  `aep-dsse-ed25519-decoded-body-v1` — an Ed25519 signature over the DSSE
  PAE encoding of `PAE(payloadType, decoded serialized in-toto Statement
  bytes)`, with the AEP record bound through the statement/predicate. The
  base64 payload transport encoding itself is not the PAE body. Historical
  inline canonical-JSON Ed25519 constructions are retained only under
  `conformance/aep/historical/` and are not the current signing profile.
- **Unsigned evidence**: `unsigned` (record state) is distinct from `invalid`
  (verification outcome) and from `not-checked` (pipeline state). Consumers
  must not conflate them.
- **Chain gaps**: absent links are counted (`partial`), never interpreted as
  tamper-evidence; a vacuous chain cannot read as `intact`.
- **Capture completeness**: AEP does not self-prove completeness. Deployments
  needing completeness require an independent witness alongside the emitter.
- **Revocation**: Trust Passport revocation state is authoritative in a
  strongly-consistent registry; caches are never authoritative.
