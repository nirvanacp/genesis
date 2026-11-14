import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { containedFile, readApplet, requireValue, toolError } from './manifest.mjs';
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

/** Names a page module may not reach into: the website's framework state and the extension world of an engine. */
const PAGE_WORLD = "page modules read the DOM, not the website's JavaScript";
const SAME_ON_BOTH = 'page modules run the same in WebView and GeckoView and do not branch on the browser';

/**
 * What a page module's own files must not use, each with the reason it is refused. Rules match
 * the code with comments and the contents of strings, templates and regular expressions blanked,
 * so a selector or a message that names one of these words passes. A rule with `strings` also
 * matches inside strings, because its name is read by a string key, such as `el["__reactFiber$x"]`.
 */
const PAGE_MODULE_RULES = [
  { strings: true, pattern: /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](react|react-dom|vue|svelte|solid-js|preact|@genesis\/sdk\/react)(?:\/[^"']*)?["']/, reason: name => `imports ${name}; page modules run in the website page and use no UI framework` },
  { pattern: /\beval\s*\(/, reason: () => 'calls eval' },
  { pattern: /\bnew\s+Function\b/, reason: () => 'uses new Function' },
  { pattern: /\bfetch\s*\(/, reason: () => 'calls fetch; page modules make no network calls' },
  { pattern: /\bXMLHttpRequest\b/, reason: () => 'uses XMLHttpRequest; page modules make no network calls' },
  { pattern: /\bdocument\.cookie\b/, reason: () => 'reads document.cookie' },
  { pattern: /\b(localStorage|sessionStorage|indexedDB)\b/, reason: name => `uses ${name}; page modules keep no storage` },
  { pattern: /\b(wrappedJSObject|unsafeWindow|cloneInto|exportFunction)\b/, reason: name => `uses ${name}; ${PAGE_WORLD}` },
  // React's keys end in a random suffix, so they are found by a string; `#__NEXT_DATA__` is also a script element's id, which a module may read.
  { strings: true, pattern: /(__reactFiber|__reactProps|__reactInternalInstance)/, reason: name => `reads ${name}; ${PAGE_WORLD}` },
  { pattern: /\b(__vue__|__NEXT_DATA__|__NUXT__)\b/, reason: name => `reads ${name}; ${PAGE_WORLD}` },
  { pattern: /\b((?:browser|chrome)\s*\.\s*(?:runtime|storage))\b/, reason: name => `uses ${name.replace(/\s/g, '')}; page modules use no browser extension APIs` },
  { pattern: /\bnavigator\s*\.\s*(userAgent|userAgentData|vendor|platform|appVersion)\b/, reason: name => `reads navigator.${name}; ${SAME_ON_BOTH}` },
  { strings: true, pattern: /\bnavigator\s*\[\s*["'`](userAgent|userAgentData|vendor|platform|appVersion)["'`]\s*\]/, reason: name => `reads navigator.${name}; ${SAME_ON_BOTH}` },
  { pattern: /\b(userAgentData)\b/, reason: name => `reads navigator.${name}; ${SAME_ON_BOTH}` },
  { pattern: /\{[^}]*\b(userAgent)\b[^}]*\}\s*=\s*(?:(?:window|globalThis|self)\s*\.\s*)?navigator\b/, reason: name => `reads navigator.${name}; ${SAME_ON_BOTH}` },
];

/** Words before which a `/` starts a regular expression rather than a division. */
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'void', 'yield', 'await', 'delete', 'throw', 'new', 'instanceof']);

/**
 * Two copies of a source file with the same length and line breaks: `text` has comments blanked,
 * and `code` also has the contents of strings, templates (outside `${}`) and regular expressions
 * blanked. A small scanner, not a parser: it tells a regular expression from a division by the
 * code before it.
 */
function maskSource(source) {
  const code = source.split(''), text = source.split('');
  const n = source.length;
  const blank = (array, i) => { if (i < n && array[i] !== '\n') array[i] = ' '; };
  const comment = i => { blank(code, i); blank(text, i); };
  /** Open `${` expressions inside templates, each with its count of open braces. */
  const braces = [];
  let last = -1; // index of the last code character that is not a space

  function regexAllowed() {
    if (last < 0) return true;
    const c = source[last];
    if (/[\w$]/.test(c)) {
      let start = last;
      while (start > 0 && /[\w$]/.test(source[start - 1])) start--;
      return REGEX_KEYWORDS.has(source.slice(start, last + 1));
    }
    // After `x++`, `x--` or a TypeScript non-null `x!`, a `/` divides.
    if ((c === '+' || c === '-') && source[last - 1] === c) return false;
    if (c === '!' && last > 0 && /[\w$)\]]/.test(source[last - 1])) return false;
    return /[(,=:[!&|?{};+\-*%<>~^]/.test(c);
  }
  /**
   * Blanks a quoted string's contents from `i`, its opening quote; returns the index after it.
   * A quote without its closing quote on the same line was misread (it sits in a regular
   * expression read as a division), so it is left as code and scanning continues after it.
   */
  function string(i, quote) {
    let j = i + 1;
    while (j < n && source[j] !== quote && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1;
    if (j >= n || source[j] !== quote) return i + 1;
    for (let k = i + 1; k < j; k++) blank(code, k);
    return j + 1;
  }
  /** Blanks template text from `i` until its end or a `${`; returns the index after the delimiter. */
  function template(i) {
    let j = i;
    while (j < n) {
      if (source[j] === '\\') { blank(code, j); blank(code, j + 1); j += 2; continue; }
      if (source[j] === '`') return j + 1;
      if (source[j] === '$' && source[j + 1] === '{') { braces.push(0); return j + 2; }
      blank(code, j++);
    }
    return j;
  }
  /**
   * Blanks a regular expression's body from `i`, its opening slash; returns the index after it.
   * A slash without its closing slash on the same line was a division, so scanning continues
   * after it.
   */
  function regex(i) {
    let j = i + 1, inClass = false;
    while (j < n && source[j] !== '\n') {
      const c = source[j];
      if (c === '\\') { if (source[j + 1] === '\n') break; j += 2; continue; }
      if (c === '/' && !inClass) break;
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      j++;
    }
    if (j >= n || source[j] !== '/') return i + 1;
    for (let k = i + 1; k < j; k++) blank(code, k);
    return j + 1;
  }

  let i = 0;
  while (i < n) {
    const c = source[i], next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') comment(i++);
      continue;
    }
    if (c === '/' && next === '*') {
      comment(i++); comment(i++);
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) comment(i++);
      comment(i++); comment(i++);
      continue;
    }
    if (c === '"' || c === "'") { last = i; i = string(i, c); continue; }
    if (c === '`') { last = i; i = template(i + 1); continue; }
    if (c === '/' && regexAllowed()) { last = i; i = regex(i); continue; }
    if (braces.length > 0 && c === '{') braces[braces.length - 1]++;
    if (braces.length > 0 && c === '}') {
      if (braces[braces.length - 1] === 0) {
        braces.pop();
        last = i;
        i = template(i + 1);
        continue;
      }
      braces[braces.length - 1]--;
    }
    if (!/\s/.test(c)) last = i;
    i++;
  }
  return { code: code.join(''), text: text.join('') };
}

/**
 * Checks the applet's own page module files line by line against `PAGE_MODULE_RULES`. A text
 * lint, not a sandbox: files outside the applet directory and indirect uses are not seen.
 */
async function checkPageModuleFiles(base, files) {
  const problems = [];
  for (const file of files) {
    const { code, text } = maskSource(await readFile(path.join(base, file), 'utf8'));
    const codeLines = code.split('\n'), textLines = text.split('\n');
    codeLines.forEach((line, i) => {
      for (const rule of PAGE_MODULE_RULES) {
        const match = rule.pattern.exec(rule.strings ? textLines[i] : line);
        if (match) problems.push(`  ${file}:${i + 1}: ${rule.reason(match[1] ?? match[0])}`);
      }
    });
  }
  if (problems.length > 0) throw toolError('PAGE_MODULE_INVALID', `The page module breaks the page module rules (checked in the applet's own files only):\n${problems.join('\n')}`);
}

/** A file input in built UI code: `type="file"` in markup, `type: "file"` in compiled JSX. */
const FILE_INPUT = /\btype\s*[:=]\s*["'`]file["'`]/;

/**
 * Warnings for the built UI files: a file input there opens no picker, since the applet UI has
 * no file chooser; the UI picks files with `genesis.files.pick` instead.
 */
export function uiWarnings(files) {
  const names = [];
  for (const [name, bytes] of files) {
    if (['.js', '.mjs', '.html'].includes(path.extname(name)) && FILE_INPUT.test(bytes.toString('utf8'))) names.push(name);
  }
  return names.length ? [`${names.join(', ')}: the applet UI cannot open a file picker; use genesis.files.pick`] : [];
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
  const { base, manifest, build: config } = applet;
  if (manifest.shell?.icon !== undefined) await checkIcon(base, manifest.shell.icon);
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
