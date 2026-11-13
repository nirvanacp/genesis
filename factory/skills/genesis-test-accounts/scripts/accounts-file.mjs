// Reads the operator's local accounts file. Only list-accounts.mjs and
// enter-secret.mjs import this module; neither prints a value.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const KEY = /^[A-Z][A-Z0-9_]*$/;

export function accountsFilePath() {
  return process.env.GENESIS_ACCOUNTS_FILE || path.join(homedir(), '.config', 'genesis', 'accounts.env');
}

/** Returns the file's keys and values in file order. Exits with a message when the file is missing. */
export function readAccounts(file = accountsFilePath()) {
  if (!existsSync(file)) fail(`No accounts file at ${file}. Ask the operator to create it (see SKILL.md, "Accounts file").`);
  const entries = new Map();
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([^=\s]+)\s*=(.*)$/.exec(line);
    if (!match || !KEY.test(match[1])) continue;
    entries.set(match[1], unquote(match[2].trim()));
  }
  return entries;
}

/** Warnings about where the file lives and who can read it. They never mention a value. */
export function fileWarnings(file = accountsFilePath()) {
  const warnings = [];
  if ((statSync(file).mode & 0o077) !== 0) warnings.push(`${file} is readable by other users; run: chmod 600 "${file}"`);
  const repository = enclosingRepository(path.dirname(path.resolve(file)));
  if (repository) warnings.push(`${file} is inside the git repository ${repository}; move it outside every repository`);
  return warnings;
}

/**
 * `NEWS_YCOMBINATOR_COM` for `https://news.ycombinator.com`, `news.ycombinator.com` or `NEWS_YCOMBINATOR_COM`.
 * A leading `www.` is dropped, so `https://www.linkedin.com` finds `LINKEDIN_COM` keys.
 */
export function accountPrefix(hostOrUrl) {
  let host = hostOrUrl;
  try { host = new URL(hostOrUrl).hostname; } catch { /* already a host or a prefix */ }
  return host.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^WWW_/, '');
}

// Field names with an underscore must be listed here so the key splits at the right place.
export const FIELDS = ['AUTH_METHOD', 'OAUTH_ACCOUNT', 'USERNAME', 'EMAIL', 'PASSWORD', 'PHONE'];

/**
 * Splits `X_COM_PASSWORD` into prefix `X_COM` and field `PASSWORD`, and
 * `ACCOUNTS_GOOGLE_COM_AUTH_METHOD_0` into prefix, field `AUTH_METHOD` and number `0`.
 * An unknown field is the key's last word.
 */
export function parseKey(key) {
  const numbered = /^(.+)_(\d+)$/.exec(key);
  const [base, number] = numbered ? [numbered[1], numbered[2]] : [key, undefined];
  const field = FIELDS.find(name => base.endsWith('_' + name)) ?? base.slice(base.lastIndexOf('_') + 1);
  const prefix = base.length > field.length ? base.slice(0, -field.length - 1) : base;
  return { prefix, field, number };
}

/** `news.ycombinator.com` for `NEWS_YCOMBINATOR_COM`. */
export function hostOf(prefix) {
  return prefix.toLowerCase().replaceAll('_', '.');
}

/** The key prefix of the site whose sign-in form a `<provider>-oauth` method uses. */
export const OAUTH_PROVIDERS = {
  google: 'ACCOUNTS_GOOGLE_COM',
  apple: 'APPLEID_APPLE_COM',
  microsoft: 'LOGIN_LIVE_COM',
  github: 'GITHUB_COM',
  facebook: 'FACEBOOK_COM',
};

/** `{ provider, prefix }` for a method such as `google-oauth`, or null when it is not an OAuth method. */
export function oauthProvider(method) {
  const match = /^([a-z0-9]+)-oauth$/.exec(method || '');
  return match ? { provider: match[1], prefix: OAUTH_PROVIDERS[match[1]] } : null;
}

/**
 * The provider account whose USERNAME or EMAIL equals `value`: `{ number }`, with
 * `number` undefined for an unnumbered account, or null when none matches.
 */
export function findProviderAccount(entries, providerPrefix, value) {
  if (!value) return null;
  for (const [key, candidate] of entries) {
    const { prefix, field, number } = parseKey(key);
    if (prefix === providerPrefix && (field === 'USERNAME' || field === 'EMAIL') && candidate === value) return { number };
  }
  return null;
}

export function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(1);
}

function unquote(value) {
  const quoted = value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0];
  return quoted ? value.slice(1, -1) : value;
}

function enclosingRepository(directory) {
  for (let current = directory; ; current = path.dirname(current)) {
    if (existsSync(path.join(current, '.git'))) return current;
    if (path.dirname(current) === current) return null;
  }
}
