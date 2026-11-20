import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = 'genesis.workspace.json';
// The applets directory itself, or a link to it when genesis.workspace.json names another place.
// The applets directory is its own npm workspace with its own node_modules.
const ENTRY = path.join(root, 'applets');
const help = `Usage: npm run workspace -- <command>   (or node tools/workspace.mjs <command>)

  path [applets|let|servelets]
          print a directory named in ${CONFIG} (default applets)
  setup   clone the applets and Let repositories when they are missing, create an empty
          servelets repository when it is missing and has no remote, then sync; after
          cloning the applets, run npm ci in them
  sync    when the applets directory is elsewhere, link applets/ to it
  check   fail unless the workspace matches ${CONFIG}
  link-framework
          install a copy of this checkout's let/packages/* into the applets' node_modules,
          so the applets build against the local framework instead of the npm registry
          copy; run it again after changing the framework
  unlink-framework
          run npm ci in the applets directory, back to the registry copy

Run npm ci at the Genesis root after setup.`;
const NESTED = ['let', 'servelets'];
const FRAMEWORK = ['core', 'sdk', 'applet-tools', 'servelet-tools'];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * The applets location from `genesis.workspace.json`. `directory` is relative to the Genesis
 * root or absolute; `repository` is the git remote that `setup` clones.
 */
export function readWorkspace() {
  const config = JSON.parse(readFileSync(path.join(root, CONFIG), 'utf8'));
  const { directory, repository } = config.applets ?? {};
  requireValue(typeof directory === 'string' && directory.trim(), `${CONFIG}: applets.directory must be a relative or absolute path`);
  requireValue(repository === undefined || typeof repository === 'string' && repository.trim(), `${CONFIG}: applets.repository must be a git remote URL`);
  const appletsDirectory = path.resolve(root, directory);
  const relative = path.relative(root, appletsDirectory);
  requireValue(relative !== '', `${CONFIG}: applets.directory must not be the Genesis root`);
  const inside = !leavesRoot(relative);
  return { appletsDirectory, repository, inside, linked: appletsDirectory !== ENTRY, ...readNested(config) };
}

/**
 * The Let framework and servelets directories. Each sits inside the Genesis root as its own
 * repository; `repository` is the remote that `setup` clones, absent for a local-only one.
 */
function readNested(config) {
  const nested = {};
  for (const name of NESTED) {
    const { directory = name, repository } = config[name] ?? {};
    requireValue(typeof directory === 'string' && directory.trim(), `${CONFIG}: ${name}.directory must be a relative path`);
    requireValue(repository === undefined || typeof repository === 'string' && repository.trim(), `${CONFIG}: ${name}.repository must be a git remote URL`);
    const location = path.resolve(root, directory);
    const relative = path.relative(root, location);
    requireValue(relative !== '' && !leavesRoot(relative), `${CONFIG}: ${name}.directory must be inside the Genesis root`);
    nested[name] = { directory: location, repository };
  }
  return nested;
}

