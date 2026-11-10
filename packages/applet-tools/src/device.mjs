import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readBuild } from './build.mjs';
import { toolError } from './manifest.mjs';

const IMPORTS = 'files/genesis-import';
const IMPORT_NAME = /^(applet-[a-z0-9-]+\.bundle|service-[a-z0-9-]+|cookies-[a-z0-9-]+)\.json$/;
const RECEIPT_MS = 15000;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** adb from the SDK named by the environment, then the default SDK folders, then `adb` on PATH. */
function defaultAdb() {
  const sdks = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ];
  const found = sdks.filter(Boolean).map(sdk => path.join(sdk, 'platform-tools', 'adb')).find(adb => existsSync(adb));
  return found ?? 'adb';
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
    if (result.error?.code === 'ENOENT') throw toolError('ADB_NOT_FOUND', 'adb was not found. Set ANDROID_HOME to the Android SDK folder or pass --adb <path>.');
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

  /** Starts the activity. It is `singleTask`: a running app scans from `onNewIntent`, a background one also on resume. */
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
  const isBuild = await stat(path.join(directory, 'revision', 'bundle.json')).then(() => true, () => false);
  return readBuild(isBuild ? directory : dist);
}

const describeMismatches = mismatches => (mismatches ?? []).map(m => `  ${m.field} ${m.applet} → ${m.host}`).join('\n');

/**
 * Sends the build to the device and reports the receipt's status. A bundle the device's Genesis
 * classifies as incompatible is listed there but cannot launch, so that fails here too.
 */
export async function installApplet(directory, options = {}) {
  const { appletId, importFile } = await findBuild(directory);
  const device = new Device(options);
  const name = path.basename(importFile);
  const receipt = await device.submit(name, await readFile(importFile, 'utf8'));
  if (!receipt.ok) throw toolError('PACKAGE_REJECTED', `Genesis rejected ${appletId}: ${receipt.code ? `${receipt.code} ` : ''}${receipt.error ?? 'no reason given'}`);
  if (receipt.status === 'incompatible') {
    const needs = receipt.direction === 'newer' ? 'needs a newer Genesis' : 'needs an update';
    throw toolError('APPLET_INCOMPATIBLE', `Genesis on ${device.serial} lists ${appletId} as incompatible (${receipt.direction}): it ${needs} (applet → device):\n${describeMismatches(receipt.mismatches)}`);
  }
  return { appletId, status: receipt.status ?? 'current', revision: receipt.revision };
}

/** One index entry as `dev status` reports it. Entries from before statuses existed are current. */
function installedEntry(entry) {
  const status = entry.status ?? 'current';
  const result = { appletId: entry.appletId, name: entry.name ?? '', revision: entry.revision ?? null, status };
  if (status !== 'current') Object.assign(result, { direction: entry.direction ?? null, mismatches: entry.mismatches ?? [] });
  return result;
}

/** Lists installed applets with their status, direction and mismatches and, for `appletId`, the last import receipt. */
export function deviceStatus(appletId, options = {}) {
  const device = new Device(options);
  device.check();
  let index = [];
  try { index = JSON.parse(device.read('files/applets/index.json') ?? '[]'); } catch { /* No index yet. */ }
  const installed = (Array.isArray(index) ? index : []).filter(entry => typeof entry?.appletId === 'string').map(installedEntry);
  const result = { device: device.serial, installed };
  if (appletId !== undefined) {
    if (!/^[a-z0-9-]+$/.test(appletId)) throw toolError('USAGE', 'Applet ids match [a-z0-9-]+');
    const text = device.read(`${IMPORTS}/${receiptName(`applet-${appletId}.bundle.json`)}`);
    result.receipt = text ? JSON.parse(text) : null;
  }
  return result;
}
