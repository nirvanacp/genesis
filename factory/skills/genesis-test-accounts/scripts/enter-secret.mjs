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
import { spawnSync } from 'node:child_process';
import { readAccounts, fail } from './accounts-file.mjs';

const { key, device, adb, command } = parseArguments(process.argv.slice(2));
const entries = readAccounts();
if (!entries.has(key)) fail(`No key ${key} in the accounts file. Run list-accounts.mjs to see the keys.`);
const value = entries.get(key);
if (!value) fail(`${key} is empty in the accounts file. Ask the operator to fill it in.`);

const { argv: [program, ...args], forms } = command ? withSecret(command, value) : adbInputText(adb, device, value);
const result = spawnSync(program, args, { encoding: 'utf8' });
const redact = text => forms.reduce((output, form) => output.split(form).join('[redacted]'), text || '');
process.stdout.write(redact(result.stdout));
process.stderr.write(redact(result.stderr));
if (result.error) fail(`Could not run ${program}: ${result.error.code || 'failed to start'}.`);
if (result.status !== 0) fail(`${program} exited with status ${result.status}; nothing was confirmed typed.`);
process.stdout.write(`Typed ${key} into the focused field.\n`);

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
