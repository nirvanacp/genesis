import { access, mkdir, cp, readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BUNDLE_FORMAT, MANIFEST_SCHEMA_VERSION } from '@genesis/core';
import { toolError as creatorError } from './manifest.mjs';

const own = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
/** The kit, the tools and the SDK they build against share one version. */
export const VERSIONS = { kitVersion: own.version, toolsVersion: own.version, sdkVersion: own.version, manifestSchemaVersion: MANIFEST_SCHEMA_VERSION, bundleFormat: BUNDLE_FORMAT };
export async function emptyDirectory(directory) {
  const target = path.resolve(directory);
  try {
    const info = await lstat(target);
    if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(target)).length) throw creatorError('TARGET_NOT_EMPTY', 'Choose a new or empty ordinary directory');
  } catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(target, { recursive: true }); }
  return target;
}
export async function exportKit(directory) {
  const output = await emptyDirectory(directory);
  const packed = fileURLToPath(new URL('../kit/', import.meta.url));
  let source = fileURLToPath(new URL('../../../factory/', import.meta.url));
  try { await access(path.join(source, 'AGENTS.md')); }
  catch { source = packed; }
  for (const name of ['AGENTS.md','README.md','guides','skills']) await cp(path.join(source, name), path.join(output, name), { recursive: true, errorOnExist: true, force: false });
  await writeFile(path.join(output, 'kit.json'), JSON.stringify(VERSIONS, null, 2) + '\n');
  return { output, ...VERSIONS };
}
