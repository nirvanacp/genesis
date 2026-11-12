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
    builder.onResolve({ filter: /^@genesis\/sdk\/(legacy\/)?react$/ }, args => ({
      errors: [{ text: `Adapters must not import ${args.path} (imported by ${args.importer})` }],
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
        // A page module runs on the page agent; an adapter still runs on the legacy runtime.
        contents: `import definition from ${JSON.stringify(specifier)};\n`
          + `import { startAgent } from "@genesis/sdk/page";\n`
          + `import { runAdapter } from "@genesis/sdk/legacy/adapter";\n`
          + `if (definition?.kind === "page-module") startAgent(definition); else runAdapter(definition);\n`,
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

/**
 * Bundles the adapter module for Node and imports it. This runs the applet's own code. Returns
 * the definition and the applet's own source files the module is built from.
 */
async function importAdapter(base, adapter) {
  let result;
  try {
    result = await build({
      absWorkingDir: base, entryPoints: [path.join(base, adapter)], bundle: true, write: false, format: 'esm', platform: 'node', metafile: true,
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
    const files = Object.keys(result.metafile.inputs)
      .filter(input => !input.includes(':') && !input.split('/').includes('node_modules') && !input.startsWith('..'));
    return { definition: module.default, files };
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

/** Reader and command names of a page module, and the readers with an `async` function. */
function describePageModule(definition) {
  const asyncReads = [];
  for (const [name, reader] of Object.entries(definition.readers ?? {})) {
    if (Object.values(reader ?? {}).some(isAsync)) asyncReads.push(name);
  }
  return {
    module: { readers: Object.keys(definition.readers ?? {}), commands: Object.keys(definition.commands ?? {}) },
    asyncReads,
  };
}

/** What a page module's own files must not use, each with the reason it is refused. */
const PAGE_MODULE_RULES = [
  { pattern: /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](react|react-dom|vue|svelte|solid-js|preact|@genesis\/sdk\/react)(?:\/[^"']*)?["']/, reason: name => `imports ${name}; page modules run in the website page and use no UI framework` },
  { pattern: /\beval\s*\(/, reason: () => 'calls eval' },
  { pattern: /\bnew\s+Function\b/, reason: () => 'uses new Function' },
  { pattern: /\bfetch\s*\(/, reason: () => 'calls fetch; page modules make no network calls' },
  { pattern: /\bXMLHttpRequest\b/, reason: () => 'uses XMLHttpRequest; page modules make no network calls' },
  { pattern: /\bdocument\.cookie\b/, reason: () => 'reads document.cookie' },
  { pattern: /\b(localStorage|sessionStorage|indexedDB)\b/, reason: name => `uses ${name}; page modules keep no storage` },
];

/** Checks the applet's own page module files line by line; comment lines are skipped. */
async function checkPageModuleFiles(base, files) {
  const problems = [];
  for (const file of files) {
    const lines = (await readFile(path.join(base, file), 'utf8')).split('\n');
    lines.forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
      for (const rule of PAGE_MODULE_RULES) {
        const match = rule.pattern.exec(line);
        if (match) problems.push(`  ${file}:${i + 1}: ${rule.reason(match[1] ?? match[0])}`);
      }
    });
  }
  if (problems.length > 0) throw toolError('ADAPTER_INVALID', `The page module breaks the page module rules:\n${problems.join('\n')}`);
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
  typeCheck(base, await containedFile(base, 'tsconfig.json'));

  const { definition, files } = await importAdapter(base, manifest.adapter);
  if (definition?.kind === 'page-module') {
    // The router's route table lives in the UI code now, so there are no adapter pages to compare.
    const { module, asyncReads } = describePageModule(definition);
    await checkPageModuleFiles(base, files);
    await bundleAdapterScript(base, manifest.adapter);
    const warnings = asyncReads.map(name => `Reader ${name}: a function is async; readers must return data synchronously`);
    return { ...applet, pages: null, module, warnings, compat: { applet: compat.applet, tools: TOOLS_TABLE } };
  }

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
  return { ...applet, pages, module: null, warnings, compat: { applet: compat.applet, tools: TOOLS_TABLE } };
}
