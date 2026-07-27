// Type declarations for @wasmagent/protocol.

export interface SchemaIndexEntry {
  id: string;
  title: string;
  path: string;
  canonical_id: string;
  version: string;
  stability: 'stable' | 'evolving' | 'unstable';
  owners: string[];
  consumers: string[];
  summary: string;
}

export interface SchemaIndex {
  protocol: string;
  description: string;
  canonical_host: string;
  schemas: SchemaIndexEntry[];
}

export interface VersionBandRanges {
  /** Range consumers are recommended to declare (stays within one band). */
  recommended: string;
  /** Other ranges the band guarantees to satisfy. */
  alsoAccepted: string[];
}

export interface VersionBand {
  /** Current minor-line band, e.g. "0.1". */
  band: string;
  /** Lifecycle status of the band, e.g. "alpha". */
  status: string;
  /** Human-readable summary of the band's compatibility guarantee. */
  summary: string;
  supportedRanges: VersionBandRanges;
  /** Semver/band policy consumers should follow. */
  policy: string;
}

/** Machine-readable registry of every canonical schema. */
export const index: SchemaIndex;

/** All schemas as a plain object keyed by id. */
export const schemas: Record<string, unknown>;

/** Published package version (mirrors package.json#version). */
export const version: string;

/** Declared runtime band (mirrors package.json#engines). */
export const engines: { node: string };

/** Supported compatibility band (mirrors package.json#versionBand). */
export const versionBand: VersionBand;

/**
 * Return the parsed JSON Schema for a registered schema id
 * (e.g. "aep-record", "constraint-ir"). Throws on unknown id.
 */
export function getSchema(id: string): unknown;
