// Tests for the cross-repo schema drift gate (index.js helpers + bin CLI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getSchema,
  normalizeSchema,
  canonicalIds,
  schemaIdForCanonical,
  checkFile,
  scan,
  hasDrift,
  isCanonicalSource,
  dependsOnPackage,
  canonicalHost,
} from '../index.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..');
const BIN = join(REPO_ROOT, 'bin', 'cli.js');
const AEP_CANONICAL_ID = 'https://wasmagent.dev/schemas/aep/aep-record.schema.json';

function mkTree() {
  const dir = mkdtempSync(join(tmpdir(), 'wp-drift-'));
  return dir;
}

function writeJSON(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj), 'utf8');
  return file;
}

function vendorAep(dir, obj, { dep = false, name = 'consumer-repo' } = {}) {
  writeJSON(join(dir, 'package.json'), dep
    ? { name, dependencies: { '@wasmagent/protocol': '0.1.6' } }
    : { name });
  return writeJSON(join(dir, 'schemas', 'aep', 'aep-record.schema.json'), obj);
}

// --- normalization --------------------------------------------------------

test('normalizeSchema is key-order independent', () => {
  assert.equal(normalizeSchema('{"b":1,"a":2}'), normalizeSchema('{"a":2,"b":1}'));
});

test('canonicalIds includes registered schemas', () => {
  const ids = canonicalIds();
  assert.ok(ids.has(AEP_CANONICAL_ID));
  assert.ok(ids.size >= 1);
});

test('schemaIdForCanonical round-trips', () => {
  assert.equal(schemaIdForCanonical(AEP_CANONICAL_ID), 'aep-record');
  assert.equal(schemaIdForCanonical('https://nope.invalid/x'), null);
});

// --- checkFile ------------------------------------------------------------

test('checkFile detects a match', () => {
  const dir = mkTree();
  try {
    const f = writeJSON(join(dir, 'aep-record.schema.json'), getSchema('aep-record'));
    const finding = checkFile(f, 'aep-record');
    assert.equal(finding.ok, true);
    assert.equal(finding.code, 'match');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkFile detects drift', () => {
  const dir = mkTree();
  try {
    const drifted = { ...getSchema('aep-record'), title: 'DRIFTED-FORK' };
    const f = writeJSON(join(dir, 'aep-record.schema.json'), drifted);
    const finding = checkFile(f, 'aep-record');
    assert.equal(finding.ok, false);
    assert.equal(finding.code, 'drift');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- scan -----------------------------------------------------------------

test('scan is clean for a consumer that depends and matches', () => {
  const dir = mkTree();
  try {
    vendorAep(dir, getSchema('aep-record'), { dep: true });
    const findings = scan(dir);
    assert.equal(hasDrift(findings), false);
    assert.ok(findings.some((f) => f.code === 'match'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scan flags drift', () => {
  const dir = mkTree();
  try {
    vendorAep(dir, { ...getSchema('aep-record'), description: 'forked' }, { dep: true });
    const findings = scan(dir);
    const codes = findings.filter((f) => !f.ok).map((f) => f.code);
    assert.ok(codes.includes('drift'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scan flags a re-declared canonical id without a package dep', () => {
  const dir = mkTree();
  try {
    vendorAep(dir, getSchema('aep-record'), { dep: false });
    const findings = scan(dir);
    const codes = findings.filter((f) => !f.ok).map((f) => f.code);
    assert.ok(codes.includes('no-package-dep'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scan flags a competing registry', () => {
  const dir = mkTree();
  try {
    vendorAep(dir, getSchema('aep-record'), { dep: true });
    writeJSON(join(dir, 'schemas', 'index.json'), {
      schemas: [{ id: 'aep-record', canonical_id: AEP_CANONICAL_ID }],
    });
    const findings = scan(dir);
    const codes = findings.filter((f) => !f.ok).map((f) => f.code);
    assert.ok(codes.includes('competing-registry'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scan exempts the canonical source repo', () => {
  const dir = mkTree();
  try {
    writeJSON(join(dir, 'package.json'), { name: '@wasmagent/protocol' });
    writeJSON(join(dir, 'schemas', 'aep', 'aep-record.schema.json'), getSchema('aep-record'));
    writeJSON(join(dir, 'schemas', 'index.json'), {
      schemas: [{ id: 'aep-record', canonical_id: AEP_CANONICAL_ID }],
    });
    assert.equal(isCanonicalSource(dir), true);
    const findings = scan(dir);
    assert.equal(hasDrift(findings), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scan ignores non-canonical schemas', () => {
  const dir = mkTree();
  try {
    writeJSON(join(dir, 'package.json'), { name: 'consumer-repo' });
    writeJSON(join(dir, 'schemas', 'private.schema.json'), {
      $id: 'https://example.invalid/private.schema.json',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
    });
    const findings = scan(dir);
    assert.equal(hasDrift(findings), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- bin CLI integration --------------------------------------------------

function runBin(args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

test('bin: self-scan of the canonical repo is green', () => {
  const res = runBin(['check', '--scan', '--root', REPO_ROOT]);
  assert.equal(res.status, 0, `stderr: ${res.stderr}`);
});

test('bin: explicit match exits 0', () => {
  const res = runBin(['check', join(REPO_ROOT, 'schemas', 'aep', 'aep-record.schema.json'), '--id', 'aep-record']);
  assert.equal(res.status, 0, `stderr: ${res.stderr}`);
});

test('bin: explicit drift exits 1', () => {
  const dir = mkTree();
  try {
    const f = writeJSON(join(dir, 'aep-record.schema.json'), { ...getSchema('aep-record'), title: 'DRIFTED' });
    const res = runBin(['check', f, '--id', 'aep-record']);
    assert.equal(res.status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bin: --version prints the version line and exits 0', () => {
  const res = runBin(['--version']);
  assert.equal(res.status, 0, `stderr: ${res.stderr}`);
  assert.match(res.stdout, /drift gate/);
});

test('bin: missing file exits 2 with a clean error, not a stack trace', () => {
  const res = runBin(['check', join(mkTree(), 'nope.schema.json'), '--id', 'aep-record']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /^error:/);
  assert.ok(!res.stderr.includes('    at '), 'must not print a raw stack trace');
});

test('bin: --id without a value exits 2', () => {
  const res = runBin(['check', join(REPO_ROOT, 'schemas', 'aep', 'aep-record.schema.json'), '--id']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /--id requires a value/);
});

// Regression: a consumer repo checked out under a path that itself contains an
// ignored directory name (e.g. .../tests/myrepo) must still be fully scanned.
test('scan still scans when the repo root path contains an ignored dir name', () => {
  const outer = mkTree();
  const dir = join(outer, 'tests', 'my-consumer-repo');
  try {
    vendorAep(dir, getSchema('aep-record'), { dep: true });
    const findings = scan(dir);
    assert.equal(hasDrift(findings), false, findings.map((f) => f.message).join('; '));
    assert.ok(findings.some((f) => f.code === 'match'), 'vendored schema must be found');
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
});
