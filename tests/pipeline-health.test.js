// Acceptance test for the pipeline-health schema family (issue #149).
//
// The milestone bullet asks for four things: end-to-end latency tracking,
// per-stage success rates, alerting on validation failures / backlog buildup,
// and automated canary testing of schema evolution from wasmagent-protocol
// updates. This test asserts the registered schemas jointly cover all four
// concerns and that the composed health fixture wires them together. Fixture
// validity against the JSON Schemas is already enforced by
// tests/conformance.py; this is the JS-side structural acceptance gate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getSchema, index, schemas, canonicalIds } from '../index.js';

const here = dirname(fileURLToPath(import.meta.url));
const IDS = ['pipeline-health-record', 'sla-metrics', 'backlog-status'];

function fixture(...parts) {
  return JSON.parse(readFileSync(join(here, 'fixtures', ...parts), 'utf8'));
}

/** Every $ref string appearing anywhere in a schema document. */
function collectRefs(node, out = []) {
  if (Array.isArray(node)) {
    for (const v of node) collectRefs(v, out);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') out.push(v);
      else collectRefs(v, out);
    }
  }
  return out;
}

// --- registration ---------------------------------------------------------

test('all three pipeline schemas are registered and loadable', () => {
  const registered = new Set(index.schemas.map((s) => s.id));
  for (const id of IDS) {
    assert.ok(registered.has(id), `${id} missing from schemas/index.json`);
    assert.ok(id in schemas, `${id} not loadable via the schemas map`);
  }
});

test('each pipeline schema has a canonical $id under the pipeline family', () => {
  const canonical = canonicalIds();
  const expected = {
    'pipeline-health-record': 'https://wasmagent.dev/schemas/pipeline/pipeline-health-record.schema.json',
    'sla-metrics': 'https://wasmagent.dev/schemas/pipeline/sla-metrics.schema.json',
    'backlog-status': 'https://wasmagent.dev/schemas/pipeline/backlog-status.schema.json',
  };
  for (const [id, cid] of Object.entries(expected)) {
    assert.equal(getSchema(id).$id, cid, `${id} $id mismatch`);
    assert.ok(canonical.has(cid), `${cid} not in canonicalIds()`);
  }
});

// --- concern 1 + 2: latency + per-stage success rates --------------------

test('sla-metrics captures end-to-end latency and per-stage success rates', () => {
  const sla = getSchema('sla-metrics');
  const props = sla.properties;
  assert.ok(props.end_to_end_latency_ms, 'sla-metrics must track end-to-end latency');
  assert.equal(
    props.end_to_end_latency_ms.$ref,
    '#/$defs/LatencyHistogram',
    'end-to-end latency must be a histogram with percentiles',
  );
  assert.ok(props.per_stage, 'sla-metrics must carry a per_stage breakdown');
  const stageProps = props.per_stage.items.properties;
  assert.ok(stageProps.success_rate, 'per_stage items must carry success_rate');
  assert.equal(stageProps.success_rate.minimum, 0);
  assert.equal(stageProps.success_rate.maximum, 1);
});

// --- concern 3: alerting on validation failures + backlog buildup --------

test('pipeline-health-record alerts on validation failures and backlog buildup', () => {
  const health = getSchema('pipeline-health-record');
  const alertKinds = health.properties.alerts.items.properties.kind.enum;
  assert.ok(alertKinds.includes('validation_failure'), 'alerts must include validation_failure');
  assert.ok(alertKinds.includes('backlog_buildup'), 'alerts must include backlog_buildup');

  // backlog-status feeds the backlog_buildup alert via a breach flag.
  const backlog = getSchema('backlog-status');
  assert.ok(
    'breaches_threshold' in backlog.properties,
    'backlog-status must expose breaches_threshold',
  );

  // And the health record composes both sub-schemas by reference.
  const refs = collectRefs(health);
  assert.ok(
    refs.includes('sla-metrics.schema.json'),
    'health record must $ref sla-metrics',
  );
  assert.ok(
    refs.includes('backlog-status.schema.json'),
    'health record must $ref backlog-status',
  );
});

// --- concern 4: automated canary testing of schema evolution -------------

test('pipeline-health-record carries a schema-evolution canary result', () => {
  const health = getSchema('pipeline-health-record');
  assert.ok(health.properties.canary, 'health record must carry a canary block');
  const canaryProps = health.properties.canary.properties;
  assert.ok(
    canaryProps.protocol_version,
    'canary must name the protocol version under test',
  );
  assert.deepEqual([...canaryProps.status.enum].sort(), ['fail', 'pass', 'skipped']);
  assert.ok(canaryProps.failures, 'canary must be able to report per-fixture failures');
});

// --- composition: the valid fixture ties all three together --------------

test('the valid pipeline-health fixture composes all three schemas coherently', () => {
  const health = fixture('valid', 'pipeline-health-record', 'example.json');
  assert.equal(health.schema_version, 'pipeline-health-record/v1');
  assert.equal(health.sla.schema_version, 'sla-metrics/v1');
  assert.ok(health.sla.end_to_end_latency_ms, 'composed fixture carries end-to-end latency');
  assert.ok(health.sla.per_stage.length >= 1, 'composed fixture carries per-stage metrics');
  assert.ok(
    health.sla.per_stage.every((s) => typeof s.success_rate === 'number'),
    'every per-stage entry carries a numeric success_rate',
  );
  assert.equal(health.backlogs[0].schema_version, 'backlog-status/v1');
  assert.ok(health.alerts.some((a) => a.kind === 'validation_failure'));
  assert.equal(typeof health.canary.protocol_version, 'string');
  assert.ok(['pass', 'fail', 'skipped'].includes(health.canary.status));
});
