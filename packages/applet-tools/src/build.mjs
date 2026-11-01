import { build } from 'esbuild';
import { matchesRoute, customizedRoute } from './routes.mjs';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, realpath, readdir, stat, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkApplet } from './check.mjs';
import { containedFile, safePath, requireValue, sha256, bundleRevision, validateBundle, MAX_ASSET_BYTES, MAX_BUNDLE_BYTES } from './manifest.mjs';
const marker = '.genesis-applet-output';
async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    requireValue(!entry.isSymbolicLink(), 'Bundle may not contain symlinks');
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), name + '/'));
    else { requireValue(entry.isFile(), 'Bundle must contain regular files'); files.push(name); }
  }
  return files.sort();
}
export async function readBundle(directory) {
  const base = await realpath(directory);
  const metadata = await containedFile(base, 'bundle.json');
  requireValue((await stat(metadata)).size <= 1024 * 1024, 'Bundle metadata exceeds 1 MiB');
  const bundle = validateBundle(JSON.parse(await readFile(metadata, 'utf8')));
  const expected = ['bundle.json', ...bundle.package.assets.map(a => `assets/${a.path}`)].sort();
  const actual = (await listFiles(base)).filter(p => p !== marker);
  requireValue(JSON.stringify(actual) === JSON.stringify(expected), 'Missing or undeclared bundle file');
  let total = 0;
  for (const asset of bundle.package.assets) {
    const file = await containedFile(base, `assets/${asset.path}`), size = (await stat(file)).size;
    total += size;
    requireValue(size <= MAX_ASSET_BYTES && total <= MAX_BUNDLE_BYTES, 'Bundle asset size limit exceeded');
    requireValue(sha256(await readFile(file)) === asset.sha256, 'Asset integrity mismatch');
  }
  return bundle;
}
export async function buildApplet(directory, output) {
  const { base, manifest: original } = await checkApplet(directory);
  requireValue(typeof output === 'string' && output.length > 0, 'Output directory required');
  const destination = path.resolve(output);
  // Resolve the parent to catch output symlinks before any cleanup.
  await mkdir(path.dirname(destination), { recursive: true });
  const resolvedOutput = path.join(await realpath(path.dirname(destination)), path.basename(destination));
  requireValue(base !== resolvedOutput && !base.startsWith(resolvedOutput + path.sep), 'Output cannot contain source directory');
  try {
    const info = await stat(destination);
    requireValue(info.isDirectory() && await realpath(destination) === resolvedOutput, 'Unsafe output directory');
    requireValue((await readFile(path.join(destination, marker), 'utf8')) === 'genesis-applet:1\n', 'Refusing to replace an unrecognized output directory');
  } catch (error) { if (error.code !== 'ENOENT') throw error; if (await stat(destination).catch(() => null)) throw error; }
  const resolver = createRequire(path.join(base, 'package.json'));
  const runtime = resolver.resolve('@genesis/sdk/runtime');
  const sdkRoot = path.dirname(path.dirname(await realpath(runtime)));
  const sdk = JSON.parse(await readFile(path.join(sdkRoot, 'package.json'), 'utf8'));
  const api = await import(resolver.resolve('@genesis/sdk/manifest'));
  const runtimeApi=original.schemaVersion>=2?original.schemaVersion+1:2;
  requireValue((api.SUPPORTED_RUNTIME_API_VERSIONS??[api.RUNTIME_API_VERSION]).includes(runtimeApi===2?3:runtimeApi), 'Installed SDK does not support this manifest runtime API');
  const manifest = structuredClone(original), files = new Map();
  files.set("runtime/routes.js", Buffer.from(`${matchesRoute.toString()}\n${customizedRoute.toString()}`));
  for (const [kind, entries] of [['sources', manifest.sources], ['pages', manifest.pages]]) {
    for (const entry of entries) {
      const source = await containedFile(base, entry.entry);
      entry.entry = `${kind}/${entry.id}.js`;
      const result = await build({ absWorkingDir: base, stdin: { contents: `import entry from ${JSON.stringify(source)}; import {bootstrap} from ${JSON.stringify(runtime)}; bootstrap(__GENESIS_BINDING__,entry);`, resolveDir: base, sourcefile: `${manifest.id}-${entry.id}.js` }, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', jsx: 'automatic', loader: { '.css': 'text' }, write: false, metafile: true, minify: true, legalComments: 'none', define: { 'process.env.NODE_ENV': '"production"' } });
      requireValue(Object.values(result.metafile.outputs).every(o => o.imports.length === 0), 'External or dynamic imports remain in bundle');
      for (const name of Object.keys(result.metafile.inputs)) {
        if (name.endsWith(`${manifest.id}-${entry.id}.js`)) continue;
        const input = await realpath(path.resolve(base, name));
        requireValue(!input.startsWith(path.join(base, 'backend') + path.sep), 'Backend files cannot enter browser bundles');
        requireValue(input.startsWith(base + path.sep) || input.startsWith(sdkRoot + path.sep) || input.includes(`${path.sep}node_modules${path.sep}`), 'Frontend import escapes applet and installed dependencies');
      }
      files.set(entry.entry, result.outputFiles[0].contents);
      if (kind === 'pages') files.set(`pages/${entry.id}/index.html`, Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${entry.id}</title><style>html,body{margin:0;padding:0}</style></head><body><noscript>Genesis requires JavaScript.</noscript></body></html>`));
    }
  }
  if (manifest.shell) {
    requireValue(!manifest.shell.brandAsset.startsWith('backend/'), 'Backend files cannot be brand assets');
    files.set(manifest.shell.brandAsset, await readFile(await containedFile(base, manifest.shell.brandAsset)));
  }
  let total = 0;
  for (const [name, bytes] of files) { total += bytes.length; requireValue(safePath(name) && bytes.length <= MAX_ASSET_BYTES && total <= MAX_BUNDLE_BYTES, 'Asset/bundle size limit exceeded'); }
  const assets = [...files].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, bytes]) => ({ path: name, sha256: sha256(bytes) }));
  const bundle = { formatVersion: 1, runtimeApiVersion: runtimeApi, sdkVersion: sdk.version, package: { manifest, revision: '', assets } };
  bundle.package.revision = bundleRevision(bundle); validateBundle(bundle);
  const staging = resolvedOutput + `.staging-${randomUUID()}`;
  try {
    await mkdir(staging);
    for (const [name, bytes] of files) { const file = path.join(staging, 'assets', name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
    await writeFile(path.join(staging, 'bundle.json'), JSON.stringify(bundle, null, 2) + '\n');
    await writeFile(path.join(staging, marker), 'genesis-applet:1\n');
    // The destination was explicitly identified as tool-owned above.
    await rm(resolvedOutput, { recursive: true, force: true });
    await rename(staging, resolvedOutput);
  } finally { await rm(staging, { recursive: true, force: true }); }
  return bundle;
}
