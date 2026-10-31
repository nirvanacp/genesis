#!/usr/bin/env node
import { checkApplet } from './check.mjs';
import { buildApplet } from './build.mjs';
import { Device, installApplet, rollbackApplet, setAppletVisibility } from './device.mjs';
import { manageService } from './services.mjs';
import { createApplet } from './create.mjs';
import { exportKit } from './kit.mjs';
export class UsageError extends Error { constructor(message) { super(message); this.code = 'USAGE'; } }
function parse(args, permitted) {
  const positional = [], options = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { positional.push(args[i]); continue; }
    const name = args[i].slice(2);
    if (!permitted.includes(name) || Object.hasOwn(options, name)) throw new UsageError(`Unknown or duplicate option --${name}`);
    if (['json','replace','allow-permission-change','react','local'].includes(name)) options[name] = true;
    else { if (!args[i+1] || args[i+1].startsWith('--')) throw new UsageError(`Missing --${name} value`); options[name] = args[++i]; }
  }
  return { positional, options };
}
const args = process.argv.slice(2), json = args.includes('--json');
let command = args[0] ?? 'help';
const help = `Genesis applet tools
  create <directory> --id <id> --name <name> --source <https-url> [--react] [--json]
  kit export --out <directory> [--json]
  check <directory> [--json]
  build <directory> --out <directory> [--json]
  dev install <bundle-directory> --device <serial> [--replace] [--allow-permission-change] [--json]
  dev status --device <serial> [--json]
  dev visibility <applet-id> --hidden true|false --device <serial> [--json]
  dev rollback <applet-id> --device <serial> [--json]
  service start|status|stop <directory> --local [--service-file <relative-json>] [--json]
  service start|status|stop|provision <directory> --device <serial> [--service-file <relative-json>] [--json]
Device commands also accept --application <host-id> and --adb <executable>.`;
try {
  if (command === 'help' || args.includes('--help')) console.log(json ? JSON.stringify({ ok: true, command: 'help', result: { help } }) : help);
  else {
    let result;
    if (command === 'create') {
      const { positional: p, options: o } = parse(args.slice(1), ['json','id','name','source','react']);
      if (p.length !== 1) throw new UsageError('Expected one target directory'); result = await createApplet(p[0], o);
    } else if (command === 'kit') {
      command = 'kit export';
      const { positional: p, options: o } = parse(args.slice(2), ['json','out']);
      if (args[1] !== 'export' || p.length || !o.out) throw new UsageError('Use kit export --out <directory>'); result = await exportKit(o.out);
    } else if (command === 'check' || command === 'build') {
      const { positional: p, options: o } = parse(args.slice(1), command === 'build' ? ['json','out'] : ['json']);
      if (p.length !== 1) throw new UsageError('Expected one applet directory');
      if (command === 'check') { const a = await checkApplet(p[0]); result = { appletId: a.manifest.id }; }
      else { if (!o.out) throw new UsageError('build requires --out'); const b = await buildApplet(p[0], o.out); result = { appletId: b.package.manifest.id, revision: b.package.revision, output: o.out }; }
    } else if (command === 'dev' || command === 'service') {
      const action = args[1]; command += ` ${action ?? ''}`;
      const { positional: p, options: o } = parse(args.slice(2), ['json','device','application','adb', ...(args[0] === 'service' ? ['local','service-file'] : []), ...(action === 'visibility' ? ['hidden'] : []), ...(args[0] === 'dev' && action === 'install' ? ['replace','allow-permission-change'] : [])]);
      if (o.local && o.device) throw new UsageError('Choose --local or --device, not both');
      if (!o.device && !o.local) throw new UsageError('Select --device <serial> or use service --local');
      if (args[0] === 'dev') {
        if (action === 'status') { if (p.length) throw new UsageError('dev status accepts no directory'); result = new Device(o).status(); }
        else { if (p.length !== 1) throw new UsageError('Expected one bundle directory or applet ID'); if (action === 'install') result = await installApplet(p[0], o); else if (action === 'visibility') result = await setAppletVisibility(p[0], o); else if (action === 'rollback') result = await rollbackApplet(p[0], o); else throw new UsageError('Unknown dev action'); }
      } else { if (p.length !== 1 || !['start','status','stop','provision'].includes(action)) throw new UsageError('Expected service start|status|stop|provision <directory>'); result = await manageService(action, p[0], o); }
    } else throw new UsageError(`Unknown command ${command}`);
    console.log(json ? JSON.stringify({ ok: true, command, result }) : `${command} passed\n${JSON.stringify(result, null, 2)}`);
  }
} catch (error) {
  const response = { ok: false, command, error: { code: error.code ?? 'FAILURE', message: error.message } };
  if (json) console.log(JSON.stringify(response)); else console.error(error.message);
  process.exitCode = error instanceof UsageError || error.code === 'USAGE' ? 2 : 1;
}
