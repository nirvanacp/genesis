#!/usr/bin/env node
import { checkApplet } from './check.mjs';
import { buildApplet } from './build.mjs';
import { deviceStatus, installApplet } from './device.mjs';
import { importCookies } from './cookies.mjs';
import { manageService } from './services.mjs';
import { createApplet } from './create.mjs';
import { exportKit } from './kit.mjs';
import { publishApplet } from './publish.mjs';
import { listRepository, releaseApplet } from './release.mjs';

class UsageError extends Error { constructor(message) { super(message); this.code = 'USAGE'; } }

const FLAGS = ['json', 'local', 'debug', 'verify', 'dry-run'];
function parse(args, permitted) {
  const positional = [], options = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { positional.push(args[i]); continue; }
    const name = args[i].slice(2);
    if (!permitted.includes(name) || Object.hasOwn(options, name)) throw new UsageError(`Unknown or duplicate option --${name}`);
    if (FLAGS.includes(name)) options[name] = true;
    else if (!args[i + 1] || args[i + 1].startsWith('--')) throw new UsageError(`Missing --${name} value`);
    else options[name] = args[++i];
  }
  return { positional, options };
}

const help = `genesis-applet
  create <directory> --origin <https://host> [--id <id>] [--name <name>]
  check <directory>
  build <directory> [--out <directory>] [--debug]
                                                 default <directory>/dist
  dev install <directory> --device <serial>      applet directory or build output
  dev status [<applet-id>] --device <serial>     status and mismatches of installed applets
  dev cookies <directory> --device <serial> [--port 9222]
                                                 copy the applet's website cookies from a
                                                 desktop Chrome to a debug Genesis build
  service start|status|stop <directory> --local [--service-file <path>]
  service start|status|stop|provision <directory> --device <serial> [--service-file <path>]
  kit export --out <directory>
  applets [<repository>]                         applets, versions, published builds and tags
  publish <directory> [--verify]                 write published/applet-<id>.bundle.json and
                                                 its .release.json; --verify rebuilds and compares
  release <directory> [--dry-run]                tag the published version: v<version>, or
                                                 <id>/v<version> in a multi-applet repository
check and build first compare the applet with these tools' versions and fail with
APPLET_INCOMPATIBLE on a difference. They then run the applet's code: the type check
(build.check, or tsc when tsconfig.json exists), the page module named by build.page,
which is bundled with esbuild and imported in Node, and for build the UI build
(build.foreground.command, or esbuild from build.foreground.entry). This is not a
sandbox; check only applets you trust.
build --debug defines __GENESIS_DEBUG__ in the esbuild outputs.
publish needs a committed Genesis checkout, a semver package.json version and exact
dependency versions. Raise versions with npm version <patch|minor|major> --no-git-tag-version.
release needs a clean repository and never pushes; push the tag yourself.
Every command accepts --json. Device commands accept --adb <path> (default: adb in
$ANDROID_HOME, $ANDROID_SDK_ROOT, ~/Library/Android/sdk or ~/Android/Sdk, then adb on
PATH) and --application <id>.`;

const DEVICE = ['device', 'adb', 'application'];

async function main(args) {
  const [command, action] = args;
  const one = (positional, what) => {
    if (positional.length !== 1) throw new UsageError(`Expected one ${what}`);
    return positional[0];
  };
  switch (command) {
    case 'create': {
      const { positional, options } = parse(args.slice(1), ['json', 'origin', 'id', 'name']);
      return ['create', await createApplet(one(positional, 'target directory'), options)];
    }
    case 'check': {
      const { positional } = parse(args.slice(1), ['json']);
      const { manifest, module, warnings, compat } = await checkApplet(one(positional, 'applet directory'));
      return ['check', { appletId: manifest.id, compat, module, warnings }];
    }
    case 'build': {
      const { positional, options } = parse(args.slice(1), ['json', 'out', 'debug']);
      return ['build', await buildApplet(one(positional, 'applet directory'), options.out, { debug: !!options.debug })];
    }
    case 'dev': {
      const { positional, options } = parse(args.slice(2), ['json', ...DEVICE, ...(action === 'cookies' ? ['port'] : [])]);
      if (action === 'install') return ['dev install', await installApplet(one(positional, 'directory'), options)];
      if (action === 'status') {
        if (positional.length > 1) throw new UsageError('dev status takes at most one applet id');
        return ['dev status', deviceStatus(positional[0], options)];
      }
      if (action === 'cookies') return ['dev cookies', await importCookies(one(positional, 'applet directory'), options)];
      throw new UsageError('Use dev install|status|cookies');
    }
    case 'service': {
      const { positional, options } = parse(args.slice(2), ['json', 'local', 'service-file', ...DEVICE]);
      if (!['start', 'status', 'stop', 'provision'].includes(action)) throw new UsageError('Use service start|status|stop|provision');
      if (!!options.local === !!options.device) throw new UsageError('Choose --local or --device <serial>');
      return [`service ${action}`, await manageService(action, one(positional, 'applet directory'), options)];
    }
    case 'kit': {
      const { positional, options } = parse(args.slice(2), ['json', 'out']);
      if (action !== 'export' || positional.length || !options.out) throw new UsageError('Use kit export --out <directory>');
      return ['kit export', await exportKit(options.out)];
    }
    case 'applets': {
      const { positional } = parse(args.slice(1), ['json']);
      if (positional.length > 1) throw new UsageError('applets takes at most one repository directory');
      return ['applets', await listRepository(positional[0] ?? '.')];
    }
    case 'publish': {
      const { positional, options } = parse(args.slice(1), ['json', 'verify']);
      return [options.verify ? 'publish --verify' : 'publish', await publishApplet(one(positional, 'applet directory'), { verify: !!options.verify })];
    }
    case 'release': {
      const { positional, options } = parse(args.slice(1), ['json', 'dry-run']);
      return [options['dry-run'] ? 'release --dry-run' : 'release', await releaseApplet(one(positional, 'applet directory'), { dryRun: !!options['dry-run'] })];
    }
    default:
      throw new UsageError(command ? `Unknown command ${command}` : help);
  }
}

const args = process.argv.slice(2), json = args.includes('--json');
if (args.length === 0 || args.includes('--help') || args[0] === 'help') {
  console.log(json ? JSON.stringify({ ok: true, command: 'help', result: { help } }) : help);
} else {
  try {
    const [command, result] = await main(args);
    if (!json) for (const warning of result.warnings ?? []) console.error(`warning: ${warning}`);
    console.log(json ? JSON.stringify({ ok: true, command, result }) : `${command} passed\n${JSON.stringify(result, null, 2)}`);
  } catch (error) {
    if (json) console.log(JSON.stringify({ ok: false, command: args[0], error: { code: error.code ?? 'FAILURE', message: error.message } }));
    else console.error(error.code && error.code !== 'USAGE' ? `${error.code}: ${error.message}` : error.message);
    process.exitCode = error.code === 'USAGE' ? 2 : 1;
  }
}
