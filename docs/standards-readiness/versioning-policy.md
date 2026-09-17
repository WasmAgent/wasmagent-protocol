# Versioning Policy

- The evidence schema carries `schema_version`; minor versions add optional
  fields, major versions may break.
- Consumers must accept every schema version they claim to support and reject
  unknown major versions explicitly.
- Signing profiles are independently versioned (e.g.
  `aep-dsse-ed25519-decoded-body-v1`); a profile pin is part of every
  certified target.
- Certified targets are append-only publications: `supersedes` records
  lineage. Certified component tuples, immutable tags, and publication
  identities are not rewritten in place. Metadata-only corrections (e.g. a
  wrong `certified_at` timestamp) are represented explicitly through an
  erratum in `conformance/aep/corrections/` and MUST NOT silently alter
  component identity, publication identity, or signing/verdict fields;
  an erratum is not a recertification.
