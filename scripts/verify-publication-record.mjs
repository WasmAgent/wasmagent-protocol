#!/usr/bin/env node
/**
 * Verify an AEP certified-target PUBLICATION RECORD (PC-01..PC-07).
 *
 * The publication record is descriptive provenance metadata separating:
 *   component identity  (the Gate-C-exercised tuple — WHAT WAS TESTED)
 *   publication identity (the protected-main revision + immutable tag
 *                         carrying the manifest naming that tuple)
 *
 * It is NOT a certified target, NOT a re-certification, and MUST NOT mutate
 * a frozen component tuple. Critically (PC-05 / regression R1): the model
 * "certified protocol SHA contains a manifest naming itself" is structurally
 * impossible and any record claiming it is INVALID by construction.
 *
 * Usage:
 *   node scripts/verify-publication-record.mjs \
 *     --record conformance/aep/publications/<id>.publication.json
 *
 * Exit 0 = consistent; 1 = any check failed; 2 = usage error.
 * Requires full history + tags (fetch-depth: 0, fetch-tags: true in CI).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const recordPath = arg('record');
const targetPath = arg('target', 'conformance/aep/certified-target.json');

if (recordPath === undefined) {
  console.error(
    'Usage: node verify-publication-record.mjs --record <file> [--target conformance/aep/certified-target.json]',
  );
  process.exit(2);
}

const failures = [];
const check = (id, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`);
  if (!ok) failures.push(id);
};
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

let record;
try {
  record = JSON.parse(readFileSync(recordPath, 'utf8'));
} catch (error) {
  console.error(`record does not parse: ${String(error).slice(0, 200)}`);
  process.exit(1);
}

// The certified-target manifest holds the CURRENT target. A publication
// record for an EARLIER target (superseded) is historical: structural and
// git-anchor checks still apply, but cross-checks against the current
// manifest (PC-01/PC-02) would be meaningless.
let target;
let historical = false;
try {
  target = JSON.parse(readFileSync(targetPath, 'utf8'));
  historical = target.target_id !== record.target_id;
  check(
    'PC-01',
    true,
    historical
      ? `historical record for ${record.target_id} (current target: ${target.target_id}) — cross-checks skipped`
      : `target_id=${record.target_id}`,
  );
} catch (error) {
  check('PC-01', false, `manifest unreadable: ${String(error).slice(0, 160)}`);
  console.log(`INVALID: ${failures.length} check(s) failed`);
  process.exit(1);
}

// PC-02 — publication record tuple equals the certified target tuple:
// publication metadata cannot silently mutate the component tuple.
// (Current-target records only; historical records are checked against their
// own git anchor in PC-03.)
const keys = ['protocol', 'js', 'proxy', 'trace'];
if (historical) {
  check('PC-02', true, 'skipped: historical record (cross-checked via PC-03 git anchor)');
} else {
  for (const key of keys) {
    check(
      'PC-02',
      record.component_tuple?.[key] === target[key],
      `tuple.${key}: record=${record.component_tuple?.[key] ?? '<missing>'} target=${target[key] ?? '<missing>'}`,
    );
  }
}

// PENDING-ANCHOR state: a record created in the same PR that adds the target
// cannot know its own protected-main anchor before merge (self-reference).
// The anchor is resolved in the immediate fast-follow commit; PC-03/04/06 are
// skipped (not failed) while the anchor is pending.
const anchorPending = String(record.publication?.protected_main_commit ?? '').startsWith('PENDING');

if (anchorPending) {
  check('PC-03', true, 'skipped: publication anchor PENDING (resolved in fast-follow commit)');
  check('PC-04', true, 'skipped: anchor pending');
  check('PC-06', true, 'skipped: tag created at anchor resolution');
} else {
// PC-03 — the protected-main publication commit contains a parseable manifest
// naming the record's OWN tuple (works for current AND historical records:
// each anchor names the tuple published at that anchor).
let published;
try {
  published = JSON.parse(
    git(['show', `${record.publication.protected_main_commit}:${record.target_manifest_path}`]),
  );
  const tupleOk = keys.every((k) => published[k] === record.component_tuple[k]);
  check('PC-03', tupleOk, `manifest at ${record.publication.protected_main_commit.slice(0, 10)} names the tuple`);
  if (!tupleOk) check('PC-03', false, 'published manifest tuple mismatch');
} catch (error) {
  check('PC-03', false, `git show failed: ${String(error).slice(0, 160)}`);
}

// PC-04 — source_commit is an ancestor of the protected-main publication
// commit (the manifest-writing commit flowed into the protected anchor).
  try {
    execFileSync('git', [
      'merge-base', '--is-ancestor',
      record.publication.source_commit,
      record.publication.protected_main_commit,
    ]);
    check('PC-04', true, 'source_commit is ancestor of protected_main_commit');
  } catch {
    check('PC-04', false, 'source_commit is NOT an ancestor of protected_main_commit');
  }
}

// PC-05 — regression R1: the SELF-NAMING model must stay invalid. A record
// whose component protocol SHA equals its publication commit means someone
// tried to make a manifest contain the SHA of the commit containing it.
check(
  'PC-05',
  record.component_tuple.protocol !== record.publication.protected_main_commit,
  'component protocol SHA != publication commit (self-reference forbidden by design)',
);

  if (!anchorPending) {
    // PC-06 — the publication tag resolves to the protected-main commit, and
    // the tuple it publishes is the frozen tuple (regression R2).
    try {
      const tagCommit = git(['rev-parse', `${record.publication.tag}^{commit}`]);
      check('PC-06', tagCommit === record.publication.protected_main_commit, `tag -> ${tagCommit.slice(0, 10)}`);
    } catch (error) {
      check('PC-06', false, `tag not resolvable: ${String(error).slice(0, 120)}`);
    }
  } else {
    check('PC-06', true, 'skipped: anchor pending');
  }

// PC-07 — gate provenance present and passing.
check(
  'PC-07',
  record.gate?.verdict === 'pass' && /^\d+$/.test(String(record.gate?.run_id ?? '')),
  `gate=${record.gate?.name ?? '<missing>'} run=${record.gate?.run_id ?? '<missing>'} verdict=${record.gate?.verdict ?? '<missing>'}`,
);

console.log(
  failures.length === 0
    ? `VALID: publication record for ${record.target_id}`
    : `INVALID: ${failures.join(', ')}`,
);
process.exit(failures.length === 0 ? 0 : 1);
