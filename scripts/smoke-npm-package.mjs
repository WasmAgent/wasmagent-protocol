#!/usr/bin/env node
// Packed-artifact CLI smoke test.
//
// Verifies the REAL npm tarball (npm pack), not the source tree: the packaging
// surface (bin mapping, files allowlist, corpus inclusion) can only be
// validated against what npm actually installs from the packed artifact.
//
// Checks, in a clean temp project:
//   1. clean `npm install <tarball>` succeeds
//   2. node_modules/.bin/wasmagent-protocol exists and is a file
//   3. `npx --no-install wasmagent-protocol aep-conformance path` prints a
//      path inside the installed package
//   4. `npx --no-install wasmagent-protocol aep-conformance self-check`
//      exits 0, reports 30/30 fixtures, and carries the not-independent notice
//
// Run: node scripts/smoke-npm-package.mjs

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();
}

const repoRoot = new URL("..", import.meta.url).pathname;

// Registry metadata must keep the bin mapping; fail here if it drifts.
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

const packLine = sh("npm", ["pack", "--json"], { cwd: repoRoot });
const packed = JSON.parse(packLine)[0];
if (!packed?.filename) {
  console.error("FAIL: npm pack did not report a tarball filename");
  process.exit(1);
}

const project = mkdtempSync(join(tmpdir(), "aep-pack-smoke-"));
let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`FAIL ${msg}`);
};

try {
  const tarball = join(project, packed.filename);
  sh("mv", [join(repoRoot, packed.filename), tarball]);

  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({ name: "aep-pack-smoke", version: "0.0.0", private: true }, null, 2),
  );
  sh("npm", ["install", tarball], { cwd: project });

  // 1. bin mapping survived packing + install.
  const binPath = join(project, "node_modules", ".bin", Object.keys(pkg.bin ?? {})[0] ?? "wasmagent-protocol");
  let binOk = false;
  try {
    binOk = statSync(binPath).isFile();
  } catch {
    binOk = false;
  }
  if (binOk) console.log("OK   node_modules/.bin/wasmagent-protocol present");
  else fail("node_modules/.bin/wasmagent-protocol missing after install");

  const npx = (args) =>
    spawnSync("npx", ["--no-install", "wasmagent-protocol", ...args], {
      cwd: project,
      encoding: "utf8",
    });

  // 2. discovery works from the installed package.
  const pathRun = npx(["aep-conformance", "path"]);
  if (pathRun.status !== 0) {
    fail(`aep-conformance path exited ${pathRun.status}: ${pathRun.stderr}`);
  } else if (!pathRun.stdout.includes(join(project, "node_modules"))) {
    fail(`aep-conformance path points outside the installed package: ${pathRun.stdout}`);
  } else {
    console.log(`OK   aep-conformance path -> ${pathRun.stdout.trim()}`);
  }

  // 3. self-check passes on the installed corpus with the honesty notice.
  const checkRun = npx(["aep-conformance", "self-check"]);
  const out = `${checkRun.stdout}`;
  if (checkRun.status !== 0) fail(`aep-conformance self-check exited ${checkRun.status}`);
  else console.log("OK   aep-conformance self-check exited 0");
  if (!/30\/30/.test(out)) fail("self-check did not report 30/30 corpus completeness");
  if (!out.includes("NOT independent semantic verification")) {
    fail("self-check output missing the not-independent notice");
  }
  if (checkRun.status === 0 && failures === 0) {
    console.log("OK   packed-artifact CLI smoke: bin + discovery + self-check all pass");
  }
} finally {
  rmSync(project, { recursive: true, force: true });
}

process.exit(failures ? 1 : 0);
