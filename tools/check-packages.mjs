import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApplet, requireValue, safePath } from '../packages/applet-tools/src/manifest.mjs';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function readPackages() {
  const selection = JSON.parse(await readFile(path.join(root, 'genesis.packages.json'), 'utf8'));
  requireValue(selection.schemaVersion === 1 && Array.isArray(selection.applets) && new Set(selection.applets).size === selection.applets.length, 'Invalid bundle selection');
  const packages = [], ids = new Set();
  for (const directory of selection.applets) {
    requireValue(safePath(directory), 'Invalid selected directory');
    const base = await realpath(path.join(root, directory));
    requireValue(base.startsWith(root + path.sep), 'Selected applet escapes workspace');
    const applet = await readApplet(base);
    requireValue(!ids.has(applet.manifest.id), 'Duplicate selected applet ID'); ids.add(applet.manifest.id); packages.push(applet);
  }
  return packages;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const packages = await readPackages(); console.log(`Package checks passed: ${packages.map(p => p.manifest.id).join(', ')}. Device qualification is recorded separately.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
