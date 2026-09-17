/**
 * AEP verifier result contract — machine-checkable logical result model.
 *
 * Normative text: conformance/aep/verifier-result-contract.md
 *
 * Purpose: prevent a single boolean `verified = true` from collapsing the
 * assurance axes. Each axis is evaluated INDEPENDENTLY; no axis implies
 * another (R7/R8/R9); evaluation state and record outcome are orthogonal
 * vocabularies (R6); a producer-signed completeness claim proves nothing
 * about completeness (R10).
 *
 * The envelope is a LOGICAL model: implementations (JS, Rust, Python) keep
 * their own native APIs and shapes; anything claiming contract conformance
 * must be able to produce this envelope and must never produce a decision
 * that contradicts it.
 *
 * CLI: node scripts/verifier-result-contract.mjs <envelope.json>  (exit 0/1)
 */

export const AXES = ["structural", "semantic", "authenticity", "chain", "capture"];

export const AXIS_STATUS = {
  structural: ["pass", "fail"],
  semantic: ["pass", "fail"],
  authenticity: [
    "unsigned",
    "valid",
    "invalid",
    "unsupported-legacy",
    "binding-mismatch",
  ],
  chain: ["intact", "broken"],
  capture: ["complete-evidenced", "unknown"],
};

export const ALLOWED_TOP_LEVEL = new Set([...AXES, "profile", "subject"]);

/**
 * Validate one axis object. Returns a list of error strings (empty = valid).
 */
function validateAxis(name, axis, errors) {
  if (typeof axis !== "object" || axis === null || Array.isArray(axis)) {
    errors.push(`${name}: axis must be an object`);
    return;
  }
  if (typeof axis.evaluated !== "boolean") {
    errors.push(`${name}: 'evaluated' must be a boolean (evaluation state is explicit, never inferred)`);
    return;
  }

  if (!axis.evaluated) {
    // R6 — evaluation state and record outcome are orthogonal. An axis that
    // was not evaluated carries NO outcome — not even "unknown": outcome
    // vocabularies describe evaluated axes only, and "not-checked"/"unknown"
    // as evaluation states are forbidden aliases. Any status on a
    // non-evaluated axis is a contract violation.
    const extra = Object.keys(axis).filter((k) => k !== "evaluated" && k !== "status");
    if (axis.status !== undefined) {
      errors.push(
        `${name}: evaluated=false must not carry an outcome (got status=${JSON.stringify(axis.status)}); "not-checked" is an evaluation state, not an outcome`,
      );
    }
    if (extra.length > 0) {
      errors.push(`${name}: evaluated=false must not carry outcome fields (${extra.join(", ")})`);
    }
    return;
  }

  // evaluated=true → an outcome from the axis vocabulary is REQUIRED.
  if (axis.status === undefined) {
    errors.push(`${name}: evaluated=true requires a status from [${AXIS_STATUS[name].join(", ")}]`);
    return;
  }
  if (!AXIS_STATUS[name].includes(axis.status)) {
    errors.push(
      `${name}: status ${JSON.stringify(axis.status)} not in [${AXIS_STATUS[name].join(", ")}]`,
    );
  }

  // R10 — capture completeness cannot be self-certified. A producer-chosen,
  // producer-signed record set can never establish capture completeness;
  // `evaluated=true` on the capture axis demands an INDEPENDENT witness
  // profile reference (observer receipt, transparency log, TEE stream, …).
  if (name === "capture" && axis.status === "complete-evidenced") {
    if (typeof axis.witness_profile !== "string" || axis.witness_profile.length === 0) {
      errors.push(
        "capture: complete-evidenced requires an independent witness_profile reference — a producer-signed claim alone cannot establish completeness",
      );
    }
  }
}

/**
 * Validate a full result envelope against the contract.
 * Returns { valid, errors }.
 */
