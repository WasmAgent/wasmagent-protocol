#!/usr/bin/env node
/**
 * Result-contract validator for the exact-SHA consumer L2/L3 adequacy CI lane.
 *
 * Consumes the machine-readable output of
 *   run-adequacy.mjs --known --consumer-only --consumer-js <dir> --json <file>
 * and enforces the lane contract:
 *
 *   LC-01  file parses and declares the adequacy-run schema
 *   LC-02  selection is the consumer-only known subset, no frozen-authority
 *          drift was tolerated, and the corpus manifest matches the freeze
 *   LC-03  the consumer checkout identity matches the PINNED exact SHA
 *          (consumer SHA drift fails the lane)
 *   LC-04  controls green: CTL-POS-01 detected, CTL-INERT-01 inert
 *   LC-05  the exact expected L2/L3 fault set is present (no silent shrinkage)
 *   LC-06  every fault outcome is inside the declared result vocabulary
 *   LC-07  no crash / missing-result / fail-closed-exit / harness-defect /
 *          unrelated-failure / control-failure anywhere
 *   LC-08  every survivor is one of the classified survivors in
 *          frozen-authority.json (an unclassified survivor fails the lane)
 *   LC-09  the counts summary is internally consistent
 *   LC-10  the claim ceiling is present and verbatim
 *
 * This lane is project-owned cross-repository adequacy: it is NOT independent
 * semantic verification, NOT independent authenticity verification, and NOT
 * certification.
 *
 * Usage: node check-consumer-lane-result.mjs <run.json> <pinned-40-hex-sha>
 * Exit 0 = contract holds; 1 = violation; 2 = usage error.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLAIM_CEILING =
  "project-owned mutation adequacy against the declared fault set — not independent semantic verification, not certification, not proof of corpus completeness or generalisation";
const EXPECTED_FAULTS = [
  "L2-1", "L2-2", "L2-3", "L2-4", "L2-5", "L2-6", "L2-7",
  "L3-1", "L3-2", "L3-3", "L3-4", "L3-5",
];
const VOCABULARY = new Set([
  "detected",
  "survivor",
  "crash",
  "missing-result",
  "fail-closed-exit",
  // harness bookkeeping outcomes (never semantic detection):
  "inert-ok",
  "control-failure",
  "harness-defect",
  "unrelated-failure",
  "skipped-consumer-unavailable",
]);
const FATAL_OUTCOMES = new Set([
  "crash",
  "missing-result",
  "fail-closed-exit",
  "harness-defect",
  "control-failure",
  "unrelated-failure",
]);

const [jsonPath, pinnedSha] = process.argv.slice(2);
if (!jsonPath || !pinnedSha) {
  console.error("usage: check-consumer-lane-result.mjs <run.json> <pinned-40-hex-sha>");
  process.exit(2);
}
if (!/^[0-9a-f]{40}$/.test(pinnedSha)) {
  console.error(`FAIL pinned consumer SHA is not a full 40-hex SHA: ${pinnedSha}`);
  process.exit(1);
}

const failures = [];
const check = (id, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${detail}`);
  if (!ok) failures.push(id);
};

let run;
try {
  run = JSON.parse(readFileSync(resolve(jsonPath), "utf8"));
} catch (e) {
  console.error(`FAIL LC-01 machine-readable result unreadable: ${e.message}`);
  process.exit(1);
}

check("LC-01", run?.schema === "wasmagent-aep-adequacy-run/v1", `schema=${run?.schema}`);

const frozen = run?.frozen_authority ?? {};
check(
  "LC-02",
  run?.selection === "known" &&
    run?.consumer_only === true &&
    Array.isArray(run?.drift_recorded) &&
    run.drift_recorded.length === 0 &&
    run?.manifest_sha256 === frozen?.measured_inputs?.manifest?.sha256,
  `selection=${run?.selection} consumer_only=${run?.consumer_only} drift=${JSON.stringify(run?.drift_recorded)}`,
);

const resolvedSha = run?.consumer_js?.head ?? null;
check("LC-03", resolvedSha === pinnedSha, `pinned=${pinnedSha} resolved=${resolvedSha ?? "<absent>"}`);

const controls = Array.isArray(run?.controls) ? run.controls : [];
const pos = controls.find((c) => c.fault_id === "CTL-POS-01");
const inert = controls.find((c) => c.fault_id === "CTL-INERT-01");
check(
  "LC-04",
  pos?.outcome === "detected" && inert?.outcome === "inert-ok",
  `CTL-POS-01=${pos?.outcome ?? "<absent>"} CTL-INERT-01=${inert?.outcome ?? "<absent>"}`,
);

const results = Array.isArray(run?.results) ? run.results : [];
const realResults = results.filter((r) => !r.fault_id.startsWith("CTL-"));
const got = new Set(realResults.map((r) => r.fault_id));
const missing = EXPECTED_FAULTS.filter((f) => !got.has(f));
const extra = [...got].filter((f) => !EXPECTED_FAULTS.includes(f));
check("LC-05", missing.length === 0 && extra.length === 0,
  `missing=[${missing.join(",") || "none"}] unexpected=[${extra.join(",") || "none"}]`);

const outsideVocab = realResults.filter((r) => !VOCABULARY.has(r.outcome));
check("LC-06", outsideVocab.length === 0,
  outsideVocab.length === 0 ? "all outcomes inside declared vocabulary" :
    outsideVocab.map((r) => `${r.fault_id}:${r.outcome}`).join(", "));

const fatal = realResults.filter((r) => FATAL_OUTCOMES.has(r.outcome));
check("LC-07", fatal.length === 0,
  fatal.length === 0 ? "no crash / missing-result / fail-closed-exit / harness-defect / unrelated-failure" :
    fatal.map((r) => `${r.fault_id}:${r.outcome}`).join(", "));

let allowlist = [];
try {
  allowlist = JSON.parse(readFileSync(join(HERE, "frozen-authority.json"), "utf8"))
    ?.ci_gate?.classified_survivors_known ?? [];
} catch { /* absent frozen-authority is itself a defect */ }
const survivors = realResults.filter((r) => r.outcome === "survivor");
const unclassified = survivors.filter((r) => !allowlist.includes(r.fault_id));
check("LC-08", unclassified.length === 0,
  unclassified.length === 0
    ? `survivors=[${survivors.map((r) => r.fault_id).join(",") || "none"}] all classified`
    : unclassified.map((r) => r.fault_id).join(", "));

const counts = run?.counts ?? {};
const counted = Object.entries(counts).reduce((acc, [, n]) => acc + n, 0);
check("LC-09", counted === results.length, `counts sum ${counted} vs results ${results.length}`);

check("LC-10", run?.claim_ceiling === CLAIM_CEILING, "claim ceiling verbatim");

if (failures.length > 0) {
  console.error(`CONSUMER LANE CONTRACT FAILED: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(
  "CONSUMER LANE CONTRACT OK — project-owned cross-repository adequacy, " +
  "NOT independent semantic verification, NOT independent authenticity verification, NOT certification.",
);
