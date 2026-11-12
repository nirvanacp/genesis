import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { readApplet, requireValue, toolError } from './manifest.mjs';
import { requireCompatible, TOOLS_TABLE } from './compat.mjs';

const require = createRequire(import.meta.url);

/** esbuild plugin: the page script runs in website pages, where the React bindings have no place. */
export const noReactInPage = {
  name: 'genesis-no-react-in-page',
  setup(builder) {
    builder.onResolve({ filter: /^@genesis\/sdk\/react$/ }, args => ({
      errors: [{ text: `The page script must not import ${args.path} (imported by ${args.importer})` }],
    }));
  },
};

const PAGE_ENTRY = 'genesis:page-entry';

/**
 * esbuild plugin: the page script's entry, which starts the page agent with the applet's page
 * module, or with none when `page` is undefined. The applet's module stays a plain definition
 * that tooling can import.
 */
export function pageEntry(base, page) {
  const contents = page === undefined
    ? 'import { startAgent } from "@genesis/sdk/page";\nstartAgent();\n'
    : `import { startAgent } from "@genesis/sdk/page";\nimport definition from ${JSON.stringify('./' + page)};\nstartAgent(definition);\n`;
  return {
    name: 'genesis-page-entry',
    setup(builder) {
      builder.onResolve({ filter: /^genesis:page-entry$/ }, () => ({ path: PAGE_ENTRY, namespace: 'genesis' }));
      builder.onLoad({ filter: /.*/, namespace: 'genesis' }, () => ({ resolveDir: base, loader: 'js', contents }));
    },
  };
}

export { PAGE_ENTRY };

const buildErrors = error => error.errors?.map(e => e.text).join('; ') ?? error.message;

/** Runs a project command from `build` through the shell in the applet directory. */
export function runCommand(base, command, label) {
  const result = spawnSync(command, { cwd: base, shell: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  requireValue(!result.error && result.status === 0, `${label} \`${command}\` failed\n${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd());
}

/**
 * Type checks the applet: the project's own `build.check` command when it declares one (for
 * example `vue-tsc --noEmit`), otherwise `tsc --noEmit` when it has a `tsconfig.json`.
 */
function typeCheck(base, check) {
  if (check !== undefined) return runCommand(base, check, 'build.check');
  if (!existsSync(path.join(base, 'tsconfig.json'))) return;
  const compiler = path.join(path.dirname(require.resolve('typescript/package.json')), 'lib/tsc.js');
  const result = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.json', '--noEmit'], { cwd: base, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  requireValue(!result.error && result.status === 0, `TypeScript check failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
}

/**
 * Bundles the page module for Node and imports it. This runs the applet's own code. Returns
 * the definition and the applet's own source files the module is built from.
 */
async function importPageModule(base, page) {
  let result;
  try {
    result = await build({
      absWorkingDir: base, entryPoints: [path.join(base, page)], bundle: true, write: false, format: 'esm', platform: 'node', metafile: true,
      logLevel: 'silent', plugins: [noReactInPage], loader: { '.css': 'empty' }, define: { __GENESIS_DEBUG__: 'false' },
    });
  } catch (error) {
    requireValue(false, `Page module ${page}: ${buildErrors(error)}`);
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'genesis-check-'));
  try {
    const file = path.join(directory, 'page.mjs');
    await writeFile(file, result.outputFiles[0].contents);
    const module = await import(pathToFileURL(file).href);
    const files = Object.keys(result.metafile.inputs)
      .filter(input => !input.includes(':') && !input.split('/').includes('node_modules') && !input.startsWith('..'));
    return { definition: module.default, files };
  } catch (error) {
    throw toolError('PAGE_MODULE_INVALID', `Page module ${page} failed to load: ${error.message}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Builds the page script as the build does, to report browser bundling errors here. */
async function bundlePageScript(base, page) {
  try {
    await build({
      absWorkingDir: base, entryPoints: [PAGE_ENTRY], bundle: true, write: false, format: 'iife', platform: 'browser',
      logLevel: 'silent', plugins: [pageEntry(base, page), noReactInPage], define: { __GENESIS_DEBUG__: 'false' },
    });
  } catch (error) {
    requireValue(false, `Page script: ${buildErrors(error)}`);
  }
}

const isAsync = fn => typeof fn === 'function' && fn.constructor?.name === 'AsyncFunction';

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

/**
 * Checks the applet's own page module files line by line; comment lines are skipped. A text lint,
 * not a sandbox: files outside the applet directory and indirect uses are not seen.
 */
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
  if (problems.length > 0) throw toolError('PAGE_MODULE_INVALID', `The page module breaks the page module rules (checked in the applet's own files only):\n${problems.join('\n')}`);
}

/**
 * Checks an applet: compatibility with these tools first, then the manifest and its `build`
 * section, the type check, and the page module named by `build.page`, which is bundled and
 * imported in Node and checked against the page module rules. Returns the applet with the
 * module's reader and command names (null without a page module) and the warnings.
 */
export async function checkApplet(directory) {
  const compat = await requireCompatible(path.resolve(directory));
  const applet = await readApplet(directory);
  const { base, build: config } = applet;
  typeCheck(base, config.check);

  let module = null, warnings = [];
  if (config.page !== undefined) {
    const { definition, files } = await importPageModule(base, config.page);
    if (definition?.kind !== 'page-module') {
      throw toolError('PAGE_MODULE_INVALID', `${config.page} must default-export definePageModule({ readers, commands })`);
    }
    const described = describePageModule(definition);
    module = described.module;
    warnings = described.asyncReads.map(name => `Reader ${name}: a function is async; readers must return data synchronously`);
    await checkPageModuleFiles(base, files);
  }
  await bundlePageScript(base, config.page);
  return { ...applet, module, warnings, compat: { applet: compat.applet, tools: TOOLS_TABLE } };
}
