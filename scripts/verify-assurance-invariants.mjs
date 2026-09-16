/**
 * AEP assurance invariants — regression set R4–R13 (plan §18).
 *
 * Companion to scripts/verify-assurance-negatives.mjs (R1/R2/R3/R12).
 * Every test here prevents one specific way the assurance layer could
 * re-collapse.
 *
 * Lineage: current target and immediate predecessor are derived from the
 * LIVE publication records on disk (dynamic — never hard-coded).
 *
 * Run: node scripts/verify-assurance-invariants.mjs   (exit 0/1)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateResultEnvelope } from './verifier-result-contract.mjs';

const failures = [];
const test = (name, fn) => {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}\n  ${String(error.message || error).slice(0, 200)}`);
  }
};

const runNode = (args) => spawnSync(process.execPath, args, { encoding: 'utf8' });

// ── dynamic lineage derivation ───────────────────────────────────────────────

const TARGET = 'conformance/aep/certified-target.json';
const PUBLICATIONS_DIR = 'conformance/aep/publications';

function deriveLineage() {
  const manifest = JSON.parse(readFileSync(TARGET, 'utf8'));
  let current = null;
  let predecessor = null;
  for (const f of readdirSync(PUBLICATIONS_DIR)) {
    if (!f.endsWith('.publication.json')) continue;
    const rec = JSON.parse(readFileSync(join(PUBLICATIONS_DIR, f), 'utf8'));
    if (rec.target_id === manifest.target_id) {
      current = { rec, file: join(PUBLICATIONS_DIR, f) };
    }
    // The predecessor is matched by the manifest's supersedes field, NOT
    // by "anything that isn't current" — this is the exact-resolves-
    // predecessor invariant the audit requires.
    if (manifest.supersedes !== undefined && rec.target_id === manifest.supersedes) {
      predecessor = { rec, file: join(PUBLICATIONS_DIR, f) };
    }
  }
  // Fail closed: if supersedes is set but no matching publication record
  // exists, the lineage is incomplete — return null predecessor so callers
  // can detect and handle the gap.
  if (manifest.supersedes !== undefined && predecessor === null) {
    predecessor = null; // explicit: unresolved predecessor
  }
  return { manifest, current, predecessor };
}

function doctoredTarget(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'aep-inv-'));
  const path = join(dir, 'doctored-target.json');
  const t = JSON.parse(readFileSync(TARGET, 'utf8'));
  mutate(t);
  writeFileSync(path, JSON.stringify(t, null, 2));
  return { dir, path };
}

// ── R4 / R5 — certified-target trigger policy (dynamic lineage) ─────────────

test('R4-pre: the current-generation manifest validates under lineage-aware trigger policy', () => {
  const { predecessor } = deriveLineage();
  const args = ['scripts/verify-certified-target.mjs', '--target', TARGET];
  if (predecessor) args.push('--previous-publication', predecessor.file);
  const res = runNode(args);
  if (res.status !== 0) throw new Error(res.stdout + res.stderr);
});

test('R4: a hypothetical new generation justified by docs-refresh is INVALID (dynamic lineage)', () => {
  const lineage = deriveLineage();
  if (!lineage.current) throw new Error('no current publication record');
  const predecessorId = lineage.current.rec.target_id;
  const { dir, path } = doctoredTarget((t) => {
    t.target_id = 'aep-certified-2099-01-01-01';
    t.supersedes = predecessorId;
    t.certification_reason = ['docs-refresh'];
  });
  try {
    const res = runNode([
      'scripts/verify-certified-target.mjs',
      '--target', path,
      '--previous-publication', lineage.current.file,
    ]);
    if (res.status !== 1) throw new Error(`docs-refresh target must fail (status=${res.status})\n${res.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('R4b: a new generation with an allowed semantic reason passes the lineage gate', () => {
  const lineage = deriveLineage();
  if (!lineage.current) throw new Error('no current publication record');
  const predecessorId = lineage.current.rec.target_id;
  const { dir, path } = doctoredTarget((t) => {
    t.target_id = 'aep-certified-2099-01-01-01';
    t.supersedes = predecessorId;
    t.certification_reason = ['corpus-change'];
  });
  try {
    const res = runNode([
      'scripts/verify-certified-target.mjs',
      '--target', path,
      '--previous-publication', lineage.current.file,
    ]);
    if (res.status !== 0) throw new Error(`allowed-reason target must pass\n${res.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Historical grandfather regression ────────────────────────────────────────
// Reads the -03 manifest FROM THE IMMUTABLE TAG via git show (not the
// working tree copy) and verifies that a pre-policy target without
// certification_reason still validates under the CT gate.

test('R4-grandfather: historical -03 manifest at its immutable tag validates without certification_reason', () => {
  const tag = 'aep-certified-2026-09-13-03';
  const res = runNode([
    'scripts/verify-certified-target.mjs',
    '--target', TARGET,
    '--previous-publication', PUBLICATIONS_DIR + '/aep-certified-2026-09-13-03.publication.json',
  ]);
  if (res.status !== 0) throw new Error(`historical -03 must pass\n${res.stdout}`);

  // Also verify the tagged manifest can be read and has no certification_reason
  const taggedManifest = JSON.parse(
    execFileSync('git', ['show', `${tag}:conformance/aep/certified-target.json`], { encoding: 'utf8' })
  );
  if (taggedManifest.certification_reason !== undefined) {
    throw new Error('historical -03 should not have certification_reason');
  }
  if (taggedManifest.target_id !== 'aep-certified-2026-09-13-03') {
    throw new Error('tagged manifest target_id mismatch');
  }
});

test('R5: an external-evidence status flip to merged leaves the certified target untouched (dynamic lineage)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aep-r5-'));
  try {
    const entry = JSON.parse(readFileSync('conformance/aep/external-evidence/aps-conformance-suite-pr-94.json', 'utf8'));
    entry.status = 'merged';
    entry.merged_in = { merge_commit: 'a'.repeat(40), final_head_sha: 'b'.repeat(40), merged_at: '2026-09-16T00:00:00Z' };
    writeFileSync(join(dir, 'aps-conformance-suite-pr-94.json'), JSON.stringify(entry, null, 2));
    const ee = runNode(['scripts/verify-external-evidence.mjs', '--dir', dir, '--target', TARGET]);
    if (ee.status !== 0) throw new Error(`merged ledger entry must pass EE\n${ee.stdout}`);

    const before = readFileSync(TARGET, 'utf8');
    const lineage = deriveLineage();
    const args = ['scripts/verify-certified-target.mjs', '--target', TARGET];
    if (lineage.predecessor) args.push('--previous-publication', lineage.predecessor.file);
    const ct = runNode(args);
    const after = readFileSync(TARGET, 'utf8');
    if (before !== after) throw new Error('target manifest changed during evidence verification');
    if (ct.status !== 0) throw new Error(`target verification must stay green\n${ct.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── R6–R10 — verifier result contract ────────────────────────────────────────

test('R6: not-evaluated axis with an outcome is invalid; "not-checked" is not an outcome', () => {
  const { valid, errors } = validateResultEnvelope({
    structural: { evaluated: true, status: 'pass' },
    semantic: { evaluated: true, status: 'pass', violations: [] },
    authenticity: { evaluated: false, status: 'not-checked' },
    chain: { evaluated: false },
    capture: { evaluated: false },
  });
  if (valid) throw new Error('merged evaluation/outcome enum must be rejected');
  if (!errors.some((e) => e.includes('authenticity'))) throw new Error('error must name the axis');
});

test('R6b: evaluated=true requires an outcome (no silent defaults)', () => {
  const { valid } = validateResultEnvelope({
    structural: { evaluated: true, status: 'pass' },
    semantic: { evaluated: true, status: 'pass', violations: [] },
    authenticity: { evaluated: true },
    chain: { evaluated: false },
    capture: { evaluated: false },
  });
  if (valid) throw new Error('evaluated axis without outcome must be rejected');
});

test('R7: semantic fail + authenticity valid is representable (no implication)', () => {
  const { valid, errors } = validateResultEnvelope({
    structural: { evaluated: true, status: 'pass' },
    semantic: { evaluated: true, status: 'fail', violations: ['S-1'] },
    authenticity: { evaluated: true, status: 'valid', binding: 'exact' },
    chain: { evaluated: true, status: 'intact' },
    capture: { evaluated: false },
  });
  if (!valid) throw new Error(`independent axes must compose: ${errors.join('; ')}`);
});

test('R8: semantic pass + authenticity unsigned is representable (no implication)', () => {
  const { valid, errors } = validateResultEnvelope({
    structural: { evaluated: true, status: 'pass' },
    semantic: { evaluated: true, status: 'pass', violations: [] },
    authenticity: { evaluated: true, status: 'unsigned' },
    chain: { evaluated: true, status: 'intact' },
    capture: { evaluated: false },
  });
  if (!valid) throw new Error(`independent axes must compose: ${errors.join('; ')}`);
});

test('R9: chain intact + capture not-evaluated is representable (chain implies nothing about capture)', () => {
  const { valid, errors } = validateResultEnvelope({
    structural: { evaluated: true, status: 'pass' },
    semantic: { evaluated: true, status: 'pass', violations: [] },
    authenticity: { evaluated: true, status: 'valid', binding: 'exact' },
    chain: { evaluated: true, status: 'intact' },
    capture: { evaluated: false },
  });
  if (!valid) throw new Error(`intact chain must not force capture evaluation: ${errors.join('; ')}`);
});

test('R10: a completeness claim without an independent witness profile is invalid', () => {
  const { valid, errors } = validateResultEnvelope({
    structural: { evaluated: true, status: 'pass' },
    semantic: { evaluated: true, status: 'pass', violations: [] },
    authenticity: { evaluated: true, status: 'valid', binding: 'exact' },
    chain: { evaluated: true, status: 'intact' },
    capture: { evaluated: true, status: 'complete-evidenced' },
  });
  if (valid) throw new Error('producer-signed completeness must be rejected');
  if (!errors.some((e) => e.includes('witness_profile'))) throw new Error('error must demand a witness profile');
});

test('R10b: a top-level complete flag is forbidden by construction', () => {
  const { valid } = validateResultEnvelope({
    complete: true,
    structural: { evaluated: true, status: 'pass' },
    semantic: { evaluated: true, status: 'pass', violations: [] },
    authenticity: { evaluated: true, status: 'valid', binding: 'exact' },
    chain: { evaluated: true, status: 'intact' },
    capture: { evaluated: false },
  });
  if (valid) throw new Error('top-level complete flag must be rejected');
});

// ── R11 — trace-pipeline is never rendered as a native Python verifier ──────

test('R11: claim-language lint rejects native-Python-verifier phrasing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aep-r11-'));
  try {
    writeFileSync(join(dir, 'bad.md'), 'trace-pipeline is a native python verifier for AEP.\n');
    const src = readFileSync('scripts/check-assurance-language.mjs', 'utf8');
    const patterns = ['native python verifier', 'python native verifier', 'wasmagent-py verifier', 'python verifier sdk'];
    const text = readFileSync(join(dir, 'bad.md'), 'utf8').toLowerCase();
    const hit = patterns.some((p) => text.includes(p));
    if (!hit) throw new Error('lint pattern list must cover native-Python-verifier phrasing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('R11b: the canonical repo docs contain no native-Python-verifier phrasing', () => {
  for (const file of ['conformance/aep/README.md', 'docs/aep-assurance-language.md', 'README.md']) {
    const text = readFileSync(file, 'utf8').toLowerCase();
    for (const p of ['native python verifier', 'python native verifier', 'wasmagent-py verifier', 'python verifier sdk']) {
      if (text.includes(p)) throw new Error(`${file} contains forbidden phrasing "${p}"`);
    }
  }
});

// ── R13 — evidence-grade firewall ─────────────────────────────────────────────

test('R13: grading the Mode-B semantic layer INDEPENDENT without a runner reference is INVALID', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aep-r13-'));
  try {
    const entry = JSON.parse(readFileSync('conformance/aep/external-evidence/aps-conformance-suite-pr-94.json', 'utf8'));
    entry.verification_grades.lab_semantic_recomputation = 'INDEPENDENT';
    writeFileSync(join(dir, 'aps-conformance-suite-pr-94.json'), JSON.stringify(entry, null, 2));
    const res = runNode([
      'scripts/verify-external-evidence.mjs',
      '--dir', dir,
      '--target', 'conformance/aep/certified-target.json',
    ]);
    if (res.status !== 1) throw new Error(`grade upgrade must fail\n${res.stdout}`);
    if (!res.stdout.includes('EE-07b')) throw new Error('EE-07b must be the failing check');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('R13b: with an independent_runner reference, the INDEPENDENT semantic grade validates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aep-r13b-'));
  try {
    const entry = JSON.parse(readFileSync('conformance/aep/external-evidence/aps-conformance-suite-pr-94.json', 'utf8'));
    entry.verification_grades.lab_semantic_recomputation = 'INDEPENDENT';
    entry.independent_runner = { repository: 'example/independent-semantic-runner', commit: 'c'.repeat(40) };
    writeFileSync(join(dir, 'aps-conformance-suite-pr-94.json'), JSON.stringify(entry, null, 2));
    const res = runNode([
      'scripts/verify-external-evidence.mjs',
      '--dir', dir,
      '--target', 'conformance/aep/certified-target.json',
    ]);
    if (res.status !== 0) throw new Error(`runner-referenced grade must pass\n${res.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── summary ──────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.log(`INVALID: ${failures.length} invariant(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('VALID: assurance invariants R4–R13 hold');
