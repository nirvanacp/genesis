#!/usr/bin/env node
// Lists the key names in the accounts file, grouped by account, and whether
// each one has a value. Keys ending in _<n> are numbered accounts on one site.
// It never prints a value.
//
//   node list-accounts.mjs                         every account
//   node list-accounts.mjs https://x.com ...       only these sites (URL, host or key prefix)
import { accountPrefix, accountsFilePath, fileWarnings, readAccounts } from './accounts-file.mjs';

const file = accountsFilePath();
const entries = readAccounts(file);
const wanted = process.argv.slice(2).map(accountPrefix);
const accounts = new Map();

for (const [key, value] of entries) {
  if (wanted.length && !wanted.some(prefix => key.startsWith(prefix + '_'))) continue;
  const name = accountName(key);
  if (!accounts.has(name)) accounts.set(name, []);
  accounts.get(name).push(`${key} (${value ? 'set' : 'empty'})`);
}

// HOST_FIELD is one account; HOST_FIELD_<n> is account <n> on a site with several.
function accountName(key) {
  const numbered = /^(.+)_[A-Z]+_(\d+)$/.exec(key);
  if (numbered) return `${hostOf(numbered[1])} account ${numbered[2]}`;
  const split = key.lastIndexOf('_');
  return hostOf(split > 0 ? key.slice(0, split) : key);
}

function hostOf(prefix) {
  return prefix.toLowerCase().replaceAll('_', '.');
}

process.stdout.write(`Accounts file: ${file}\n`);
for (const warning of fileWarnings(file)) process.stdout.write(`Warning: ${warning}\n`);
if (!accounts.size) process.stdout.write(wanted.length ? 'No keys for these sites.\n' : 'The file has no keys.\n');
for (const [name, keys] of accounts) {
  process.stdout.write(`\n${name}\n`);
  for (const key of keys) process.stdout.write(`  ${key}\n`);
}
