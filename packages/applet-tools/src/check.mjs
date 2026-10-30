import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readApplet, requireValue, containedFile } from './manifest.mjs';
const require = createRequire(import.meta.url);
export async function checkApplet(directory) {
  const applet = await readApplet(directory);
  const config = await containedFile(applet.base, 'tsconfig.json');
  const compiler = path.join(path.dirname(require.resolve('typescript/package.json')), 'lib/tsc.js');
  const result = spawnSync(process.execPath, [compiler, '-p', config, '--noEmit'], { cwd: applet.base, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  requireValue(!result.error && result.status === 0, `TypeScript check failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  return applet;
}
