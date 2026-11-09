// CI steps for applet repositories, run by the reusable workflows in .github/workflows/.
//
//   plan    --source <dir> [--tag <tag>]
//   verify  --source <dir> --path <path>
//   assets  --source <dir> --path <path> --out <dir> --repository-id <n> --repository <owner/name>
//           --commit <sha> --tag <tag> --run <url>
//
// An applet resolves @genesis/sdk from the Genesis npm workspace, so `verify` copies it into this
// checkout's applets directory and rebuilds it with this checkout's tools.
import { spawnSync } from 'node:child_process';
import { appendFile, copyFile, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateReleaseRecord } from '@genesis/core';
import { readApplet, requireValue } from '../packages/applet-tools/src/manifest.mjs';
import { PUBLISHED, bundleName, readPublished, recordName } from '../packages/applet-tools/src/publish.mjs';
import { listApplets, tagFor } from '../packages/applet-tools/src/repo.mjs';
import { readWorkspace, root } from './workspace.mjs';

const OPTIONS = {
  plan: ['source', 'tag'],
  verify: ['source', 'path'],
  assets: ['source', 'path', 'out', 'repository-id', 'repository', 'commit', 'tag', 'run'],
};
const REQUIRED = { plan: ['source'], verify: ['source', 'path'], assets: OPTIONS.assets };

function parseArgs(argv) {
  const [command, ...rest] = argv;
  requireValue(Object.hasOwn(OPTIONS, command), `Use ${Object.keys(OPTIONS).join('|')}`);
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i]?.replace(/^--/, '');
    requireValue(rest[i]?.startsWith('--') && OPTIONS[command].includes(name) && rest[i + 1] !== undefined, `Unknown or incomplete option ${rest[i]}`);
    options[name] = rest[i + 1];
  }
  for (const name of REQUIRED[command]) requireValue(options[name], `${command} needs --${name}`);
  return { command, options };
}

function run(executable, args) {
  console.error(`$ ${executable} ${args.join(' ')}`);
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', shell: false });
  requireValue(!result.error && result.status === 0, `${executable} ${args.join(' ')} failed${result.error ? `: ${result.error.message}` : ` (${result.status})`}`);
}

/** One matrix entry per applet; `genesisCommit` is null when the applet has no published record. */
async function plan({ source, tag }) {
  const { layout, applets } = await listApplets(source);
  const matrix = [];
  for (const applet of applets) {
    const published = await readPublished(applet.directory, applet.id).catch(() => null);
    matrix.push({ appletId: applet.id, path: applet.path, version: applet.version, genesisCommit: published?.record.toolchain.genesisCommit ?? null });
  }
  let selected = matrix;
  if (tag) {
    selected = matrix.filter(entry => tagFor(layout, entry.appletId, entry.version) === tag);
    if (selected.length === 0) {
      const named = matrix.find(entry => tag.startsWith(layout === 'single' ? 'v' : `${entry.appletId}/v`));
      requireValue(false, named
        ? `Tag ${tag} names ${named.appletId}, whose package.json version is ${named.version}; the tag must be ${tagFor(layout, named.appletId, named.version)}`
        : `Tag ${tag} names no applet of this ${layout}-applet repository`);
    }
  }
  const json = JSON.stringify(selected);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `matrix=${json}\n`);
  console.log(json);
}

/** Copies the applet into this checkout's applets directory and runs `publish --verify` on it. */
async function verify({ source, path: relative }) {
  const from = path.resolve(source, relative);
  const { manifest } = await readApplet(from);
  const published = await readPublished(from, manifest.id);
  requireValue(published, `${path.join(relative, PUBLISHED, recordName(manifest.id))}: no published release record; run genesis-applet publish and commit it`);
  requireValue(published.record.toolchain.genesisCommit === spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
    `${manifest.id} was published with Genesis ${published.record.toolchain.genesisCommit}; check out that commit to verify it`);
  const { appletsDirectory } = readWorkspace();
  const target = path.join(appletsDirectory, manifest.id);
  requireValue(!(await stat(target).catch(() => null)), `${target} already exists; verify runs in a checkout without that applet`);
  const lockfile = path.join(root, 'package-lock.json');
  const lock = await readFile(lockfile);
  const created = !(await stat(appletsDirectory).catch(() => null));
  try {
    await mkdir(appletsDirectory, { recursive: true });
    await cp(from, target, { recursive: true, filter: file => path.dirname(file) !== from || !['node_modules', 'dist', '.git'].includes(path.basename(file)) });
    // npm ci cannot run: the lockfile does not list the copied workspace.
    console.error('Installing with npm install, because the root lockfile does not list the copied applet');
    run('npm', ['install', '--no-audit', '--no-fund']);
    run('npm', ['run', 'build', '-w', 'packages/core']);
    run(process.execPath, ['packages/sdk/build.mjs']);
    run(process.execPath, ['packages/applet-tools/src/cli.mjs', 'publish', target, '--verify']);
  } finally {
    await rm(created ? appletsDirectory : target, { recursive: true, force: true });
    await writeFile(lockfile, lock);
  }
}

/** Writes the release assets: the committed bundle, and the record with its `source` block. */
async function assets(options) {
  const from = path.resolve(options.source, options.path);
  const { manifest } = await readApplet(from);
  const published = await readPublished(from, manifest.id);
  requireValue(published?.current, `${path.join(options.path, PUBLISHED)} has no current release of ${manifest.id}`);
  const id = Number(options['repository-id']);
  requireValue(Number.isSafeInteger(id) && id > 0, '--repository-id must be a positive integer');
  const record = validateReleaseRecord({
    ...published.record,
    source: {
      repository: { id, fullName: options.repository },
      path: options.path.replace(/\/+$/, '') || '.',
      commit: options.commit,
      tag: options.tag,
      workflowRun: options.run,
    },
  });
  await mkdir(options.out, { recursive: true });
  await copyFile(path.join(from, PUBLISHED, bundleName(manifest.id)), path.join(options.out, bundleName(manifest.id)));
  await writeFile(path.join(options.out, recordName(manifest.id)), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ appletId: manifest.id, version: record.version, files: [bundleName(manifest.id), recordName(manifest.id)] }));
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  await ({ plan, verify, assets })[command](options);
} catch (error) {
  console.error(error.code ? `${error.code}: ${error.message}` : error.message);
  process.exitCode = 1;
}
