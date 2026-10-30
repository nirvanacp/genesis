import { readFile, writeFile, mkdir, chmod, unlink, open } from 'node:fs/promises';
import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import https from 'node:https';
import net from 'node:net';
import { readApplet, containedFile } from './manifest.mjs';
import { Device, creatorError } from './device.mjs';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 15000, shell: false });
  if (result.error || result.status !== 0) throw creatorError('SERVICE_PROCESS', `${path.basename(command)} failed; check the local service prerequisites`);
  return result.stdout.trim();
}
export async function manageService(action, directory, options = {}) {
  if (!['start','status','stop','provision'].includes(action)) throw creatorError('USAGE', 'Unknown service action');
  const { base, manifest, service } = await readApplet(directory);
  if (!service) throw creatorError('SERVICE_DECLARATION_REQUIRED', 'This applet needs backend/service.json for local service tooling');
  const entry = await containedFile(base, service.entry);
  const device = new Device(options);
  const state = path.join(process.env.GENESIS_SERVICE_STATE_ROOT ?? path.join(homedir(), '.local/share/genesis/services'), manifest.id, service.serviceId);
  const pidFile = path.join(state, 'process.json');
  let managed;
  try { managed = JSON.parse(await readFile(pidFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw creatorError('SERVICE_STATE_INVALID', 'Invalid managed service process metadata'); }
  const alive = () => { if (!Number.isInteger(managed?.pid) || managed.pid < 1) return false; try { process.kill(managed.pid, 0); return true; } catch { return false; } };
  const result = extra => ({ appletId: manifest.id, serviceId: service.serviceId, ...extra });
  if (action === 'status') return result({ running: alive(), healthChecked: false });
  if (action === 'stop') {
    if (alive()) {
      const command = run('ps', ['-p', String(managed.pid), '-o', 'command=']);
      if (!command.includes(entry) || !command.includes(process.execPath)) throw creatorError('PROCESS_IDENTITY_MISMATCH', 'Recorded process does not match this backend; refusing to stop it');
      process.kill(managed.pid, 'SIGTERM');
      for (let i = 0; i < 30 && alive(); i++) await delay(100);
      if (alive()) throw creatorError('SERVICE_STOP_TIMEOUT', 'Managed backend has not stopped; data preserved');
    }
    await unlink(pidFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
    return result({ running: false, dataPreserved: true });
  }
  const host = device.status().applets.find(p => p.id === manifest.id);
  if (!host?.services.includes(service.serviceId)) throw creatorError('UNDECLARED_SERVICE', 'Install this applet and declare its service before provisioning');
  async function provision(origin, token, certificate = '') {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw creatorError('INVALID_SERVICE_ORIGIN', 'Use an exact HTTPS origin without path or credentials');
    if (token.length < 32 || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw creatorError('INVALID_CREDENTIAL', 'Service token must be 32–4096 printable ASCII characters');
    device.clear('genesis-service-ready');
    device.privateWrite('genesis-service-import.json', JSON.stringify({ version: 1, appletId: manifest.id, serviceId: service.serviceId, origin, token, certificate, healthPath: service.healthPath }));
    device.restart();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      let ready;
      try { ready = device.privateRead('genesis-service-ready'); } catch { /* Device is starting. */ }
      if (ready === 'ready') return;
      if (ready === 'unavailable') throw creatorError('SERVICE_HEALTH_FAILED', 'Device could not authenticate or reach the configured HTTPS service; inspect server health and credentials');
      await delay(200);
    }
    throw creatorError('UNKNOWN_STATUS', 'Device did not acknowledge service health; settings may be imported. Check service status before retrying');
  }
  if (action === 'provision' && process.env.GENESIS_SERVICE_ORIGIN) {
    if (!process.env.GENESIS_SERVICE_TOKEN_FILE) throw creatorError('CREDENTIAL_REQUIRED', 'Set GENESIS_SERVICE_TOKEN_FILE to a private token file');
    const token = (await readFile(process.env.GENESIS_SERVICE_TOKEN_FILE, 'utf8')).trim();
    await provision(process.env.GENESIS_SERVICE_ORIGIN, token);
    return result({ ready: true, kind: 'remote' });
  }
  await mkdir(state, { recursive: true, mode: 0o700 }); await chmod(state, 0o700);
  const tokenFile = path.join(state, 'token'), certFile = path.join(state, 'certificate.pem'), keyFile = path.join(state, 'key.pem');
  let token;
  try { token = await readFile(tokenFile, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; token = randomBytes(32).toString('hex'); await writeFile(tokenFile, token, { mode: 0o600, flag: 'wx' }); }
  try { await readFile(certFile); await readFile(keyFile); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    run('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-days','365','-keyout',keyFile,'-out',certFile,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1']);
    await chmod(keyFile, 0o600); await chmod(certFile, 0o600);
  }
  const certificate = await readFile(certFile, 'utf8');
  const health = () => new Promise((resolve, reject) => {
    const request = https.get({ hostname: 'localhost', port: service.port, path: service.healthPath, ca: certificate, headers: { Authorization: `Bearer ${token}` }, timeout: 3000 }, response => {
      let size = 0, data = '';
      response.on('data', chunk => { size += chunk.length; if (size > 32768) response.destroy(new Error('Health response too large')); else data += chunk; });
      response.on('error', reject);
      response.on('end', () => { try { response.statusCode === 200 && JSON.parse(data).ready === true ? resolve() : reject(new Error('Health rejected')); } catch { reject(new Error('Invalid health JSON')); } });
    });
    request.on('error', reject); request.on('timeout', () => request.destroy(new Error('Health timeout')));
  });
  if (action === 'start' && !alive()) {
    await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', () => reject(creatorError('PORT_OCCUPIED', 'Service port belongs to another process'))); probe.listen(service.port, '127.0.0.1', () => probe.close(resolve)); });
    process.stderr.write(`Starting declared Node backend: ${entry}\n`);
    const env = { ...process.env };
    for (const [key, value] of Object.entries({ token, database: path.join(state, 'documents.sqlite3'), port: String(service.port), certificate: certFile, key: keyFile })) env[service.environment[key]] = value;
    const log = await open(path.join(state, 'server.log'), 'a', 0o600);
    const child = spawn(process.execPath, [entry], { cwd: state, env, detached: true, stdio: ['ignore', log.fd, log.fd] });
    try { await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); }
    finally { await log.close(); }
    child.unref(); managed = { pid: child.pid, entry };
    await writeFile(pidFile, JSON.stringify(managed), { mode: 0o600 });
  }
  if (alive()) {
    const command = run('ps', ['-p', String(managed.pid), '-o', 'command=']);
    if (!command.includes(entry) || !command.includes(process.execPath)) throw creatorError('PROCESS_IDENTITY_MISMATCH', 'Recorded service belongs to a different source path; stop the original managed process before restarting from this checkout');
  }
  let healthy = false;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { try { await health(); healthy = true; break; } catch { await delay(200); } }
  if (!healthy) throw creatorError('SERVICE_HEALTH_FAILED', 'Backend did not become healthy; inspect its private server log');
  device.run(['reverse', `tcp:${service.port}`, `tcp:${service.port}`]);
  await provision(`https://localhost:${service.port}`, token, certificate);
  return result({ ready: true, running: alive(), kind: 'local' });
}
