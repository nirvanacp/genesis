import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = 'genesis.workspace.json';
// npm installs every applet through the workspace glob `applets/*`. This in-root path is the
// applets directory itself, or a link to it when genesis.workspace.json names another place.
const ENTRY = path.join(root, 'applets');
const help = `Usage: npm run workspace -- <command>   (or node tools/workspace.mjs <command>)

  path    print the applets directory named in ${CONFIG}
  setup   clone the applets repository into that directory when it is missing, then sync
  sync    when the applets directory is elsewhere, link applets/ to it; when it is outside
          the Genesis root, also link its node_modules to the root install
  check   fail unless the workspace matches ${CONFIG}

Run npm install after setup.`;

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
  const inside = !relative.startsWith('..') && !path.isAbsolute(relative);
  return { appletsDirectory, repository, inside, linked: appletsDirectory !== ENTRY };
}

function realpathOrNull(file) {
  try { return realpathSync(file); } catch { return null; }
}

function isLink(file) {
  try { return lstatSync(file).isSymbolicLink(); } catch { return false; }
}

// Node and esbuild resolve from an applet's real path. Outside the Genesis root no root
// node_modules lies above it, so the SDK and React resolve through this link instead.
function modulesLink({ appletsDirectory }) {
  return path.join(realpathOrNull(appletsDirectory) ?? appletsDirectory, 'node_modules');
}

// Decided by real paths, so a directory reached through a link counts where it really is.
function outsideRoot({ appletsDirectory, inside }) {
  const real = realpathOrNull(appletsDirectory);
  if (!real) return !inside;
  const relative = path.relative(realpathSync(root), real);
  return relative.startsWith('..') || path.isAbsolute(relative);
}

// Compares the link's target rather than real paths, so it holds before the first npm install.
function modulesLinked(workspace) {
  const link = modulesLink(workspace);
  return isLink(link) && path.resolve(path.dirname(link), readlinkSync(link)) === path.join(root, 'node_modules');
}

function ignoredByRoot(file) {
  const result = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', path.relative(root, file)], { shell: false });
  return result.status === 0;
}

/** Fails with the command that repairs the first difference between the workspace and its config. */
export function checkLayout() {
  const workspace = readWorkspace();
  const { appletsDirectory, inside, linked } = workspace;
  const { workspaces } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  requireValue(Array.isArray(workspaces) && workspaces.includes('applets/*'), 'package.json workspaces must include applets/*');
  requireValue(existsSync(appletsDirectory), `Missing applets directory ${appletsDirectory}. Run npm run workspace -- setup, then npm install.`);
  requireValue(realpathOrNull(ENTRY) === realpathSync(appletsDirectory), `applets/ does not lead to ${appletsDirectory}. Run npm run workspace -- sync, then npm install.`);
  requireValue(ignoredByRoot(ENTRY), 'Add /applets to .gitignore: the applets directory is its own repository.');
  if (linked && inside) requireValue(ignoredByRoot(appletsDirectory), `Add /${path.relative(root, appletsDirectory).split(path.sep).join('/')}/ to .gitignore: the applets directory is its own repository.`);
  if (outsideRoot(workspace)) requireValue(modulesLinked(workspace), `${modulesLink(workspace)} must link to the Genesis root node_modules. Run npm run workspace -- sync.`);
  return workspace;
}

function sync() {
  const workspace = readWorkspace();
  const { appletsDirectory, linked } = workspace;
  requireValue(existsSync(appletsDirectory), `Missing applets directory ${appletsDirectory}. Run npm run workspace -- setup.`);
  if (linked && realpathOrNull(ENTRY) !== realpathSync(appletsDirectory)) {
    requireValue(!existsSync(ENTRY) || isLink(ENTRY), `applets/ is a directory, not a link. Move it to ${appletsDirectory} or set applets.directory to "applets".`);
    if (isLink(ENTRY)) rmSync(ENTRY);
    symlinkSync(appletsDirectory, ENTRY, 'dir');
    console.log(`Linked applets/ to ${appletsDirectory}`);
  }
  if (outsideRoot(workspace) && !modulesLinked(workspace)) {
    requireValue(!existsSync(modulesLink(workspace)) || isLink(modulesLink(workspace)), `${modulesLink(workspace)} exists and is not a link. Remove it and run sync again.`);
    if (isLink(modulesLink(workspace))) rmSync(modulesLink(workspace));
    symlinkSync(path.join(root, 'node_modules'), modulesLink(workspace), 'dir');
    console.log(`Linked ${modulesLink(workspace)} to the Genesis root node_modules`);
  }
  console.log(`Workspace matches ${CONFIG}.`);
}

function setup() {
  const { appletsDirectory, repository } = readWorkspace();
  if (existsSync(appletsDirectory)) console.log(`Applets directory exists: ${appletsDirectory}`);
  else {
    requireValue(repository, `${CONFIG}: set applets.repository to clone the applets directory`);
    const result = spawnSync('git', ['clone', repository, appletsDirectory], { stdio: 'inherit', shell: false });
    requireValue(!result.error && result.status === 0, `git clone ${repository} failed`);
  }
  sync();
  console.log('Run npm install to install the applets\' dependencies.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  try {
    if (command === 'path') console.log(readWorkspace().appletsDirectory);
    else if (command === 'setup') setup();
    else if (command === 'sync') sync();
    else if (command === 'check') { checkLayout(); console.log(`Workspace matches ${CONFIG}.`); }
    else { console.log(help); if (command !== '--help') process.exitCode = 1; }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
