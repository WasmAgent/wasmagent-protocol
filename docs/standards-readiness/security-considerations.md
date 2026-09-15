# Security Considerations

- **Signing keys**: conformance keys are seeded test keys; production evidence
  requires production key management (out of scope for the corpus).
- **Canonicalization**: signatures bind canonical JSON; any non-canonical
  serialization in a consumer is an implementation defect, not a spec option.
- **Unsigned evidence**: `unsigned` (record state) is distinct from `invalid`
  (verification outcome) and from `not-checked` (pipeline state). Consumers
  must not conflate them.
- **Chain gaps**: absent links are counted (`partial`), never interpreted as
  tamper-evidence; a vacuous chain cannot read as `intact`.
- **Capture completeness**: AEP does not self-prove completeness. Deployments
  needing completeness require an independent witness alongside the emitter.
- **Revocation**: Trust Passport revocation state is authoritative in a
  strongly-consistent registry; caches are never authoritative.
