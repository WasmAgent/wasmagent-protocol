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

/**
 * Map a normalized canonical event into an AEP record.
 *
 * The canonical event is retained under `canonical_event` so event kinds that
 * do not have a one-to-one AEP field remain lossless. Action events are
 * represented as the corresponding single AEP action; input, output, and
 * evidence references are routed to their AEP destinations.
 */
export function canonicalEventToAEPRecord(event, { schemaVersion = 'aep/v0.3' } = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('@wasmagent/protocol: canonical event must be an object');
  }
  if (event.schema_version !== 'canonical-event/v0.1') {
    throw new TypeError(
      '@wasmagent/protocol: canonical event requires schema_version "canonical-event/v0.1"',
    );
  }
  if (typeof event.event_id !== 'string' || !event.event_id) {
    throw new TypeError('@wasmagent/protocol: canonical event requires a non-empty event_id');
  }
  if (!['action', 'decision', 'observation', 'error', 'lifecycle'].includes(event.event_type)) {
    throw new TypeError('@wasmagent/protocol: canonical event has an unsupported event_type');
  }
  if (!Number.isFinite(event.timestamp_ms)) {
    throw new TypeError('@wasmagent/protocol: canonical event requires numeric timestamp_ms');
  }
  if (!['aep/v0.1', 'aep/v0.2', 'aep/v0.3'].includes(schemaVersion)) {
    throw new TypeError(`@wasmagent/protocol: unsupported AEP schema version ${JSON.stringify(schemaVersion)}`);
  }
  if (typeof event.run_id !== 'string' || !event.run_id) {
    throw new TypeError('@wasmagent/protocol: canonical event requires a non-empty run_id');
  }

  const record = {
    schema_version: schemaVersion,
    run_id: event.run_id,
    created_at_ms: event.timestamp_ms,
    canonical_event: event,
  };

  if (typeof event.trace_id === 'string') record.trace_id = event.trace_id;
  if (typeof event.subject_id === 'string') record.subject_id = event.subject_id;
  if (event.signature && typeof event.signature === 'object' && !Array.isArray(event.signature)) {
    record.signature = event.signature;
  }

  if (event.actor && typeof event.actor === 'object' && !Array.isArray(event.actor)) {
    const runContext = {};
    if (typeof event.actor.actor_id === 'string') runContext.agent_id = event.actor.actor_id;
    if (typeof event.actor.agent_version === 'string') {
      runContext.agent_version = event.actor.agent_version;
      record.runtime_version = event.actor.agent_version;
    }
    if (Object.keys(runContext).length) record.run_context = runContext;
  }

  const refs = Array.isArray(event.refs) ? event.refs : [];
  const mapRefs = (relation) => refs
    .filter((ref) => ref && typeof ref === 'object' && ref.relation === relation)
    .map(({ uri, digest }) => (digest === undefined ? { uri } : { uri, digest }));
  const inputRefs = mapRefs('input');
  const outputRefs = mapRefs('output');
  if (inputRefs.length) record.input_refs = inputRefs;
  if (outputRefs.length) record.output_refs = outputRefs;

  if (event.event_type === 'action') {
    if (typeof event.tool_name !== 'string' || typeof event.state_changing !== 'boolean') {
      throw new TypeError(
        '@wasmagent/protocol: action canonical events require tool_name and state_changing',
      );
    }
    const action = {
      action_id: event.event_id,
      tool_name: event.tool_name,
      state_changing: event.state_changing,
      timestamp_ms: event.timestamp_ms,
    };
    if (typeof event.parent_event_id === 'string') action.parent_action_id = event.parent_event_id;
    const evidenceRefs = mapRefs('evidence')
      .map(({ uri }) => uri)
      .filter((uri) => typeof uri === 'string');
    if (evidenceRefs.length) action.evidence_refs = evidenceRefs;
    record.actions = [action];
  }

  return record;
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
