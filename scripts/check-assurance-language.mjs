#!/usr/bin/env node
/**
 * Claim-language firewall (docs lint).
 *
 * Enforces docs/aep-assurance-language.md: forbidden assurance claims must
 * not appear in any repository markdown outside the policy document itself
 * (which quotes them as definitions).
 *
 * Exit 0 = clean; 1 = violations found; 2 = usage error.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const POLICY_DOC = 'docs/aep-assurance-language.md';
const ROOTS = ['docs', 'conformance', 'README.md'];

// Ordered longest-first so alternation is unambiguous. Each pattern is an
// assurance claim with no current evidence backing (see the policy doc).
const FORBIDDEN = [
  'linux foundation certified',
  'lf certified',
  'certified by the linux foundation',
  'owasp certified',
  'owasp approved',
  'official conformance certification',
  'industry certified',
  'third-party certification',
  'complete capture proof',
  'proves complete capture',
  'fully certified',
  // R11 — trace-pipeline is a Python corpus consumer, never a native
  // Python verifier, and no wasmagent-py verifier SDK exists.
  'native python verifier',
  'python native verifier',
  'wasmagent-py verifier',
  'python verifier sdk',
];

function* walk(path) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    // Only markdown, skip dependency/vendor noise.
    for (const entry of readdirSync(path)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      yield* walk(join(path, entry));
    }
  } else if (path.endsWith('.md')) {
    yield path;
  }
}

const violations = [];
for (const root of ROOTS) {
  if (!exists(root)) continue;
  for (const file of walk(root)) {
    if (relative('.', file) === POLICY_DOC) continue; // definitions live there
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const lower = line.toLowerCase();
      for (const pattern of FORBIDDEN) {
        if (lower.includes(pattern)) {
          violations.push(`${file}:${i + 1}: "${pattern}" — ${line.trim().slice(0, 100)}`);
        }
      }
    });
  }
}

function exists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

if (violations.length > 0) {
  console.error(`claim-language firewall: ${violations.length} violation(s)`);
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error('\nSee docs/aep-assurance-language.md for allowed phrasing.');
  process.exit(1);
}
console.log('claim-language firewall: clean');
