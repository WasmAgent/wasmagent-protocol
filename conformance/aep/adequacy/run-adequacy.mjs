#!/usr/bin/env node
/**
 * AEP conformance corpus adequacy harness (non-invasive seeded-fault runner).
 *
 * For every fault in faults-v1.json the harness builds a TEMPORARY patched
 * copy of the targeted verifier (declarative find/replace — the in-tree
 * verifier is never modified), runs it against the FROZEN corpus, and scores:
 *
 *   detected        the mutated verifier changes the targeted result exactly
 *                   as the fault's witness describes
 *   crash           the mutant run crashed / exit >= 2 (reported separately —
 *                   never counted as semantic detection)
 *   missing-result  no parseable verdict output
 *   fail-closed-exit the mutant hit a fail-closed gate before evaluating any
 *                   witness (e.g. signing-profile guard)
 *   survivor        the targeted result is unchanged
 *
 * Controls: CTL-POS-01 must be detected (else the run is INVALID);
 * CTL-INERT-01 must leave every outcome unchanged (else harness defect).
 *
 * Usage:
 *   node conformance/aep/adequacy/run-adequacy.mjs --known
 *   node conformance/aep/adequacy/run-adequacy.mjs --known  --consumer-js /path/to/wasmagent-js
 *   node conformance/aep/adequacy/run-adequacy.mjs --heldout --consumer-js /path/to/wasmagent-js
 *   node conformance/aep/adequacy/run-adequacy.mjs --known --consumer-only --consumer-js /path/to/wasmagent-js [--json <out>]
 *   node conformance/aep/adequacy/run-adequacy.mjs --all    [--json <out>] [--allow-drift]
 *
 *   --consumer-only restricts the fault set to the KNOWN consumer-js adapter
 *   faults (L2 authenticity / L3 chain) while keeping both controls gating
 *   the run — the exact-SHA CI lane subset. It requires --consumer-js.
 *
 * Outputs: per-fault table on stdout; with --json, a machine result file.
 * The harness writes ONLY to the --json path and a self-cleaning tmp dir.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../.."); // wasmagent-protocol root
const CORPUS = join(REPO_ROOT, "conformance", "aep");

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const want = {
  known: args.includes("--known"),
  heldout: args.includes("--heldout"),
  all: args.includes("--all"),
};
const consumerOnly = args.includes("--consumer-only");
const consumerJs = (() => {
  const i = args.indexOf("--consumer-js");
  return i >= 0 ? resolve(args[i + 1]) : process.env.ADEQUACY_CONSUMER_JS
    ? resolve(process.env.ADEQUACY_CONSUMER_JS)
    : null;
})();
const jsonOut = (() => {
  const i = args.indexOf("--json");
  return i >= 0 ? resolve(args[i + 1]) : null;
})();
const allowDrift = args.includes("--allow-drift");
const checkKnown = args.includes("--check-known");
const selection = want.all ? "all" : want.known ? "known" : want.heldout ? "heldout" : null;
if (!selection) {
  console.error("usage: run-adequacy.mjs --known | --heldout | --all [--consumer-only] [--consumer-js <dir>] [--json <file>] [--allow-drift]");
  process.exit(2);
}
if (consumerOnly && selection !== "known") {
  console.error("--consumer-only combines only with --known");
  process.exit(2);
}
if (consumerOnly && !consumerJs) {
  console.error("--consumer-only requires --consumer-js <dir> (the L2/L3 subset has no meaning without the consumer adapter)");
  process.exit(2);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (p) => readFileSync(p, "utf8");

// ── B0 freeze check ──────────────────────────────────────────────────────────
const frozen = JSON.parse(read(join(HERE, "frozen-authority.json")));
const faultsManifest = JSON.parse(read(join(HERE, "faults-v1.json")));
const drift = [];
const manifestSha = sha256(readFileSync(join(CORPUS, "manifest.json")));
const contractSha = sha256(readFileSync(join(CORPUS, "verifier-result-contract.md")));
if (manifestSha !== frozen.measured_inputs.manifest.sha256) {
  drift.push(`manifest.json sha ${manifestSha} != frozen ${frozen.measured_inputs.manifest.sha256}`);
}
if (contractSha !== frozen.measured_inputs.verifier_result_contract.sha256) {
  drift.push(`verifier-result-contract.md sha ${contractSha} != frozen`);
}
if (drift.length > 0 && !allowDrift) {
  console.error(`REFUSING to run — frozen authority drifted:\n  - ${drift.join("\n  - ")}`);
  console.error("Re-freeze frozen-authority.json deliberately, or pass --allow-drift to record the drift.");
  process.exit(2);
}

// ── fault selection ──────────────────────────────────────────────────────────
// Controls ALWAYS gate the run (they validate the harness itself), so they are
// drawn from the full known set regardless of the fault-subset selection.
const inScopeKnown = faultsManifest.faults.filter(
  (f) => f.in_scope === true && f.known_or_heldout === "known"
);
const controls = inScopeKnown.filter((f) => f.layer === "control");
const faults = consumerOnly
  ? inScopeKnown.filter((f) => f.adapter === "consumer-js")
  : faultsManifest.faults.filter((f) => {
      if (f.in_scope !== true) return false;
      if (selection === "all") return true;
      return f.known_or_heldout === selection;
    });
const realFaults = faults.filter((f) => f.layer !== "control");

// ── tmp workspace (self-cleaning) ────────────────────────────────────────────
const TMP = mkdtempSync(join(tmpdir(), "aep-adequacy-"));
let consumerHead = null;
try {
  runFaults();
} finally {
  rmSync(TMP, { recursive: true, force: true });
  if (consumerJs) rmSync(join(consumerJs, "packages", "aep", ".aep-adequacy"), { recursive: true, force: true });
}

// ── engine ───────────────────────────────────────────────────────────────────
function applyMutation(sourceText, fault) {
  const occurrences = sourceText.split(fault.find).length - 1;
  if (occurrences !== 1) {
    return { error: `find-string occurs ${occurrences} times (expected exactly 1) in ${fault.target_file}` };
  }
  return { text: sourceText.replace(fault.find, fault.replace) };
}

function writePatched(absPath, text) {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, text);
}

/** Build a python-corpus mutant workspace; returns the runner path. */
function buildPythonMutant(fault) {
  const ws = join(TMP, "py", fault.fault_id);
  // Mirror the repo layout the runner expects (REPO_ROOT = ws):
  //   scripts/run-aep-conformance-corpus.py, src/wasmagent_protocol/…,
  //   schemas/aep/aep-record.schema.json (resolved from manifest.canonical_schema).
  const runnerSrc = join(REPO_ROOT, "scripts", "run-aep-conformance-corpus.py");
  const semanticSrc = join(REPO_ROOT, "src", "wasmagent_protocol", "conformance.py");
  const schemaRel = JSON.parse(read(join(CORPUS, "manifest.json"))).canonical_schema;
  cpSync(runnerSrc, join(ws, "scripts", "run-aep-conformance-corpus.py"));
  cpSync(semanticSrc, join(ws, "src", "wasmagent_protocol", "conformance.py"));
  cpSync(join(REPO_ROOT, schemaRel), join(ws, schemaRel));

  const targetAbs =
    fault.target_file.endsWith("conformance.py")
      ? join(ws, "src", "wasmagent_protocol", "conformance.py")
      : join(ws, "scripts", "run-aep-conformance-corpus.py");
  const applied = applyMutation(read(targetAbs), fault);
  if (applied.error) return { error: applied.error };
  writePatched(targetAbs, applied.text);
  return { cmd: "python3", args: [join(ws, "scripts", "run-aep-conformance-corpus.py"), CORPUS], cwd: ws };
}

