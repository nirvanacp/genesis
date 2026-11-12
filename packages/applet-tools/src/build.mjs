import { build } from 'esbuild';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BUNDLE_FORMAT, COMPAT, isBundlePath, REQUIRED_BUNDLE_FILES } from '@genesis/core';
import { checkApplet, noReactInPage, PAGE_ENTRY, pageEntry, runCommand } from './check.mjs';
import { bundleCompat, installedSdk } from './compat.mjs';
import { containedFile, requireValue, sha256 } from './manifest.mjs';

const MARKER = '.genesis-applet-output';
const MARKER_TEXT = `genesis-applet:${BUNDLE_FORMAT}\n`;
/** The revision directory under the output: the same layout the host installs and serves. */
const REVISION = 'revision';
/** Text files travel as UTF-8 in the import file; everything else as base64. */
const TEXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map']);
/**
 * References that start with `/`, by file type: the UI is served under a revision path, so they
 * would miss. HTML `src` and `href` attributes (whole attribute names, so `data-src` is not one),
 * `srcset` entries, CSS `url(/…)` and JS import specifiers.
 */
const ROOT_ATTRIBUTE = /(?<![\w-])(?:src|href)\s*=\s*["']?\//gi;
const SRCSET = /(?<![\w-])srcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const CSS_URL = /\burl\(\s*["']?\//gi;
const JS_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'`]\//g;
const ROOT_URL_RULES = {
  '.html': [ROOT_ATTRIBUTE, CSS_URL, JS_IMPORT],
  '.css': [CSS_URL],
  '.js': [JS_IMPORT],
  '.mjs': [JS_IMPORT],
};

const esbuildOptions = (base, debug) => ({
  absWorkingDir: base, bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser', target: 'es2022',
  jsx: 'automatic', minify: true, legalComments: 'none', logLevel: 'silent',
  loader: { '.svg': 'file', '.png': 'file', '.woff2': 'file' }, assetNames: 'assets/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"', __GENESIS_DEBUG__: String(debug) },
});

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    requireValue(!entry.isSymbolicLink(), `Symlinks are not allowed: ${prefix}${entry.name}`);
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), name + '/'));
    else if (entry.isFile()) files.push(name);
  }
  return files;
}

