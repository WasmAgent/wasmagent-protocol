// @wasmagent/protocol — canonical AEP + compliance JSON Schemas.
// Single source of truth across the WasmAgent org. Do not copy these schemas
// into consumer repositories; depend on this package instead.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Machine-readable registry of every canonical schema. */
export const index = JSON.parse(readFileSync(join(here, 'schemas', 'index.json'), 'utf8'));

const byId = new Map(index.schemas.map((s) => [s.id, s]));

/**
 * Return the parsed JSON Schema for a registered schema id
 * (e.g. "aep-record", "constraint-ir"). Throws on unknown id.
 */
export function getSchema(id) {
  const entry = byId.get(id);
  if (!entry) {
    throw new Error(
      `@wasmagent/protocol: unknown schema id ${JSON.stringify(id)}. ` +
        `Known: ${[...byId.keys()].join(', ')}`,
    );
  }
  return JSON.parse(readFileSync(join(here, entry.path), 'utf8'));
}

/**
 * All schemas as a plain object keyed by id. Values load lazily on first
 * access, so importing the package does not parse every schema file.
 */
export const schemas = {};
for (const entry of index.schemas) {
  Object.defineProperty(schemas, entry.id, {
    enumerable: true,
    configurable: true,
    get() {
      return getSchema(entry.id);
    },
  });
}
// ---------------------------------------------------------------------------
// Named convenience exports for AgentBOM and MCP Posture — the two schemas
// originally owned by agent-trust-infra that consumers most commonly need.
// These wrap getSchema() so callers do not have to remember string ids.
// ---------------------------------------------------------------------------

/**
 * Return the parsed AgentBOM JSON Schema (id "agentbom").
 * Equivalent to getSchema("agentbom").
 */
export function loadAgentBOMSchema() {
  return getSchema('agentbom');
}

/**
 * Return the parsed MCP Posture JSON Schema (id "mcp-posture").
 * Equivalent to getSchema("mcp-posture").
 */
export function loadMCPPostureSchema() {
  return getSchema('mcp-posture');
}


/** Grouped schema families (e.g. "aep") for cross-cutting discovery. */
export const families = index.families ?? {};

/** Registry ids of the concrete member schemas in a family, or [] if unknown. */
export function familyMembers(family) {
  const fam = (index.families || {})[family];
  return Array.isArray(fam && fam.members) ? [...fam.members] : [];
}

// ---------------------------------------------------------------------------
// Cross-repo schema drift detection.
//
// A vendored copy of a canonical wasmagent.dev schema is "drifted" when its
// normalized JSON differs from the canonical schema shipped by this package.
// The `check` CLI and the shared schema-drift.yml workflow build on these.
// ---------------------------------------------------------------------------

/** Canonical host prefix for every registered schema $id. */
export const canonicalHost = index.canonical_host ?? 'https://wasmagent.dev/schemas/';

const PACKAGE_NAMES = new Set(['@wasmagent/protocol', 'wasmagent-protocol']);

const SCAN_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'env',
  'dist',
  'build',
  '__pycache__',
  '.pytest_cache',
  '.turbo',
  '.next',
  'target',
  'tests',
  '.idea',
  '.vscode',
]);

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeys(value[k]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Canonical, order-independent serialization of a schema document. Accepts a
 * raw JSON string (a vendored file) or an already-parsed object (the canonical
 * schema from getSchema). Two schemas that differ only in key order or
 * whitespace compare equal.
 */
export function normalizeSchema(input) {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  return JSON.stringify(sortKeys(obj));
}

/** The set of canonical $id URIs for every registered schema. */
export function canonicalIds() {
  return new Set(index.schemas.map((s) => s.canonical_id));
}

/** Map a canonical $id back to its registry id, or null. */
export function schemaIdForCanonical(canonicalId) {
  const entry = index.schemas.find((s) => s.canonical_id === canonicalId);
  return entry ? entry.id : null;
}

/**
 * Compare a single vendored schema file to the canonical schema for `schemaId`.
 * Returns a finding object: { ok, code, path, message }.
 */
export function checkFile(filePath, schemaId) {
  const entry = byId.get(schemaId);
  if (!entry) {
    return {
      ok: false,
      code: 'unknown-id',
      path: filePath,
      message: `unknown schema id ${JSON.stringify(schemaId)}`,
    };
  }
  const text = readFileSync(filePath, 'utf8');
  const canonical = getSchema(schemaId);
  if (normalizeSchema(text) === normalizeSchema(canonical)) {
    return { ok: true, code: 'match', path: filePath, message: `${schemaId}: matches canonical` };
  }
  return {
    ok: false,
    code: 'drift',
    path: filePath,
    message: `${schemaId}: vendored schema differs from canonical`,
  };
}

function iterFiles(root, suffix) {
  const out = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      if (SCAN_IGNORE_DIRS.has(name)) continue;
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (name.endsWith(suffix)) out.push(full);
    }
  }
  walk(root);
  return out;
}

