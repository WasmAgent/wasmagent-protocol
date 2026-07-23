# wasmagent-protocol

> **Canonical source of truth for every cross-repository contract in the
> [WasmAgent](https://github.com/WasmAgent) org.** One public schema → one
> canonical source.

WasmAgent is open infrastructure for _provable_ AI agents. Proving an agent ran
correctly requires that every repository — the runtime, the gateway, the
evidence pipelines, the audit product — speak the **same** evidence and
compliance vocabulary. `wasmagent-protocol` is where that vocabulary is defined,
versioned, and published, so no repository has to keep its own copy.

This repository holds **specifications only**. It contains no business logic,
no runtime, and no product code — only JSON Schemas, conformance fixtures, and
thin loader packages that expose the schemas to JavaScript and Python
consumers.

## Why this repository exists

The Agent Evidence Protocol (AEP) and the compliance schemas were originally
authored inside `wasmagent-js` and independently copied into `trace-pipeline`.
By the time this repository was extracted, those copies had **drifted**: five
shared schemas differed (one had a copy-paste `title` bug, and the same logical
schema carried two conflicting `$id` URLs). Drift in a shared contract silently
breaks cross-repo evidence validation — exactly the failure mode WasmAgent
exists to prevent.

Per the org [repository boundary policy](https://github.com/WasmAgent/.github/blob/main/docs/repository-boundaries.md):
**one public schema has exactly one canonical source.** That source is here.

## What's in scope

Only contracts that genuinely cross a repository boundary:

| Schema | Version | Consumers |
| --- | --- | --- |
| `aep-record` | `aep/v0.2` | wasmagent-js, wasmagent-proxy, trace-pipeline, wasmagent-train-replay, open-agent-audit |
| `constraint-ir` | `compliance/v1` | wasmagent-js, trace-pipeline |
| `constraint-violation` | `compliance/v1` | wasmagent-js, trace-pipeline |
| `repair-trace` | `compliance/v1` | wasmagent-js, trace-pipeline |
| `task-spec` | `compliance/v1` | wasmagent-js, trace-pipeline |
| `compliance-eval-record` | `compliance-eval-record/v1` | wasmagent-js, trace-pipeline |
| `rollout-wire` | `rollout-wire/v1` | wasmagent-js, trace-pipeline |

The machine-readable registry is [`schemas/index.json`](schemas/index.json).

**Out of scope:** schemas owned by a single repository (e.g. trace-pipeline's
`*-training-record` output formats, open-agent-audit's `audit-run`). A schema
belongs here only when two or more repositories must agree on it.

## Consuming the schemas

Downstream repositories **must not** copy schema JSON. Depend on the published
package instead.

### JavaScript / TypeScript

```bash
npm install @wasmagent/protocol
```

```ts
import { schemas, getSchema } from "@wasmagent/protocol";

const aep = getSchema("aep-record"); // parsed JSON Schema object
```

### Python

```bash
pip install wasmagent-protocol
```

```python
from wasmagent_protocol import get_schema, schema_path

aep = get_schema("aep-record")        # parsed dict
path = schema_path("aep-record")      # pathlib.Path to the .json file
```

## Versioning & stability

- Each schema carries a `version` string (see the registry).
- **Additive** changes (new optional field) → minor package bump.
- **Breaking** changes (removed/renamed field, tightened `required`) → major
  package bump **and** a new `version` value, announced in the
  [org release ledger](https://github.com/WasmAgent/.github/blob/main/releases/public-release-ledger.yml)
  before merge.
- Every schema has at least one valid and one invalid conformance fixture under
  [`tests/fixtures/`](tests/fixtures/). CI rejects any schema without both.

See [`docs/CONTRACT-CHANGE-PROCESS.md`](docs/CONTRACT-CHANGE-PROCESS.md) for the
full change workflow and [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md) for
maintainer and exit-condition policy.

## Development

```bash
# validate every schema is well-formed and every fixture conforms
python3 -m pip install jsonschema
python3 tests/conformance.py
```

## Releases

Published to npm and PyPI from CI via OIDC trusted publishing on `v*` tags — no
tokens stored. See [`docs/CONTRACT-CHANGE-PROCESS.md`](docs/CONTRACT-CHANGE-PROCESS.md).

- **0.1.3** — npm OIDC fix: drop setup-node registry-url (empty token was short-circuiting OIDC).
- **0.1.2** — npm OIDC attempt (Node 24); PyPI only.
- **0.1.1** — release-pipeline verification (PyPI); no schema changes.
- **0.1.0** — initial canonical extraction of the AEP + compliance schema family.

## License

[Apache-2.0](LICENSE).
