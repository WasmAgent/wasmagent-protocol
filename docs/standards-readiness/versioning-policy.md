# Versioning Policy

- The evidence schema carries `schema_version`; minor versions add optional
  fields, major versions may break.
- Consumers must accept every schema version they claim to support and reject
  unknown major versions explicitly.
- Signing profiles are independently versioned (e.g.
  `aep-dsse-ed25519-decoded-body-v1`); a profile pin is part of every
  certified target.
- Certified targets are append-only publications: `supersedes` records
  lineage; published targets are never edited in place.
