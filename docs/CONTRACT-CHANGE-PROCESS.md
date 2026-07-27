# Contract change process

How to change a schema in `wasmagent-protocol` without breaking downstream
repositories. This process exists because these schemas are consumed by
multiple repos; an unreviewed change here is a cross-repo outage.

## 1. Classify the change

| Change | Class | Package bump | New schema `version`? |
| --- | --- | --- | --- |
| Add optional field | additive | minor | no |
| Loosen a constraint (widen enum, drop `required`) | additive | minor | no |
| Add a new schema | additive | minor | n/a (new entry) |
| Remove or rename a field | **breaking** | major | **yes** |
| Add a `required` field | **breaking** | major | **yes** |
| Tighten a constraint (narrow enum, stricter pattern) | **breaking** | major | **yes** |

If unsure, treat it as breaking.

## 2. Edit and prove

1. Edit the schema under `schemas/`.
2. Update `schemas/index.json` (bump `version` if breaking; update `stability`).
3. Add or update fixtures under `tests/fixtures/valid/<id>/` and
   `tests/fixtures/invalid/<id>/` so the new behavior is pinned by an example.
4. Run the harness locally:
   ```bash
   python3 -m pip install jsonschema referencing
   python3 tests/conformance.py
   node --test
   ```

## 3. For breaking changes only

1. Open (or update) an RFC in the org
   [RFC registry](https://github.com/WasmAgent/.github/blob/main/docs/RFC/README.md)
   describing the shape change and migration.
2. Announce it in the org
   [release ledger](https://github.com/WasmAgent/.github/blob/main/releases/public-release-ledger.yml)
   **before** merge.
3. File a tracking issue in each consumer repo listed in the schema's
   `consumers` array (`schemas/index.json`) so they can bump their dependency
   and adapt.

## 4. Merge and publish

1. PR requires an owner review (`CODEOWNERS`) and green CI.
2. On merge to `main`, tag and publish the npm and PyPI packages with the new
   version.
3. Consumers update their dependency at their own pace for additive changes, or
   by the migration deadline for breaking changes.

## The one rule that matters

**No consumer repo keeps a local copy of a schema in this repo.** If you find a
copied schema JSON in a consumer repo, that is a bug: delete it and depend on
the package. Drift between copies is exactly the failure this repo prevents.

## Enforcing it in CI: the schema-drift gate

The one rule is now machine-enforced, not just documented. This repo ships a
reusable drift gate that any consumer can wire into CI so a forked schema fails
to merge automatically.

- **CLI** — `@wasmagent/protocol` (npm) and `wasmagent-protocol` (PyPI) both
  expose `wasmagent-protocol check`:

  ```bash
  # compare one vendored file against the pinned canonical version
  wasmagent-protocol check path/to/aep-record.schema.json --id aep-record

  # scan the whole repo for drift, re-declared canonical $ids with no package
  # dependency, and competing schemas/index.json registries
  wasmagent-protocol check --scan --root .
  ```

  It exits non-zero on any drift or violation, so it drops straight into CI.
  `wasmagent-protocol` auto-detects when it is running inside this repo (the
  canonical source) and relaxes the source-only checks there.

- **Reusable workflow** — `.github/workflows/schema-drift.yml` is a
  `workflow_call` gate consumer repos invoke with one line:

  ```yaml
  jobs:
    schema-drift:
      uses: WasmAgent/wasmagent-protocol/.github/workflows/schema-drift.yml@v0.1.6
  ```

  It installs the pinned package and runs the scan. A PR that forks or drifts a
  canonical schema, re-declares a canonical `$id` without depending on the
  package, or ships a competing `schemas/index.json` fails CI.

Consumer repos that vendor a canonical schema should instead delete the copy and
`npm install @wasmagent/protocol` / `pip install wasmagent-protocol`. See
[README.md](../README.md) for consumption.
