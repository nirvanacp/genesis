import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApplet, requireValue, safePath } from '../let/packages/applet-tools/src/manifest.mjs';
import { appletCompat, formatMismatches } from '../let/packages/applet-tools/src/compat.mjs';
import { checkLayout, readWorkspace } from './workspace.mjs';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGES = ['let/packages/core', 'let/packages/sdk', 'let/packages/applet-tools', 'let/packages/servelet-tools'];

/** `COMPAT` and `FRAMEWORK_VERSION` as written in `let/packages/core/src/compat.ts`. */
async function typescriptTable() {
  const source = await readFile(path.join(root, 'let/packages/core/src/compat.ts'), 'utf8');
  const body = source.match(/export const COMPAT = \{([^}]*)\}/)?.[1];
  const framework = source.match(/export const FRAMEWORK_VERSION = "([^"]+)"/)?.[1];
  requireValue(body && framework, 'let/packages/core/src/compat.ts must define COMPAT and FRAMEWORK_VERSION');
  const table = {};
  for (const [, name, value] of body.matchAll(/^\s*([A-Za-z]+):\s*(\d+),/gm)) table[name] = Number(value);
  return { table, framework };
}

/** The constants of `pub mod compat` in `crates/contracts/src/lib.rs`, keyed in camelCase. */
async function rustTable() {
  const source = await readFile(path.join(root, 'crates/contracts/src/lib.rs'), 'utf8');
  const body = source.match(/pub mod compat \{([^}]*)\}/)?.[1];
  requireValue(body, 'crates/contracts/src/lib.rs must define pub mod compat');
  const table = {};
  for (const [, name, value] of body.matchAll(/pub const ([A-Z_]+): u32 = (\d+);/g)) {
    table[name.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = Number(value);
  }
  return table;
}

/** Fails unless the TypeScript and Rust tables hold the same eight versions. Returns the TypeScript table. */
export async function checkCompatMirror() {
  const { table, framework } = await typescriptTable();
  const rust = await rustTable();
  const names = [...new Set([...Object.keys(table), ...Object.keys(rust)])].sort();
  const differences = names.filter(name => table[name] !== rust[name])
    .map(name => `  ${name}: compat.ts ${table[name] ?? 'missing'}, contracts ${rust[name] ?? 'missing'}`);
  requireValue(differences.length === 0, `The compat tables differ:\n${differences.join('\n')}`);
  requireValue(names.length === 9, `Expected 9 compat versions, found ${names.length}: ${names.join(', ')}`);
  return { table, framework };
}

/** Fails unless the framework packages carry FRAMEWORK_VERSION and point at each other with it. */
export async function checkFrameworkVersions(framework) {
  const problems = [];
  for (const directory of PACKAGES) {
    const json = JSON.parse(await readFile(path.join(root, directory, 'package.json'), 'utf8'));
    if (json.version !== framework) problems.push(`  ${json.name} version ${json.version}, expected ${framework}`);
    for (const [name, range] of Object.entries({ ...json.dependencies, ...json.devDependencies, ...json.peerDependencies })) {
      if (name.startsWith('@nirvanacp/') && range !== framework) problems.push(`  ${json.name} depends on ${name} ${range}, expected ${framework}`);
    }
  }
  requireValue(problems.length === 0, `Framework package versions differ from FRAMEWORK_VERSION:\n${problems.join('\n')}`);
}

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** A `release` object: the GitHub repository, the release tag and the SHA-256 of its bundle asset. */
function releaseEntry(release) {
  requireValue(release && typeof release === 'object' && !Array.isArray(release)
    && Object.keys(release).every(key => ['repository', 'tag', 'sha256'].includes(key))
    && typeof release.repository === 'string' && REPOSITORY.test(release.repository)
    && typeof release.tag === 'string' && release.tag.trim() !== ''
    && typeof release.sha256 === 'string' && SHA256.test(release.sha256),
  'Invalid bundle selection release: use { repository: "owner/name", tag, sha256 } with a 64-character hex sha256');
  return { repository: release.repository, tag: release.tag, sha256: release.sha256 };
}

/**
 * One `genesis.packages.json` entry: an applet directory name, or `{ id, drawer, release }` where
 * `id` is the directory name, `drawer: true` gives the bundled applet an app drawer entry and
 * `release` names its published GitHub release. An entry without `release` is source only.
 */
