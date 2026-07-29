// @wasmagent/protocol — canonical AEP + compliance JSON Schemas.
// Single source of truth across the WasmAgent org. Do not copy these schemas
// into consumer repositories; depend on this package instead.

import { readFileSync, readdirSync, statSync } from 'node:fs';
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

/** All schemas as a plain object keyed by id. */
export const schemas = Object.fromEntries(index.schemas.map((s) => [s.id, getSchema(s.id)]));
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
  '.claude-bot',
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

