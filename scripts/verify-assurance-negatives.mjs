/**
 * Assurance-geometry negative regression tests (subset of plan R1–R12).
 *
 * These tests exist to prevent the assurance layer from re-collapsing: each
 * one proves a WRONG model stays rejected by the machine checks.
 *
 *   R1  component SHA must NOT be required/claimed to contain a self-naming
 *       manifest (a record claiming protocol == publication commit fails)
 *   R2  a publication tag resolving to the WRONG commit fails verification
 *   R3  publication metadata cannot alter semantic target identity (tuple
 *       mismatch in the record fails)
 *   R12 external evidence cannot be rendered as certification (a ledger
 *       entry claiming formal_certification=true fails)
 *
 * Run: node --test scripts/test-assurance-geometry.mjs
 * Requires full history + the aep-certified-* tags (fetch-depth 0 + tags in CI).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RECORD = 'conformance/aep/publications/aep-certified-2026-09-13-03.publication.json';
const LEDGER_ENTRY = 'conformance/aep/external-evidence/aps-conformance-suite-pr-94.json';

function runVerifier(recordPath) {
  return execFileSync('node', ['scripts/verify-publication-record.mjs', '--record', recordPath], {
    encoding: 'utf8',
  });
}

// execFileSync puts the exit code on err.status, not in the message.
const failsWithStatus1 = (err) => err.status === 1;

function withDoctoredRecord(mutate, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'aep-geom-'));
  const path = join(dir, 'doctored.publication.json');
  const record = JSON.parse(readFileSync(RECORD, 'utf8'));
  mutate(record);
  writeFileSync(path, JSON.stringify(record, null, 2));
  try {
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('R1: a record claiming protocol == publication commit is INVALID (self-reference forbidden)', () => {
  withDoctoredRecord((record) => {
    record.component_tuple.protocol = record.publication.protected_main_commit;
  }, (path) => {
    assert.throws(() => runVerifier(path), failsWithStatus1, 'self-naming model must stay rejected');
  });
});

test('R3: publication metadata cannot alter the semantic component tuple', () => {
  withDoctoredRecord((record) => {
    record.component_tuple.protocol = '0'.repeat(40);
  }, (path) => {
    assert.throws(() => runVerifier(path), failsWithStatus1, 'tuple mutation must be caught (PC-02)');
  });
});

test('R2: a tag resolving to the wrong commit fails verification (PC-06)', () => {
  // Pick a commit that is definitively NOT the publication anchor.
  const wrongCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const tagName = 'aep-geometry-test-doctored-tag';
  execFileSync('git', ['tag', '-f', tagName, wrongCommit]);
  try {
    withDoctoredRecord((record) => {
      record.publication.tag = tagName;
    }, (path) => {
      assert.throws(() => runVerifier(path), failsWithStatus1, 'wrong-commit tag must be caught');
    });
  } finally {
    execFileSync('git', ['tag', '-d', tagName]);
  }
});

test('positive control: the real publication record verifies cleanly', () => {
  const out = runVerifier(RECORD);
  assert.match(out, /VALID: publication record for aep-certified-2026-09-13-03/);
});

test('R12: an external-evidence entry claiming certification is INVALID', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aep-ledger-'));
  const path = join(dir, 'doctored-evidence.json');
  const entry = JSON.parse(readFileSync(LEDGER_ENTRY, 'utf8'));
  entry.claim_boundary.formal_certification = true;
  writeFileSync(path, JSON.stringify(entry, null, 2));
  try {
    assert.throws(() => {
      execFileSync(
        'node',
        ['scripts/verify-external-evidence.mjs', '--dir', dir, '--target', 'conformance/aep/certified-target.json'],
        { encoding: 'utf8' },
      );
    }, failsWithStatus1, 'certification claims in the ledger must be rejected (EE-04)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
