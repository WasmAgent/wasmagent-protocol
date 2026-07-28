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
// AEP record type (mirrors schemas/aep/aep-record.schema.json).
//
// The schema is additive/evolving: it does not set additionalProperties: false,
// so validated records may carry fields not listed here. The interfaces below
// model the documented fields; retrieve the authoritative shape with
// `getSchema('aep-record')`.
// ---------------------------------------------------------------------------

/** Allowed `schema_version` values for an AEP record. */
export type AepSchemaVersion = 'aep/v0.1' | 'aep/v0.2' | 'aep/v0.3';

/** A recorded capability decision (allow / deny / ask_user / dry_run). */
export interface AepCapabilityDecision {
  capability: string;
  subject: string;
  resource: string;
  decision: 'allow' | 'deny' | 'ask_user' | 'dry_run';
  reason_code?: string;
}

/** A single runtime action captured as evidence. */
export interface AepAction {
  action_id: string;
  tool_name: string;
  state_changing: boolean;
  timestamp_ms: number;
  precondition_digest?: string;
  result_digest?: string;
  evidence_refs?: string[];
  parent_action_id?: string;
  causal_chain_id?: string;
  tool_descriptor_digest?: string;
  server_card_digest?: string;
  scope_lease_id?: string;
  approval_context_hash?: string;
  input_taint_labels?: string[];
  output_taint_labels?: string[];
  memory_read_refs?: string[];
  memory_write_refs?: string[];
  pre_state_digest?: string;
  post_state_digest?: string;
}

/** Result of a verifier run over the record. */
export interface AepVerifierResult {
  verifier_id: string;
  passed: boolean;
  score?: number;
  claim_ids?: string[];
}

/** Optional tamper-evident signature over the record. */
export interface AepSignature {
  alg: string;
  key_id: string;
  sig: string;
  bundle?: unknown;
  transparency_log_ref?: string;
}

/**
 * Agent Evidence Protocol record — runtime action evidence and run provenance.
 * Mirrors `schemas/aep/aep-record.schema.json` (`aep/v0.3`). Only
 * `schema_version`, `run_id`, and `created_at_ms` are required; every other
 * field is optional and additive.
 */
export interface AepRecord {
  schema_version: AepSchemaVersion;
  run_id: string;
  created_at_ms: number;
  trace_id?: string;
  parent_trace_id?: string | null;
  repo_commit?: string;
  runtime_version?: string;
  model_provider?: string;
  model_id?: string;
  policy_bundle_digest?: string;
  tool_manifest_digest?: string;
  mcp_server_card_digest?: string | null;
  capability_decisions?: AepCapabilityDecision[];
  actions?: AepAction[];
  verifier_results?: AepVerifierResult[];
  budget_ledger?: Record<string, unknown>;
  run_context?: Record<string, unknown>;
  user_id?: string;
  subject_id?: string;
  side_effect_class?: 'read' | 'mutate-local' | 'mutate-external' | 'network-egress' | 'unknown';
  run_side_effect_class_max?: 'read' | 'mutate-local' | 'mutate-external' | 'network-egress' | 'unknown';
  recording_mode?: 'full' | 'delta' | 'validation';
  argument_drift?: Record<string, unknown>;
  signature?: AepSignature;
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
