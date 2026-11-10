import { readApplet, toolError } from './manifest.mjs';
import { Device } from './device.mjs';

const REPLY_MS = 10000;

const WARNINGS = [
  'Websites can treat imported cookies as a new sign-in and email the account about it.',
  'Google sign-ins do not transfer: Google binds its session cookies to the browser that created them.',
];

/** The Chrome DevTools endpoint of a browser started with --remote-debugging-port. */
async function browserSocket(port) {
  let response;
  try { response = await fetch(`http://127.0.0.1:${port}/json/version`); }
  catch {
    throw toolError('BROWSER_UNAVAILABLE', [
      `No browser is listening for DevTools on port ${port}. Start Chrome with a separate profile, sign in there, then run this again:`,
      `  chrome --user-data-dir=<directory> --remote-debugging-port=${port}`,
      'Chrome 136 and later refuses remote debugging on the default profile.',
    ].join('\n'));
  }
  const version = await response.json();
  if (typeof version.webSocketDebuggerUrl !== 'string') throw toolError('BROWSER_UNAVAILABLE', `Port ${port} did not describe a DevTools browser endpoint`);
  return version.webSocketDebuggerUrl;
}

/** Every cookie of the browser's default context, through one `Storage.getCookies` call. */
function readCookies(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => { socket.close(); reject(toolError('BROWSER_TIMEOUT', `The browser did not return its cookies within ${REPLY_MS / 1000} s`)); }, REPLY_MS);
    const finish = (error, cookies) => { clearTimeout(timer); socket.close(); error ? reject(error) : resolve(cookies); };
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Storage.getCookies' })));
    socket.addEventListener('error', () => finish(toolError('BROWSER_UNAVAILABLE', 'The DevTools connection failed')));
    socket.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.id !== 1) return;
      if (message.error) finish(toolError('BROWSER_FAILED', `Storage.getCookies failed: ${message.error.message}`));
      else finish(null, message.result?.cookies ?? []);
    });
  });
}

/** A cookie belongs to a declared host when its domain is that host or a parent of it. */
const matches = (hosts, domain) => hosts.some(host => host === domain || host.endsWith(`.${domain}`));

/**
 * Copies the cookies of the applet's websites from a desktop Chrome into a debug Genesis on the
 * device. Returns counts per domain; names and values never leave the payload.
 */
export async function importCookies(directory, options = {}) {
  const { manifest } = await readApplet(directory);
  const hosts = manifest.origins.map(origin => new URL(origin).hostname);
  const port = Number(options.port ?? 9222);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw toolError('INVALID_ARGUMENT', 'Pass --port <1-65535>');
  const device = new Device(options);
  const now = Date.now() / 1000;
  const declared = (await readCookies(await browserSocket(port)))
    .map(cookie => ({ ...cookie, host: String(cookie.domain ?? '').replace(/^\./, '') }))
    .filter(cookie => matches(hosts, cookie.host) && !(cookie.expires > 0 && cookie.expires < now));
  // A partitioned cookie belongs to one top-level site. WebView's cookie API can't keep the
  // partition, so importing it would hand it to every site; it stays behind.
  const partitioned = declared.filter(cookie => cookie.partitionKey).length;
  const cookies = declared
    .filter(cookie => !cookie.partitionKey)
    .map(cookie => ({
      url: `https://${cookie.host}${cookie.path || '/'}`,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      expires: cookie.expires > 0 ? Math.floor(cookie.expires) : -1,
      secure: !!cookie.secure,
      httpOnly: !!cookie.httpOnly,
      ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
    }));
  if (cookies.length === 0) throw toolError('NO_COOKIES', `The browser has no cookies for ${hosts.join(', ')}. Sign in there first.`);
  const name = `cookies-${manifest.id}.json`;
  const receipt = await device.submit(name, JSON.stringify({ version: 1, appletId: manifest.id, cookies }));
  if (!receipt.ok) throw toolError('COOKIES_REJECTED', `Genesis rejected the cookies: ${receipt.error ?? 'no reason given'}`);
  const domains = {};
  for (const cookie of cookies) domains[cookie.host] = (domains[cookie.host] ?? 0) + 1;
  return {
    appletId: manifest.id,
    imported: receipt.count ?? cookies.length,
    domains,
    next: 'Websites already open in the applet need Reload from the Genesis menu.',
    warnings: partitioned ? [...WARNINGS, `${partitioned} partitioned cookies were not imported: Genesis can't keep their partition.`] : WARNINGS,
  };
}
