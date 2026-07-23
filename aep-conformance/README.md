# `aep-conformance/` — AEP record conformance fixture set

A versioned corpus of **valid** and **invalid** `aep-record` instances, published
inside the [`@wasmagent/protocol`](https://www.npmjs.com/package/@wasmagent/protocol)
package so that any Agent Evidence Protocol emitter can self-check:

> _Does my output validate against the canonical record contract?_

This is the consumer-facing counterpart to the repository's internal
[`tests/fixtures/`](../tests/fixtures/) harness. Where `tests/fixtures/` holds one
example per schema to guard the repo itself, `aep-conformance/` is a richer,
deliberately enumerated set covering the distinct constraint regions of
`aep-record`, intended to be pointed at a real emitter's output.

## Layout

| Path | Purpose |
| --- | --- |
| [`manifest.json`](manifest.json) | Machine-readable index of every fixture: path, `valid` flag, description, and (for invalid cases) the `expect_keyword` the violation should trip. |
| `valid/*.json` | Records that **MUST pass** validation against [`schemas/aep/aep-record.schema.json`](../schemas/aep/aep-record.schema.json). |
| `invalid/*.json` | Records that **MUST fail**, each violating exactly one constraint, annotated in the manifest. |

## Coverage

- **Valid** — minimal record, the `aep/v0.1` legacy version, capability decisions +
  actions + verifier results, a full budget ledger + run context, and input/output
  refs with taint labels and redaction profiles.
- **Invalid** — `enum` (schema version, capability decision), `required` (missing
  top-level / action / signature fields), and `type` (numeric field as string)
  violations.

## Using it

Iterate `manifest.json`, load the schema from the package, and validate each
fixture — asserting the opposite result for `valid` vs `invalid`.

### JavaScript / TypeScript

```ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Fixture corpus + manifest ship inside the package under aep-conformance/.
const manifest = JSON.parse(
  readFileSync(require.resolve("@wasmagent/protocol/aep-conformance/manifest.json"), "utf8"),
);

// Resolve the canonical schema and a validator from your toolchain (e.g. ajv).
const require = createRequire(import.meta.url);
const schema = require("@wasmagent/protocol/schemas/aep/aep-record.schema.json");
```

### Python

```python
import json
from importlib import resources
from wasmagent_protocol import get_schema

schema = get_schema("aep-record")          # parsed canonical schema
manifest = json.loads(
    (resources.files("wasmagent_protocol") / "aep_conformance" / "manifest.json")
    .read_text("utf-8")
)
```

> The npm package exposes the corpus via `@wasmagent/protocol/aep-conformance/*`.
> Consumers iterate the manifest rather than hard-coding paths so the set can grow
> additively across versions.
