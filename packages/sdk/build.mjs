import { build } from 'esbuild';
import { mkdir, rm, readFile, writeFile, readdir, open, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
const cwd = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);
async function inputs(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...await inputs(name)); else result.push(name);
  }
  return result.sort();
}
const hash = createHash('sha256');
for (const name of [...await inputs(path.join(cwd, 'src')), path.join(cwd, 'package.json'), path.join(cwd, 'tsconfig.json'), fileURLToPath(import.meta.url), path.resolve(cwd, '../../tsconfig.base.json'), require.resolve('typescript/package.json'), require.resolve('esbuild/package.json')]) hash.update(await readFile(name));
const signature = hash.digest('hex');
const lock = path.join(cwd, '.build-lock');
let handle;
for (let attempt = 0; attempt < 300; attempt++) {
  try { handle = await open(lock, 'wx'); await handle.writeFile(String(process.pid)); break; }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await readFile(lock, 'utf8').catch(() => ''));
    if (pid > 0) {
      try { process.kill(pid, 0); }
      catch (alive) { if (alive.code === 'ESRCH') { await rm(lock, { force: true }); continue; } }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
if (!handle) throw new Error('Timed out waiting for the SDK artifact builder');
try {
  const stamp = path.join(cwd, 'dist/.build-stamp');
  const current = await readFile(stamp, 'utf8').catch(() => '');
  const outputs = ['index.js','react.js','runtime.js','manifest.js','types/index.d.ts','types/manifest.d.ts','types/react.d.ts','types/bootstrap.d.ts'];
  if (current !== signature || !(await Promise.all(outputs.map(name => stat(path.join(cwd, 'dist', name)).then(s => s.isFile()).catch(() => false)))).every(Boolean)) {
    await rm(path.join(cwd, 'dist'), { recursive: true, force: true });
    await mkdir(path.join(cwd, 'dist'), { recursive: true });
    await build({ absWorkingDir: cwd, entryPoints: { index: 'src/index.ts', react: 'src/react.tsx', runtime: 'src/bootstrap.ts', manifest: 'src/manifest.ts' }, outdir: 'dist', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', external: ['react', 'react-dom/client', 'react/jsx-runtime'], jsx: 'automatic', loader: { '.css': 'text' } });
    const compiler = path.join(path.dirname(require.resolve('typescript/package.json')), 'lib/tsc.js');
    const result = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.json', '--noEmit', 'false', '--declaration', '--emitDeclarationOnly', '--outDir', 'dist/types', '--rootDir', 'src'], { cwd, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('SDK declarations failed');
    await writeFile(stamp, signature);
  }
} finally { await handle.close(); await rm(lock, { force: true }); }
