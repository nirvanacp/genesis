import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { COMPAT, FRAMEWORK_VERSION } from '@genesis/core';
import { toolError } from './manifest.mjs';

const own = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
/** The version of these tools, written into every bundle's `compat` block. */
export const TOOLS_VERSION = own.version;

/** The versions these tools build against: the shared table and the framework version. */
export const TOOLS_TABLE = Object.freeze({ ...COMPAT, framework: FRAMEWORK_VERSION });

const SDK = '@genesis/sdk';

async function readJson(file, { optional = false } = {}) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw toolError('INVALID_PACKAGE', `Cannot read ${file}: ${error.message}`);
  }
}

/** The version of the `@genesis/sdk` package the applet resolves, or null when it is not installed. */
export async function installedSdk(base) {
  let file;
  try { file = createRequire(path.join(base, 'package.json')).resolve(SDK); }
  catch { return null; }
  for (let directory = path.dirname(file); directory !== path.dirname(directory); directory = path.dirname(directory)) {
    const json = await readJson(path.join(directory, 'package.json'), { optional: true });
    if (json?.name === SDK) return typeof json.version === 'string' ? json.version : null;
  }
  return null;
}

/**
 * Compares the applet's `applet.json` schemaVersion and its `@genesis/sdk` dependency (declared
 * and installed) with the tools' table. Reads the files raw, so it runs before the manifest parse.
 */
export async function appletCompat(base) {
  const manifest = await readJson(path.join(base, 'applet.json'));
  const pkg = await readJson(path.join(base, 'package.json'), { optional: true });
  const applet = {
    manifestSchema: manifest?.schemaVersion ?? null,
    sdk: pkg?.dependencies?.[SDK] ?? pkg?.devDependencies?.[SDK] ?? null,
    installedSdk: await installedSdk(base),
  };
  const mismatches = [];
  const compare = (field, value, current) => {
    if (value !== current) mismatches.push({ field, applet: value === null ? 'missing' : String(value), current: String(current) });
  };
  compare('schemaVersion', applet.manifestSchema, COMPAT.manifestSchema);
  compare(SDK, applet.sdk, FRAMEWORK_VERSION);
  // A missing installation is reported by the TypeScript check; a different one is a mismatch.
  if (applet.installedSdk !== null) compare(`${SDK} installed`, applet.installedSdk, FRAMEWORK_VERSION);
  return { id: typeof manifest?.id === 'string' ? manifest.id : path.basename(base), applet, mismatches };
}

/** One line per mismatch, such as `schemaVersion 5 → 6`. */
export function formatMismatches(mismatches) {
  return mismatches.map(m => `  ${m.field} ${m.applet} → ${m.current}`).join('\n');
}

/** Fails with `APPLET_INCOMPATIBLE` unless the applet matches the tools' table. */
export async function requireCompatible(base) {
  const result = await appletCompat(base);
  if (result.mismatches.length > 0) {
    throw toolError('APPLET_INCOMPATIBLE', `${result.id} does not match these tools (applet → current):\n${formatMismatches(result.mismatches)}\n`
      + 'Update the applet to the current SDK and run check again.');
  }
  return result;
}

/** The `compat` block of `bundle.json`: what the bundle was built against. */
export function bundleCompat(sdk, builtAt = new Date()) {
  return {
    manifestSchema: COMPAT.manifestSchema,
    bundleFormat: COMPAT.bundleFormat,
    protocol: COMPAT.protocol,
    adapterApi: COMPAT.adapterApi,
    sdk,
    tools: TOOLS_VERSION,
    builtAt: builtAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}
