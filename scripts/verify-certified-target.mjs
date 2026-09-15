#!/usr/bin/env node
/**
 * Verify an AEP certified-target manifest AND enforce the certified-target
 * trigger policy (CT-01..CT-07).
 *
 * Trigger policy (docs/aep-assurance-language.md, "Certified-target
 * lifecycle trigger policy"):
 *   - a NEW certified target requires at least one allowed
 *     `certification_reason` (semantic/runtime changes only) and a
 *     `supersedes` reference;
 *   - forbidden reasons (latest-main, docs-refresh, external-run-merged,
 *     README-update) are invalid BY CONSTRUCTION — documentation-only,
 *     external-evidence, and publication-index movement must never produce
 *     a new certified target (regressions R4 / R5);
 *   - the currently published target is grandfathered without reasons (the
 *     -03 manifest predates the policy field).
 *
 * Usage:
 *   node scripts/verify-certified-target.mjs \
 *     --target conformance/aep/certified-target.json \
 *     [--publication conformance/aep/publications/aep-certified-2026-09-13-03.publication.json]
 *
 * Exit 0 = valid; 1 = any check failed; 2 = usage error.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const targetPath = arg('target', 'conformance/aep/certified-target.json');
const publicationPath = arg('publication');

const ALLOWED_REASONS = new Set([
  'schema-change',
  'semantic-rule-change',
  'verifier-contract-change',
  'signing-profile-change',
  'chain-semantics-change',
  'corpus-change',
  'security-repair',
]);
const FORBIDDEN_REASONS = new Set([
  'latest-main',
  'docs-refresh',
  'external-run-merged',
  'README-update',
]);

const failures = [];
const check = (id, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`);
  if (!ok) failures.push(id);
};

let target;
try {
  target = JSON.parse(readFileSync(targetPath, 'utf8'));
} catch (error) {
  console.error(`manifest unreadable: ${String(error).slice(0, 200)}`);
  process.exit(1);
}

// CT-01 — required fields.
const required = ['target_id', 'certified_at', 'gate_c_run_id', 'protocol', 'js', 'proxy', 'trace', 'signing_profile_id', 'verdict'];
const missing = required.filter((k) => target[k] === undefined);
check('CT-01', missing.length === 0, `missing=[${missing.join(',') || 'none'}]`);

// CT-02 — id format.
check('CT-02', /^aep-certified-\d{4}-\d{2}-\d{2}-\d{2}$/.test(String(target.target_id ?? '')), `target_id=${target.target_id ?? '<missing>'}`);

// CT-03 — exact 40-hex component tuple.
const keys = ['protocol', 'js', 'proxy', 'trace'];
const tupleOk = keys.every((k) => typeof target[k] === 'string' && /^[0-9a-f]{40}$/.test(target[k]));
check('CT-03', tupleOk, 'component tuple: 4 exact-SHA entries');

// CT-04 — gate provenance.
check('CT-04', /^\d+$/.test(String(target.gate_c_run_id ?? '')) && target.verdict === 'pass', `gate run=${target.gate_c_run_id} verdict=${target.verdict}`);

// CT-05 — signing profile.
check('CT-05', typeof target.signing_profile_id === 'string' && target.signing_profile_id.length > 0, `signing_profile_id=${target.signing_profile_id ?? '<missing>'}`);

// CT-06 — trigger policy. A NEW target (differs from the currently published
// one) MUST declare allowed semantic/runtime reasons and what it supersedes.
let publishedId = null;
if (publicationPath) {
  try {
    publishedId = JSON.parse(readFileSync(publicationPath, 'utf8')).target_id ?? null;
  } catch {
    publishedId = null;
  }
}
const isNew = publishedId !== null && target.target_id !== publishedId;
const reasons = Array.isArray(target.certification_reason) ? target.certification_reason : null;

if (!isNew) {
  check('CT-06', true, `published target ${target.target_id} — trigger policy not applicable (grandfathered)`);
} else {
  const reasonsOk =
    reasons !== null &&
    reasons.length > 0 &&
    reasons.every((r) => ALLOWED_REASONS.has(r));
  check('CT-06', reasonsOk, `new target requires allowed certification_reason (got ${JSON.stringify(target.certification_reason ?? null)})`);
  const forbiddenFound = (reasons ?? []).filter((r) => FORBIDDEN_REASONS.has(r));
  check('CT-06b', forbiddenFound.length === 0, `forbidden reasons present: [${forbiddenFound.join(', ') || 'none'}]`);
  check('CT-06c', typeof target.supersedes === 'string' && /^aep-certified-\d{4}-\d{2}-\d{2}-\d{2}$/.test(target.supersedes), `supersedes=${target.supersedes ?? '<missing>'}`);
}

// Forbidden reasons are invalid on ANY manifest, old or new.
const forbiddenAnywhere = (reasons ?? []).filter((r) => FORBIDDEN_REASONS.has(r));
check('CT-07', forbiddenAnywhere.length === 0, `forbidden reasons on manifest: [${forbiddenAnywhere.join(', ') || 'none'}]`);

// CT-08 — the manifest names the tuple that Gate C certified: the working
// tree must not have drifted from the publication record's frozen tuple
// (light check; full anchor verification lives in the PUB/PC verifiers).
if (publicationPath) {
  try {
    const record = JSON.parse(readFileSync(publicationPath, 'utf8'));
    const drift = keys.filter((k) => record.component_tuple?.[k] !== target[k]);
    check('CT-08', drift.length === 0, `tuple drift vs publication record: [${drift.join(', ') || 'none'}]`);
  } catch (error) {
    check('CT-08', false, `publication record unreadable: ${String(error).slice(0, 120)}`);
  }
}

console.log(
  failures.length === 0
    ? `VALID: certified target ${target.target_id}`
    : `INVALID: ${failures.join(', ')}`,
);
process.exit(failures.length === 0 ? 0 : 1);
