#!/usr/bin/env node
/**
 * Gate C provenance + certified_at time verification (GP-01..GP-10).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const protoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const failures = [];
const check = (id, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${detail}`);
  if (!ok) failures.push(id);
};

let target;
try {
  target = JSON.parse(readFileSync(join(protoRoot, "conformance/aep/certified-target.json"), "utf8"));
} catch (e) {
  console.error(`target unreadable: ${e.message?.slice(0, 200)}`);
  process.exit(1);
}

const runId = String(target.gate_c_run_id ?? "");
check("GP-01", /^\d+$/.test(runId), `gate_c_run_id=${target.gate_c_run_id ?? "<missing>"}`);

let gate = null;
const gateDir = join(protoRoot, "conformance/aep/gate-provenance");
try {
  for (const f of readdirSync(gateDir)) {
    if (!f.endsWith(".json")) continue;
    const gp = JSON.parse(readFileSync(join(gateDir, f), "utf8"));
    if (String(gp.gate_c_run_id) === runId) { gate = gp; break; }
  }
} catch { /* dir absent */ }

check("GP-02", gate !== null && gate.conclusion === "success",
  `gate conclusion=${gate?.conclusion ?? "<no provenance>"}`);

if (gate) {
  check("GP-03", gate.head_sha === target.protocol && gate.component_tuple?.protocol === target.protocol,
    `gate head vs target.protocol`);
} else {
  check("GP-03", false, "no gate provenance");
}

let erratum = null;
const errPath = arg("erratum");
if (errPath) {
  try { erratum = JSON.parse(readFileSync(join(protoRoot, errPath), "utf8")); }
  catch (e) { console.error(`erratum unreadable: ${e.message?.slice(0, 200)}`); process.exit(1); }
}
const certifiedAt = erratum ? erratum.corrected_value : target.certified_at;

check("GP-04",
  typeof certifiedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(certifiedAt) && gate !== null && certifiedAt === gate.completed_at,
  `certified_at=${certifiedAt ?? "<missing>"} vs completed_at=${gate?.completed_at ?? "<missing>"}`);

check("GP-05",
  certifiedAt !== undefined && gate !== null && gate.started_at !== undefined && certifiedAt >= gate.started_at,
  `certified_at >= gate.started_at`);

if (erratum) {
  check("GP-06", erratum.target_id === target.target_id, `erratum target_id=${erratum.target_id}`);
  const leaked = ["protocol","js","proxy","trace","component_tuple","signing_profile_id","verdict","supersedes"].filter(k => k in erratum);
  check("GP-07", leaked.length === 0, `tuple/signing leak: [${leaked.join(",") || "none"}]`);
  check("GP-08", erratum.changes_component_identity === false, "metadata-only");
  check("GP-08b", erratum.field === "certified_at", `field=${erratum.field}`);
  check("GP-09", erratum.recertification === false && erratum.changes_publication_identity === false, "no recert");
  check("GP-10", erratum.correction_type === "metadata-erratum" && erratum.published_value === "2026-09-16T00:00:00Z", "correction type");
}

console.log(failures.length === 0
  ? `VALID: Gate C provenance consistent for ${target.target_id}`
  : `INVALID: ${failures.join(", ")}`);
process.exit(failures.length === 0 ? 0 : 1);
