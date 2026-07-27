// Type declarations for @wasmagent/protocol.

// ---------------------------------------------------------------------------
// AEP Record types — mirrors schemas/aep/aep-record.schema.json.
// ---------------------------------------------------------------------------

/** Schema version strings accepted by the canonical aep-record. */
export type AEPRecordSchemaVersion = 'aep/v0.1' | 'aep/v0.2' | 'aep/v0.3';

export interface AEPInputRef {
  uri: string;
  digest?: string;
  taint_labels?: string[];
}

export interface AEPOutputRef {
  uri: string;
  digest?: string;
  redaction_profile?: string;
}

/** Capability decision values. */
export type AEPCapabilityDecisionValue = 'allow' | 'deny' | 'ask_user' | 'dry_run';

export interface AEPCapabilityDecision {
  capability: string;
  subject: string;
  resource: string;
  decision: AEPCapabilityDecisionValue;
  reason_code?: string;
}

export interface AEPAction {
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

export interface AEPVerifierResult {
  verifier_id: string;
  passed: boolean;
  score?: number;
  claim_ids?: string[];
}

export interface AEPBudgetEntry {
  limit?: number;
  spent: number;
}

export interface AEPBudgetLedger {
  token_budget?: AEPBudgetEntry & { spent: number };
  latency_budget?: { limit_ms?: number; actual_ms: number };
  tool_budget?: AEPBudgetEntry & { spent: number };
  risk_budget?: AEPBudgetEntry & { spent: number };
  retry_budget?: AEPBudgetEntry & { spent: number };
  human_approval_budget?: AEPBudgetEntry & { spent: number };
}

export interface AEPRunContext {
  agent_id?: string;
  agent_version?: string;
  subagent_id?: string;
  delegation_chain?: string[];
  environment_digest?: string;
  dependency_lock_digest?: string;
}

/** Per-record and per-run side-effect classification. */
export type AEPSideEffectClass =
  | 'read'
  | 'mutate-local'
  | 'mutate-external'
  | 'network-egress'
  | 'unknown';

/** How evidence for a run was captured. */
export type AEPRecordingMode = 'full' | 'delta' | 'validation';

/**
 * Detected drift between an action's declared arguments and the arguments
 * used at runtime. The JSON Schema allows additional properties.
 */
export interface AEPArgumentDrift {
  tool_name?: string;
  declared_digest?: string;
  actual_digest?: string;
  diff_summary?: string;
  drifted_args?: string[];
  /** Additional properties beyond the known fields. */
  [key: string]: string | string[] | undefined;
}

export interface AEPSignature {
  alg: string;
  key_id: string;
  sig: string;
  bundle?: Record<string, unknown>;
  transparency_log_ref?: string;
}

/**
 * Agent Evidence Protocol record — runtime action evidence and run provenance.
 *
 * Mirrors `schemas/aep/aep-record.schema.json`. Use `getSchema("aep-record")`
 * for runtime JSON Schema validation; use this interface for compile-time type
 * checking in TypeScript.
 */
export interface AEPRecord {
  schema_version: AEPRecordSchemaVersion;
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
  input_refs?: AEPInputRef[];
  output_refs?: AEPOutputRef[];
  capability_decisions?: AEPCapabilityDecision[];
  actions?: AEPAction[];
  verifier_results?: AEPVerifierResult[];
  budget_ledger?: AEPBudgetLedger;
  run_context?: AEPRunContext;
  user_id?: string;
  subject_id?: string;
  side_effect_class?: AEPSideEffectClass;
  run_side_effect_class_max?: AEPSideEffectClass;
  recording_mode?: AEPRecordingMode;
  argument_drift?: AEPArgumentDrift;
  signature?: AEPSignature;
}

// ---------------------------------------------------------------------------
// Schema index and loader types.
// ---------------------------------------------------------------------------

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
