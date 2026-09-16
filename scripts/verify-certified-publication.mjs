#!/usr/bin/env node
/**
 * Verify that a certified-target publication is internally consistent
 * (PUB-01..07). See conformance/aep/README.md "Component identity vs
 * publication identity".
 *
 * The component tuple SHA and the publication commit are DIFFERENT
 * identities by design; this tool deliberately does NOT require
 * target.protocol === publication commit (PUB-05 checks that corpus
 * fixtures/manifests are unchanged between them, allowing only
 * publication-only files such as README.md and certified-target.json).
 *
 * Usage:
 *   node scripts/verify-certified-publication.mjs \
 *     --target conformance/aep/certified-target.json \
 *     --publication-ref <tag-or-commit> \
 *     [--allow-extra <path>]... [--protocol-sha <sha>]
 *
 * Exit 0 = consistent; 1 = any check failed; 2 = usage error.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const targetPath = arg('target', 'conformance/aep/certified-target.json');
const publicationRef = arg('publication-ref');
const protocolSha = arg('protocol-sha');
// Optional: verify the anchor against the target manifest AT THE ANCHOR'S OWN
// REF (self-consistency of that generation) instead of the working tree
// (which holds the CURRENT generation and would false-fail historical
// anchors). Required when verifying superseded publication generations.
const targetRef = arg('target-ref');
const extraAllowed = [].concat(
  ...args
    .map((a, i) => (a === '--allow-extra' ? (args[i + 1] ?? '').split(',').filter(Boolean) : [])),
);
const PUBLICATION_ONLY = new Set(['README.md', 'certified-target.json', ...extraAllowed]);

if (targetPath === undefined || publicationRef === undefined) {
  console.error(
    'Usage: node verify-certified-publication.mjs --target <file> --publication-ref <ref> [--allow-extra <path>,...] [--protocol-sha <sha>]',
  );
  process.exit(2);
}

const failures = [];
const check = (id, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`);
  if (!ok) failures.push(id);
};
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

// PUB-01 — the reference target parses: working-tree manifest by default, or
// the manifest AT THE ANCHOR'S OWN REF when --target-ref is given.
let target;
try {
  target = targetRef
    ? JSON.parse(git(['show', `${targetRef}:${targetPath}`]))
    : JSON.parse(readFileSync(targetPath, 'utf8'));
  check('PUB-01', true, `${targetPath} parses${targetRef ? ` @ ${targetRef}` : ''}`);
} catch (error) {
  check('PUB-01', false, `${targetPath} does not parse: ${String(error)}`);
  console.log(`INVALID: ${failures.length} check(s) failed`);
  process.exit(1);
}

// PUB-02 — target_id naming: aep-certified-YYYY-MM-DD-NN
const idOk = /^aep-certified-\d{4}-\d{2}-\d{2}-\d{2}$/.test(String(target.target_id ?? ''));
check('PUB-02', idOk, `target_id=${JSON.stringify(target.target_id ?? null)}`);

// PUB-03 — the publication ref contains a parsing manifest.
let published;
try {
  published = JSON.parse(git(['show', `${publicationRef}:${targetPath}`]));
  check('PUB-03', true, `${publicationRef}:${targetPath} parses`);
} catch (error) {
  check('PUB-03', false, `no parseable ${targetPath} at ${publicationRef}: ${String(error).slice(0, 160)}`);
  console.log(`INVALID: ${failures.length} check(s) failed`);
  process.exit(1);
}

// PUB-04 — the published manifest names the exact component tuple (its OWN
// generation when --target-ref is used).
const tupleKeys = ['protocol', 'js', 'proxy', 'trace'];
for (const key of tupleKeys) {
  check(
    'PUB-04',
    typeof target[key] === 'string' && target[key] === published[key],
    `tuple.${key}: target=${target[key] ?? '<missing>'} published=${published[key] ?? '<missing>'}`,
  );
}

// PUB-05 — between the component protocol SHA and the publication ref, only
// publication-only files may differ (corpus fixtures/manifests are frozen).
const protocolCommit = protocolSha ?? target.protocol;
let corpusClean = false;
let changed = [];
try {
  changed = git(['diff', '--name-only', protocolCommit, publicationRef, '--', 'conformance/aep'])
    .split('\n')
    .filter(Boolean);
  const base = (f) => f.split('/').pop();
  const nonPublication = changed.filter((f) => !PUBLICATION_ONLY.has(base(f)));
  corpusClean = nonPublication.length === 0;
  check('PUB-05', corpusClean, `changed under conformance/aep: ${changed.join(', ') || '(none)'}`);
  if (!corpusClean) {
    check('PUB-05', false, `non-publication-only changes: ${nonPublication.join(', ')}`);
  }
} catch (error) {
  check('PUB-05', false, `git diff failed: ${String(error).slice(0, 160)}`);
}

// PUB-06 — signing profile identical between target and published manifest.
check(
  'PUB-06',
  typeof target.signing_profile_id === 'string' &&
    target.signing_profile_id === published.signing_profile_id,
  `signing_profile_id target=${target.signing_profile_id ?? '<missing>'} published=${published.signing_profile_id ?? '<missing>'}`,
);

// PUB-07 — Gate C run id present.
check(
  'PUB-07',
  typeof target.gate_c_run_id === 'string' && /^\d+$/.test(target.gate_c_run_id),
  `gate_c_run_id=${JSON.stringify(target.gate_c_run_id ?? null)}`,
);

console.log(failures.length === 0 ? `VALID: ${target.target_id} @ ${publicationRef}` : `INVALID: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
