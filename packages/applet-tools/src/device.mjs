import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readBundle } from './build.mjs';
import { requireValue } from './manifest.mjs';
export function creatorError(code, message) { return Object.assign(new Error(message), { code }); }
export class Device {
  constructor(options = {}) {
    if (!options.device || !/^[a-zA-Z0-9._:-]+$/.test(options.device)) throw creatorError('DEVICE_REQUIRED', 'Select an authorized device with --device <serial>');
    this.serial = options.device;
    this.application = options.application ?? process.env.GENESIS_APPLICATION_ID ?? 'app.nirvana.genesis';
    if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(this.application)) throw creatorError('INVALID_APPLICATION', 'Invalid host application ID');
    this.adb = options.adb ?? process.env.GENESIS_ADB ?? (process.platform === 'darwin' ? path.join(homedir(), 'Library/Android/sdk/platform-tools/adb') : 'adb');
  }
  run(args, input) {
    const result = spawnSync(this.adb, ['-s', this.serial, ...args], { input, encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024, shell: false });
    if (result.error || result.status !== 0) throw creatorError('DEVICE_UNAVAILABLE', `Android device command failed for ${this.serial}; check adb authorization, device selection, and connectivity`);
    return result.stdout.trim();
  }
  privateRead(name) { return this.run(['exec-out', 'run-as', this.application, 'cat', `files/${name}`]); }
  privateWrite(name, bytes) {
    // File names are internal constants; no creator input is evaluated as shell text.
    if (!['genesis-applet-import.json','genesis-service-import.json'].includes(name)) throw creatorError('INVALID_ARGUMENT', 'Unknown private import file');
    this.run(['shell', 'run-as', this.application, 'sh', '-c', `"umask 077; mkdir -p files; cat > files/${name}.pending && mv files/${name}.pending files/${name}"`], bytes);
  }
  clear(name) {
    if (!['genesis-applet-receipt.json','genesis-service-ready'].includes(name)) throw creatorError('INVALID_ARGUMENT', 'Unknown private receipt');
    this.run(['shell', 'run-as', this.application, 'rm', '-f', `files/${name}`]);
  }
  restart() {
    this.run(['shell', 'am', 'force-stop', this.application]);
    this.run(['shell', 'am', 'start', '-n', `${this.application}/app.nirvana.genesis.MainActivity`]);
  }
  status() {
    if (this.run(['get-state']) !== 'device') throw creatorError('DEVICE_UNAVAILABLE', 'Selected Android device is not connected and authorized');
    // Distinguish a missing/non-debuggable app from a host without the development API.
    try { this.run(['shell', 'run-as', this.application, 'id']); }
    catch { throw creatorError('HOST_NOT_DEBUGGABLE', 'The selected host must be installed and debuggable; release hosts do not accept development applets'); }
    let status;
    try { status = JSON.parse(this.privateRead('genesis-applet-status.json')); }
    catch { throw creatorError('UNSUPPORTED_HOST', 'Host development status is unavailable; launch a compatible debug Genesis build'); }
    if (status.debug !== true || status.runtimeApiVersion !== 3 || !status.bundleFormatVersions?.includes(1) || !Array.isArray(status.applets)) throw creatorError('INCOMPATIBLE_HOST', 'Host does not support bundle/runtime API 3');
    return status;
  }
  async submit(request) {
    request.requestId = randomUUID();
    const encoded = JSON.stringify(request);
    if (Buffer.byteLength(encoded) > 16 * 1024 * 1024) throw creatorError('QUOTA_EXCEEDED', 'Development import exceeds 16 MiB');
    this.clear('genesis-applet-receipt.json'); this.privateWrite('genesis-applet-import.json', encoded); this.restart();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      let receipt;
      try { receipt = JSON.parse(this.privateRead('genesis-applet-receipt.json')); } catch { /* An older/stale receipt cannot acknowledge this request. */ }
      if (receipt?.requestId === request.requestId) {
        if (!receipt.ok) throw creatorError(receipt.error?.code ?? 'PACKAGE_REJECTED', receipt.error?.message ?? 'Host rejected package');
        if (request.package && receipt.revision !== request.package.revision) throw creatorError('INVALID_RECEIPT', 'Host acknowledged an unexpected revision; read status before retrying');
        return receipt;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw creatorError('UNKNOWN_STATUS', `Host did not acknowledge request ${request.requestId}; read dev status before retrying. The operation may have completed`);
  }
}
function permissions(manifest) {
  return { origins: [...new Set(manifest.schemaVersion === 2 ? manifest.routeContracts.flatMap(c => c.origins) : manifest.sources.flatMap(s => s.origins))].sort(), capabilities: [...manifest.capabilities].sort(), services: [...(manifest.services ?? [])].sort() };
}
export async function installApplet(directory, options = {}) {
  const bundle = await readBundle(directory), device = new Device(options), status = device.status();
  const id = bundle.package.manifest.id, current = status.applets.find(p => p.id === id);
  const nextPermissions = permissions(bundle.package.manifest);
  const changed = current && current.revision !== bundle.package.revision;
  if (changed && !options.replace) throw creatorError('REPLACEMENT_REQUIRED', `Applet ${id} already exists; use --replace to update its code while retaining data`);
  const diff = current ? Object.fromEntries(Object.entries(nextPermissions).filter(([key, values]) => JSON.stringify([...current[key]].sort()) !== JSON.stringify(values)).map(([key, values]) => [key, { previous: current[key], next: values }])) : {};
  if (changed && Object.keys(diff).length) {
    process.stderr.write(`Declared permission changes: ${JSON.stringify(diff)}\n`);
    if (!options['allow-permission-change']) throw creatorError('PERMISSION_CHANGE', 'Review the declared permission diff, then use --allow-permission-change if intended');
  }
  const files = [];
  for (const asset of bundle.package.assets) files.push({ path: asset.path, base64: (await readFile(path.join(directory, 'assets', asset.path))).toString('base64') });
  return device.submit({ ...bundle, action: 'install', expectedCurrentRevision: current?.revision ?? null, intent: { replace: !!options.replace, allowPermissionChange: !!options['allow-permission-change'] }, files });
}
export async function rollbackApplet(id, options = {}) {
  requireValue(typeof id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(id), 'Invalid applet ID');
  const device = new Device(options), current = device.status().applets.find(p => p.id === id);
  if (!current?.previousRevision) throw creatorError('NO_PREVIOUS_REVISION', 'No previous applet code is available; records are unchanged');
  process.stderr.write('Rolling back code only; application records remain at their current state.\n');
  return device.submit({ action: 'rollback', appletId: id, expectedCurrentRevision: current.revision });
}

export async function setAppletVisibility(id, options = {}) {
  requireValue(/^[a-z][a-z0-9-]{0,63}$/.test(id), 'Invalid applet ID');
  requireValue(['true','false'].includes(options.hidden), '--hidden must be true or false');
  const device = new Device(options), status = device.status();
  if (!status.packageVisibility) throw creatorError('UNSUPPORTED_HOST', 'Upgrade the host for package visibility');
  const current = status.applets.find(p => p.id === id);
  if (!current) throw creatorError('UNKNOWN_APPLET', 'Applet is not installed');
  return device.submit({action:'visibility', appletId:id, hidden:options.hidden === 'true', expectedCurrentRevision:current.revision});
}
