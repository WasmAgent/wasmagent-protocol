#!/usr/bin/env node
// @wasmagent/protocol — cross-repo schema drift gate CLI.
//
//   wasmagent-protocol check path/to/aep-record.schema.json --id aep-record
//   wasmagent-protocol check --scan --root .
//   wasmagent-protocol aep-conformance path|manifest|self-check
//
// Exits non-zero on any drift or violation. See index.js for the library API.

import { resolve } from 'node:path';
import {
  aepConformanceSelfCheck,
  checkFile,
  getAepConformanceDir,
  getAepConformanceManifest,
  hasDrift,
  scan,
} from '../index.js';

function format(f) {
  const level = f.ok ? 'OK' : 'ERROR';
  return `${level.padEnd(5)} [${f.code}] ${f.path}: ${f.message}`;
}

function parseArgs(argv) {
  const out = { command: null, path: null, schemaId: null, root: '.', scan: false, allowCanonicalSource: false, aepAction: null, help: false, version: false };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '-v' || a === '--version') out.version = true;
    else if (a === 'check') out.command = 'check';
    else if (a === 'aep-conformance') out.command = 'aep-conformance';
    else if (a === 'path' || a === 'manifest' || a === 'self-check') {
      if (out.command === 'aep-conformance' && out.aepAction === null) out.aepAction = a;
      else if (out.command === 'check' && out.path === null) out.path = a;
      else {
        console.error(`error: unexpected argument ${a}`);
        process.exit(2);
      }
    }
    else if (a === '--scan') out.scan = true;
    else if (a === '--allow-canonical-source') out.allowCanonicalSource = true;
    else if (a === '--id') {
      if (i + 1 >= args.length) {
        console.error('error: --id requires a value');
        process.exit(2);
      }
      out.schemaId = args[++i];
    } else if (a === '--root') {
      if (i + 1 >= args.length) {
        console.error('error: --root requires a value');
        process.exit(2);
      }
      out.root = args[++i];
    } else if (a.startsWith('--')) {
      console.error(`error: unknown option ${a}`);
      process.exit(2);
    } else if (out.command === 'check' && out.path === null) out.path = a;
    else {
      console.error(`error: unexpected argument ${a}`);
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  console.log(`@wasmagent/protocol — cross-repo schema drift gate

Usage:
  wasmagent-protocol check <path> --id <schema-id>
      Compare one vendored *.schema.json to the canonical version.

  wasmagent-protocol check --scan [--root <dir>] [--allow-canonical-source]
      Scan a repo for drifted canonical schemas, re-declared canonical $ids
      without a package dependency, and competing schemas/index.json registries.

  wasmagent-protocol aep-conformance path
      Print the packaged AEP conformance corpus directory.

  wasmagent-protocol aep-conformance manifest
      Print the AEP conformance manifest (the corpus verdict authority).

  wasmagent-protocol aep-conformance self-check
      Verify the packaged corpus against the manifest and the project-owned
      reference layers. Self-check is NOT independent semantic verification.

Exits non-zero on any drift or violation.`);
}

function runAepConformance(args) {
  if (!args.aepAction) {
    console.error('error: aep-conformance requires an action: path | manifest | self-check');
    return 2;
  }
  if (args.aepAction === 'path') {
    console.log(getAepConformanceDir());
    return 0;
  }
  if (args.aepAction === 'manifest') {
    console.log(JSON.stringify(getAepConformanceManifest(), null, 2));
    return 0;
  }
  const { ok, report } = aepConformanceSelfCheck();
  for (const line of report) console.log(line);
  return ok ? 0 : 1;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.version) {
    console.log('@wasmagent/protocol drift gate');
    return 0;
  }
  if (args.help || args.command === null) {
    printHelp();
    return args.command === null ? 1 : 0;
  }
  if (args.command === 'aep-conformance') return runAepConformance(args);
  if (args.command !== 'check') {
    console.error(`error: unknown command ${args.command}`);
    return 2;
  }

  if (args.path) {
    if (!args.schemaId) {
      console.error('error: --id is required when checking an explicit path');
      return 2;
    }
    let finding;
    try {
      finding = checkFile(args.path, args.schemaId);
    } catch (err) {
      console.error(`error: cannot check ${args.path}: ${err.message}`);
      return 2;
    }
    console.log(format(finding));
    return finding.ok ? 0 : 1;
  }

  const root = resolve(args.root);
  const findings = scan(root, { allowCanonicalSource: args.allowCanonicalSource });
  for (const f of findings) console.log(format(f));
  if (hasDrift(findings)) {
    const errors = findings.filter((f) => !f.ok);
    console.error(`\n${errors.length} drift/violation(s) found under ${root}`);
    return 1;
  }
  const checked = findings.filter((f) => f.code === 'match').length;
  console.log(`no drift detected under ${root} (${checked} canonical schema file(s) verified)`);
  return 0;
}

process.exit(main());
