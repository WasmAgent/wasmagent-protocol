# Interoperability

AEP **complements** and **maps to** adjacent work; it does not claim to
replace or supersede any of them.

| Ecosystem | Relationship |
|---|---|
| OpenTelemetry | AEP evidence **maps to** OTel spans/logs as a verification-oriented projection; OTel remains the transport/observability backbone |
| DSSE / in-toto | AEP **uses** DSSE envelopes; in-toto-style attestations are a natural payload family |
| SPDX / CycloneDX | AEP evidence can reference SBOM attestations where agent provenance matters |
| MCP | AEP records MCP tool-call surfaces (e.g. MCP08 discussions); it neither replaces nor defines MCP |
| OAuth / OIDC / workload identity | Out of scope for AEP; AEP evidence may carry identifiers minted by those systems |

Language discipline: *complements, maps to, uses* — not *replaces, supersedes,
standardizes* — unless formally true.