/** Build a result-contract mutant; returns a runner over the envelope inputs. */
function buildContractMutant(fault) {
  const ws = join(TMP, "rc", fault.fault_id);
  const src = join(REPO_ROOT, "scripts", "verifier-result-contract.mjs");
  cpSync(src, join(ws, "verifier-result-contract.mjs"));
  const applied = applyMutation(read(src), fault);
  if (applied.error) return { error: applied.error };
  writePatched(join(ws, "verifier-result-contract.mjs"), applied.text);
  return { cmd: "node", args: [join(ws, "verifier-result-contract.mjs")], cwd: ws, contractAdapter: true };
}

/** Build a consumer-js mutant (verify-corpus.mjs + full packages/aep/src copy). */
function buildConsumerMutant(fault) {
  if (!consumerJs) return { error: "consumer-js adapter unavailable (pass --consumer-js)" };
  // The mutant workspace lives INSIDE the consumer repo tree, under
  // packages/aep/, so package resolution (@noble/ed25519 …) walks up through
  // packages/aep/node_modules — the layout that resolves under both bun
  // linker modes (hoisted roots everything at the repo root; isolated keeps
  // workspace deps under packages/aep/node_modules). It is namespaced and
  // removed after the run (see the finally block).
  const ws = join(consumerJs, "packages", "aep", ".aep-adequacy", fault.fault_id);
  const gateSrc = join(consumerJs, "scripts", "verify-corpus.mjs");
  cpSync(gateSrc, join(ws, "verify-corpus.mjs"));
  cpSync(join(consumerJs, "packages", "aep", "src"), join(ws, "aep"), { recursive: true });

  // Rewrite the gate's import of the aep package to the patched copy.
  let gate = read(join(ws, "verify-corpus.mjs"));
  gate = gate.replace(
    /\.\.\/packages\/aep\/src\/index\.ts/g,
    join(ws, "aep", "index.ts")
  );
  let targetAbs;
  if (fault.target_file.endsWith("verify-corpus.mjs")) {
    targetAbs = join(ws, "verify-corpus.mjs");
  } else if (fault.target_file.endsWith("verify.ts")) {
    targetAbs = join(ws, "aep", "verify.ts");
  } else if (fault.target_file.endsWith("dsse.ts")) {
    targetAbs = join(ws, "aep", "dsse.ts");
  } else {
    return { error: `consumer-js adapter cannot map target ${fault.target_file}` };
  }
  if (targetAbs === join(ws, "verify-corpus.mjs")) {
    const applied = applyMutation(gate, fault);
    if (applied.error) return { error: applied.error };
    gate = applied.text;
  } else {
    const applied = applyMutation(read(targetAbs), fault);
    if (applied.error) return { error: applied.error };
    writePatched(targetAbs, applied.text);
  }
  writePatched(join(ws, "verify-corpus.mjs"), gate);
  return { cmd: "bun", args: [join(ws, "verify-corpus.mjs"), CORPUS], cwd: consumerJs, ws };
}

