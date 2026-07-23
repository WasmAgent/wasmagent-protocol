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
