#!/usr/bin/env node
/**
 * Verify the AEP EXTERNAL EVIDENCE ledger (EE-01..EE-05).
 *
 * The ledger registers facts about external runs. It NEVER upgrades them:
 *   external run  != certification
 *   external PR   != endorsement (LF, OWASP, or otherwise)
 *
 * EE-04 hard-fails any record whose claim_boundary asserts certification or
 * endorsement. Merging external evidence must NEVER trigger a new certified
 * target (regression R5).
 *
 * Usage:
 *   node scripts/verify-external-evidence.mjs --dir conformance/aep/external-evidence \
 *     [--target conformance/aep/certified-target.json]
 *
 * Exit 0 = consistent; 1 = any check failed; 2 = usage error.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const dir = arg('dir', 'conformance/aep/external-evidence');
const targetPath = arg('target', 'conformance/aep/certified-target.json');

const failures = [];
const check = (id, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`);
  if (!ok) failures.push(id);
};

let target;
try {
  target = JSON.parse(readFileSync(targetPath, 'utf8'));
} catch (error) {
  console.error(`certified target unreadable: ${String(error).slice(0, 160)}`);
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.log(`FAIL EE-00 no ledger entries in ${dir}`);
  process.exit(1);
}

const seenIds = new Set();
for (const file of files) {
  const path = join(dir, file);
  let entry;
  try {
    entry = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    check('EE-01', false, `${file}: does not parse: ${String(error).slice(0, 120)}`);
    continue;
  }
  const label = basename(file);

  // EE-01 — required fields present.
  const required = ['evidence_id', 'target_id', 'source', 'status', 'scope', 'reported_results', 'claim_boundary'];
  const missing = required.filter((k) => entry[k] === undefined);
  check('EE-01', missing.length === 0, `${label} missing=[${missing.join(',') || 'none'}]`);

  // EE-02 — status enum; merged requires merge provenance.
  const status = entry.status;
  const statusOk = status === 'pending_merge' || status === 'merged' || status === 'superseded';
  const mergedOk =
    status !== 'merged' ||
    (typeof entry.merged_in?.merge_commit === 'string' && /^[0-9a-f]{40}$/.test(entry.merged_in.merge_commit));
  check('EE-02', statusOk && mergedOk, `${label} status=${status} merged_provenance=${mergedOk}`);

  // EE-03 — target_id resolves to the actual certified target.
  check('EE-03', entry.target_id === target.target_id, `${label} target_id=${entry.target_id}`);

  // EE-04 — claim boundary is an anti-certification wall: any entry claiming
  // certification/endorsement is invalid by construction.
  const cb = entry.claim_boundary ?? {};
  const boundaryOk =
    cb.external_independent_run === true &&
    cb.formal_certification === false &&
    cb.linux_foundation_endorsement === false &&
    cb.owasp_endorsement === false;
  check('EE-04', boundaryOk, `${label} claim_boundary non-certification invariants`);

  // EE-05 — evidence ids are unique across the ledger.
  const dup = seenIds.has(entry.evidence_id);
  seenIds.add(entry.evidence_id);
  check('EE-05', !dup, `${label} evidence_id=${entry.evidence_id}${dup ? ' (DUPLICATE)' : ''}`);

  // EE-06 — scope booleans present (capture completeness must be explicitly
  // false or absent-as-false, never claimed true by the producer's own
  // signature — see the capture-completeness no-go boundary).
  const scope = entry.scope ?? {};
  if ('capture_completeness' in scope) {
    check('EE-06', scope.capture_completeness === false, `${label} capture_completeness must be false if present`);
  } else {
    check('EE-06', true, `${label} capture_completeness not claimed`);
  }

  // EE-07 — evidence-grade firewall (R13): an INDEPENDENT runner can never
  // be silently upgraded to 'every layer independently implemented'. Any
  // semantic layer graded INDEPENDENT demands an explicit independent_runner
  // reference; the Mode-B vocabulary is the default for lab-authored
  // recomputation.
  const grades = entry.verification_grades ?? null;
  if (grades !== null) {
    const VOCAB = ['INDEPENDENT', 'AUTHOR_PRODUCED_MODE_B', 'OBSERVED', 'NOT_YET_ESTABLISHED'];
    const badVocab = Object.entries(grades)
      .filter(([, v]) => !VOCAB.includes(v))
      .map(([k]) => k);
    check('EE-07a', badVocab.length === 0, `${label} grade vocabulary violations: [${badVocab.join(', ') || 'none'}]`);

    const semanticGrades = Object.entries(grades).filter(([k]) => k.toLowerCase().includes('semantic'));
    const claimsIndependentSemantic = semanticGrades.some(
      ([k, v]) => k !== 'independent_semantic_verification' && v === 'INDEPENDENT',
    );
    const hasRunnerRef = typeof entry.independent_runner === 'object' && entry.independent_runner !== null;
    check(
      'EE-07b',
      !claimsIndependentSemantic || hasRunnerRef,
      `${label} semantic INDEPENDENT grade requires an independent_runner reference`,
    );
  } else {
    check('EE-07', true, `${label} no verification_grades block (grades optional)`);
  }
}

console.log(
  failures.length === 0
    ? `VALID: ${files.length} external evidence entr(y|ies) in ${dir}`
    : `INVALID: ${failures.join(', ')}`,
);
process.exit(failures.length === 0 ? 0 : 1);
