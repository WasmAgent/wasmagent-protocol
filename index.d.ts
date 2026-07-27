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

/** Machine-readable registry of every canonical schema. */
export const index: SchemaIndex;

/** All schemas as a plain object keyed by id. */
export const schemas: Record<string, unknown>;

/**
 * Return the parsed JSON Schema for a registered schema id
 * (e.g. "aep-record", "constraint-ir"). Throws on unknown id.
 */
export function getSchema(id: string): unknown;

// ---------------------------------------------------------------------------
// Cross-repo schema drift detection.
// ---------------------------------------------------------------------------

/** Canonical host prefix for every registered schema $id. */
export const canonicalHost: string;

/** A single drift-scan result. `ok === false` blocks CI. */
export interface DriftFinding {
  ok: boolean;
  code: string;
  path: string;
  message: string;
}

/** Canonical, order-independent serialization of a schema document. */
export function normalizeSchema(input: string | unknown): string;

/** The set of canonical $id URIs for every registered schema. */
export function canonicalIds(): Set<string>;

/** Map a canonical $id back to its registry id, or null. */
export function schemaIdForCanonical(canonicalId: string): string | null;

/** Compare a vendored schema file to the canonical schema for `schemaId`. */
export function checkFile(filePath: string, schemaId: string): DriftFinding;

/** True if `root` is the wasmagent-protocol repo itself (best-effort). */
export function isCanonicalSource(root: string): boolean;

/** True if `root` declares a dependency on the protocol package (best-effort). */
export function dependsOnPackage(root: string): boolean;

/** Scan `root` for drift, re-declared canonical ids, and competing registries. */
export function scan(root: string, options?: { allowCanonicalSource?: boolean }): DriftFinding[];

/** True if any finding in the list is an error. */
export function hasDrift(findings: DriftFinding[]): boolean;
