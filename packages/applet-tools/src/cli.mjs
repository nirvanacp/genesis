#!/usr/bin/env node
import { checkApplet } from './check.mjs';
import { buildApplet } from './build.mjs';
export class UsageError extends Error { constructor(message) { super(message); this.code = 'USAGE'; } }
function argumentsFor(args) {
  const positional = [], options = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { positional.push(args[i]); continue; }
    const name = args[i].slice(2);
    if (Object.hasOwn(options, name)) throw new UsageError(`Duplicate option --${name}`);
    if (['json','replace','allow-permission-change','react'].includes(name)) options[name] = true;
    else { if (!args[i+1] || args[i+1].startsWith('--')) throw new UsageError(`Missing --${name} value`); options[name] = args[++i]; }
  }
  return { positional, options };
}
const args = process.argv.slice(2), json = args.includes('--json');
let command = args[0] ?? 'help';
try {
  if (command === 'help' || args.includes('--help')) {
    console.log('Genesis applet tools\n  check <directory> [--json]\n  build <directory> --out <directory> [--json]');
  } else {
    const { positional, options } = argumentsFor(args.slice(1));
    if (Object.keys(options).some(k => !['json','out'].includes(k))) throw new UsageError('Unknown option');
    if (positional.length !== 1) throw new UsageError('Expected one applet directory');
    let result;
    if (command === 'check') { if (options.out) throw new UsageError('check does not accept --out'); const a = await checkApplet(positional[0]); result = { appletId: a.manifest.id }; }
    else if (command === 'build') { if (!options.out) throw new UsageError('build requires --out'); const bundle = await buildApplet(positional[0], options.out); result = { appletId: bundle.package.manifest.id, revision: bundle.package.revision, output: options.out }; }
    else throw new UsageError(`Unknown command ${command}`);
    console.log(json ? JSON.stringify({ ok: true, command, result }) : `${command} passed: ${result.appletId}`);
  }
} catch (error) {
  const response = { ok: false, command, error: { code: error.code ?? 'FAILURE', message: error.message } };
  if (json) console.log(JSON.stringify(response));
  else console.error(error.message);
  process.exitCode = error instanceof UsageError ? 2 : 1;
}
