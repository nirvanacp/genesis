import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const base = new URL('./src/', import.meta.url);
for (const name of await readdir(base)) {
  if (!name.endsWith('.mjs')) continue;
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(name, base))], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Syntax check failed: ${name}`);
}