/** True if `root` is the wasmagent-protocol repo itself (best-effort). */
export function isCanonicalSource(root) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (PACKAGE_NAMES.has(pkg.name)) return true;
  } catch {
    // ignore
  }
  return false;
}

/** True if `root` declares a dependency on the protocol package (best-effort). */
export function dependsOnPackage(root) {
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  } catch {
    pkg = {};
  }
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[key];
    if (deps && typeof deps === 'object') {
      for (const name of Object.keys(deps)) {
        if (PACKAGE_NAMES.has(name)) return true;
      }
    }
  }
  return false;
}

/**
 * Scan `root` for vendored canonical-schema drift, re-declared canonical ids
 * without a package dependency, and competing schemas/index.json registries.
 * Returns a list of finding objects: { ok, code, path, message }.
 */
export function scan(root, { allowCanonicalSource = false } = {}) {
  const treatAsSource = isCanonicalSource(root) || allowCanonicalSource;
  const hasDep = dependsOnPackage(root);
  const canonicalById = new Map(index.schemas.map((s) => [s.canonical_id, s]));
  const findings = [];

  for (const filePath of iterFiles(root, '.schema.json')) {
    let doc;
    try {
      doc = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (err) {
      findings.push({ ok: false, code: 'invalid-json', path: filePath, message: `cannot parse JSON: ${err.message}` });
      continue;
    }
    const sid = doc && typeof doc === 'object' ? doc.$id : null;
    if (typeof sid !== 'string' || !sid.startsWith(canonicalHost)) continue;
    const entry = canonicalById.get(sid);
    if (!entry) {
      findings.push({
        ok: false,
        code: 'unknown-canonical-id',
        path: filePath,
        message: `$id ${sid} is under the canonical host but is not registered`,
      });
      continue;
    }
    if (normalizeSchema(doc) !== normalizeSchema(getSchema(entry.id))) {
      findings.push({
        ok: false,
        code: 'drift',
        path: filePath,
        message: `${entry.id}: vendored schema differs from canonical`,
      });
      continue;
    }
    if (treatAsSource) {
      findings.push({ ok: true, code: 'match', path: filePath, message: `${entry.id}: matches canonical (source repo)` });
    } else if (hasDep) {
      findings.push({ ok: true, code: 'match', path: filePath, message: `${entry.id}: matches canonical` });
    } else {
      findings.push({
        ok: false,
        code: 'no-package-dep',
        path: filePath,
        message: `${entry.id}: re-declares canonical $id but the repo does not depend on @wasmagent/protocol / wasmagent-protocol`,
      });
    }
  }

  // Registry guard: only wasmagent-protocol may ship a canonical registry.
  if (!treatAsSource) {
    for (const idxPath of iterFiles(root, '.json')) {
      const base = idxPath.split(/[\\/]/).pop();
      if (base !== 'index.json') continue;
      let idx;
      try {
        idx = JSON.parse(readFileSync(idxPath, 'utf8'));
      } catch {
        continue;
      }
      const entries = idx && Array.isArray(idx.schemas) ? idx.schemas : null;
      if (!entries) continue;
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const cid = entry.canonical_id;
        if (typeof cid === 'string' && cid.startsWith(canonicalHost)) {
          findings.push({
            ok: false,
            code: 'competing-registry',
            path: idxPath,
            message: `lists canonical schema id ${cid} — only the wasmagent-protocol repo may ship a canonical registry`,
          });
          break;
        }
      }
    }
  }

  return findings;
}

