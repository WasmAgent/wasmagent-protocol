// @wasmagent/protocol — canonical AEP + compliance JSON Schemas.
// Single source of truth across the WasmAgent org. Do not copy these schemas
// into consumer repositories; depend on this package instead.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Machine-readable registry of every canonical schema. */
export const index = JSON.parse(readFileSync(join(here, 'schemas', 'index.json'), 'utf8'));

/** Package manifest (name, version, runtime band, version band). */
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

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

/** Published package version (mirrors package.json#version). */
export const version = pkg.version;

/** Declared runtime band (mirrors package.json#engines). */
export const engines = pkg.engines;

/**
 * Supported compatibility band for this package (mirrors
 * package.json#versionBand). Consumers should consult
 * `versionBand.supportedRanges.recommended` when declaring a dependency range.
 */
export const versionBand = pkg.versionBand;
