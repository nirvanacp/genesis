import { access, mkdir, cp, readdir, writeFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { creatorError } from './device.mjs';
export const KIT_VERSION = '0.4.0';
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
  await writeFile(path.join(output, 'kit.json'), JSON.stringify({ kitVersion: KIT_VERSION, sdkVersion: '0.4.0', toolsVersion: '0.4.0', runtimeApiVersion: 3, bundleFormatVersion: 1 }, null, 2) + '\n');
  return { output, kitVersion: KIT_VERSION, runtimeApiVersion: 3 };
}