function runVerdict(build) {
  const res = spawnSync(build.cmd, build.args, { cwd: build.cwd, encoding: "utf8", timeout: 120_000 });
  return {
    exit: res.status ?? (res.error ? -1 : null),
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    signal: res.signal ?? null,
  };
}

function scoreFault(fault, frozenRun, mutantRun) {
  // fail-closed gates (exit 2) evaluate no witness.
  if (mutantRun.exit === 2) return "fail-closed-exit";
  if (mutantRun.exit < 0 || mutantRun.signal) return "crash";
  if (fault.adapter === "result-contract") {
    // Direction: a weakened validator ACCEPTS the violating envelope (exit 0).
    if (frozenRun.exit !== 1) return "harness-defect"; // frozen must reject the witness
    if (mutantRun.exit === 0) return "detected";
    if (mutantRun.exit === 1) return "survivor";
    return "crash";
  }
  // corpus adapters: frozen run must be exit 0 (all agree).
  if (frozenRun.exit !== 0) return "harness-defect";
  if (mutantRun.exit === 0) return "survivor";
  const combined = `${mutantRun.stdout}\n${mutantRun.stderr}`;
  // Declarative witnesses: a fault is detected only when a FAIL line names one
  // of its witness fixtures. With NO declared witness, any disagreement counts
  // (a fixture the mutant newly fails proves the corpus discriminates).
  const witnesses = fault.witness_fixtures ?? [];
  if (witnesses.length === 0) return "detected";
  if (witnesses.some((w) => combined.includes(`FAIL ${w}`))) return "detected";
  if (combined.includes("FAIL") || combined.includes("Traceback")) return "unrelated-failure";
  return "missing-result";
}

