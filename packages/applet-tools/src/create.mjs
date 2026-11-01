import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyDirectory, exportKit } from './kit.mjs';
import { identifier, validateManifest } from './manifest.mjs';
import { creatorError } from './device.mjs';
// Escape user-supplied scalars so generated records cannot introduce Markdown structure.
function markdownValue(value) {
  return JSON.stringify(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, character => '\\' + character);
}
export async function createApplet(directory, options) {
  if (!identifier.test(options.id ?? '') || typeof options.name !== 'string' || !options.name.trim() || !options.source) throw creatorError('USAGE', 'create requires --id <stable-id> --name <display-name> --source <https-url>');
  const url = new URL(options.source);
  const manifest = { schemaVersion: 3, id: options.id, name: options.name.trim(), dataSchemaVersion: 1,
    sources: [{ id: 'main', startUrl: url.href, entry: 'src/main.ts', homePaths: [url.pathname], routeContractId: 'site' }],
    navigation:{external:{default:'website',origins:[]},uncoveredWebsiteRecovery:true},websiteActions:[{id:'original-page',contractId:'site',routeIds:['home'],label:'Open original website',reason:'Continue on the original website while this custom screen is unavailable'}],
    routeContracts: [{id:'site',defaultSourceId:'main',origins:[url.origin],unmatched:'unsupported',routes:[{id:'home',path:url.pathname,result:{kind:'custom',screen:'home',adapter:'home',title:'Home'}}]}],
    foreground:{pageId:'app',screens:['home']},
    pages: [{ id: 'app', entry: options.react ? 'src/home.tsx' : 'src/home.ts' }], actions: [], capabilities: ['dom'] };
  validateManifest(manifest);
  const output = await emptyDirectory(directory);
  for (const name of ['src', '.specs', '.changelog']) await mkdir(path.join(output, name));
  const created = new Date();
  const local = new Date(created.getTime() - created.getTimezoneOffset() * 60000).toISOString();
  const stamp = local.slice(0, 10) + '-' + local.slice(11, 19).replaceAll(':', '');
  const displayName = markdownValue(options.name.trim());
  const sourceLabel = markdownValue(url.href);
  const packageJson = { name: options.id, version: '0.1.0', private: true, type: 'module', engines: { node: '24.15.0' },
    scripts: { check: 'genesis-applet check .', build: 'genesis-applet build . --out dist' },
    dependencies: { '@genesis/sdk': '0.5.1', ...(options.react ? { react: '19.3.1', 'react-dom': '19.3.1' } : {}) },
    devDependencies: { '@genesis/applet-tools': '0.5.0', ...(options.react ? { '@types/react': '19.3.0', '@types/react-dom': '19.3.0' } : {}) } };
  const config = { compilerOptions: { strict: true, noEmit: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022','DOM','DOM.Iterable'], jsx: 'react-jsx', skipLibCheck: true }, include: ['src'] };
  const files = { 'applet.json': JSON.stringify(manifest,null,2)+'\n', 'package.json': JSON.stringify(packageJson,null,2)+'\n', 'tsconfig.json': JSON.stringify(config,null,2)+'\n',
    '.gitignore': 'node_modules/\ndist/\n.env\n.env.*\n*.sqlite3\n*.sqlite3-*\n*.pem\n.genesis-private/\n',
    'start.sh': '#!/usr/bin/env bash\nset -euo pipefail\napplet_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"\nif [[ -d "$applet_dir/backend" ]]; then\n  printf "%s\\n" "Backend added: update start.sh to start every required service. See factory/guides/services-and-data.md." >&2\n  exit 1\nfi\nprintf "%s\\n" "No local backend required by this applet."\n',
    'AGENTS.md': '# Applet workspace\n\nRead and follow [factory/AGENTS.md](factory/AGENTS.md) for all applet changes. Read .specs/current.md and relevant decisions first; maintain flat .specs and .changelog records under factory rules. This workspace owns application code and data; it consumes the Genesis SDK and tools.\n',
    'README.md': `# ${displayName}

Source: ${sourceLabel}. Read [current specs](.specs/current.md), [decisions](.specs/decisions.md) and [factory instructions](factory/AGENTS.md).

Install matching maintainer-supplied SDK/tools archives and generated dependencies, then run npm run check and npm run build. See [setup](factory/guides/getting-started.md). Packages are not published to a public registry. The adapter is unimplemented; no backend or persistent records are configured. Configure the native shell/menu default during authoring unless explicitly overridden.
`,
    '.specs/current.md': `# Current applet specification

## Identity and context

Name: ${displayName}. Stable ID: ${options.id}. Base/canonical source candidate: ${sourceLabel}. Origin: ${markdownValue(url.origin)}. Source main, foreground page app, route contract site, home screen/adapter. No services. SDK 0.5.1, tools 0.5.0, runtime API 4, manifest schema 3, data/bundle schema 1. Kit metadata: factory/kit.json. Created ${local}; website canonical destination and user timezone must be confirmed from context.

## Product scope

Product features, preserved workflows, account/data authority, delivery target and exclusions are not yet established. One applet identity is scaffolded. No user-approved exclusions or completed website inspection are recorded.

## Applied defaults and overrides

| Rule ID | Current choice | Origin and reason | Decision / limit |
| --- | --- | --- | --- |
| default-platform-menu | Configure shell/menu during authoring; absent from scaffold | Factory default | decision-0001; no menu positioning API |
| default-pending-skeletons | Static themed placeholders included | Factory default | Adapt shapes to inspected routes |

No explicit user overrides recorded. Apply remaining [defaults](../factory/guides/defaults.md) when implementing the product.

## Route inventory

| Journey/example URL | Rule/source | Adapter/model/renderer | Evidence and cue | Back/Return | Implementation | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Supplied entry: ${sourceLabel} | site/home, main | home adapter / owned app page | Readiness unimplemented; original-page website recovery declaration | Must verify opener return | planned | not-run |

## Interaction inventory

| Control/entity | Result/owner | Authorization | Pending/error/uncertainty | Back/Return | Implementation | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Open original website | Explicit original-page navigation / host | User click only, no submission | Scaffold recovery only | Host Return | implemented scaffold | not-run |

## Current work and verification

Inspect authorized website, establish product scope and inventories, implement validated adapter/model/renderer, configure native shell/menu unless overridden, and verify actual journeys. Adapter reports ADAPTER_NOT_IMPLEMENTED. Scaffold code exists; product implementation is planned. All verification is not-run. No source, device, account or backend behavior is qualified.
`,
    '.specs/decisions.md': `# Applet decisions

## decision-0001: Scaffold baseline

- Date and origin: ${local}, creator-generated baseline using supplied name/ID/URL; no inferred user design approval.
- Choice and rationale: Separate hidden source and owned foreground under schema 3/API 4. Shell/menu default remains to be configured during authoring. Preserve stable ID ${options.id}.
- Evidence and supersession: applet.json and source files; adapter unimplemented, checks not run. Supersedes none. Record later product choices here and keep current.md authoritative.
`,
    ['.changelog/' + stamp + '-scaffold.md']: `# Initial scaffold

- Goal: Initialize applet ${options.id} from supplied source ${sourceLabel}.
- Changes: Created source/foreground placeholders, manifest, operator start script, factory guidance and current specifications/decision records.
- Decisions: Creator baseline at ${local}, linked in [decision-0001](../.specs/decisions.md). No product exclusions or user design overrides inferred; native menu awaits authoring configuration.
- Verification: Not run. Adapter unimplemented; no live source, device or backend qualification. Follow [current work](../.specs/current.md).
`,
    'src/main.ts': `import { defineSourceAdapter } from '@genesis/sdk';\n\n// Inspect the website and publish a validated content model. Never mount foreground UI here.\nexport default defineSourceAdapter({adapters:['home'],activate(context) {\n  void context.source.publish({state:'unsupported',error:{code:'ADAPTER_NOT_IMPLEMENTED',retryable:false,message:'This applet adapter has not been implemented yet.'}});\n}});\n`,
    'src/styles.css': 'body { line-height: 1.6; }\n',
    'src/assets.d.ts': 'declare module "*.css" { const css: string; export default css; }\n' };
  files['src/styles.css'] = `body{line-height:1.6}:host{background:var(--applet-paper,#fff)!important;color:var(--applet-ink,#182026)!important}main{min-height:100dvh;padding:16px;background:var(--applet-paper,#fff);color:var(--applet-ink,#182026)}.skeleton{padding:16px 0}.skeleton-row{padding:20px 0;border-bottom:1px solid #e6e9ec}.skeleton-block{display:block;background:#eceff1;height:12px;border-radius:5px;margin:0 0 14px;max-width:100%}.skeleton-title{width:46%;height:16px}.skeleton-line{width:92%}.skeleton-short{width:66%}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(prefers-color-scheme:dark){:host,main{--applet-paper:#171a1c;--applet-ink:#e7e9ea}.skeleton-block{background:#303438}.skeleton-row{border-color:#303438}}`;
  const statusText = `snapshot.state==='ready'?'Content is ready. Add your validated model renderer.':snapshot.state==='empty'?'Nothing here yet.':snapshot.state==='auth-required'?'Sign in on the website.':snapshot.state==='challenge'?'The website needs your attention.':snapshot.error?.message??'Continue on the website.'`;
  if (!options.react) files['src/home.ts'] = `import {defineForeground,createNavigationControl} from '@genesis/sdk';
import css from './styles.css';
export default defineForeground({screens:['home'],mount(context,root){
  const style=document.createElement('style');style.textContent=css;
  const skeleton=document.createElement('section');skeleton.className='skeleton';skeleton.setAttribute('role','status');skeleton.setAttribute('aria-label','Loading content');skeleton.setAttribute('aria-busy','true');
  const status=document.createElement('p');status.setAttribute('role','status');
  for(let i=0;i<3;i++){const row=document.createElement('div');row.className='skeleton-row';row.setAttribute('aria-hidden','true');for(const kind of ['title','line','short']){const block=document.createElement('span');block.className='skeleton-block skeleton-'+kind;row.append(block);}skeleton.append(row);}
  let currentUrl=${JSON.stringify(url.href)};
  const open=createNavigationControl(context,{target:{kind:'url',url:currentUrl,websiteActionId:'original-page'},label:'Open original website'});open.hidden=true;
  root.append(style,skeleton,status,open);context.source.subscribe(snapshot=>{const pending=snapshot.state==='loading';currentUrl=snapshot.url;skeleton.hidden=!pending;status.hidden=pending;open.hidden=['loading','ready','empty','blocked'].includes(snapshot.state);root.setAttribute('aria-busy',String(pending));status.textContent=pending?'':${statusText};});
}});
`;
  if (options.react) files['src/home.tsx'] = `import {useEffect,useState} from 'react';
import {defineForeground,type AppletContext,type SourceSnapshot} from '@genesis/sdk';
import {mountReact,NavigationLink} from '@genesis/sdk/react';
import css from './styles.css';
function Skeleton(){return <section className="skeleton" role="status" aria-label="Loading content" aria-busy="true"><span className="sr-only">Loading content</span><div aria-hidden="true">{[0,1,2].map(i=><div className="skeleton-row" key={i}><span className="skeleton-block skeleton-title"/><span className="skeleton-block skeleton-line"/><span className="skeleton-block skeleton-short"/></div>)}</div></section>;}
function App({context}:{context:AppletContext}){
  const [snapshot,setSnapshot]=useState<SourceSnapshot|null>(null);
  useEffect(()=>context.source.subscribe(setSnapshot),[context]);
  return <main aria-busy={!snapshot||snapshot.state==='loading'}><style>{css}</style><h1>My applet</h1>{!snapshot||snapshot.state==='loading'?<Skeleton/>:<p role="status">{${statusText}}</p>}{snapshot&&!['loading','ready','empty','blocked'].includes(snapshot.state)&&<NavigationLink context={context} target={{kind:'url',url:snapshot.url,websiteActionId:snapshot.route?.kind==='matched'&&snapshot.route.result.kind==='custom'?'original-page':undefined}}>Open original website</NavigationLink>}</main>;
}
export default defineForeground({screens:['home'],mount(context,root){return mountReact(context,root,<App context={context}/>);}});
`;
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(output, name), content, { flag: 'wx', ...(name === 'start.sh' ? { mode: 0o755 } : {}) });
  await exportKit(path.join(output, 'factory'));
  return { output, appletId: manifest.id, dependenciesInstalled: false };
}
