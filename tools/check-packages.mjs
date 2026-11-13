import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApplet, requireValue, safePath } from '../packages/applet-tools/src/manifest.mjs';
import { appletCompat, formatMismatches } from '../packages/applet-tools/src/compat.mjs';
import { checkLayout, readWorkspace } from './workspace.mjs';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGES = ['packages/core', 'packages/sdk', 'packages/applet-tools'];

/** `COMPAT` and `FRAMEWORK_VERSION` as written in `packages/core/src/compat.ts`. */
async function typescriptTable() {
  const source = await readFile(path.join(root, 'packages/core/src/compat.ts'), 'utf8');
  const body = source.match(/export const COMPAT = \{([^}]*)\}/)?.[1];
  const framework = source.match(/export const FRAMEWORK_VERSION = "([^"]+)"/)?.[1];
  requireValue(body && framework, 'packages/core/src/compat.ts must define COMPAT and FRAMEWORK_VERSION');
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
      if (name.startsWith('@genesis/') && range !== framework) problems.push(`  ${json.name} depends on ${name} ${range}, expected ${framework}`);
    }
  }
  requireValue(problems.length === 0, `Framework package versions differ from FRAMEWORK_VERSION:\n${problems.join('\n')}`);
}

/**
 * One `genesis.packages.json` entry: an applet directory name, or `{ id, drawer }` where `id` is
 * the directory name and `drawer: true` gives the bundled applet an app drawer entry.
 */
function selectionEntry(entry) {
  if (typeof entry === 'string') return { directory: entry, drawer: false };
  requireValue(entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.id === 'string'
    && Object.keys(entry).every(key => key === 'id' || key === 'drawer')
    && (entry.drawer === undefined || typeof entry.drawer === 'boolean'), 'Invalid bundle selection entry');
  return { directory: entry.id, drawer: entry.drawer === true };
}

/**
 * The selected applets from `genesis.packages.json`: each directory resolved inside the applets
 * directory that `genesis.workspace.json` names, and whether it has a drawer entry.
 */
async function readSelection(packagesIndex) {
  const selection = JSON.parse(await readFile(path.join(root, 'genesis.packages.json'), 'utf8'));
  requireValue(selection.schemaVersion === packagesIndex && Array.isArray(selection.applets), 'Invalid bundle selection');
  const entries = selection.applets.map(selectionEntry);
  requireValue(new Set(entries.map(e => e.directory)).size === entries.length, 'Invalid bundle selection');
  const { appletsDirectory } = readWorkspace();
  let applets;
  try { applets = await realpath(appletsDirectory); }
  catch { throw new Error(`Missing applets directory ${appletsDirectory}. Run npm run workspace -- setup, then npm install.`); }
  const selected = [];
  for (const { directory, drawer } of entries) {
    requireValue(safePath(directory), 'Invalid selected directory');
    let base;
    try { base = await realpath(path.join(applets, directory)); }
    catch { throw new Error(`Selected applet ${directory} is missing from ${applets}`); }
    requireValue(base.startsWith(applets + path.sep), 'Selected applet escapes the applets directory');
    selected.push({ base, drawer });
  }
  return selected;
}

/** Every selected applet, read and validated, with its `drawer` choice. Fails on the first invalid one. */
export async function readPackages() {
  const { table } = await typescriptTable();
  const packages = [], ids = new Set();
  for (const { base, drawer } of await readSelection(table.packagesIndex)) {
    const applet = await readApplet(base);
    requireValue(!ids.has(applet.manifest.id), 'Duplicate selected applet ID'); ids.add(applet.manifest.id); packages.push({ ...applet, drawer });
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
  for (const { base } of await readSelection(table.packagesIndex)) {
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
