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

export interface SchemaFamily {
  title: string;
  description: string;
  /** Registry id of the base/reference schema every member extends. */
  base: string;
  /** Registry ids of the concrete member schemas in the family. */
  members: string[];
}

export interface SchemaIndex {
  protocol: string;
  description: string;
  canonical_host: string;
  schemas: SchemaIndexEntry[];
  /** Grouped schema families (e.g. "aep") for cross-cutting discovery. */
  families?: Record<string, SchemaFamily>;
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

/** Grouped schema families (e.g. "aep") for cross-cutting discovery. */
export const families: Record<string, SchemaFamily>;

/** Registry ids of the concrete member schemas in a family, or [] if unknown. */
export function familyMembers(family: string): string[];

// ---------------------------------------------------------------------------
// Schema instance types (convenience views).
//
// The authoritative contract for every record shape is its JSON Schema
// (see schemas/index.json). Load and validate against it at runtime via
// getSchema(<id>). The interfaces below capture only the required top-level
// fields so consumers can type their payloads ergonomically; the index
// signature passes through every optional schema property unchanged.
// ---------------------------------------------------------------------------

/**
 * Convenience structural view of an Agent Evidence Protocol (AEP) record —
 * runtime action evidence and run provenance. Authoritative shape:
 * getSchema('aep-record') → schemas/aep/aep-record.schema.json.
 */
export interface AEPRecord {
  /** Schema version, one of `aep/v0.1` | `aep/v0.2` | `aep/v0.3`. */
  schema_version: string;
  /** Identifier of the run this record captures. */
  run_id: string;
  /** UTC epoch milliseconds when the record was created. */
  created_at_ms: number;
  [key: string]: unknown;
}

/**
 * Convenience structural view of a normalized event — the foundational record
 * heterogeneous agent evidence is normalized into before being mapped onto an
 * AEPRecord. Authoritative shape:
 * getSchema('canonical-event') → schemas/aep/canonical-event.schema.json.
 */
export interface CanonicalEvent {
  /** Canonical-event schema version, currently `canonical-event/v0.1`. */
  schema_version: string;
  /** Globally-unique identifier for this event within its trace. */
  event_id: string;
  /** Kind of event: action | decision | observation | error | lifecycle. */
  event_type: string;
  /** UTC epoch milliseconds when the event occurred. */
  timestamp_ms: number;
  [key: string]: unknown;
}

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

/** Return the parsed AgentBOM JSON Schema. Equivalent to getSchema("agentbom"). */
export function loadAgentBOMSchema(): unknown;

/** Return the parsed MCP Posture JSON Schema. Equivalent to getSchema("mcp-posture"). */
export function loadMCPPostureSchema(): unknown;