function selectionEntry(entry) {
  if (typeof entry === 'string') return { id: entry, drawer: false, release: null };
  requireValue(entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.id === 'string'
    && Object.keys(entry).every(key => ['id', 'drawer', 'release'].includes(key))
    && (entry.drawer === undefined || typeof entry.drawer === 'boolean'), 'Invalid bundle selection entry');
  return { id: entry.id, drawer: entry.drawer === true, release: entry.release === undefined ? null : releaseEntry(entry.release) };
}

/**
 * The selected applets from `genesis.packages.json`: each one's id, drawer choice and release,
 * and `base`, its directory inside the applets directory that `genesis.workspace.json` names, or
 * null when that directory, or the whole applets directory, is missing.
 */
async function readSelection(packagesIndex) {
  const selection = JSON.parse(await readFile(path.join(root, 'genesis.packages.json'), 'utf8'));
  requireValue(selection.schemaVersion === packagesIndex && Array.isArray(selection.applets), 'Invalid bundle selection');
  const entries = selection.applets.map(selectionEntry);
  requireValue(new Set(entries.map(e => e.id)).size === entries.length, 'Invalid bundle selection');
  const { appletsDirectory } = readWorkspace();
  const applets = await realpath(appletsDirectory).catch(() => null);
  const selected = [];
  for (const entry of entries) {
    requireValue(safePath(entry.id), 'Invalid selected directory');
    const base = applets && await realpath(path.join(applets, entry.id)).catch(() => null);
    requireValue(!base || base.startsWith(applets + path.sep), 'Selected applet escapes the applets directory');
    selected.push({ ...entry, base });
  }
  return { appletsDirectory, selected };
}

/** Fails for a selected applet that has neither its source directory nor a published release. */
function requireSource({ id, release, base }, appletsDirectory) {
  requireValue(base || release, `Selected applet ${id} has no source directory ${path.join(appletsDirectory, id)} and names no published release. Run npm run workspace -- setup.`);
}

/**
 * Every selected applet: `{ id, drawer, release, base }`, plus the applet read and validated from
 * its source directory when `base` is set. Fails on the first invalid one.
 */
export async function readPackages() {
  const { table } = await typescriptTable();
  const { appletsDirectory, selected } = await readSelection(table.packagesIndex);
  const packages = [], ids = new Set();
  for (const entry of selected) {
    requireSource(entry, appletsDirectory);
    if (!entry.base) { packages.push(entry); continue; }
    const applet = await readApplet(entry.base);
    requireValue(!ids.has(applet.manifest.id), 'Duplicate selected applet ID'); ids.add(applet.manifest.id); packages.push({ ...applet, ...entry });
  }
  return packages;
}

/**
 * The workspace checks: the workspace layout, the compat mirror, the framework versions, and the selected applets.
 * A selected applet built for other versions is reported, not failed: `genesis-applet check`
 * and the APK build refuse it.
 */
async function checkWorkspace() {
  checkLayout();
  const { table, framework } = await checkCompatMirror();
  await checkFrameworkVersions(framework);
  const passed = [], incompatible = [], ids = new Set();
  const { appletsDirectory, selected } = await readSelection(table.packagesIndex);
  for (const entry of selected) {
    requireSource(entry, appletsDirectory);
    const { base, id, release } = entry;
    if (!base) { passed.push(`${id} (release ${release.tag})`); continue; }
    const compat = await appletCompat(base);
    if (compat.mismatches.length > 0) { incompatible.push(`${base} (${compat.id}):\n${formatMismatches(compat.mismatches)}`); continue; }
    const { manifest } = await readApplet(base);
    requireValue(!ids.has(manifest.id), 'Duplicate selected applet ID'); ids.add(manifest.id); passed.push(manifest.id);
  }
  return { framework, passed, incompatible };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { framework, passed, incompatible } = await checkWorkspace();
    for (const applet of incompatible) console.warn(`warning: selected applet needs an update and cannot be built: ${applet}`);
    console.log(`Package checks passed: compat tables agree, framework packages at ${framework}, selected applets ready: ${passed.join(', ') || 'none'}. Device qualification is recorded separately.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