function runFaults() {
  console.log(`aep adequacy run — selection=${selection}, faults=${realFaults.length}+${controls.length} controls`);
  console.log(`frozen authority: manifest ${frozen.measured_inputs.manifest.sha256.slice(0, 12)}…, protocol ${frozen.protocol_repo_sha.slice(0, 12)}…`);
  if (drift.length > 0) console.log(`DRIFT RECORDED (--allow-drift):\n  - ${drift.join("\n  - ")}`);
  if (consumerJs) {
    consumerHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: consumerJs, encoding: "utf8" }).stdout?.trim() ?? null;
    console.log(`consumer-js: ${consumerJs} @ ${consumerHead ?? "unknown"}`);
  } else {
    console.log("consumer-js: NOT AVAILABLE — L2/L3 faults will be reported as skipped-consumer-unavailable");
  }

  const results = [];
  const frozenPython = runVerdict({ cmd: "python3", args: [join(REPO_ROOT, "scripts", "run-aep-conformance-corpus.py"), CORPUS], cwd: REPO_ROOT });
  const frozenContractEnvelope = join(HERE, "envelopes", "_valid-baseline.json");

  // Controls gate the whole run.
  for (const ctl of controls) {
    const build =
      ctl.adapter === "python-corpus"
        ? buildPythonMutant(ctl)
        : ctl.adapter === "result-contract"
          ? buildContractMutant(ctl)
          : buildConsumerMutant(ctl);
    if (build.error) {
      console.error(`INVALID: control ${ctl.fault_id} could not be built: ${build.error}`);
      process.exit(3);
    }
    const mutant = runVerdict(build);
    let ok;
    if (ctl.fault_id === "CTL-POS-01") {
      ok = scoreFault({ ...ctl, expected_witness: "invalid-semantic/floor-roundup.json" }, frozenPython, mutant) === "detected";
    } else {
      ok = mutant.exit === 0 && mutant.stdout === frozenPython.stdout; // inert: byte-identical outcome
    }
    results.push({ fault_id: ctl.fault_id, outcome: ok ? (ctl.fault_id === "CTL-POS-01" ? "detected" : "inert-ok") : "control-failure", exit: mutant.exit });
    if (!ok) {
      console.error(`INVALID: control ${ctl.fault_id} failed — run results are void.`);
      if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify({ invalid: true, controls: results }, null, 2)}\n`);
      process.exit(3);
    }
  }
  console.log("controls: CTL-POS-01 detected ✓, CTL-INERT-01 inert ✓");

  for (const fault of realFaults) {
    if (fault.adapter === "consumer-js" && !consumerJs) {
      results.push({ fault_id: fault.fault_id, outcome: "skipped-consumer-unavailable" });
      continue;
    }
    const build =
      fault.adapter === "python-corpus"
        ? buildPythonMutant(fault)
        : fault.adapter === "result-contract"
          ? buildContractMutant(fault)
          : buildConsumerMutant(fault);
    if (build.error) {
      results.push({ fault_id: fault.fault_id, outcome: "harness-defect", detail: build.error });
      continue;
    }
    const frozenRun =
      fault.adapter === "result-contract"
        ? runVerdict({ cmd: "node", args: [join(REPO_ROOT, "scripts", "verifier-result-contract.mjs"), witnessPath(fault)], cwd: REPO_ROOT })
        : fault.adapter === "python-corpus"
          ? frozenPython
          : runVerdict({ cmd: "bun", args: [join(consumerJs, "scripts", "verify-corpus.mjs"), CORPUS], cwd: consumerJs });
    const mutant = runVerdict(build);
    if (build.ws) rmSync(build.ws, { recursive: true, force: true });
    const outcome = scoreFault(fault, frozenRun, mutant);
    const rec = { fault_id: fault.fault_id, outcome, exit: mutant.exit };
    if (outcome !== "detected" && outcome !== "survivor") {
      rec.output_tail = `${mutant.stdout}\n${mutant.stderr}`.trim().split("\n").slice(-8).join("\n");
    }
    results.push(rec);
  }

  // ── report ────────────────────────────────────────────────────────────────
  const counts = results.reduce((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\nper-fault outcomes:");
  for (const r of results) console.log(`  ${r.fault_id.padEnd(12)} ${r.outcome}${r.detail ? ` — ${r.detail}` : ""}`);
  console.log("\nsummary:", JSON.stringify(counts));
  console.log(
    "\nCLAIM CEILING: project-owned mutation adequacy against the declared fault set — not independent semantic verification, not certification, not proof of corpus completeness or generalisation."
  );

  if (checkKnown) {
    // CI gate: controls green, no harness defects, and every survivor is one
    // of the deliberately classified survivors in frozen-authority.json.
    const allowlist = new Set(frozen.ci_gate?.classified_survivors_known ?? []);
    const bad = [];
    for (const r of results) {
      if (r.fault_id.startsWith("CTL-")) continue;
      if (["harness-defect", "crash", "missing-result", "unrelated-failure", "fail-closed-exit"].includes(r.outcome)) {
        bad.push(`${r.fault_id}: ${r.outcome}`);
      } else if (r.outcome === "survivor" && !allowlist.has(r.fault_id)) {
        bad.push(`${r.fault_id}: unclassified survivor — classify it and update frozen-authority.json`);
      } else if (r.outcome === "skipped-consumer-unavailable" && consumerJs) {
        bad.push(`${r.fault_id}: skipped even though a consumer was provided`);
      }
    }
    if (bad.length > 0) {
      console.error(`CHECK-KNOWN FAILED:\n  - ${bad.join("\n  - ")}`);
      process.exit(1);
    }
    console.log("CHECK-KNOWN OK: controls green, no harness defects, all survivors classified.");
  }

  if (jsonOut) {
    writeFileSync(
      jsonOut,
      `${JSON.stringify(
        {
          schema: "wasmagent-aep-adequacy-run/v1",
          selection,
          consumer_only: consumerOnly,
          claim_ceiling:
            "project-owned mutation adequacy against the declared fault set — not independent semantic verification, not certification, not proof of corpus completeness or generalisation",
          frozen_authority: frozen,
          drift_recorded: drift,
          faults_manifest_id: faultsManifest.manifest_id,
          protocol_repo_sha: frozen.protocol_repo_sha,
          consumer_js: consumerJs ? { path: consumerJs, head: consumerHead } : null,
          manifest_sha256: manifestSha,
          contract_sha256: contractSha,
          controls: results.filter((r) => r.fault_id.startsWith("CTL-")),
          results,
          counts,
          generated_at_utc: new Date().toISOString(),
        },
        null,
        2
      )}\n`
    );
    console.log(`wrote ${jsonOut}`);
  }
}

function witnessPath(fault) {
  const m = fault.expected_witness.match(/envelopes\/([\w.-]+\.json)/);
  return m ? join(HERE, "envelopes", m[1]) : frozenContractEnvelope;
}