/** Runs esbuild and returns its output files keyed by their path in the revision directory. */
async function bundle(base, entryName, entry, label, { outdir, debug, plugins = [] }) {
  let result;
  try {
    result = await build({ ...esbuildOptions(base, debug), entryPoints: { [entryName]: entry }, outdir, plugins });
  } catch (error) {
    requireValue(false, `Bundling ${label} failed: ${error.errors?.map(e => e.text).join('; ') ?? error.message}`);
  }
  for (const name of Object.keys(result.metafile.inputs)) {
    const input = await realpath(path.resolve(base, name)).catch(() => null);
    requireValue(!input?.startsWith(path.join(base, 'backend') + path.sep), `Backend file ${name} cannot enter a browser bundle`);
  }
  return new Map(result.outputFiles.map(file => [path.relative(outdir, file.path).split(path.sep).join('/'), Buffer.from(file.contents)]));
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** The UI document of the zero-configuration build: the bundled entry, its CSS and the accent. */
function indexHtml(manifest, hasCss) {
  const accent = manifest.shell?.accent;
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    + `<title>${escapeHtml(manifest.name)}</title>\n`
    + (accent ? `<style>:root{--genesis-accent:${accent}}</style>\n` : '')
    + (hasCss ? '<link rel="stylesheet" href="foreground.css">\n' : '')
    + '</head>\n<body>\n<div id="root"></div>\n<script src="foreground.js"></script>\n</body>\n</html>\n';
}

/**
 * Builds the UI and returns its files by path in the bundle. `{ entry }` bundles that source
 * file with esbuild, copies the applet's `assets/` and writes the HTML document at
 * `manifest.foreground.entry`. `{ command, dir }` runs the project's own build and takes every
 * file of `dir`.
 */
async function buildForeground(base, foreground, manifest, { outdir, debug }) {
  if ('entry' in foreground) {
    const files = await bundle(base, 'foreground', path.join(base, foreground.entry), foreground.entry, { outdir, debug });
    const assets = path.join(base, 'assets');
    if (await stat(assets).then(info => info.isDirectory(), () => false)) {
      for (const name of await listFiles(assets)) {
        requireValue(!files.has(`assets/${name}`), `Two bundle files share the path assets/${name}`);
        files.set(`assets/${name}`, await readFile(path.join(assets, name)));
      }
    }
    requireValue(!files.has(manifest.foreground.entry), `The UI build already writes ${manifest.foreground.entry}`);
    files.set(manifest.foreground.entry, Buffer.from(indexHtml(manifest, files.has('foreground.css'))));
    return files;
  }
  runCommand(base, foreground.command, 'build.foreground.command');
  const dir = path.join(base, foreground.dir);
  const real = await realpath(dir).catch(() => null);
  requireValue(real && (await stat(real)).isDirectory(), `build.foreground.dir ${foreground.dir} does not exist after the build command`);
  requireValue(real.startsWith(base + path.sep), `build.foreground.dir ${foreground.dir} leaves the applet`);
  requireValue(!(real + path.sep).startsWith(path.join(base, 'backend') + path.sep), `build.foreground.dir ${foreground.dir} is inside backend/`);
  const files = new Map();
  for (const name of await listFiles(real)) files.set(name, await readFile(await containedFile(real, name)));
  return files;
}

/**
 * Fails when an HTML, CSS or JS file references a path that starts with `/`, naming the setting
 * to change. A text lint: it reads the built files, not the parsed document.
 */
function refuseRootUrls(files) {
  const problems = [];
  for (const [name, bytes] of files) {
    const rules = ROOT_URL_RULES[path.extname(name)];
    if (!rules) continue;
    const text = bytes.toString('utf8');
    for (const rule of rules) {
      for (const match of text.matchAll(rule)) problems.push(`  ${name}: ${match[0]}`);
    }
    if (name.endsWith('.html')) {
      for (const match of text.matchAll(SRCSET)) {
        const entries = (match[1] ?? match[2]).split(',').map(entry => entry.trim());
        if (entries.some(entry => entry.startsWith('/'))) problems.push(`  ${name}: ${match[0]}`);
      }
    }
  }
  requireValue(problems.length === 0, 'The UI references paths that start with /. The UI is served from a revision directory, '
    + 'so every URL must be relative; a Vite project sets base: "./" in its config.\n' + problems.join('\n'));
}

/** Refuses to replace a directory this tool did not create. */
async function prepareOutput(base, output) {
  const destination = path.resolve(output);
  await mkdir(path.dirname(destination), { recursive: true });
  const resolved = path.join(await realpath(path.dirname(destination)), path.basename(destination));
  requireValue(resolved !== base && !base.startsWith(resolved + path.sep), 'The output directory cannot contain the applet');
  const existing = await lstat(resolved).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing) {
    requireValue(existing.isDirectory(), 'The output path is not a directory');
    const marker = await readFile(path.join(resolved, MARKER), 'utf8').catch(() => null);
    const empty = (await readdir(resolved)).length === 0;
    requireValue(empty || marker?.startsWith('genesis-applet:'), 'Refusing to replace a directory genesis-applet did not create');
  }
  return resolved;
}

/**
 * Builds `dist/`: `revision/` is the revision directory (`bundle.json`, `index.html`, `page.js`
 * and the built UI's other files) and `applet-<id>.bundle.json` is the import file that
 * `dev install` and the APK carry. The `build` section of `applet.json` is not part of the
 * bundled manifest. `debug` defines `__GENESIS_DEBUG__` in the esbuild outputs. `builtAt` (an ISO time) fixes
 * `compat.builtAt`, so two builds of the same sources are byte-identical; without it the build
 * records the current time.
 */
