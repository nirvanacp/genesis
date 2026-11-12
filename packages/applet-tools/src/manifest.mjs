import { readFile, realpath, stat } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseSourceManifest } from '@genesis/core';

export function toolError(code, message) { return Object.assign(new Error(message), { code }); }
export function requireValue(condition, message) { if (!condition) throw toolError('INVALID_PACKAGE', message); }

/** A relative path of plain segments, the only form the host accepts for bundle files. */
export function safePath(value) {
  return typeof value === 'string' && !path.posix.isAbsolute(value) && !value.includes('\\') && !value.includes('\0')
    && value.split('/').every(part => part && part !== '.' && part !== '..');
}

/** Resolves `name` under `base`, refusing paths that leave it through `..` or symlinks. */
export async function containedFile(base, name) {
  requireValue(safePath(name), `Unsafe relative file path: ${name}`);
  const root = await realpath(base), file = await realpath(path.join(root, name));
  requireValue(file.startsWith(root + path.sep) && (await stat(file)).isFile(), `${name} escapes the applet or is not a regular file`);
  return file;
}

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function readService(value, file) {
  const keys = ['serviceId', 'entry', 'healthPath', 'port', 'environment'];
  requireValue(value && typeof value === 'object' && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), `${file} must have exactly ${keys.join(', ')}`);
  requireValue(Number.isInteger(value.port) && value.port >= 1024 && value.port <= 65535, `${file}: port must be 1024-65535`);
  requireValue(/^\/[a-z0-9/-]+$/.test(value.healthPath), `${file}: invalid healthPath`);
  const environment = ['token', 'database', 'port', 'certificate', 'key'];
  requireValue(value.environment && environment.every(k => /^[A-Z][A-Z0-9_]+$/.test(value.environment[k] ?? '')) && Object.keys(value.environment).length === environment.length, `${file}: environment must name ${environment.join(', ')}`);
  return value;
}

/**
 * Reads and validates `applet.json` with the schema rules in `@genesis/core`, splitting it into
 * the manifest the bundle carries and the `build` section only the tools use. Also loads the
 * service declaration `serviceFile`, or the first declared service's config when none is given.
 */
export async function readApplet(directory, { serviceFile } = {}) {
  const base = await realpath(directory);
  let json;
  try { json = JSON.parse(await readFile(path.join(base, 'applet.json'), 'utf8')); }
  catch (error) { throw toolError('INVALID_PACKAGE', `Cannot read ${path.join(base, 'applet.json')}: ${error.message}`); }
  const exists = relative => {
    const file = path.join(base, relative);
    return existsSync(file) && statSync(file).isFile();
  };
  const parsed = parseSourceManifest(json, exists);
  if ('errors' in parsed) {
    throw toolError('INVALID_MANIFEST', `applet.json is invalid:\n${parsed.errors.map(e => `  ${e.path || '/'}: ${e.message}`).join('\n')}`);
  }
  const { manifest, build } = parsed;
  const declared = manifest.capabilities.services ?? [];
  const config = serviceFile ?? declared[0]?.config;
  let service;
  if (config) {
    const declaration = declared.find(s => s.config === config);
    requireValue(declaration, `${config} is not a declared service config`);
    service = readService(JSON.parse(await readFile(await containedFile(base, config), 'utf8')), config);
    requireValue(service.serviceId === declaration.id, `${config}: serviceId must be ${declaration.id}`);
    await containedFile(base, service.entry);
  }
  return { base, manifest, build, service };
}
