import { spawnSync } from 'node:child_process';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { compare, parse } from './semver.mjs';
import { requireValue, toolError } from './manifest.mjs';

/** Runs git and returns its trimmed stdout; throws unless `allowFailure` is set. */
export function git(directory, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  if (result.error) throw toolError('GIT_FAILED', `git could not run: ${result.error.message}`);
  if (result.status !== 0) {
    if (allowFailure) return null;
    throw toolError('GIT_FAILED', `git ${args.join(' ')} failed in ${directory}: ${result.stderr.trim()}`);
  }
  return result.stdout.trimEnd();
}

const isFile = file => stat(file).then(info => info.isFile(), () => false);

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { throw toolError('INVALID_PACKAGE', `Cannot read ${file}: ${error.message}`); }
}

/**
 * The applets of a repository directory. `applet.json` at the root makes it a single-applet
 * repository (path `.`); otherwise every immediate subdirectory with `applet.json` is one applet
 * of a multi-applet repository. Returns `{ root, layout, applets, warnings }`, where each applet
 * is `{ id, path, directory, version }`. Throws when the layout is empty or ids repeat.
 */
export async function listApplets(directory) {
  const root = await realpath(directory);
  const warnings = [];
  const entry = async (relative) => {
    const appletDirectory = path.join(root, relative);
    const manifest = await readJson(path.join(appletDirectory, 'applet.json'));
    const pkg = await isFile(path.join(appletDirectory, 'package.json')) ? await readJson(path.join(appletDirectory, 'package.json')) : null;
    return { id: manifest?.id, path: relative, directory: appletDirectory, version: pkg?.version ?? null };
  };
  const subdirectories = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules'
      && await isFile(path.join(root, item.name, 'applet.json'))) subdirectories.push(item.name);
  }
  subdirectories.sort();
  let layout, applets;
  if (await isFile(path.join(root, 'applet.json'))) {
    layout = 'single';
    applets = [await entry('.')];
    if (subdirectories.length) warnings.push(`applet.json at the root makes this a single-applet repository; ignoring ${subdirectories.join(', ')}`);
  } else {
    layout = 'multi';
    applets = await Promise.all(subdirectories.map(entry));
  }
  requireValue(applets.length > 0, `${root} has no applet.json at its root or in an immediate subdirectory`);
  const seen = new Map();
  for (const applet of applets) {
    requireValue(typeof applet.id === 'string' && applet.id, `${applet.path}/applet.json has no id`);
    requireValue(!seen.has(applet.id), `Applet id ${applet.id} is used by both ${seen.get(applet.id)} and ${applet.path}`);
    seen.set(applet.id, applet.path);
    if (layout === 'multi' && applet.path !== applet.id) warnings.push(`Directory ${applet.path} holds applet ${applet.id}; name it after the applet id`);
  }
  return { root, layout, applets, warnings };
}

/** The git repository that holds `directory`, with its applets and the applet at `directory`. */
export async function findRepository(directory) {
  const base = await realpath(directory);
  const root = git(base, ['rev-parse', '--show-toplevel'], { allowFailure: true });
  requireValue(root, `${base} is not inside a git repository`);
  const repository = await listApplets(root);
  const applet = repository.applets.find(a => a.directory === base);
  requireValue(applet, `${base} is not an applet of the repository ${repository.root} (applets: ${repository.applets.map(a => a.path).join(', ')})`);
  return { ...repository, applet };
}

/** `v1.2.0` in a single-applet repository, `<id>/v1.2.0` in a multi-applet one. */
export const tagPrefix = (layout, id) => (layout === 'single' ? 'v' : `${id}/v`);
export const tagFor = (layout, id, version) => `${tagPrefix(layout, id)}${version}`;

/** The local tags of an applet with their versions, highest first. Tags that are not semver are skipped. */
export function tagsFor(root, layout, id) {
  const prefix = tagPrefix(layout, id);
  const listed = git(root, ['tag', '--list', `${prefix}*`]);
  return (listed ? listed.split('\n') : [])
    .map(tag => ({ tag, version: tag.slice(prefix.length) }))
    .filter(entry => parse(entry.version))
    .sort((a, b) => compare(b.version, a.version));
}

/** `owner/name` of a GitHub remote URL (`git@github.com:o/n.git`, `https://github.com/o/n(.git)`), or null. */
export function githubFullName(url) {
  const match = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url ?? '');
  return match ? `${match[1]}/${match[2]}` : null;
}
