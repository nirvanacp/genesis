import { build } from 'esbuild';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BUNDLE_FORMAT } from '@genesis/core';
import { checkApplet, noReactInAdapters } from './check.mjs';
import { requireValue, safePath, sha256 } from './manifest.mjs';

const MARKER = '.genesis-applet-output';
const MARKER_TEXT = 'genesis-applet:2\n';
/** Text files travel as UTF-8 in the import file; everything else as base64. */
const TEXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map']);
/** Segments the host accepts in a bundle path. */
const SEGMENT = /^[A-Za-z0-9._@-]+$/;

const esbuildOptions = base => ({
  absWorkingDir: base, bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser', target: 'es2022',
  jsx: 'automatic', minify: true, legalComments: 'none', logLevel: 'silent',
  loader: { '.svg': 'file', '.png': 'file', '.woff2': 'file' }, assetNames: 'assets/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"' },
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

/** Runs esbuild and returns its output files keyed by their path under `files/`. */
async function bundle(base, entryName, entry, outdir, plugins = []) {
  let result;
  try {
    result = await build({ ...esbuildOptions(base), entryPoints: { [entryName]: entry }, outdir, plugins });
  } catch (error) {
    requireValue(false, `Bundling ${path.relative(base, entry)} failed: ${error.errors?.map(e => e.text).join('; ') ?? error.message}`);
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

function indexHtml(manifest, hasCss) {
  const accent = manifest.shell?.accent;
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    + `<title>${escapeHtml(manifest.name)}</title>\n`
    + (accent ? `<style>:root{--genesis-accent:${accent}}</style>\n` : '')
    + (hasCss ? '<link rel="stylesheet" href="foreground.css">\n' : '')
    + '</head>\n<body>\n<div id="root"></div>\n<script src="foreground.js"></script>\n</body>\n</html>\n';
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
 * Builds `dist/`: `bundle.json`, the served `files/` and the import file
 * `applet-<id>.bundle.json` that `dev install` and the APK carry.
 */
export async function buildApplet(directory, output) {
  const { base, manifest } = await checkApplet(directory);
  const destination = await prepareOutput(base, output ?? path.join(base, 'dist'));
  const outdir = path.join(destination, 'files');
  const files = new Map();
  const add = (name, bytes) => {
    requireValue(safePath(name) && name.split('/').every(segment => SEGMENT.test(segment)), `Unsupported bundle path ${name}`);
    requireValue(!files.has(name), `Two bundle files share the path ${name}`);
    files.set(name, bytes);
  };

  const foreground = await bundle(base, 'foreground', path.join(base, manifest.foreground.entry), outdir);
  for (const [name, bytes] of foreground) add(name, bytes);
  for (const source of manifest.sources) {
    const adapter = await bundle(base, `sources/${source.id}`, path.join(base, source.adapter), outdir, [noReactInAdapters]);
    for (const [name, bytes] of adapter) {
      requireValue(!name.endsWith('.css'), `Adapter ${source.adapter} must not import CSS`);
      if (!files.has(name) || !name.startsWith('assets/')) add(name, bytes);
    }
  }
  const assets = path.join(base, 'assets');
  if (await stat(assets).then(info => info.isDirectory(), () => false)) {
    for (const name of await listFiles(assets)) add(`assets/${name}`, await readFile(path.join(assets, name)));
  }
  add('index.html', Buffer.from(indexHtml(manifest, files.has('foreground.css'))));

  const names = [...files.keys()].sort();
  const bundleJson = { format: BUNDLE_FORMAT, manifest, files: names.map(name => ({ path: name, sha256: sha256(files.get(name)) })) };
  const entries = names.map(name => TEXT.has(path.extname(name))
    ? { path: name, encoding: 'utf8', content: files.get(name).toString('utf8') }
    : { path: name, encoding: 'base64', content: files.get(name).toString('base64') });
  const importName = `applet-${manifest.id}.bundle.json`;

  const staging = `${destination}.staging-${randomUUID()}`;
  try {
    for (const [name, bytes] of files) {
      const file = path.join(staging, 'files', name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    }
    await writeFile(path.join(staging, 'bundle.json'), JSON.stringify(bundleJson, null, 2) + '\n');
    await writeFile(path.join(staging, importName), JSON.stringify({ bundle: bundleJson, entries }));
    await writeFile(path.join(staging, MARKER), MARKER_TEXT);
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { appletId: manifest.id, output: destination, importFile: path.join(destination, importName), files: names.length };
}

/** Reads a built `dist/` directory and returns its import file path and applet id. */
export async function readBuild(directory) {
  const base = await realpath(directory);
  const bundleJson = JSON.parse(await readFile(path.join(base, 'bundle.json'), 'utf8'));
  requireValue(bundleJson.format === BUNDLE_FORMAT && typeof bundleJson.manifest?.id === 'string', `${base} is not a bundle format ${BUNDLE_FORMAT} build`);
  const importFile = path.join(base, `applet-${bundleJson.manifest.id}.bundle.json`);
  requireValue(await stat(importFile).then(info => info.isFile(), () => false), `Missing ${path.basename(importFile)}; run genesis-applet build again`);
  return { appletId: bundleJson.manifest.id, importFile, bundle: bundleJson };
}
