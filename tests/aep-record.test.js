// Sample AEP record instantiation + conformance (wasmagent-protocol #138).
//
// The `AepRecord` TypeScript interface in index.d.ts documents the record
// shape; this runtime test validates a conforming sample against the canonical
// `aep-record` schema loaded through the package. Full JSON-Schema validation
// lives in the Python suite + tests/conformance.py; here we assert the sample
// carries every schema-required field and uses an accepted schema_version.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSchema } from '../index.js';

/** Sample record typed against the exported AepRecord interface. */
const sampleAepRecord = /** @type {import('../index.d.ts').AepRecord} */ ({
  schema_version: 'aep/v0.3',
  run_id: 'run-abc123',
  trace_id: 'trace-001',
  runtime_version: 'wasmagent-js@1.20.0',
  created_at_ms: 1737600000000,
  capability_decisions: [
    { capability: 'fs.write', subject: 'agent-1', resource: '/tmp/out.txt', decision: 'allow' },
  ],
  actions: [
    { action_id: 'a1', tool_name: 'write_file', state_changing: true, timestamp_ms: 1737600000100 },
  ],
});

test('sample AEP record satisfies every schema-required field', () => {
  const schema = getSchema('aep-record');
  for (const key of schema.required) {
    assert.ok(key in sampleAepRecord, `sample missing required field: ${key}`);
  }
});

test('sample schema_version is accepted by the aep-record schema', () => {
  const schema = getSchema('aep-record');
  assert.deepEqual(
    schema.properties.schema_version.enum,
    ['aep/v0.1', 'aep/v0.2', 'aep/v0.3'],
  );
  assert.ok(schema.properties.schema_version.enum.includes(sampleAepRecord.schema_version));
});

test('aep-record schema is the canonical wasmagent.dev record', () => {
  const schema = getSchema('aep-record');
  assert.equal(schema.$id, 'https://wasmagent.dev/schemas/aep/aep-record.schema.json');
  assert.equal(schema.title, 'AEPRecord');
});
