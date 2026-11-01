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
    dependencies: { '@genesis/sdk': '0.4.1', ...(options.react ? { react: '19.3.1', 'react-dom': '19.3.1' } : {}) },
    devDependencies: { '@genesis/applet-tools': '0.4.2', ...(options.react ? { '@types/react': '19.3.0', '@types/react-dom': '19.3.0' } : {}) } };
  const config = { compilerOptions: { strict: true, noEmit: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022','DOM','DOM.Iterable'], jsx: 'react-jsx', skipLibCheck: true }, include: ['src'] };
  const files = { 'applet.json': JSON.stringify(manifest,null,2)+'\n', 'package.json': JSON.stringify(packageJson,null,2)+'\n', 'tsconfig.json': JSON.stringify(config,null,2)+'\n',
    '.gitignore': 'node_modules/\ndist/\n.env\n.env.*\n*.sqlite3\n*.sqlite3-*\n*.pem\n.genesis-private/\n',
    'start.sh': '#!/usr/bin/env bash\nset -euo pipefail\napplet_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"\nif [[ -d "$applet_dir/backend" ]]; then\n  printf "%s\\n" "Backend added: update start.sh to start every required service. See factory/guides/services-and-data.md." >&2\n  exit 1\nfi\nprintf "%s\\n" "No local backend required by this applet."\n',
    'AGENTS.md': '# Applet workspace\n\nRead and follow [factory/AGENTS.md](factory/AGENTS.md) for all applet changes. This workspace owns application code and data; it consumes the Genesis SDK and tools.\n',
    'README.md': `# ${options.name.trim()}\n\nSource: ${url.origin}. This starter separates a hidden source adapter from an owned foreground and declares an explicit URL contract. Inspect the actual source DOM before implementing extraction or controls.\n\nRead [factory/AGENTS.md](factory/AGENTS.md). Install the matching SDK/tools artifacts supplied by the Genesis maintainer, then run npm run check and npm run build. See [the workflow](factory/guides/getting-started.md) for development installation into a compatible prebuilt debug host. Dependencies are not yet published to a public registry.\n\nDocument the desired screens/actions, supported routes, data authority, service setup, and verified behavior here as the applet develops. The source adapter is an explicit unimplemented placeholder. Implement inspected readiness, empty, failure and loading observations before delivery; ready data still needs its own validated foreground renderer. No backend or persistent records are configured by this starter.\n`,
    'src/main.ts': `import { defineSourceAdapter } from '@genesis/sdk';\n\n// Inspect the website and publish a validated content model. Never mount foreground UI here.\nexport default defineSourceAdapter({adapters:['home'],activate(context) {\n  void context.source.publish({state:'unsupported',error:{code:'ADAPTER_NOT_IMPLEMENTED',retryable:false,message:'This applet adapter has not been implemented yet.'}});\n}});\n`,
    'src/styles.css': 'body { line-height: 1.6; }\n',
    'src/assets.d.ts': 'declare module "*.css" { const css: string; export default css; }\n' };
  files['src/styles.css'] = `body{line-height:1.6}.skeleton{padding:16px 0}.skeleton-row{padding:20px 0;border-bottom:1px solid #e6e9ec}.skeleton-block{display:block;background:#eceff1;height:12px;border-radius:5px;margin:0 0 14px;max-width:100%}.skeleton-title{width:46%;height:16px}.skeleton-line{width:92%}.skeleton-short{width:66%}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(prefers-color-scheme:dark){.skeleton-block{background:#303438}.skeleton-row{border-color:#303438}}`;
  const statusText = `snapshot.state==='ready'?'Content is ready. Add your validated model renderer.':snapshot.state==='empty'?'Nothing here yet.':snapshot.state==='auth-required'?'Sign in on the website.':snapshot.state==='challenge'?'The website needs your attention.':snapshot.error?.message??'Continue on the website.'`;
  if (!options.react) files['src/home.ts'] = `import {defineForeground} from '@genesis/sdk';
import css from './styles.css';
export default defineForeground({screens:['home'],mount(context,root){
  const style=document.createElement('style');style.textContent=css;
  const skeleton=document.createElement('section');skeleton.className='skeleton';skeleton.setAttribute('role','status');skeleton.setAttribute('aria-label','Loading content');skeleton.setAttribute('aria-busy','true');
  const status=document.createElement('p');status.setAttribute('role','status');
  for(let i=0;i<3;i++){const row=document.createElement('div');row.className='skeleton-row';row.setAttribute('aria-hidden','true');for(const kind of ['title','line','short']){const block=document.createElement('span');block.className='skeleton-block skeleton-'+kind;row.append(block);}skeleton.append(row);}
  let currentUrl=${JSON.stringify(url.href)};
  const open=document.createElement('button');open.hidden=true;open.textContent='Open website';open.onclick=()=>void context.webViews.open({url:currentUrl});
  root.append(style,skeleton,status,open);context.source.subscribe(snapshot=>{const pending=snapshot.state==='loading';currentUrl=snapshot.url;skeleton.hidden=!pending;status.hidden=pending;open.hidden=['loading','ready','empty','blocked'].includes(snapshot.state);root.setAttribute('aria-busy',String(pending));status.textContent=pending?'':${statusText};});
}});
`;
  if (options.react) files['src/home.tsx'] = `import {useEffect,useState} from 'react';
import {defineForeground,type AppletContext,type SourceSnapshot} from '@genesis/sdk';
import {mountReact} from '@genesis/sdk/react';
import css from './styles.css';
function Skeleton(){return <section className="skeleton" role="status" aria-label="Loading content" aria-busy="true"><span className="sr-only">Loading content</span><div aria-hidden="true">{[0,1,2].map(i=><div className="skeleton-row" key={i}><span className="skeleton-block skeleton-title"/><span className="skeleton-block skeleton-line"/><span className="skeleton-block skeleton-short"/></div>)}</div></section>;}
function App({context}:{context:AppletContext}){
  const [snapshot,setSnapshot]=useState<SourceSnapshot|null>(null);
  useEffect(()=>context.source.subscribe(setSnapshot),[context]);
  return <main aria-busy={!snapshot||snapshot.state==='loading'}><style>{css}</style><h1>My applet</h1>{!snapshot||snapshot.state==='loading'?<Skeleton/>:<p role="status">{${statusText}}</p>}{snapshot&&!['loading','ready','empty','blocked'].includes(snapshot.state)&&<button onClick={()=>void context.webViews.open({url:snapshot.url})}>Open website</button>}</main>;
}
export default defineForeground({screens:['home'],mount(context,root){return mountReact(context,root,<App context={context}/>);}});
`;
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(output, name), content, { flag: 'wx', ...(name === 'start.sh' ? { mode: 0o755 } : {}) });
  await exportKit(path.join(output, 'factory'));
  return { output, appletId: manifest.id, dependenciesInstalled: false };
}
