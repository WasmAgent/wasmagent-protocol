#!/usr/bin/env node
/**
 * Verify that consumer dependency declarations stay within the supported
 * wasmagent-protocol 0.1.x release line.
 *
 * Usage: node scripts/check-consumer-versions.mjs <consumer-dir> [...consumer-dir]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const PROTOCOL_BANDS = new Map([
  ['@wasmagent/protocol', '>=0.1.0 <0.2.0'],
  ['wasmagent-protocol', '>=0.1.0 <0.2.0'],
]);
const IGNORED_DIRECTORIES = new Set([
  '.git', '.venv', 'node_modules', 'vendor', '__pycache__', 'dist', 'build',
]);

function parseVersion(value) {
  const match = String(value).trim().replace(/^v/, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) return null;
  return match.slice(1).map((part) => Number(part ?? 0));
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function nextVersion(version, component) {
  const next = [...version];
  next[component] += 1;
  for (let index = component + 1; index < 3; index += 1) next[index] = 0;
  return next;
}

function setLower(interval, version, inclusive) {
  if (!interval.lower || compareVersions(version, interval.lower) > 0
      || (compareVersions(version, interval.lower) === 0 && !inclusive)) {
    interval.lower = version;
    interval.lowerInclusive = inclusive;
  }
}

function setUpper(interval, version, inclusive) {
  if (!interval.upper || compareVersions(version, interval.upper) < 0
      || (compareVersions(version, interval.upper) === 0 && !inclusive)) {
    interval.upper = version;
    interval.upperInclusive = inclusive;
  }
}

function addTerm(interval, operator, rawVersion) {
  const value = rawVersion.trim().replace(/^v/, '');
  const wildcard = value.match(/^(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?$/);
  if (!wildcard) return false;

  const parts = wildcard.slice(1);
  const wildcardIndex = parts.findIndex((part) => !part || /^(x|\*)$/i.test(part));
  if (wildcardIndex !== -1) {
    if (operator && operator !== '=') return false;
    const lower = parts.map((part) => Number(/^(x|\*)$/i.test(part || '') ? 0 : part || 0));
    setLower(interval, lower, true);
    if (wildcardIndex === 0) return true;
    setUpper(interval, nextVersion(lower, wildcardIndex - 1), false);
    return true;
  }

  const version = parseVersion(value);
  if (!version) return false;
  switch (operator) {
    case '>': setLower(interval, version, false); break;
    case '>=': setLower(interval, version, true); break;
    case '<': setUpper(interval, version, false); break;
    case '<=': setUpper(interval, version, true); break;
    case '^': {
      setLower(interval, version, true);
      const component = version[0] > 0 ? 0 : version[1] > 0 ? 1 : 2;
      setUpper(interval, nextVersion(version, component), false);
      break;
    }
    case '~':
    case '~=':
      setLower(interval, version, true);
      setUpper(interval, nextVersion(version, value.split('.').length === 1 ? 0 : 1), false);
      break;
    case '':
    case '=':
    case '==':
    case '===':
      setLower(interval, version, true);
      setUpper(interval, nextVersion(version, 2), false);
      break;
    default:
      return false;
  }
  return true;
}

function parseRange(range) {
  const intervals = [];
  for (const alternative of range.trim().split(/\s*\|\|\s*/)) {
    const interval = { lower: null, lowerInclusive: false, upper: null, upperInclusive: false };
    const terms = alternative.trim().split(/\s*,\s*|\s+/).filter(Boolean);
    if (!terms.length || !terms.every((term) => {
      const match = term.match(/^(\^|~=|~|>=|<=|===|==|>|<|=)?(.+)$/);
      return match && addTerm(interval, match[1] ?? '', match[2]);
    })) return null;
    intervals.push(interval);
  }
  return intervals;
}