export async function buildApplet(directory, output, { debug = false, builtAt } = {}) {
  const time = builtAt === undefined ? new Date() : new Date(builtAt);
  requireValue(builtAt === undefined || (typeof builtAt === 'string' && !Number.isNaN(time.getTime())
    && [time.toISOString(), time.toISOString().replace(/\.\d{3}Z$/, 'Z')].includes(builtAt)), `builtAt must be an ISO time such as 2026-11-09T16:00:00Z, not ${builtAt}`);
  const { base, manifest, build: config } = await checkApplet(directory);
  const destination = await prepareOutput(base, output ?? path.join(base, 'dist'));
  const outdir = path.join(destination, REVISION);
  const files = new Map();
  const add = (name, bytes) => {
    requireValue(isBundlePath(name), `Unsupported bundle path ${name}: segments use only A-Z a-z 0-9 . _ - and do not start with a dot`);
    requireValue(!files.has(name), `Two bundle files share the path ${name}`);
    files.set(name, bytes);
  };

  for (const [name, bytes] of await buildForeground(base, config.foreground, manifest, { outdir, debug })) add(name, bytes);
  const page = await bundle(base, 'page', PAGE_ENTRY, config.page ?? 'the page agent',
    { outdir, debug, plugins: [pageEntry(base, config.page), noReactInPage] });
  for (const [name, bytes] of page) {
    requireValue(!name.endsWith('.css'), `The page script must not import CSS`);
    if (!files.has(name) || !name.startsWith('assets/')) add(name, bytes);
  }
  for (const name of [...REQUIRED_BUNDLE_FILES, manifest.foreground.entry]) requireValue(files.has(name), `The built UI has no ${name}`);
  refuseRootUrls(files);

  const names = [...files.keys()].sort();
  const sdk = await installedSdk(base);
  requireValue(sdk, `${base} does not resolve @genesis/sdk; run npm install`);
  const bundleJson = {
    format: BUNDLE_FORMAT, compat: bundleCompat(sdk, time), manifest,
    files: names.map(name => ({ path: name, sha256: sha256(files.get(name)) })),
  };
  const entries = names.map(name => TEXT.has(path.extname(name))
    ? { path: name, encoding: 'utf8', content: files.get(name).toString('utf8') }
    : { path: name, encoding: 'base64', content: files.get(name).toString('base64') });
  const importName = `applet-${manifest.id}.bundle.json`;

  const staging = `${destination}.staging-${randomUUID()}`;
  try {
    for (const [name, bytes] of files) {
      const file = path.join(staging, REVISION, name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    }
    await writeFile(path.join(staging, REVISION, 'bundle.json'), JSON.stringify(bundleJson, null, 2) + '\n');
    await writeFile(path.join(staging, importName), JSON.stringify({ envelope: COMPAT.importEnvelope, bundle: bundleJson, entries }));
    await writeFile(path.join(staging, MARKER), MARKER_TEXT);
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { appletId: manifest.id, output: destination, importFile: path.join(destination, importName), files: names.length, compat: bundleJson.compat, debug };
}

/** Reads a built `dist/` directory and returns its import file path and applet id. */
export async function readBuild(directory) {
  const base = await realpath(directory);
  const bundleJson = JSON.parse(await readFile(path.join(base, REVISION, 'bundle.json'), 'utf8').catch(() => 'null'));
  requireValue(bundleJson?.format === BUNDLE_FORMAT && typeof bundleJson.manifest?.id === 'string', `${base} is not a bundle format ${BUNDLE_FORMAT} build`);
  const importFile = path.join(base, `applet-${bundleJson.manifest.id}.bundle.json`);
  requireValue(await stat(importFile).then(info => info.isFile(), () => false), `Missing ${path.basename(importFile)}; run genesis-applet build again`);
  return { appletId: bundleJson.manifest.id, importFile, bundle: bundleJson };
}