/** True if any finding in the list is an error. */
export function hasDrift(findings) {
  return findings.some((f) => !f.ok);
}

// ---------------------------------------------------------------------------
// AEP conformance kit.
//
// The conformance/aep corpus ships inside this package (see "files" in
// package.json), so third-party implementers can pin and verify it without
// cloning the repository. Self-check verifies corpus integrity and the
// project-owned reference layers only — it is NOT independent semantic
// verification (see conformance/aep/IMPLEMENTER.md).
// ---------------------------------------------------------------------------

const AEP_CORPUS_REL = join('conformance', 'aep');

/** Absolute path to the packaged AEP conformance corpus. Throws if absent. */
export function getAepConformanceDir() {
  const dir = join(here, AEP_CORPUS_REL);
  if (!statSync(join(dir, 'manifest.json'), { throwIfNoEntry: false })) {
    throw new Error(
      `@wasmagent/protocol: AEP conformance corpus not found at ${dir} — ` +
        'reinstall the package (the corpus ships in the npm tarball)',
    );
  }
  return dir;
}

/** The parsed AEP conformance manifest (the corpus verdict authority). */
export function getAepConformanceManifest() {
  return JSON.parse(readFileSync(join(getAepConformanceDir(), 'manifest.json'), 'utf8'));
}

// Canonical grade order for floor semantics (weakest first). Kept in sync
// with src/wasmagent_protocol/conformance.py — the Python module is the
// reference implementation shared with the protocol-side corpus runner.
const BACKING_RANK = {
  unknown: 0,
  operator_asserted: 1,
  principal_key_signed: 2,
  qualified_signature: 3,
};

/**
 * JS port of the project-owned semantic reference checker (attribution
 * floor / vocabulary / count invariants). Returns [ok, reason].
 */
export function checkSemanticReference(record) {
  const floor = record.run_attribution_backing_floor;
  const observed = record.run_attribution_backing_observed;

  for (const [key, value] of [
    ['attribution_backing', record.attribution_backing],
    ['run_attribution_backing_floor', floor],
  ]) {
    if (value !== null && value !== undefined && !(value in BACKING_RANK)) {
      return [false, `attribution: ${key} outside canonical vocabulary`];
    }
  }

  const count = record.authorization_evidence_count;
  if (count !== null && count !== undefined && (!Number.isInteger(count) || count < 0)) {
    return [false, 'attribution: authorization_evidence_count must be a non-negative integer'];
  }

  // Pair-presence symmetry: floor and observed ship together; any half-pair
  // fails closed (see the Python reference implementation for the rationale).
  const observedIsList = Array.isArray(observed);
  const observedNonempty = observedIsList && observed.length > 0;
  if (floor != null && !observedNonempty) {
    return [false, 'attribution: floor provided without a non-empty observed set'];
  }
  if (observed !== null && observed !== undefined) {
    if (!observedNonempty) {
      return [false, 'attribution: observed provided as an empty set — empty grading claim'];
    }
    if (floor == null) {
      return [false, 'attribution: observed provided without floor — the pair ships together'];
    }
  }

  if (floor != null && observedNonempty) {
    if (observed.some((g) => !(g in BACKING_RANK))) {
      return [false, 'attribution: observed grade outside canonical vocabulary'];
    }
    if (!observed.includes(floor)) {
      return [false, 'attribution: floor not present in observed'];
    }
    if (new Set(observed).size !== observed.length) {
      return [false, 'attribution: duplicate grade in observed set'];
    }
    if (BACKING_RANK[floor] !== Math.min(...observed.map((g) => BACKING_RANK[g]))) {
      return [false, 'attribution: floor is not the weakest observed grade'];
    }
  }
  return [true, ''];
}

function recordsIn(fixturePath) {
  const text = readFileSync(fixturePath, 'utf8');
  if (fixturePath.endsWith('.jsonl')) {
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }
  return [JSON.parse(text)];
}

/**
 * Self-check the packaged AEP corpus: manifest coherence, fixture presence,
 * verifying keys, canonical schema parse, and agreement between the
 * project-owned semantic reference checker and every manifest semantic label.
 * JSON-Schema (structural) validation is not executed here — the npm package
 * carries no validator dependency; use the Python runner or your own toolchain.
 *
 * Returns { ok, report } where report is a printable line list.
 */
