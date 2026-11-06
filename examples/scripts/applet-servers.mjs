import { access, readdir, readFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { manageService, readApplet } from '@genesis/applet-tools';

const appletsRoot = fileURLToPath(new URL('../', import.meta.url));
const help = `Usage: ./examples/start-applet-servers.sh [--device <serial>] [--check | --stop]
       ./examples/<applet>/start.sh [--device <serial>] [--check | --stop]

Without --device, start and health-check local backends only.
With --device, also restore adb tunnels and provision Genesis service connections.
--check validates declarations and port reservations without starting anything.
--stop stops managed Node backends and preserves their data.
Node 24+, installed workspace dependencies and OpenSSL are required to start.
X_EXPECTED_HANDLE is required only when creating X's database for the first time.`;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function inventory() {
  const registry = JSON.parse(await readFile(path.join(appletsRoot, 'ports.json'), 'utf8'));
  requireValue(registry.version === 1 && registry.applets && typeof registry.applets === 'object' && !Array.isArray(registry.applets), 'Invalid examples/ports.json');
  const applets = new Map(), ports = new Map(), ids = new Set();
  for (const dirent of await readdir(appletsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const directory = path.join(appletsRoot, dirent.name);
    try { await access(path.join(directory, 'applet.json')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const { manifest, service: defaultService } = await readApplet(directory);
    requireValue(!ids.has(manifest.id), `Duplicate applet identity: ${manifest.id}`);
    ids.add(manifest.id);
    const reservations = registry.applets[dirent.name];
    requireValue(Array.isArray(reservations), `Add ${dirent.name} to examples/ports.json, using [] if it has no servers`);
    await access(path.join(directory, 'start.sh'), constants.X_OK);
    const names = new Set(), declarations = new Set();
    for (const reservation of reservations) {
      const { name, port, serviceFile } = reservation;
      requireValue(typeof name === 'string' && /^[a-z][a-z0-9-]*$/.test(name) && !names.has(name), `Invalid or duplicate server name in ${dirent.name}`);
      names.add(name);
      requireValue(Number.isInteger(port) && port >= 8787 && port <= 8999, `${dirent.name}/${name}: reserve a port in 8787–8999`);
      requireValue(!ports.has(port), `Port ${port} is reserved more than once: ${ports.get(port)} and ${dirent.name}/${name}`);
      ports.set(port, `${dirent.name}/${name}`);
      if (serviceFile !== undefined) {
        requireValue(typeof serviceFile === 'string' && !declarations.has(serviceFile), `Invalid or duplicate serviceFile in ${dirent.name}`);
        const { service } = await readApplet(directory, { serviceFile });
        requireValue(service && service.serviceId === name && service.port === port, `${dirent.name}/${name}: service declaration must match its reserved name and port ${port}`);
        declarations.add(serviceFile);
      }
    }
    requireValue(!defaultService || declarations.has('backend/service.json'), `${dirent.name}: register backend/service.json in examples/ports.json`);
    let backendFiles = [];
    try { backendFiles = await readdir(path.join(directory, 'backend')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const file of backendFiles.filter(name => /^service(?:\.[a-z0-9-]+)?\.json$/.test(name))) {
      requireValue(declarations.has(`backend/${file}`), `${dirent.name}: register backend/${file} in examples/ports.json`);
    }
    applets.set(dirent.name, { directory, reservations });
  }
  for (const name of Object.keys(registry.applets)) requireValue(applets.has(name), `Port registry references missing applet: ${name}`);
  return applets;
}

async function main() {
  const [scope, ...args] = process.argv.slice(2);
  const directory = scope === 'applet' ? args.shift() : null;
  let device, check = false, stop = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') { console.log(help); return; }
    if (args[i] === '--check' && !check) check = true;
    else if (args[i] === '--stop' && !stop) stop = true;
    else if (args[i] === '--device' && !device && !args[i + 1]?.startsWith('--') && /^[a-zA-Z0-9._:-]+$/.test(args[i + 1] ?? '')) device = args[++i];
    else throw new Error(`Unknown, duplicate or incomplete option: ${args[i]}\n${help}`);
  }
  requireValue(scope === 'all' || scope === 'applet' && directory, help);
  requireValue(!(check && stop), 'Choose --check or --stop');
  requireValue(Number(process.versions.node.split('.')[0]) >= 24, 'Use Node 24 or later for built-in SQLite');
  const applets = await inventory();
  let selected = [...applets.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (directory) {
    const resolved = await realpath(directory);
    selected = selected.filter(([, applet]) => applet.directory === resolved);
    requireValue(selected.length === 1, 'Applet directory is not registered under examples');
  }
  if (check) {
    for (const [name, { reservations }] of selected) console.log(`${name}: ${reservations.map(r => `${r.name}=${r.port}`).join(', ') || 'no backend required'}`);
    console.log('Port registry, service declarations and executable start.sh scripts are valid. No servers started.');
    return;
  }
  let failures = 0;
  if (scope === 'all') {
    for (const [name, applet] of selected) {
      console.log(`\n${name}`);
      const result = spawnSync(path.join(applet.directory, 'start.sh'), args, { stdio: 'inherit', shell: false });
      if (result.error || result.status !== 0) { console.error(`${name}: failed${result.error ? `: ${result.error.message}` : ''}`); failures++; }
    }
  } else {
    const [name, applet] = selected[0];
    if (!applet.reservations.length) console.log(`${name}: no backend required`);
    for (const reservation of stop ? [...applet.reservations].reverse() : applet.reservations) {
      if (!reservation.serviceFile) {
        console.log(`${name}/${reservation.name}: port ${reservation.port}; lifecycle owned by this applet's start.sh`);
        continue;
      }
      try {
        const result = await manageService(stop ? 'stop' : 'start', applet.directory, {
          local: !device || stop, device, 'service-file': reservation.serviceFile,
        });
        console.log(`${name}/${reservation.name}: ${stop ? 'stopped; data preserved' : `ready on https://localhost:${reservation.port}${device ? `; connected to ${device}` : '; device connection unchanged'}`}`);
        requireValue(stop || result.ready, 'Service did not report readiness');
      } catch (error) {
        console.error(`${name}/${reservation.name}: ${error.message}`);
        failures++;
        if (!stop) break;
      }
    }
  }
  requireValue(!failures, `${failures} applet/server startup or shutdown failure(s). ${stop ? 'Other managed services were stopped; data preserved.' : 'Successful services remain running.'} Inspect private server.log files under ~/.local/share/genesis/services/<applet-id>/<service-id>/.`);
  if (scope === 'all' && !stop && !device) console.log('\nLocal backends are ready. To restore Android tunnels/connections, rerun with --device <adb-serial>.');
}

try { await main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
