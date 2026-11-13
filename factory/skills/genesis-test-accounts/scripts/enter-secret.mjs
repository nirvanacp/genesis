#!/usr/bin/env node
// Types one value from the accounts file into the field that has focus on the
// device. The value never reaches this script's output; the child command's
// output is shown with the value replaced by [redacted].
//
//   node enter-secret.mjs <KEY> [--device <serial>] [--adb <path>]
//       Types with `adb shell input text`.
//   node enter-secret.mjs <KEY> -- <command> [args...]
//       Runs your device tool's text command. One argument must contain
//       {secret}; the script replaces it with the value.
//
// For a *_TOTP_SECRET key it types the current six-digit authenticator code,
// never the secret itself.
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readAccounts, fail, parseKey } from './accounts-file.mjs';

const { key, device, adb, command } = parseArguments(process.argv.slice(2));
const entries = readAccounts();
if (!entries.has(key)) fail(`No key ${key} in the accounts file. Run list-accounts.mjs to see the keys.`);
if (!entries.get(key)) fail(`${key} is empty in the accounts file. Ask the operator to fill it in.`);
const isTotp = parseKey(key).field === 'TOTP_SECRET';
const value = isTotp ? await currentCode(entries.get(key)) : entries.get(key);

const { argv: [program, ...args], forms } = command ? withSecret(command, value) : adbInputText(adb, device, value);
const result = spawnSync(program, args, { encoding: 'utf8' });
const redact = text => forms.reduce((output, form) => output.split(form).join('[redacted]'), text || '');
process.stdout.write(redact(result.stdout));
process.stderr.write(redact(result.stderr));
if (result.error) fail(`Could not run ${program}: ${result.error.code || 'failed to start'}.`);
if (result.status !== 0) fail(`${program} exited with status ${result.status}; nothing was confirmed typed.`);
process.stdout.write(isTotp ? `Typed the current code from ${key} into the focused field.\n` : `Typed ${key} into the focused field.\n`);

function parseArguments(argv) {
  const separator = argv.indexOf('--');
  const own = separator < 0 ? argv : argv.slice(0, separator);
  const options = { key: undefined, device: undefined, adb: 'adb', command: separator < 0 ? undefined : argv.slice(separator + 1) };
  for (let index = 0; index < own.length; index++) {
    const argument = own[index];
    if (argument === '--device') options.device = own[++index];
    else if (argument === '--adb') options.adb = own[++index];
    else if (!options.key && !argument.startsWith('--')) options.key = argument;
    else fail(`Unknown argument ${argument}.`);
  }
  if (!options.key) fail('Usage: enter-secret.mjs <KEY> [--device <serial>] [--adb <path>] [-- <command> ... {secret} ...]');
  if (options.command && !options.command.length) fail('Give a command after --.');
  if (options.command && !options.command.some(part => part.includes('{secret}'))) fail('The command after -- needs an argument containing {secret}.');
  return options;
}

function withSecret(command, value) {
  return { argv: command.map(part => part.replaceAll('{secret}', value)), forms: [value] };
}

// `adb shell` hands its argument to the device shell, so the value is single-quoted
// there. `input text` reads %s as a space and handles printable ASCII only.
function adbInputText(adbPath, serial, value) {
  if (!/^[\x21-\x7e ]+$/.test(value)) fail('adb input text types printable ASCII only. Pass your device tool\'s text command after --.');
  if (value.includes('%s')) fail('adb input text reads %s as a space. Pass your device tool\'s text command after --.');
  const spaced = value.replaceAll(' ', '%s');
  const quoted = spaced.replaceAll("'", "'\\''");
  // Longest form first, so a shorter form never splits a longer one before it is replaced.
  const forms = [...new Set([quoted, spaced, value])].sort((a, b) => b.length - a.length);
  return { argv: [adbPath, ...(serial ? ['-s', serial] : []), 'shell', `input text '${quoted}'`], forms };
}

// RFC 6238 code: HMAC-SHA1, 30-second steps, six digits. The secret is base32, or an
// otpauth:// URI holding one. Near the end of a step it waits for the next, so the
// code is still valid when the site checks it.
async function currentCode(stored) {
  let secret = stored;
  if (stored.startsWith('otpauth://')) {
    // The URI holds the secret, so a parse error must not echo it.
    try {
      secret = new URL(stored).searchParams.get('secret') || '';
    } catch {
      fail('The TOTP secret is not a valid otpauth:// URI. Ask the operator to check it.');
    }
  }
  const key = base32(secret);
  if (!key.length) fail('The TOTP secret is not base32. Ask the operator to check it.');
  const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remaining < 5) await new Promise(resolve => setTimeout(resolve, remaining * 1000 + 250));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

function base32(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  if (!/^[A-Z2-7]+$/.test(clean)) return Buffer.alloc(0);
  let bits = '';
  for (const character of clean) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}
