import { readFile, writeFile, mkdir, realpath, chmod, unlink, open } from 'node:fs/promises';
import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import https from 'node:https';

// Creator-only tool. Credentials move over stdin into a private, one-time Android file.
const [action, directory, serial] = process.argv.slice(2);
if (!['start', 'status', 'stop', 'provision'].includes(action) || !directory || !serial) throw new Error('Usage: node tools/services.mjs start|status|stop|provision <applet-directory> <adb-device>');
if (process.versions.node !== '24.15.0') throw new Error('Use the pinned Node 24.15.0 runtime');
const base = await realpath(directory), manifest = JSON.parse(await readFile(path.join(base, 'applet.json')));
const declaration = JSON.parse(await readFile(path.join(base, 'backend/service.json')));
const identifier = /^[a-z][a-z0-9-]{0,63}$/;
if (!identifier.test(manifest.id) || !identifier.test(declaration.serviceId) || !manifest.services.includes(declaration.serviceId)) throw new Error('Undeclared service');
const entry = await realpath(path.resolve(base, declaration.entry));
if (!entry.startsWith(base + path.sep)) throw new Error('Service entry escapes applet');
async function provision(origin, token, certificate = '') {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('Use an exact HTTPS origin');
  if (token.length < 32 || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw new Error('Invalid service token');
  const envelope = { version: 1, appletId: manifest.id, serviceId: declaration.serviceId, origin, token, certificate, healthPath: declaration.healthPath };
  device(['shell', 'run-as', application, 'rm', '-f', 'files/genesis-service-ready']);
  run(adb, ['-s', serial, 'shell', 'run-as', application, 'sh', '-c', '"umask 077; mkdir -p files; cat > files/genesis-service-import.json"'], JSON.stringify(envelope));
  device(['shell', 'am', 'force-stop', application]);
  device(['shell', 'am', 'start', '-n', `${application}/.MainActivity`]);
  let imported = false;
  for (let i = 0; i < 30; i++) { try { if (device(['shell', 'run-as', application, 'cat', 'files/genesis-service-ready']) === 'ready') { imported = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 200)); }
  if (!imported) throw new Error('Android did not acknowledge the private import');
}
const state = path.join(homedir(), '.local/share/genesis/services', manifest.id, declaration.serviceId);
await mkdir(state, { recursive: true, mode: 0o700 }); await chmod(state, 0o700);
const adb = process.env.GENESIS_ADB ?? path.join(homedir(), 'Library/Android/sdk/platform-tools/adb');
function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status ?? 'unavailable'})`);
  return result.stdout.trim();
}
const device = args => run(adb, ['-s', serial, ...args]);
const port = declaration.port;
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^\/[a-z0-9/-]+$/.test(declaration.healthPath)) throw new Error('Invalid service port/health path');
const tokenFile = path.join(state, 'token'), certFile = path.join(state, 'certificate.pem'), keyFile = path.join(state, 'key.pem'), pidFile = path.join(state, 'process.json');
let managed; try { managed = JSON.parse(await readFile(pidFile)); } catch {}
const alive = () => { try { process.kill(managed.pid, 0); return true; } catch { return false; } };
if (action === 'status') { console.log(managed && alive() ? 'Managed backend process is running; use start to check health and restore the tunnel.' : 'Managed backend is stopped.'); process.exit(0); }
if (action === 'stop') {
  if (managed && alive()) {
    const command = run('ps', ['-p', String(managed.pid), '-o', 'command=']);
    if (!command.includes(entry) || !command.includes(process.execPath)) throw new Error('PID does not identify the managed service; refusing to stop it');
    process.kill(managed.pid, 'SIGTERM');
  }
  await unlink(pidFile).catch(() => {}); console.log('Managed backend stopped; data and credentials preserved.'); process.exit(0);
}
const application = 'app.nirvana.genesis';
if (action === 'provision' && process.env.GENESIS_SERVICE_ORIGIN) {
  if (!process.env.GENESIS_SERVICE_TOKEN_FILE) throw new Error('Set GENESIS_SERVICE_TOKEN_FILE to a private credential file');
  const token = (await readFile(process.env.GENESIS_SERVICE_TOKEN_FILE, 'utf8')).trim();
  await provision(process.env.GENESIS_SERVICE_ORIGIN, token);
  console.log('HTTPS service connection provisioned. Verify reachability in the app.'); process.exit(0);
}
let token; try { token = await readFile(tokenFile, 'utf8'); } catch { token = randomBytes(32).toString('hex'); await writeFile(tokenFile, token, { mode: 0o600, flag: 'wx' }); }
try { await readFile(certFile); } catch {
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365', '-keyout', keyFile, '-out', certFile, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1']);
  await chmod(keyFile, 0o600); await chmod(certFile, 0o600);
}
const certificate = await readFile(certFile, 'utf8');
const health = () => new Promise((resolve, reject) => {
  const request = https.get({ hostname: 'localhost', port, path: declaration.healthPath, ca: certificate, headers: { Authorization: `Bearer ${token}` }, timeout: 3000 }, response => {
    let data = ''; response.on('data', chunk => { data += chunk; }); response.on('end', () => { try { response.statusCode === 200 && JSON.parse(data).ready === true ? resolve() : reject(new Error('Backend health rejected')); } catch { reject(new Error('Invalid health response')); } });
  }); request.on('error', reject); request.on('timeout', () => request.destroy(new Error('Health timeout')));
});
if (action === 'start' && !(managed && alive())) {
  const net = await import('node:net');
  await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', () => reject(new Error('Port occupied by an unmanaged process'))); probe.listen(port, '127.0.0.1', () => probe.close(resolve)); });
  const env = { ...process.env };
  for (const [key, value] of Object.entries({ token, database: path.join(state, 'documents.sqlite3'), port: String(port), certificate: certFile, key: keyFile })) {
    const name = declaration.environment[key]; if (!/^[A-Z][A-Z0-9_]+$/.test(name)) throw new Error('Invalid environment declaration'); env[name] = value;
  }
  const log = await open(path.join(state, 'server.log'), 'a', 0o600);
  const child = spawn(process.execPath, [entry], { cwd: state, env, detached: true, stdio: ['ignore', log.fd, log.fd] }); child.unref(); await log.close();
  await writeFile(pidFile, JSON.stringify({ pid: child.pid }), { mode: 0o600 });
}
let healthy = false;
for (let attempt = 0; attempt < 30; attempt++) { try { await health(); healthy = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 200)); } }
if (!healthy) throw new Error('Backend did not become healthy; inspect the private server log.');
device(['reverse', `tcp:${port}`, `tcp:${port}`]);
await provision(`https://localhost:${port}`, token, certificate);
console.log('Local HTTPS backend healthy; device connection provisioned. Verify Save in the app.');
