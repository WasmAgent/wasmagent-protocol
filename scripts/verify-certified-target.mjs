#!/usr/bin/env node
/**
 * Verify an AEP certified-target manifest AND enforce the LINEAGE-AWARE
 * certified-target trigger policy (CT-01..CT-08, CT-LINEAGE-01..05).
 *
 * Newness is determined relative to the IMMEDIATE PREDECESSOR publication
 * record (--previous-publication), never the target's own record
 * (CT-LINEAGE-01: same-ID self-record cannot bypass reason enforcement).
 *
 * Trigger policy:
 *   - a NEW generation requires an ALLOWED certification_reason and a
 *     supersedes reference naming the immediate predecessor;
 *   - forbidden reasons (latest-main, docs-refresh, external-run-merged,
 *     README-update) are invalid BY CONSTRUCTION;
 *   - the predecessor publication must exist and be resolved.
 *
 * Usage:
 *   node scripts/verify-certified-target.mjs \
 *     --target conformance/aep/certified-target.json \
 *     [--previous-publication conformance/aep/publications/<prev>.publication.json] \
 *     [--historical]
 *
 * --historical verifies a pre-policy target at structural + provenance level
 * only (grandfathered): CT-01..CT-07 always apply, CT-08 applies when a Gate C
 * provenance record exists for the target's run, and the lifecycle
 * trigger-policy checks (CT-LINEAGE-02..05, CT-06) are skipped entirely.
 *
 * Exit 0 = valid; 1 = any check failed; 2 = usage error.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const targetPath = arg('target', 'conformance/aep/certified-target.json');
const previousPublicationPath = arg('previous-publication');
// --historical: the target predates the trigger policy (grandfathered).
// Structural checks (CT-01..CT-07) and provenance integrity (CT-08, when a
// provenance record exists for the run) still apply; ALL lifecycle
// trigger-policy requirements (CT-LINEAGE-02..05, CT-06) are skipped.
const historicalMode = args.includes('--historical');

const ALLOWED_REASONS = new Set([
  'schema-change', 'semantic-rule-change', 'verifier-contract-change',
  'signing-profile-change', 'chain-semantics-change', 'corpus-change', 'security-repair',
]);
const FORBIDDEN_REASONS = new Set([
  'latest-main', 'docs-refresh', 'external-run-merged', 'README-update',
]);

const failures = [];
const check = (id, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`);
  if (!ok) failures.push(id);
};

function git(args2) {
  try {
    return execFileSync('git', args2, { encoding: 'utf8' }).trim();
  } catch (error) {
    throw new Error(`git ${args2.join(' ')}: ${String(error.stderr || error.message || '').slice(0, 160)}`);
  }
}

// ── Load manifest ────────────────────────────────────────────────────────────
let target;
try {
  target = JSON.parse(readFileSync(targetPath, 'utf8'));
} catch (error) {
  console.error(`manifest unreadable: ${String(error).slice(0, 200)}`);
  process.exit(1);
}

// ── Load predecessor publication record (optional) ───────────────────────────
let previous = null;
if (previousPublicationPath !== undefined) {
  try {
    previous = JSON.parse(readFileSync(previousPublicationPath, 'utf8'));
  } catch (e) {
    console.error(`predecessor publication unreadable: ${String(e).slice(0, 200)}`);
    process.exit(1);
  }
}

const reasons = Array.isArray(target.certification_reason) ? target.certification_reason : null;
const claimsNewGeneration = typeof target.supersedes === 'string';

// ── CT-01..CT-05 — structural checks ────────────────────────────────────────
const required = ['target_id', 'certified_at', 'gate_c_run_id', 'protocol', 'js', 'proxy', 'trace', 'signing_profile_id', 'verdict'];
const missing = required.filter((k) => target[k] === undefined);
check('CT-01', missing.length === 0, `missing=[${missing.join(',') || 'none'}]`);

check('CT-02', /^aep-certified-\d{4}-\d{2}-\d{2}-\d{2}$/.test(String(target.target_id ?? '')),
  `target_id=${target.target_id ?? '<missing>'}`);

const tupleKeys = ['protocol', 'js', 'proxy', 'trace'];
const tupleOk = tupleKeys.every((k) => typeof target[k] === 'string' && /^[0-9a-f]{40}$/.test(target[k]));
check('CT-03', tupleOk, 'component tuple: 4 exact-SHA entries');

check('CT-04', /^\d+$/.test(String(target.gate_c_run_id ?? '')) && target.verdict === 'pass',
  `gate run=${target.gate_c_run_id} verdict=${target.verdict}`);

check('CT-05', typeof target.signing_profile_id === 'string' && target.signing_profile_id.length > 0,
  `signing_profile_id=${target.signing_profile_id ?? '<missing>'}`);

// ── CT-LINEAGE-01..05 — lineage-aware trigger policy ────────────────────────
// CT-LINEAGE-01: a same-ID "predecessor" is a self-record bypass attempt.
if (previous !== null && previous.target_id === target.target_id && claimsNewGeneration) {
  check('CT-LINEAGE-01', false, 'same-ID self-record cannot bypass reason enforcement');
} else {
  check('CT-LINEAGE-01', true, 'no self-record bypass');
}

// CT-LINEAGE-02: forbidden reasons on a new generation fail.
// In historical mode the entire lifecycle trigger policy (CT-LINEAGE-02..05,
// CT-06) is skipped: a grandfathered pre-policy manifest carries no
// certification_reason and must not be judged by rules that postdate it.
if (historicalMode) {
  check('CT-LINEAGE-02', true, 'historical mode — lifecycle trigger-policy skipped (grandfathered)');
} else if (claimsNewGeneration) {
  const forbiddenFound = (reasons ?? []).filter((r) => FORBIDDEN_REASONS.has(r));
  check('CT-LINEAGE-02', forbiddenFound.length === 0,
    `forbidden reasons: [${forbiddenFound.join(', ') || 'none'}]`);
} else {
  check('CT-LINEAGE-02', true, 'not a new generation');
}

// CT-LINEAGE-03: allowed reason + exact immediate predecessor + resolved
// predecessor publication => PASS.
if (historicalMode) {
  check('CT-LINEAGE-03', true, 'historical mode — lifecycle trigger-policy skipped (grandfathered)');
  check('CT-LINEAGE-04', true, 'historical mode — lifecycle trigger-policy skipped (grandfathered)');
  check('CT-LINEAGE-05', true, 'historical mode — lifecycle trigger-policy skipped (grandfathered)');
} else if (claimsNewGeneration) {
  const reasonsOk = reasons !== null && reasons.length > 0 && reasons.every((r) => ALLOWED_REASONS.has(r));
  check('CT-LINEAGE-03', reasonsOk,
    `certification_reason=${JSON.stringify(target.certification_reason ?? null)}`);
  const supersedesKnown = previous !== null && previous.target_id === target.supersedes;
  check('CT-LINEAGE-04', supersedesKnown,
    `supersedes=${target.supersedes ?? '<missing>'} vs predecessor ${previous?.target_id ?? '<none>'}`);
  const prevPending = String(previous?.publication?.protected_main_commit ?? '').startsWith('PENDING');
  check('CT-LINEAGE-05', previous !== null && !prevPending, 'predecessor publication resolved');
} else {
  check('CT-LINEAGE-03', true, 'not a new generation');
  check('CT-LINEAGE-04', true, 'not a new generation');
  check('CT-LINEAGE-05', true, 'not a new generation');
}

// ── CT-06 — same-generation: trigger policy not applicable ──────────────────
if (historicalMode) {
  check('CT-06', true, 'historical mode — lifecycle trigger-policy skipped (grandfathered)');
} else if (!claimsNewGeneration) {
  check('CT-06', true, `target ${target.target_id} — not a new generation`);
} else {
  const reasonsOk = reasons !== null && reasons.length > 0 && reasons.every((r) => ALLOWED_REASONS.has(r));
  check('CT-06', reasonsOk, 'new generation requires allowed certification_reason');
}

// ── CT-07 — forbidden reasons are invalid on ANY manifest ───────────────────
const forbiddenAnywhere = (reasons ?? []).filter((r) => FORBIDDEN_REASONS.has(r));
check('CT-07', forbiddenAnywhere.length === 0,
  `forbidden reasons: [${forbiddenAnywhere.join(', ') || 'none'}]`);

// ── CT-08 — tuple coherence with Gate C provenance ──────────────────────────
// The manifest must name the tuple that ITS OWN Gate C run certified.
{
  let gateTuple = null;
  try {
    const gateDir = 'conformance/aep/gate-provenance';
    for (const f of readdirSync(gateDir)) {
      if (!f.endsWith('.json')) continue;
      const gp = JSON.parse(readFileSync(join(gateDir, f), 'utf8'));
      if (String(gp.gate_c_run_id) === String(target.gate_c_run_id)) {
        gateTuple = gp.component_tuple ?? null;
        break;
      }
    }
  } catch { /* dir absent */ }
  if (gateTuple === null) {
    if (historicalMode) {
      check('CT-08', true,
        `historical mode — no persisted Gate C provenance for run ${target.gate_c_run_id} (pre-provenance era, grandfathered)`);
    } else {
      check('CT-08', false, `no persisted Gate C provenance for run ${target.gate_c_run_id}`);
    }
  } else {
    const drift = tupleKeys.filter((k) => gateTuple[k] !== target[k]);
    check('CT-08', drift.length === 0,
      `tuple drift vs Gate C provenance: [${drift.join(', ') || 'none'}]`);
  }
}

console.log(
  failures.length === 0
    ? `VALID: certified target ${target.target_id}`
    : `INVALID: ${failures.join(', ')}`,
);
process.exit(failures.length === 0 ? 0 : 1);
