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
// The SDK bundles @genesis/core, so its compiled output is an input too.
const core = path.dirname(require.resolve('@genesis/core'));
const hash = createHash('sha256');
for (const name of [...await inputs(path.join(cwd, 'src')), ...await inputs(core), path.join(cwd, 'package.json'), path.join(cwd, 'tsconfig.json'), fileURLToPath(import.meta.url), path.resolve(cwd, '../../tsconfig.base.json'), require.resolve('typescript/package.json'), require.resolve('esbuild/package.json')]) hash.update(await readFile(name));
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
  const outputs = ['index.js','types/index.d.ts','page.js','types/page/index.d.ts','legacy/index.js','legacy/adapter.js','legacy/react.js','types/legacy/index.d.ts','types/legacy/adapter.d.ts','types/legacy/react.d.ts'];
  const chunks = await readdir(path.join(cwd, 'dist/chunks')).catch(() => []);
  if (current !== signature || chunks.length === 0 || !(await Promise.all(outputs.map(name => stat(path.join(cwd, 'dist', name)).then(s => s.isFile()).catch(() => false)))).every(Boolean)) {
    await rm(path.join(cwd, 'dist'), { recursive: true, force: true });
    await mkdir(path.join(cwd, 'dist'), { recursive: true });
    await build({ absWorkingDir: cwd, entryPoints: { index: 'src/index.ts', page: 'src/page/index.ts', 'legacy/index': 'src/legacy/index.ts', 'legacy/adapter': 'src/legacy/adapter.ts', 'legacy/react': 'src/legacy/react.tsx' }, outdir: 'dist', bundle: true, splitting: true, chunkNames: 'chunks/[name]-[hash]', format: 'esm', platform: 'browser', target: 'es2022', external: ['react', 'react-dom/client', 'react/jsx-runtime'], jsx: 'automatic' });
    const compiler = path.join(path.dirname(require.resolve('typescript/package.json')), 'lib/tsc.js');
    const result = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.json', '--noEmit', 'false', '--declaration', '--emitDeclarationOnly', '--outDir', 'dist/types', '--rootDir', 'src'], { cwd, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('SDK declarations failed');
    await writeFile(stamp, signature);
  }
} finally { await handle.close(); await rm(lock, { force: true }); }
