# Governance — wasmagent-protocol

This repository is the **canonical source of truth** for cross-repository
contracts in the [WasmAgent](https://github.com/WasmAgent) org. Because a change
here can ripple into every consumer repo, it is governed more strictly than a
normal product repo. This document satisfies the "adding a new repository"
requirements in the org
[repository boundary policy](https://github.com/WasmAgent/.github/blob/main/docs/repository-boundaries.md).

## Scope

- **In scope:** JSON Schemas that two or more org repositories must agree on
  (currently AEP evidence records and the compliance/repair contract family).
- **Out of scope:** any schema owned by a single repository, runtime code,
  business logic, product features. If only one repo consumes a schema, it
  belongs in that repo, not here.

A schema is admitted only when there is a demonstrated second consumer.

## Maintainer

- **Primary owner:** WasmAgent core / `@telleroutlook` (org owner).
- Commit access is granted after a sustained track record, per the org's
  general maintainer policy.
- All schema changes require review by an owner (see `CODEOWNERS`).

## Independent publishing value

The schemas are published as two independent, versioned packages:

- npm: `@wasmagent/protocol`
- PyPI: `wasmagent-protocol`

Consumers depend on the package; they never copy schema JSON. This is what
prevents the drift that motivated the repo's creation.

## Versioning policy

- Each schema carries a `version` string (see `schemas/index.json`).
- **Additive, backward-compatible** change (new optional field, loosened
  constraint) → minor package version bump.
- **Breaking** change (removed/renamed field, new `required`, tightened enum) →
  major package version bump **and** a new schema `version` value.
- Breaking changes MUST be announced in the org
  [release ledger](https://github.com/WasmAgent/.github/blob/main/releases/public-release-ledger.yml)
  before the PR merges, so consumers can plan migration.
- Every schema must keep at least one valid and one invalid conformance
  fixture; CI rejects a schema that lacks either.

See [`CONTRACT-CHANGE-PROCESS.md`](CONTRACT-CHANGE-PROCESS.md) for the full
workflow.

## Exit condition

Per org policy, every repository declares what would cause it to be archived or
merged away:

> `wasmagent-protocol` is retired only if the org stops maintaining more than
> one runtime/consumer of these contracts — i.e. if there is no longer a
> cross-repo contract to centralize. In that case its schemas fold back into the
> single surviving consumer. As long as ≥2 repos share these contracts, this
> repo remains the canonical source and is **not** a "fade to community"
> repository — it is core-spine infrastructure.

## Relationship to the RFC registry

Design decisions that change the *shape* of a protocol (not just a field) are
recorded as RFCs in the org
[RFC registry](https://github.com/WasmAgent/.github/blob/main/docs/RFC/README.md),
then realized here. Protocol is sedimented from shipping products, not designed
speculatively.
