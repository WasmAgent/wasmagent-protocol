import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSchema, index, schemas } from '../index.js';

test('registry lists at least one schema', () => {
  assert.ok(index.schemas.length >= 1);
});

test('getSchema round-trips every registered id with a matching $id', () => {
  for (const entry of index.schemas) {
    const doc = getSchema(entry.id);
    assert.equal(doc.$id, entry.canonical_id, `${entry.id} $id mismatch`);
    assert.ok(doc.title, `${entry.id} missing title`);
  }
});

test('schemas map is keyed by id', () => {
  for (const entry of index.schemas) {
    assert.ok(entry.id in schemas, `${entry.id} missing from schemas map`);
  }
});

test('getSchema throws on unknown id', () => {
  assert.throws(() => getSchema('does-not-exist'), /unknown schema id/);
});

// ---------------------------------------------------------------------------
// AEP conformance kit
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAepConformanceDir, getAepConformanceManifest, aepConformanceSelfCheck, checkSemanticReference } from '../index.js';

test('getAepConformanceDir locates the packaged corpus', () => {
  const dir = getAepConformanceDir();
  assert.ok(existsSync(join(dir, 'manifest.json')));
  assert.ok(existsSync(join(dir, 'certified-target.json')));
});

test('getAepConformanceManifest parses the verdict authority', () => {
  const manifest = getAepConformanceManifest();
  assert.equal(manifest.schema_version, 2);
  assert.equal(manifest.conformance_target.length, 30);
  assert.equal(manifest.signing_profile_id, 'aep-dsse-ed25519-decoded-body-v1');
});

function recordsInFixture(corpusDir, rel) {
  const text = readFileSync(join(corpusDir, rel), 'utf8');
  if (rel.endsWith('.jsonl')) {
    return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  }
  return [JSON.parse(text)];
}

test('checkSemanticReference agrees with the corpus manifest labels', () => {
  const manifest = getAepConformanceManifest();
  for (const entry of manifest.conformance_target) {
    if (entry.semantic !== 'valid' && entry.semantic !== 'invalid') continue;
    const records = recordsInFixture(getAepConformanceDir(), entry.path);
    for (const record of records) {
      const [ok, reason] = checkSemanticReference(record);
      assert.equal(ok, entry.semantic === 'valid', `${entry.path}: ${reason}`);
    }
  }
});

test('aepConformanceSelfCheck passes and states its boundary', () => {
  const { ok, report } = aepConformanceSelfCheck();
  assert.ok(ok, report.join('\n'));
  const joined = report.join('\n');
  assert.match(joined, /30\/30/);
  assert.match(joined, /NOT independent semantic verification/);
  assert.match(joined, /structural layer: not executed/);
});

test('checkSemanticReference floor rules', () => {
  assert.deepEqual(checkSemanticReference({
    run_attribution_backing_floor: 'unknown',
    run_attribution_backing_observed: ['unknown', 'operator_asserted'],
  }), [true, '']);
  assert.equal(checkSemanticReference({
    run_attribution_backing_floor: 'qualified_signature',
    run_attribution_backing_observed: ['unknown'],
  })[0], false);
  assert.equal(checkSemanticReference({ run_attribution_backing_floor: 'unknown' })[0], false);
});
