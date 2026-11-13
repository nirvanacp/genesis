#!/usr/bin/env node
// Lists the key names in the accounts file, grouped by account, and whether
// each one has a value. Keys ending in _<n> are numbered accounts on one site.
// It prints no secret: only key names, the sign-in method, and which provider
// account an OAuth sign-in uses.
//
//   node list-accounts.mjs                         every account
//   node list-accounts.mjs https://x.com ...       only these sites (URL, host or key prefix),
//                                                  plus the provider accounts their OAuth sign-in uses
import {
  FIELDS, accountPrefix, accountsFilePath, fileWarnings, findProviderAccount, hostOf, oauthProvider, parseKey, readAccounts,
} from './accounts-file.mjs';

const file = accountsFilePath();
const entries = readAccounts(file);
const wanted = process.argv.slice(2).map(accountPrefix);

// One account per site prefix and number, in file order.
const accounts = new Map();
for (const [key, value] of entries) {
  const { prefix, field, number } = parseKey(key);
  const id = accountId(prefix, number);
  if (!accounts.has(id)) accounts.set(id, { prefix, number, fields: new Map(), keys: [] });
  const account = accounts.get(id);
  account.fields.set(field, value);
  account.keys.push({ key, field, value });
}

const shown = new Set([...accounts.keys()].filter(id => !wanted.length || wanted.includes(accounts.get(id).prefix)));
for (const id of [...shown]) {
  const linked = signIn(accounts.get(id)).provider;
  if (linked) shown.add(linked);
}

process.stdout.write(`Accounts file: ${file}\n`);
for (const warning of fileWarnings(file)) process.stdout.write(`Warning: ${warning}\n`);
if (!shown.size) process.stdout.write(wanted.length ? 'No keys for these sites.\n' : 'The file has no keys.\n');
for (const [id, account] of accounts) {
  if (!shown.has(id)) continue;
  process.stdout.write(`\n${accountName(account.prefix, account.number)}\n`);
  process.stdout.write(`  sign in: ${signIn(account).text}\n`);
  for (const { key, field, value } of account.keys) process.stdout.write(`  ${key} ${describe(field, value, account)}\n`);
}

function accountId(prefix, number) {
  return number === undefined ? prefix : `${prefix}#${number}`;
}

function accountName(prefix, number) {
  return number === undefined ? hostOf(prefix) : `${hostOf(prefix)} account ${number}`;
}

/** How to sign in to the account, and the id of the provider account an OAuth sign-in uses. */
function signIn(account) {
  const method = account.fields.get('AUTH_METHOD');
  if (!method || method === 'email-password') return { text: "the site's own form" };
  const oauth = oauthProvider(method);
  if (!oauth) return { text: `unrecognized AUTH_METHOD; ask the operator how to sign in` };
  const button = `the site's "Continue with ${capitalize(oauth.provider)}" button`;
  if (!oauth.prefix) return { text: `${button}; no provider site is known for "${oauth.provider}", ask the operator which keys to use` };
  const providerHost = hostOf(oauth.prefix);
  if (!account.fields.has('OAUTH_ACCOUNT')) return { text: `${button}; no OAUTH_ACCOUNT key names the ${providerHost} account to use` };
  const match = findProviderAccount(entries, oauth.prefix, account.fields.get('OAUTH_ACCOUNT'));
  if (!match) return { text: `${button}; OAUTH_ACCOUNT names no ${providerHost} account in the file (by number, USERNAME or EMAIL)` };
  return { text: `${button}, as ${accountName(oauth.prefix, match.number)}`, provider: accountId(oauth.prefix, match.number) };
}

/** The marker after a key: never a secret. AUTH_METHOD shows its value only when it is a known method. */
function describe(field, value, account) {
  if (!value) return '(empty)';
  if (field === 'AUTH_METHOD') return value === 'email-password' || oauthProvider(value) ? `= ${value}` : '(set, unrecognized method)';
  if (field === 'OAUTH_ACCOUNT') return signIn(account).provider ? '(set, matched)' : '(set, unmatched)';
  return FIELDS.includes(field) ? '(set)' : `(set; ${field} is not a known field name)`;
}

function capitalize(word) {
  return word[0].toUpperCase() + word.slice(1);
}
