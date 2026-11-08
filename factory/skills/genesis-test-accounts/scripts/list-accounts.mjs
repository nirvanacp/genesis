#!/usr/bin/env node
// Lists the key names in the accounts file, grouped by account, and whether
// each one has a value. It never prints a value.
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
  const split = key.lastIndexOf('_');
  const prefix = split > 0 ? key.slice(0, split) : key;
  if (!accounts.has(prefix)) accounts.set(prefix, []);
  accounts.get(prefix).push(`${key} (${value ? 'set' : 'empty'})`);
}

process.stdout.write(`Accounts file: ${file}\n`);
for (const warning of fileWarnings(file)) process.stdout.write(`Warning: ${warning}\n`);
if (!accounts.size) process.stdout.write(wanted.length ? 'No keys for these sites.\n' : 'The file has no keys.\n');
for (const [prefix, keys] of accounts) {
  process.stdout.write(`\n${prefix.toLowerCase().replaceAll('_', '.')}\n`);
  for (const key of keys) process.stdout.write(`  ${key}\n`);
}
