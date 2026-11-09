import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { RELEASE_FORMAT, validateReleaseRecord } from '@genesis/core';
import { buildApplet } from './build.mjs';
import { TOOLS_VERSION } from './compat.mjs';
import { readApplet, requireValue, sha256, toolError } from './manifest.mjs';
import { findRepository, git, githubFullName } from './repo.mjs';
import { isExact, parse } from './semver.mjs';

export const PUBLISHED = 'published';
export const bundleName = id => `applet-${id}.bundle.json`;
export const recordName = id => `applet-${id}.release.json`;

/** The Genesis checkout these tools run from, or null when they were installed from a package. */
export function genesisRoot() {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  try {
    const json = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    return Array.isArray(json.workspaces) && existsSync(path.join(root, 'packages/applet-tools')) ? path.resolve(root) : null;
  } catch { return null; }
}

const GENESIS_PATHS = ['packages', 'tools', 'package.json', 'package-lock.json'];

/** The Genesis commit that builds the release. Refuses when the build inputs differ from it. */
function genesisCommit({ requireClean }) {
  const root = genesisRoot();
  requireValue(root, 'publish needs the Genesis checkout these tools belong to; run it from a Genesis workspace');
  if (requireClean) {
    const dirty = git(root, ['status', '--porcelain', '--', ...GENESIS_PATHS]);
    requireValue(!dirty, `The Genesis checkout has uncommitted changes, so its commit would not describe the build:\n${dirty}\nCommit them first.`);
  }
  const commit = git(root, ['rev-parse', 'HEAD']);
  const pushed = git(root, ['branch', '-r', '--contains', commit], { allowFailure: true });
  return { root, commit, warnings: pushed ? [] : [`Genesis commit ${commit.slice(0, 12)} is on no remote branch; CI cannot check it out until it is pushed`] };
}

async function readPackage(base) {
  try { return JSON.parse(await readFile(path.join(base, 'package.json'), 'utf8')); }
  catch (error) { throw toolError('INVALID_PACKAGE', `Cannot read ${path.join(base, 'package.json')}: ${error.message}`); }
}

/** Refuses a version that is not semver and dependency ranges that are not exact. */
function checkPackage(pkg) {
  requireValue(parse(pkg.version), `package.json version ${pkg.version ?? '(missing)'} is not MAJOR.MINOR.PATCH[-prerelease]; set it with npm version <patch|minor|major> --no-git-tag-version`);
  const loose = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([, range]) => !isExact(range));
  requireValue(loose.length === 0, `Dependencies must name exact versions so the build is reproducible:\n${loose.map(([name, range]) => `  ${name} ${range}`).join('\n')}`);
}

/** `{ fullName, path }` from the applet repository's GitHub `origin` remote, or null. */
async function homeOf(base) {
  let repository;
  try { repository = await findRepository(base); } catch { return null; }
  const fullName = githubFullName(git(repository.root, ['remote', 'get-url', 'origin'], { allowFailure: true }));
  return fullName ? { fullName, path: repository.applet.path } : null;
}

/** The release record for a built bundle, in the field order of the documented format. */
export function releaseRecord({ manifest, version, bundleBytes, compat, commit, home }) {
  return {
    releaseFormat: RELEASE_FORMAT,
    appletId: manifest.id,
    name: manifest.name,
    version,
    bundle: { file: bundleName(manifest.id), sha256: sha256(bundleBytes), size: bundleBytes.length },
    compat,
    origins: manifest.origins,
    capabilities: { storage: !!manifest.capabilities.storage, services: (manifest.capabilities.services ?? []).map(s => s.id) },
    toolchain: { genesisCommit: commit, node: process.versions.node, tools: TOOLS_VERSION, sdk: compat.sdk },
    ...(home ? { home } : {}),
    builtAt: compat.builtAt,
  };
}

const recordText = record => JSON.stringify(record, null, 2) + '\n';