export function validateResultEnvelope(envelope) {
  const errors = [];
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
    return { valid: false, errors: ["envelope must be an object"] };
  }

  // R10 — no top-level completeness shortcut may exist next to the axes.
  if ("complete" in envelope || "capture_complete" in envelope) {
    errors.push(
      "top-level 'complete'/'capture_complete' is forbidden: a completeness claim signed by the producer is not proof of completeness — use the capture axis with an independent witness profile",
    );
  }

  for (const [key, value] of Object.entries(envelope)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      errors.push(`unknown key '${key}' (axes: ${AXES.join(", ")}; metadata: profile, subject)`);
    }
  }

  // Every axis must be PRESENT and EXPLICIT: absence would silently default
  // an axis to "fine", which is exactly the collapse the contract forbids.
  for (const axisName of AXES) {
    if (envelope[axisName] === undefined) {
      errors.push(`${axisName}: axis missing — every axis must be explicitly evaluated or explicitly not-evaluated`);
      continue;
    }
    validateAxis(axisName, envelope[axisName], errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Independence proof helper (R7/R8/R9): return ALL axis-outcome combinations
 * that the contract must ACCEPT. The contract is satisfied only when no pair
 * of independent axes constrains each other.
 */
export function independenceMatrixCases() {
  return [
    // R7 — authenticity pass does not imply semantic pass…
    {
      name: "R7a: semantic fail + authenticity valid is representable (no implication)",
      envelope: {
        structural: { evaluated: true, status: "pass" },
        semantic: { evaluated: true, status: "fail", violations: ["S-1"] },
        authenticity: { evaluated: true, status: "valid", binding: "exact" },
        chain: { evaluated: true, status: "intact" },
        capture: { evaluated: false },
      },
    },
    // …and R8 — semantic pass does not imply authenticity pass.
    {
      name: "R8: semantic pass + authenticity unsigned is representable (no implication)",
      envelope: {
        structural: { evaluated: true, status: "pass" },
        semantic: { evaluated: true, status: "pass", violations: [] },
        authenticity: { evaluated: true, status: "unsigned" },
        chain: { evaluated: true, status: "intact" },
        capture: { evaluated: false },
      },
    },
    // R9 — an intact chain says NOTHING about capture…
    {
      name: "R9a: chain intact + capture not evaluated is representable",
      envelope: {
        structural: { evaluated: true, status: "pass" },
        semantic: { evaluated: true, status: "pass", violations: [] },
        authenticity: { evaluated: true, status: "valid", binding: "exact" },
        chain: { evaluated: true, status: "intact" },
        capture: { evaluated: false },
      },
    },
    // R9b — …and capture CAN only be evaluated through an independent witness.
    {
      name: "R9b: capture complete-evidenced requires the witness profile",
      envelope: {
        structural: { evaluated: true, status: "pass" },
        semantic: { evaluated: true, status: "pass", violations: [] },
        authenticity: { evaluated: true, status: "valid", binding: "exact" },
        chain: { evaluated: true, status: "intact" },
        capture: { evaluated: true, status: "complete-evidenced", witness_profile: "aep-capture-witness-v1" },
      },
    },
    // R6 — evaluation state and record outcome never merge into one enum.
    {
      name: "R6: not-evaluated authenticity carries no outcome",
      envelope: {
        structural: { evaluated: true, status: "pass" },
        semantic: { evaluated: true, status: "pass", violations: [] },
        authenticity: { evaluated: false },
        chain: { evaluated: false },
        capture: { evaluated: false },
      },
    },
  ];
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith("verifier-result-contract.mjs") && process.argv[2]) {
  const { readFileSync } = await import("node:fs");
  let envelope;
  try {
    envelope = JSON.parse(readFileSync(process.argv[2], "utf8"));
  } catch (error) {
    console.error(`cannot read envelope: ${String(error).slice(0, 200)}`);
    process.exit(2);
  }
  const { valid, errors } = validateResultEnvelope(envelope);
  for (const e of errors) console.log(`FAIL ${e}`);
  console.log(valid ? "VALID: result envelope conforms to the verifier result contract" : `INVALID: ${errors.length} error(s)`);
  process.exit(valid ? 0 : 1);
}
