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

/** `NEWS_YCOMBINATOR_COM` for `https://news.ycombinator.com`, `news.ycombinator.com` or `NEWS_YCOMBINATOR_COM`. */
export function accountPrefix(hostOrUrl) {
  let host = hostOrUrl;
  try { host = new URL(hostOrUrl).hostname; } catch { /* already a host or a prefix */ }
  return host.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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