function leavesRoot(relative) {
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function realpathOrNull(file) {
  try { return realpathSync(file); } catch { return null; }
}

function isLink(file) {
  try { return lstatSync(file).isSymbolicLink(); } catch { return false; }
}

// git check-ignore exits 1 for a path it does not ignore. Any other failure means the root is
// not a git checkout (a source archive) or git is missing; there is nothing to protect then.
function ignoredByRoot(file) {
  const result = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', path.relative(root, file)], { shell: false });
  return result.status !== 1;
}

/**
 * Fails with the command that repairs the first difference between the workspace and its config.
 * With `requireApplets: false`, a missing applets directory is accepted: a release checkout has
 * only Genesis and Let, and its bundled applets come from their published releases.
 */
export function checkLayout({ requireApplets = true } = {}) {
  const workspace = readWorkspace();
  const { appletsDirectory, inside, linked } = workspace;
  const { workspaces } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  requireValue(Array.isArray(workspaces) && workspaces.includes('let/packages/*'), 'package.json workspaces must include let/packages/*');
  requireValue(existsSync(path.join(workspace.let.directory, 'packages')), `Missing Let framework in ${workspace.let.directory}. Run npm run workspace -- setup, then npm install.`);
  for (const name of NESTED) {
    const { directory } = workspace[name];
    requireValue(ignoredByRoot(directory), `Add /${path.relative(root, directory).split(path.sep).join('/')} to .gitignore: the ${name} directory is its own repository.`);
  }
  if (!requireApplets && !existsSync(appletsDirectory) && !existsSync(ENTRY)) return workspace;
  requireValue(existsSync(appletsDirectory), `Missing applets directory ${appletsDirectory}. Run npm run workspace -- setup.`);
  requireValue(realpathOrNull(ENTRY) === realpathSync(appletsDirectory), `applets/ does not lead to ${appletsDirectory}. Run npm run workspace -- sync.`);
  requireValue(ignoredByRoot(ENTRY), 'Add /applets to .gitignore: the applets directory is its own repository.');
  if (linked && inside) requireValue(ignoredByRoot(appletsDirectory), `Add /${path.relative(root, appletsDirectory).split(path.sep).join('/')}/ to .gitignore: the applets directory is its own repository.`);
  return workspace;
}

function sync() {
  const { appletsDirectory, linked } = readWorkspace();
  requireValue(existsSync(appletsDirectory), `Missing applets directory ${appletsDirectory}. Run npm run workspace -- setup.`);
  if (linked && realpathOrNull(ENTRY) !== realpathSync(appletsDirectory)) {
    requireValue(!existsSync(ENTRY) || isLink(ENTRY), `applets/ is a directory, not a link. Move it to ${appletsDirectory} or set applets.directory to "applets".`);
    if (isLink(ENTRY)) rmSync(ENTRY);
    symlinkSync(appletsDirectory, ENTRY, 'dir');
    console.log(`Linked applets/ to ${appletsDirectory}`);
  }
  checkLayout();
  console.log(`Workspace matches ${CONFIG}.`);
}

function setup() {
  const { appletsDirectory, repository, let: framework, servelets } = readWorkspace();
  if (!existsSync(framework.directory)) {
    requireValue(framework.repository, `${CONFIG}: set let.repository to clone the Let framework`);
    const result = spawnSync('git', ['clone', framework.repository, framework.directory], { stdio: 'inherit', shell: false });
    requireValue(!result.error && result.status === 0, `git clone ${framework.repository} failed`);
  }
  if (!existsSync(servelets.directory)) {
    const result = servelets.repository
      ? spawnSync('git', ['clone', servelets.repository, servelets.directory], { stdio: 'inherit', shell: false })
      : spawnSync('git', ['init', '-b', 'main', servelets.directory], { stdio: 'inherit', shell: false });
    requireValue(!result.error && result.status === 0, `Could not create ${servelets.directory}`);
  }
  if (existsSync(appletsDirectory)) console.log(`Applets directory exists: ${appletsDirectory}`);
  else {
    requireValue(repository, `${CONFIG}: set applets.repository to clone the applets directory`);
    const result = spawnSync('git', ['clone', repository, appletsDirectory], { stdio: 'inherit', shell: false });
    requireValue(!result.error && result.status === 0, `git clone ${repository} failed`);
    npm(appletsDirectory, ['ci']);
  }
  sync();
  console.log('Run npm ci at the Genesis root to install the Let packages.');
}

function npm(directory, args) {
  console.log(`${directory}: npm ${args.join(' ')}`);
  const result = spawnSync('npm', args, { cwd: directory, stdio: 'inherit', shell: false });
  requireValue(!result.error && result.status === 0, `npm ${args.join(' ')} failed in ${directory}`);
}

// Installs this checkout's framework into the applets the way the registry would: npm pack runs each
// package's prepack step (builds, the servelet tools' Go library and templates) and the applets
// install the tarballs. A copy, not a link: a linked SDK would resolve React from the Genesis root,
// a second copy beside the applets' own, and hooks would fail. --no-save keeps the applets'
// package.json and lockfile on the registry versions. Run it again after changing the framework.
function linkFramework() {
  const { appletsDirectory, let: framework } = readWorkspace();
  requireValue(existsSync(appletsDirectory), `Missing applets directory ${appletsDirectory}. Run npm run workspace -- setup.`);
  const packed = mkdtempSync(path.join(tmpdir(), 'genesis-framework-'));
  try {
    for (const name of FRAMEWORK) npm(path.join(framework.directory, 'packages', name), ['pack', '--pack-destination', packed]);
    npm(appletsDirectory, ['install', '--no-save', ...readdirSync(packed).map(file => path.join(packed, file))]);
  } finally {
    rmSync(packed, { recursive: true, force: true });
  }
  console.log('The applets use the local Let packages. npm run workspace -- unlink-framework restores the registry copy.');
}

function unlinkFramework() {
  const { appletsDirectory } = readWorkspace();
  requireValue(existsSync(appletsDirectory), `Missing applets directory ${appletsDirectory}. Run npm run workspace -- setup.`);
  npm(appletsDirectory, ['ci']);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  try {
    if (command === 'path') {
      const name = process.argv[3] ?? 'applets';
      const workspace = readWorkspace();
      requireValue(name === 'applets' || NESTED.includes(name), `Unknown directory ${name}; use applets, let or servelets`);
      console.log(name === 'applets' ? workspace.appletsDirectory : workspace[name].directory);
    }
    else if (command === 'setup') setup();
    else if (command === 'sync') sync();
    else if (command === 'check') { checkLayout(); console.log(`Workspace matches ${CONFIG}.`); }
    else if (command === 'link-framework') linkFramework();
    else if (command === 'unlink-framework') unlinkFramework();
    else { console.log(help); if (command !== '--help') process.exitCode = 1; }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
