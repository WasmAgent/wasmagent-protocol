#!/usr/bin/env node
// @wasmagent/protocol — cross-repo schema drift gate CLI.
//
//   wasmagent-protocol check path/to/aep-record.schema.json --id aep-record
//   wasmagent-protocol check --scan --root .
//
// Exits non-zero on any drift or violation. See index.js for the library API.

import { resolve } from 'node:path';
import {
  checkFile,
  scan,
  hasDrift,
} from '../index.js';

function format(f) {
  const level = f.ok ? 'OK' : 'ERROR';
  return `${level.padEnd(5)} [${f.code}] ${f.path}: ${f.message}`;
}

function parseArgs(argv) {
  const out = { command: null, path: null, schemaId: null, root: '.', scan: false, allowCanonicalSource: false, help: false, version: false };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '-v' || a === '--version') out.version = true;
    else if (a === 'check') out.command = 'check';
    else if (a === '--scan') out.scan = true;
    else if (a === '--allow-canonical-source') out.allowCanonicalSource = true;
    else if (a === '--id') out.schemaId = args[++i];
    else if (a === '--root') out.root = args[++i];
    else if (a.startsWith('--')) {
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

Exits non-zero on any drift or violation.`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.command === null) {
    printHelp();
    return args.command === null ? 1 : 0;
  }
  if (args.version) {
    console.log('@wasmagent/protocol drift gate');
    return 0;
  }
  if (args.command !== 'check') {
    console.error(`error: unknown command ${args.command}`);
    return 2;
  }

  if (args.path) {
    if (!args.schemaId) {
      console.error('error: --id is required when checking an explicit path');
      return 2;
    }
    const finding = checkFile(args.path, args.schemaId);
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
