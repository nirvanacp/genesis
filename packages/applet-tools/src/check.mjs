import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { unreachableRoutes } from '@genesis/core';
import { readApplet, requireValue, containedFile, toolError } from './manifest.mjs';
import { requireCompatible, TOOLS_TABLE } from './compat.mjs';

const require = createRequire(import.meta.url);

/** esbuild plugin: adapters run in website pages, where the React foreground SDK has no place. */
export const noReactInAdapters = {
  name: 'genesis-no-react-in-adapters',
  setup(builder) {
    builder.onResolve({ filter: /^@genesis\/sdk\/react$/ }, args => ({
      errors: [{ text: `Adapters must not import @genesis/sdk/react (imported by ${args.importer})` }],
    }));
  },
};

const ADAPTER_ENTRY = 'genesis:adapter-entry';

/**
 * esbuild plugin: the injected adapter script's entry, which runs the applet's adapter with the
 * SDK runtime. The applet's module stays a plain definition that tooling can import.
 */
export function adapterEntry(base, adapter) {
  const specifier = './' + adapter.split(path.sep).join('/');
  return {
    name: 'genesis-adapter-entry',
    setup(builder) {
      builder.onResolve({ filter: /^genesis:adapter-entry$/ }, () => ({ path: ADAPTER_ENTRY, namespace: 'genesis' }));
      builder.onLoad({ filter: /.*/, namespace: 'genesis' }, () => ({
        resolveDir: base, loader: 'js',
        contents: `import adapter from ${JSON.stringify(specifier)};\nimport { runAdapter } from "@genesis/sdk/adapter";\nrunAdapter(adapter);\n`,
      }));
    },
  };
}

export { ADAPTER_ENTRY };

const buildErrors = error => error.errors?.map(e => e.text).join('; ') ?? error.message;

function typeCheck(base, config) {
  const compiler = path.join(path.dirname(require.resolve('typescript/package.json')), 'lib/tsc.js');
  const result = spawnSync(process.execPath, [compiler, '-p', config, '--noEmit'], { cwd: base, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  requireValue(!result.error && result.status === 0, `TypeScript check failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
}

/** Bundles the adapter module for Node and imports it. This runs the applet's own code. */
async function importAdapter(base, adapter) {
  let result;
  try {
    result = await build({
      absWorkingDir: base, entryPoints: [path.join(base, adapter)], bundle: true, write: false, format: 'esm', platform: 'node',
      logLevel: 'silent', plugins: [noReactInAdapters], loader: { '.css': 'empty' }, define: { __GENESIS_DEBUG__: 'false' },
    });
  } catch (error) {
    requireValue(false, `Adapter ${adapter}: ${buildErrors(error)}`);
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'genesis-check-'));
  try {
    const file = path.join(directory, 'adapter.mjs');
    await writeFile(file, result.outputFiles[0].contents);
    const module = await import(pathToFileURL(file).href);
    return module.default;
  } catch (error) {
    throw toolError('ADAPTER_INVALID', `Adapter ${adapter} failed to load: ${error.message}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Builds the injected adapter script as the build does, to report browser bundling errors here. */
async function bundleAdapterScript(base, adapter) {
  try {
    await build({
      absWorkingDir: base, entryPoints: [ADAPTER_ENTRY], bundle: true, write: false, format: 'iife', platform: 'browser',
      logLevel: 'silent', plugins: [adapterEntry(base, adapter), noReactInAdapters], define: { __GENESIS_DEBUG__: 'false' },
    });
  } catch (error) {
    requireValue(false, `Adapter ${adapter}: ${buildErrors(error)}`);
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICON_MAX_BYTES = 256 * 1024;

/** Checks `shell.icon`: a square PNG of 192 to 1024 px and at most 256 KiB, copied by the build from `assets/`. */
async function checkIcon(base, icon) {
  const fail = message => { throw toolError('INVALID_MANIFEST', `/shell/icon: ${message}`); };
  const file = await containedFile(base, icon).catch(() => fail(`file ${icon} does not exist in the applet`));
  const bytes = await readFile(file);
  if (bytes.length > ICON_MAX_BYTES) fail(`${icon} is ${bytes.length} bytes; the limit is ${ICON_MAX_BYTES}`);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('latin1', 12, 16) !== 'IHDR') {
    fail(`${icon} is not a PNG file`);
  }
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width !== height) fail(`${icon} is ${width}x${height}; it must be square`);
  if (width < 192 || width > 1024) fail(`${icon} is ${width} px wide; it must be 192 to 1024 px`);
}

const isAsync = fn => typeof fn === 'function' && fn.constructor?.name === 'AsyncFunction';

/** Page ids with their regions' kinds, and the region `read` functions declared `async`. */
function describeAdapter(definition, adapter) {
  if (!definition || typeof definition !== 'object' || !definition.pages || typeof definition.pages !== 'object') {
    throw toolError('ADAPTER_INVALID', `${adapter} must default-export defineAdapter({ pages })`);
  }
  const pages = {}, asyncReads = [];
  for (const [id, page] of Object.entries(definition.pages)) {
    const regions = {};
    for (const [name, region] of Object.entries(page?.regions ?? {})) {
      regions[name] = region?.kind ?? 'unknown';
      if (isAsync(region?.read)) asyncReads.push(`${id}.${name}`);
    }
    pages[id] = { regions, actions: Object.keys(page?.actions ?? {}) };
  }
  return { pages, asyncReads };
}

/**
 * Checks an applet: compatibility with these tools first, then the manifest, TypeScript, and
 * the adapter, which is bundled and imported in Node to compare its pages with the routes.
 * Returns the applet with the adapter's pages and the warnings.
 */
export async function checkApplet(directory) {
  const compat = await requireCompatible(path.resolve(directory));
  const applet = await readApplet(directory);
  const { base, manifest } = applet;
  if (manifest.shell?.icon !== undefined) await checkIcon(base, manifest.shell.icon);
  typeCheck(base, await containedFile(base, 'tsconfig.json'));

  const definition = await importAdapter(base, manifest.adapter);
  const { pages, asyncReads } = describeAdapter(definition, manifest.adapter);
  const undeclared = manifest.routes.filter(route => !Object.hasOwn(pages, route.page));
  if (undeclared.length > 0) {
    throw toolError('INVALID_MANIFEST', `${manifest.adapter} declares no page for:\n`
      + undeclared.map(route => `  route ${route.id}: page ${route.page}`).join('\n')
      + `\nDeclared pages: ${Object.keys(pages).join(', ') || 'none'}.`);
  }
  await bundleAdapterScript(base, manifest.adapter);

  const warnings = [
    ...unreachableRoutes(manifest).map(id => `Route ${id} is unreachable: an earlier route matches every URL it matches`),
    ...asyncReads.map(region => `Region ${region}: read is async; it must return data synchronously`),
  ];
  return { ...applet, pages, warnings, compat: { applet: compat.applet, tools: TOOLS_TABLE } };
}
