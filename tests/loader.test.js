import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  engines,
  getSchema,
  index,
  schemas,
  version,
  versionBand,
} from '../index.js';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
);

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

test('package.json initializes @wasmagent/protocol with a version and runtime band', () => {
  assert.equal(pkg.name, '@wasmagent/protocol');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'package declares a semver version');
  assert.equal(pkg.version, version, 'exported version mirrors package.json');
  assert.equal(
    typeof pkg.engines?.node,
    'string',
    'package declares an engines.node runtime band',
  );
  assert.equal(engines.node, pkg.engines.node, 'exported engines mirrors package.json');
});

test('version band mechanism is declared in package.json and re-exported', () => {
  // The band must match the current version's major.minor line.
  const [major, minor] = pkg.version.split('.');
  assert.ok(pkg.versionBand, 'package.json declares a versionBand mechanism');
  assert.deepEqual(versionBand, pkg.versionBand, 'versionBand is re-exported verbatim');
  assert.equal(versionBand.band, `${major}.${minor}`, 'band tracks the current minor line');
  assert.ok(versionBand.summary, 'versionBand has a summary');
  assert.ok(versionBand.policy, 'versionBand has a policy');

  const recommended = versionBand.supportedRanges.recommended;
  assert.equal(
    typeof recommended,
    'string',
    'versionBand declares a recommended consumer range',
  );
  const bandEsc = versionBand.band.replace('.', '\\.');
  assert.match(
    recommended,
    new RegExp(`^~${bandEsc}\\.\\d+$`),
    'recommended range stays within the declared band',
  );
  assert.ok(
    Array.isArray(versionBand.supportedRanges.alsoAccepted) &&
      versionBand.supportedRanges.alsoAccepted.length > 0,
    'versionBand lists at least one additional accepted range',
  );
});
