import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readBuild } from './build.mjs';
import { toolError } from './manifest.mjs';

const IMPORTS = 'files/genesis-import';
const IMPORT_NAME = /^(applet-[a-z0-9-]+\.bundle|service-[a-z0-9-]+)\.json$/;
const RECEIPT_MS = 15000;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function defaultAdb() {
  const home = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  const bundled = home && path.join(home, 'platform-tools', 'adb');
  return bundled && existsSync(bundled) ? bundled : 'adb';
}

/** One debuggable Genesis install on one adb device. Every file goes through `run-as`. */
export class Device {
  constructor(options = {}) {
    if (!options.device || !/^[a-zA-Z0-9._:-]+$/.test(options.device)) throw toolError('DEVICE_REQUIRED', 'Select a device with --device <serial>');
    this.serial = options.device;
    this.application = options.application ?? process.env.GENESIS_APPLICATION_ID ?? 'app.nirvana.genesis';
    if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(this.application)) throw toolError('INVALID_APPLICATION', 'Invalid application id');
    this.adb = options.adb ?? process.env.GENESIS_ADB ?? defaultAdb();
  }

  run(args, input, timeout = 15000) {
    const result = spawnSync(this.adb, ['-s', this.serial, ...args], { input, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, shell: false });
    if (result.error || result.status !== 0) {
      throw toolError('DEVICE_UNAVAILABLE', `adb ${args[0]} failed on ${this.serial}: ${(result.stderr || result.error?.message || '').trim() || 'check that the device is connected and authorized'}`);
    }
    return result.stdout.trim();
  }

  /** Confirms the device is online and the app is installed and debuggable. */
  check() {
    if (this.run(['get-state']) !== 'device') throw toolError('DEVICE_UNAVAILABLE', `${this.serial} is not connected and authorized`);
    try { this.run(['shell', 'run-as', this.application, 'id']); }
    catch { throw toolError('HOST_NOT_DEBUGGABLE', `${this.application} must be installed as a debug build`); }
  }

  /** Reads a private file relative to the app's data directory, or returns null. `shell`, unlike `exec-out`, reports cat's exit status. */
  read(name) {
    try { return this.run(['shell', 'run-as', this.application, 'cat', name]); } catch { return null; }
  }

  /** Writes an import under a name the shell ignores, then renames it so the shell never sees a partial file. */
  writeImport(name, text) {
    if (!IMPORT_NAME.test(name)) throw toolError('INVALID_ARGUMENT', `Not an import file name: ${name}`);
    const file = `${IMPORTS}/${name}`;
    this.run(['shell', 'run-as', this.application, 'sh', '-c', `"umask 077; mkdir -p ${IMPORTS}; cat > ${file}.pending && mv ${file}.pending ${file}"`], text, 120000);
  }

  removeReceipt(name) {
    this.run(['shell', 'run-as', this.application, 'rm', '-f', `${IMPORTS}/${receiptName(name)}`]);
  }

  /** Brings the activity forward. It is `singleTask`, so a running app pauses, resumes and scans. */
  scan() {
    this.run(['shell', 'am', 'start', '-n', `${this.application}/app.nirvana.genesis.MainActivity`]);
  }

  async waitForReceipt(name) {
    const deadline = Date.now() + RECEIPT_MS;
    while (Date.now() < deadline) {
      const text = this.read(`${IMPORTS}/${receiptName(name)}`);
      if (text) {
        try { return JSON.parse(text); } catch { /* Still being written. */ }
      }
      await delay(250);
    }
    throw toolError('UNKNOWN_STATUS', `No receipt for ${name} after ${RECEIPT_MS / 1000} s. Open Genesis on the device, then run dev status`);
  }

  /** Writes one import, triggers a scan and returns its receipt. */
  async submit(name, text) {
    this.check();
    this.removeReceipt(name);
    this.writeImport(name, text);
    this.scan();
    return this.waitForReceipt(name);
  }
}

export const receiptName = name => name.replace(/\.json$/, '.receipt.json');

/** Accepts an applet directory (uses its `dist/`) or a build output directory. */
async function findBuild(directory) {
  const dist = path.join(directory, 'dist');
  const isBuild = await stat(path.join(directory, 'bundle.json')).then(() => true, () => false);
  return readBuild(isBuild ? directory : dist);
}

export async function installApplet(directory, options = {}) {
  const { appletId, importFile } = await findBuild(directory);
  const device = new Device(options);
  const name = path.basename(importFile);
  const receipt = await device.submit(name, await readFile(importFile, 'utf8'));
  if (!receipt.ok) throw toolError('PACKAGE_REJECTED', `Genesis rejected ${appletId}: ${receipt.error ?? 'no reason given'}`);
  return { appletId, revision: receipt.revision };
}

/** Lists installed applets and, for `appletId`, the last import receipt. */
export function deviceStatus(appletId, options = {}) {
  const device = new Device(options);
  device.check();
  let installed = [];
  try { installed = JSON.parse(device.read('files/applets/index.json') ?? '[]'); } catch { /* No index yet. */ }
  const result = { device: device.serial, installed };
  if (appletId !== undefined) {
    if (!/^[a-z0-9-]+$/.test(appletId)) throw toolError('USAGE', 'Applet ids match [a-z0-9-]+');
    const text = device.read(`${IMPORTS}/${receiptName(`applet-${appletId}.bundle.json`)}`);
    result.receipt = text ? JSON.parse(text) : null;
  }
  return result;
}