function isWithinBand(range, band) {
  const candidates = parseRange(range);
  const [minimum, maximum] = band.replaceAll(',', ' ').split(/\s+/).map((term) => {
    const match = term.match(/^(>=|<)(.+)$/);
    return match ? parseVersion(match[2]) : null;
  });
  if (!candidates || !minimum || !maximum) return false;

  // Python consumers commonly use a lower-bound-only requirement (for example
  // ``wasmagent-protocol>=0.1.7``). Such a declaration is compatible when its
  // minimum is in the band. Every explicit upper bound, and every alternative
  // in an npm ``||`` range, must also remain in the supported band.
  return candidates.every((candidate) => candidate.lower
    && compareVersions(candidate.lower, minimum) >= 0
    && compareVersions(candidate.lower, maximum) < 0
    && (!candidate.upper || (compareVersions(candidate.upper, maximum) < 0
      || (compareVersions(candidate.upper, maximum) === 0 && !candidate.upperInclusive)))
    && (!candidate.upper || compareVersions(candidate.upper, candidate.lower) > 0
      || (compareVersions(candidate.upper, candidate.lower) === 0
        && candidate.lowerInclusive && candidate.upperInclusive)));
}

function walk(directory, manifests = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) walk(path, manifests);
    } else if (entry.isFile() && (entry.name === 'package.json' || entry.name === 'pyproject.toml'
      || /^requirements(?:[-.].+)?\.txt$/.test(entry.name))) {
      manifests.push(path);
    }
  }
  return manifests;
}

function packageDependencies(path) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    .flatMap((field) => Object.entries(manifest[field] ?? {}))
    .filter(([name]) => PROTOCOL_BANDS.has(name))
    .map(([name, range]) => ({ name, range: String(range), path }));
}

function pythonDependencies(path) {
  const entries = [];
  const pattern = /["']wasmagent-protocol(?:\[[^\]]+\])?\s*([^"']*)["']/gi;
  for (const match of readFileSync(path, 'utf8').matchAll(pattern)) {
    const range = match[1].split(';', 1)[0].trim() || '*';
    entries.push({ name: 'wasmagent-protocol', range, path });
  }
  return entries;
}

function requirementsDependencies(path) {
  return readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^wasmagent-protocol(?:\[[^\]]+\])?\s*(.*?)(?:\s+#.*)?$/i);
    const range = match?.[1].split(';', 1)[0].trim() || '*';
    return match ? [{ name: 'wasmagent-protocol', range, path }] : [];
  });
}

function dependenciesFor(path) {
  if (basename(path) === 'package.json') return packageDependencies(path);
  if (basename(path) === 'pyproject.toml') return pythonDependencies(path);
  return requirementsDependencies(path);
}

function checkConsumer(root) {
  const manifests = walk(root);
  const dependencies = manifests.flatMap(dependenciesFor);
  const failures = [];
  if (!dependencies.length) {
    failures.push(`${root}: no @wasmagent/protocol or wasmagent-protocol dependency declaration found`);
  }
  for (const dependency of dependencies) {
    if (!isWithinBand(dependency.range, PROTOCOL_BANDS.get(dependency.name))) {
      failures.push(`${relative(root, dependency.path)}: ${dependency.name}@${dependency.range} is outside supported band ${PROTOCOL_BANDS.get(dependency.name)}`);
    }
  }
  return { dependencies, failures };
}

function main(arguments_) {
  if (!arguments_.length || arguments_.includes('--help') || arguments_.includes('-h')) {
    console.log('Usage: node scripts/check-consumer-versions.mjs <consumer-dir> [...consumer-dir]');
    return arguments_.length ? 0 : 2;
  }

  let failures = [];
  for (const root of arguments_) {
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      failures.push(`${root}: consumer directory does not exist`);
      continue;
    }
    const result = checkConsumer(root);
    failures = failures.concat(result.failures);
    console.log(`${root}: checked ${result.dependencies.length} protocol declaration(s)`);
  }
  if (failures.length) {
    console.error('\nConsumer version-band violations:');
    for (const failure of failures) console.error(`- ${failure}`);
    return 1;
  }
  console.log(`\nAll consumer protocol dependencies are within ${[...PROTOCOL_BANDS.values()][0]}.`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