/** Builds a release bundle into a temporary directory and returns its bytes and record. */
async function buildRelease(base, { builtAt, commit, home }) {
  const { manifest } = await readApplet(base);
  const pkg = await readPackage(base);
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'genesis-publish-'));
  try {
    const built = await buildApplet(base, path.join(temporary, 'dist'), { builtAt });
    requireValue(built.appletId === manifest.id, `The build produced applet ${built.appletId}, but applet.json names ${manifest.id}`);
    const bundleBytes = await readFile(built.importFile);
    return { manifest, bundleBytes, record: releaseRecord({ manifest, version: pkg.version, bundleBytes, compat: built.compat, commit, home }) };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** Reads the committed release record of an applet directory, or null when there is none. */
export async function readPublished(base, id) {
  const directory = path.join(base, PUBLISHED);
  const text = await readFile(path.join(directory, recordName(id)), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (text === null) return null;
  let record;
  try { record = validateReleaseRecord(JSON.parse(text)); }
  catch (error) { throw toolError('INVALID_RELEASE', `${path.join(PUBLISHED, recordName(id))}: ${error.message}`); }
  const bundleBytes = await readFile(path.join(directory, record.bundle.file)).catch(() => null);
  return { record, text, bundleBytes, current: !!bundleBytes && sha256(bundleBytes) === record.bundle.sha256 && bundleBytes.length === record.bundle.size };
}

async function writeAtomic(file, bytes) {
  await writeFile(`${file}.tmp`, bytes);
  await rename(`${file}.tmp`, file);
}

/**
 * Writes `published/applet-<id>.bundle.json` and its release record from a fresh release build,
 * or with `verify` rebuilds with the committed `builtAt` and compares bytes without writing.
 */
export async function publishApplet(directory, { verify = false } = {}) {
  const base = await realpath(directory);
  const { manifest } = await readApplet(base);
  const pkg = await readPackage(base);
  checkPackage(pkg);
  return verify ? verifyPublished(base, manifest) : writePublished(base, pkg);
}

async function writePublished(base, pkg) {
  const { commit, warnings } = genesisCommit({ requireClean: true });
  const home = await homeOf(base);
  if (!home) warnings.push('No GitHub origin remote found; the record has no home, so a bundled copy cannot match later releases');
  const builtAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace(/\.000Z$/, 'Z');
  const { manifest, bundleBytes, record } = await buildRelease(base, { builtAt, commit, home });
  validateReleaseRecord(record);

  const output = path.join(base, PUBLISHED);
  await mkdir(output, { recursive: true });
  const bundleFile = path.join(output, bundleName(manifest.id)), recordFile = path.join(output, recordName(manifest.id));
  await writeAtomic(bundleFile, bundleBytes);
  await writeAtomic(recordFile, recordText(record));
  const removed = [];
  for (const name of await readdir(output)) {
    if (/^applet-.+\.(bundle|release)\.json$/.test(name) && ![path.basename(bundleFile), path.basename(recordFile)].includes(name)) {
      await rm(path.join(output, name));
      removed.push(name);
    }
  }
  return {
    appletId: manifest.id, version: pkg.version, sha256: record.bundle.sha256, size: record.bundle.size, builtAt,
    genesisCommit: commit, home: record.home ?? null, bundle: bundleFile, record: recordFile, removed, warnings,
    next: 'Commit published/, then run genesis-applet release',
  };
}

async function verifyPublished(base, manifest) {
  const published = await readPublished(base, manifest.id);
  requireValue(published, `${path.join(PUBLISHED, recordName(manifest.id))} does not exist; run genesis-applet publish first`);
  const { record } = published;
  requireValue(published.bundleBytes, `${path.join(PUBLISHED, record.bundle.file)} is missing`);
  const { commit } = genesisCommit({ requireClean: false });
  // The home comes from the applet repository's remote, which a CI copy of the applet does not have.
  const rebuilt = await buildRelease(base, { builtAt: record.builtAt, commit, home: record.home });
  // The Node version that ran publish is informational; the bundle bytes show any effect it had.
  rebuilt.record.toolchain.node = record.toolchain.node;
  const differences = [];
  if (!rebuilt.bundleBytes.equals(published.bundleBytes)) {
    differences.push(`bundle bytes differ: committed ${sha256(published.bundleBytes)}, rebuilt ${rebuilt.record.bundle.sha256}`);
  }
  const expected = recordText(rebuilt.record);
  if (expected !== published.text) {
    const a = JSON.parse(published.text), b = rebuilt.record;
    const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
    differences.push(fields.length
      ? `release record fields differ: ${fields.map(key => `${key} (committed ${JSON.stringify(a[key])}, rebuilt ${JSON.stringify(b[key])})`).join('; ')}`
      : 'release record formatting differs');
  }
  if (differences.length) throw toolError('PUBLISH_MISMATCH', `The committed release does not match a rebuild:\n${differences.map(d => `  ${d}`).join('\n')}`);
  return { appletId: manifest.id, version: record.version, sha256: record.bundle.sha256, builtAt: record.builtAt, genesisCommit: commit, identical: true };
}
