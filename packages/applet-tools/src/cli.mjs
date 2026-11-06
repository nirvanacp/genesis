#!/usr/bin/env node
import { checkApplet } from './check.mjs';
import { buildApplet } from './build.mjs';
import { deviceStatus, installApplet } from './device.mjs';
import { manageService } from './services.mjs';
import { createApplet } from './create.mjs';
import { exportKit } from './kit.mjs';

class UsageError extends Error { constructor(message) { super(message); this.code = 'USAGE'; } }

const FLAGS = ['json', 'local'];
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
  build <directory> [--out <directory>]          default <directory>/dist
  dev install <directory> --device <serial>      applet directory or build output
  dev status [<applet-id>] --device <serial>
  service start|status|stop <directory> --local [--service-file <path>]
  service start|status|stop|provision <directory> --device <serial> [--service-file <path>]
  kit export --out <directory>
Every command accepts --json. Device commands accept --adb <path> (default
$ANDROID_HOME/platform-tools/adb, then adb on PATH) and --application <id>.`;

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
      const applet = await checkApplet(one(positional, 'applet directory'));
      return ['check', { appletId: applet.manifest.id }];
    }
    case 'build': {
      const { positional, options } = parse(args.slice(1), ['json', 'out']);
      return ['build', await buildApplet(one(positional, 'applet directory'), options.out)];
    }
    case 'dev': {
      const { positional, options } = parse(args.slice(2), ['json', ...DEVICE]);
      if (action === 'install') return ['dev install', await installApplet(one(positional, 'directory'), options)];
      if (action === 'status') {
        if (positional.length > 1) throw new UsageError('dev status takes at most one applet id');
        return ['dev status', deviceStatus(positional[0], options)];
      }
      throw new UsageError('Use dev install|status');
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
    console.log(json ? JSON.stringify({ ok: true, command, result }) : `${command} passed\n${JSON.stringify(result, null, 2)}`);
  } catch (error) {
    if (json) console.log(JSON.stringify({ ok: false, command: args[0], error: { code: error.code ?? 'FAILURE', message: error.message } }));
    else console.error(error.message);
    process.exitCode = error.code === 'USAGE' ? 2 : 1;
  }
}
