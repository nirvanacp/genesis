import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { Store, ApiError } from './store.mjs';
const token = process.env.HN_BACKEND_TOKEN;
if (!token || token.length < 32 || /[^\x21-\x7e]/.test(token)) throw new Error('Set HN_BACKEND_TOKEN to at least 32 printable ASCII characters');
const store = new Store(process.env.HN_BACKEND_DB ?? 'hn-bookmarks.sqlite3');
const equal = candidate => { const a = Buffer.from(candidate), b = Buffer.from(`Bearer ${token}`); return a.length === b.length && timingSafeEqual(a, b); };
const handler = async (request, response) => {
  response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
  const send = (status, value) => { response.writeHead(status); response.end(JSON.stringify(value)); };
  if (!equal(request.headers.authorization ?? '')) { send(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid backend token' } }); request.resume(); return; }
  if (request.method === 'GET' && request.url === '/health') { send(200, { ready: true }); return; }
  if (request.method !== 'POST' || request.url !== '/v1/documents') { send(404, { error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } }); request.resume(); return; }
  try {
    let size = 0; const chunks = [];
    for await (const chunk of request) { size += chunk.length; if (size > 262144) { send(413, { error: { code: 'QUOTA_EXCEEDED', message: 'Request exceeds 256 KiB' } }); return; } chunks.push(chunk); }
    let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError('INVALID_ARGUMENT', 'Invalid JSON'); }
    if (!input || typeof input !== 'object') throw new ApiError('INVALID_ARGUMENT', 'Expected an object');
    send(200, store.execute(input));
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'STORAGE_FAILURE';
    send(code === 'CONFLICT' ? 409 : code === 'INVALID_ARGUMENT' ? 400 : 500, { error: { code, message: error instanceof ApiError ? error.message : 'Backend operation failed; reread before retrying' } });
  }
};
const server = process.env.GENESIS_TLS_CERT && process.env.GENESIS_TLS_KEY
  ? httpsServer({ cert: readFileSync(process.env.GENESIS_TLS_CERT), key: readFileSync(process.env.GENESIS_TLS_KEY) }, handler)
  : httpServer(handler);
server.requestTimeout = 10000; server.headersTimeout = 10000;
server.listen(Number(process.env.HN_BACKEND_PORT ?? 8787), process.env.HN_BACKEND_HOST ?? '127.0.0.1', () => console.log('HN backend listening', server.address()));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
