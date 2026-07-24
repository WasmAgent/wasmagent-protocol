import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { getSchema, index, schemas } from '../index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
// Consumer-surface guarantee for wasmagent-js (Milestone 1 — single source of
// truth). wasmagent-js must be able to delete its local schema copies —
// packages/compliance/schemas/* and
// packages/core/src/ranking/schemas/rollout-wire.schema.json — and import them
// from @wasmagent/protocol instead. Deleting those copies lives in the
// wasmagent-js repo (tracked via cross-repo note); the in-repo half of the
// contract — that every such schema is registered, declared as a wasmagent-js
// consumer, and reachable through the published package surface — is locked
// down here so the consumer-repo deletion can never silently regress.
const WASMAGENT_JS_SCHEMAS = [
  'rollout-wire',
  'constraint-ir',
  'constraint-violation',
  'repair-trace',
  'task-spec',
  'compliance-eval-record',
];

test('every schema wasmagent-js consumes is registered, declared, and published', () => {
  const byId = new Map(index.schemas.map((s) => [s.id, s]));
  for (const id of WASMAGENT_JS_SCHEMAS) {
    const entry = byId.get(id);
    assert.ok(
      entry,
      `${id} is missing from the registry — wasmagent-js cannot drop its local copy`,
    );
    assert.ok(
      entry.consumers.includes('wasmagent-js'),
      `${id} does not declare wasmagent-js as a consumer`,
    );
    // Programmatic import path: getSchema() must serve the live document.
    assert.equal(getSchema(id).$id, entry.canonical_id, `${id} getSchema $id mismatch`);
    // File import path: the schema file must ship so the ./schemas/* subpath
    // export can serve it to consumers.
    assert.ok(
      existsSync(join(ROOT, entry.path)),
      `${entry.path} is not on disk — the ./schemas/* subpath export cannot serve it`,
    );
  }
});

test("package.json exports the './schemas/*' subpath wasmagent-js imports from", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(
    Object.keys(pkg.exports).includes('./schemas/*'),
    "package.json exports must map './schemas/*' so consumers can import schema files directly",
  );
});
