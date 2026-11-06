import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { readApplet, requireValue, containedFile } from './manifest.mjs';

const require = createRequire(import.meta.url);

/** esbuild plugin: adapters run in website pages, where the React foreground SDK has no place. */
export const noReactInAdapters = {
  name: 'genesis-no-react-in-adapters',
  setup(builder) {
    builder.onResolve({ filter: /^@genesis\/sdk\/react$/ }, args => ({
      errors: [{ text: `Adapters must not import @genesis/sdk/react (imported by ${args.importer})` }],
    }));
  },
};

/** Type checks the applet, validates its manifest, and checks every adapter's imports. */
export async function checkApplet(directory) {
  const applet = await readApplet(directory);
  const config = await containedFile(applet.base, 'tsconfig.json');
  const compiler = path.join(path.dirname(require.resolve('typescript/package.json')), 'lib/tsc.js');
  const result = spawnSync(process.execPath, [compiler, '-p', config, '--noEmit'], { cwd: applet.base, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  requireValue(!result.error && result.status === 0, `TypeScript check failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  for (const source of applet.manifest.sources) {
    try {
      await build({ absWorkingDir: applet.base, entryPoints: [path.join(applet.base, source.adapter)], bundle: true, write: false,
        format: 'iife', platform: 'browser', logLevel: 'silent', plugins: [noReactInAdapters], loader: { '.css': 'empty' } });
    } catch (error) {
      requireValue(false, `Adapter ${source.adapter}: ${error.errors?.map(e => e.text).join('; ') ?? error.message}`);
    }
  }
  return applet;
}
