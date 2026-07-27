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
// Canonical event type (the aep-record shape).
//
// `AepRecord` is the typed view of the canonical-event wire contract
// (schemas/v0.1/canonical-event.schema.json). Each field maps 1:1 onto the
// Agent Evidence Protocol record, so consumers get types instead of an opaque
// object. open-agent-audit maps its v0.1 events onto this shape before
// validating them against the aep-record schema.
// ---------------------------------------------------------------------------

/** Agent identity that produced a canonical event. Maps to AEP run_context. */
export interface CanonicalEventAgent {
  agent_id?: string;
  agent_version?: string;
  subagent_id?: string;
  delegation_chain?: string[];
  [key: string]: unknown;
}

/** A single state-changing tool action. Maps to an AEP actions[] entry. */
export interface CanonicalEventAction {
  action_id: string;
  tool_name: string;
  state_changing: boolean;
  timestamp_ms: number;
  precondition_digest?: string;
  result_digest?: string;
  parent_action_id?: string;
  evidence_refs?: string[];
  [key: string]: unknown;
}

/** A capability allow/deny decision. Maps to an AEP capability_decisions[] entry. */
export interface CanonicalEventCapabilityDecision {
  capability: string;
  subject: string;
  resource: string;
  decision: 'allow' | 'deny' | 'ask_user' | 'dry_run';
  reason_code?: string;
  [key: string]: unknown;
}

/** A verifier pass/fail result. Maps to an AEP verifier_results[] entry. */
export interface CanonicalEventVerifierResult {
  verifier_id: string;
  passed: boolean;
  score?: number;
  claim_ids?: string[];
  [key: string]: unknown;
}

/** Tamper-evident signature over the event. Maps to the AEP signature block. */
export interface CanonicalEventSignature {
  alg: string;
  key_id: string;
  sig: string;
  bundle?: Record<string, unknown>;
  transparency_log_ref?: string;
  [key: string]: unknown;
}

/**
 * The canonical event (aep-record) type exported by @wasmagent/protocol.
 * Maps onto schemas/v0.1/canonical-event.schema.json and the Agent Evidence
 * Protocol record shape.
 */
export interface AepRecord {
  schema_version: 'canonical-event/v0.1';
  event_id: string;
  event_type: 'action' | 'capability_decision' | 'verifier_result' | 'run_lifecycle' | 'custom';
  run_id: string;
  trace_id?: string;
  parent_trace_id?: string | null;
  created_at_ms: number;
  agent?: CanonicalEventAgent;
  action?: CanonicalEventAction;
  capability_decision?: CanonicalEventCapabilityDecision;
  verifier_result?: CanonicalEventVerifierResult;
  payload?: Record<string, unknown>;
  signature?: CanonicalEventSignature;
}

/** Alias naming the same type after the canonical-event schema. */
export type CanonicalEvent = AepRecord;

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
