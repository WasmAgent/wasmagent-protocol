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
