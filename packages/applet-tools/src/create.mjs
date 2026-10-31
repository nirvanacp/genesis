import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyDirectory, exportKit } from './kit.mjs';
import { identifier, validateManifest } from './manifest.mjs';
import { creatorError } from './device.mjs';
export async function createApplet(directory, options) {
  if (!identifier.test(options.id ?? '') || typeof options.name !== 'string' || !options.name.trim() || !options.source) throw creatorError('USAGE', 'create requires --id <stable-id> --name <display-name> --source <https-url>');
  const url = new URL(options.source);
  const manifest = { schemaVersion: 2, id: options.id, name: options.name.trim(), dataSchemaVersion: 1,
    sources: [{ id: 'main', startUrl: url.href, entry: 'src/main.ts', homePaths: [url.pathname], routeContractId: 'site' }],
    routeContracts: [{id:'site',origins:[url.origin],unmatched:'unsupported',routes:[{id:'home',path:url.pathname,result:{kind:'custom',screen:'home',adapter:'home'}}]}],
    foreground:{pageId:'app',screens:['home']},
    pages: [{ id: 'app', entry: options.react ? 'src/home.tsx' : 'src/home.ts' }], actions: [], capabilities: ['dom'] };
  validateManifest(manifest);
  const output = await emptyDirectory(directory); await mkdir(path.join(output, 'src'));
  const packageJson = { name: options.id, version: '0.1.0', private: true, type: 'module', engines: { node: '24.15.0' },
    scripts: { check: 'genesis-applet check .', build: 'genesis-applet build . --out dist' },
    dependencies: { '@genesis/sdk': '0.4.0', ...(options.react ? { react: '19.3.1', 'react-dom': '19.3.1' } : {}) },
    devDependencies: { '@genesis/applet-tools': '0.4.0', ...(options.react ? { '@types/react': '19.3.0', '@types/react-dom': '19.3.0' } : {}) } };
  const config = { compilerOptions: { strict: true, noEmit: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022','DOM','DOM.Iterable'], jsx: 'react-jsx', skipLibCheck: true }, include: ['src'] };
  const files = { 'applet.json': JSON.stringify(manifest,null,2)+'\n', 'package.json': JSON.stringify(packageJson,null,2)+'\n', 'tsconfig.json': JSON.stringify(config,null,2)+'\n',
    '.gitignore': 'node_modules/\ndist/\n.env\n.env.*\n*.sqlite3\n*.sqlite3-*\n*.pem\n.genesis-private/\n',
    'start.sh': '#!/usr/bin/env bash\nset -euo pipefail\napplet_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"\nif [[ -d "$applet_dir/backend" ]]; then\n  printf "%s\\n" "Backend added: update start.sh to start every required service. See factory/guides/services-and-data.md." >&2\n  exit 1\nfi\nprintf "%s\\n" "No local backend required by this applet."\n',
    'AGENTS.md': '# Applet workspace\n\nRead and follow [factory/AGENTS.md](factory/AGENTS.md) for all applet changes. This workspace owns application code and data; it consumes the Genesis SDK and tools.\n',
    'README.md': `# ${options.name.trim()}\n\nSource: ${url.origin}. This starter separates a hidden source adapter from an owned foreground and declares an explicit URL contract. Inspect the actual source DOM before implementing extraction or controls.\n\nRead [factory/AGENTS.md](factory/AGENTS.md). Install the matching SDK/tools artifacts supplied by the Genesis maintainer, then run npm run check and npm run build. See [the workflow](factory/guides/getting-started.md) for development installation into a compatible prebuilt debug host. Dependencies are not yet published to a public registry.\n\nDocument the desired screens/actions, supported routes, data authority, service setup, and verified behavior here as the applet develops. No backend or persistent records are configured by this starter.\n`,
    'src/main.ts': `import { defineSourceAdapter } from '@genesis/sdk';\n\n// Inspect the website and publish a validated content model. Never mount foreground UI here.\nexport default defineSourceAdapter({adapters:['home'],activate(context) {\n  void context.source.publish({state:'unsupported'});\n}});\n`,
    'src/styles.css': 'body { line-height: 1.6; }\n',
    'src/assets.d.ts': 'declare module "*.css" { const css: string; export default css; }\n' };
  if (!options.react) files['src/home.ts'] = `import {defineForeground} from '@genesis/sdk';\nexport default defineForeground({screens:['home'],mount(context,root){\n  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Loading…';\n  const open=document.createElement('button');open.textContent='Open website';open.onclick=()=>void context.webViews.open({url:${JSON.stringify(url.href)}});\n  root.append(status,open);context.source.subscribe(snapshot=>{status.textContent=snapshot.state==='loading'?'Loading…':'This page is not available yet.';});\n}});\n`;
  if (options.react) files['src/home.tsx'] = `import { defineForeground } from '@genesis/sdk';\nimport { mountReact } from '@genesis/sdk/react';\n\nexport default defineForeground({\n  screens:['home'],\n  mount(context, container) {\n    return mountReact(context, container, <main><h1>My applet</h1><p>Your applet-owned page is ready to customize.</p></main>);\n  },\n});\n`;
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(output, name), content, { flag: 'wx', ...(name === 'start.sh' ? { mode: 0o755 } : {}) });
  await exportKit(path.join(output, 'factory'));
  return { output, appletId: manifest.id, dependenciesInstalled: false };
}