export function aepConformanceSelfCheck({ dir } = {}) {
  const corpusDir = dir ?? getAepConformanceDir();
  const report = [];
  const failures = [];
  const fail = (msg) => {
    failures.push(msg);
    report.push(`FAIL ${msg}`);
  };

  const manifestPath = join(corpusDir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    report.push(`OK   manifest parsed (${manifestPath})`);
  } catch (err) {
    fail(`manifest does not parse: ${err.message}`);
    return { ok: false, report };
  }

  if (manifest.schema_version !== 2) fail(`schema_version ${manifest.schema_version} != 2`);
  if (manifest.signing_profile_id !== 'aep-dsse-ed25519-decoded-body-v1') {
    fail(`unsupported signing_profile_id ${manifest.signing_profile_id}`);
  }

  const canonicalRel = manifest.canonical_schema;
  let canonicalPath = null;
  if (typeof canonicalRel !== 'string' || !canonicalRel) {
    fail('canonical_schema missing from manifest');
  } else {
    // Repo-root-relative in the manifest; source checkout root and package
    // root are both two levels above the corpus dir (see the Python module).
    for (const candidate of [join(corpusDir, canonicalRel), join(corpusDir, '..', '..', canonicalRel)]) {
      if (existsSync(candidate)) {
        canonicalPath = candidate;
        break;
      }
    }
    if (!canonicalPath) {
      fail(`canonical schema missing: ${canonicalRel}`);
    } else {
      try {
        JSON.parse(readFileSync(canonicalPath, 'utf8'));
        report.push(`OK   canonical schema parses (${canonicalRel})`);
      } catch (err) {
        fail(`canonical schema does not parse: ${err.message}`);
        canonicalPath = null;
      }
    }
  }

  const entries = manifest.conformance_target ?? [];
  if (!entries.length) fail('manifest declares no conformance_target entries');

  let checked = 0;
  for (const entry of entries) {
    const rel = entry.path;
    if (!rel) {
      fail(`entry missing path: ${JSON.stringify(entry)}`);
      continue;
    }
    const fixture = join(corpusDir, rel);
    if (!existsSync(fixture)) {
      fail(`manifest fixture missing on disk: ${rel}`);
      continue;
    }
    checked += 1;
    let records;
    try {
      records = recordsIn(fixture);
    } catch (err) {
      fail(`${rel}: fixture does not parse: ${err.message}`);
      continue;
    }
    if (entry.semantic === 'valid' || entry.semantic === 'invalid') {
      for (const r of records) {
        const [ok, reason] = checkSemanticReference(r);
        if (ok !== (entry.semantic === 'valid')) {
          fail(`${rel}: semantic expected ${entry.semantic}, checker said ${ok} (${reason})`);
          break;
        }
      }
    }
  }
  report.push(`OK   corpus complete: ${checked}/${entries.length} manifest fixture(s) present`);

  for (const [keyId, keyRel] of Object.entries(manifest.verifying_keys?.by_keyid ?? {})) {
    if (!existsSync(join(corpusDir, keyRel))) fail(`verifying key missing: ${keyId} -> ${keyRel}`);
  }
  report.push('OK   verifying keys present');

  for (const entry of manifest.historical ?? []) {
    const rel = String(entry.path ?? '');
    if (entry.conformance_target !== false) {
      fail(`historical entry ${JSON.stringify(rel)} must declare conformance_target: false`);
    }
    if (!rel.includes('historical/')) {
      fail(`historical entry ${JSON.stringify(rel)} must live under historical/`);
    }
  }

  report.push(
    'INFO structural layer: not executed in JS self-check (no JSON Schema validator ' +
      'dependency; use the Python runner or your own toolchain)',
  );
  const ok = failures.length === 0;
  report.push(
    `${ok ? 'OK' : 'FAIL'}  aep conformance self-check: ${entries.length} current target(s), ` +
      `${failures.length} failure(s)`,
  );
  report.push(
    'NOTE self-check verifies corpus integrity and the project-owned reference layers; ' +
      'it is NOT independent semantic verification (see conformance/aep/IMPLEMENTER.md)',
  );
  return { ok, report };
}

