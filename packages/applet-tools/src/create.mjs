import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { COMPAT, FRAMEWORK_VERSION } from '@genesis/core';
import { emptyDirectory, exportKit } from './kit.mjs';
import { toolError } from './manifest.mjs';

/** Escapes user-supplied text so it cannot add Markdown structure to generated records. */
function markdownValue(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}\[\]()#+.!|~-]/g, c => '\\' + c);
}

function localStamp(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offset = sign + String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0') + ':' + String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
  const local = new Date(date.getTime() + offsetMinutes * 60000).toISOString().slice(0, 19) + offset;
  return { local, file: local.slice(0, 10) + '-' + local.slice(11, 19).replaceAll(':', '') };
}

const PAGE = `import { definePageModule, list } from "@genesis/sdk/page";

/** One link on the start page. Replace it with the records your applet needs. */
export interface Link {
  text: string;
  url: string;
  /** Text of the list item or paragraph around the link. */
  around: string;
}

/** The list item or paragraph a link sits in: part of what \`read\` reads, so it is the link's extent. */
const container = (link: Element) => link.closest("li, p");

/** Query parameters that often carry a session or form token. A reader never sends those out of the page. */
const SECRET = /auth|token|csrf|xsrf|sig|session|key|nonce/i;

/** The link's address without its fragment and without token-like query parameters. */
function linkUrl(link: Element): string {
  const url = new URL((link as HTMLAnchorElement).href);
  for (const name of [...url.searchParams.keys()]) if (SECRET.test(name)) url.searchParams.delete(name);
  url.hash = "";
  return url.href;
}

/**
 * A link's key: its URL plus its occurrence among the page's links to that URL, so two links to
 * the same address keep distinct keys.
 */
function linkKey(link: Element): string {
  const url = linkUrl(link);
  const same = [...link.ownerDocument.querySelectorAll("a[href]")].filter(other => linkUrl(other) === url);
  return \`\${url}#\${same.indexOf(link)}\`;
}

/**
 * The page module runs inside every website page the applet opens. Its readers turn the page into
 * JSON for the UI's watches; it never sends page HTML, cookies or form tokens anywhere.
 */
export default definePageModule({
  readers: {
    links: list<Link>({
      root: "body",
      items: "a[href]",
      // Keys must be unique in the list. Choose items and keys the website keeps stable.
      key: linkKey,
      read: link => ({
        text: link.textContent?.trim() ?? "",
        url: linkUrl(link),
        around: container(link)?.textContent?.trim().slice(0, 200) ?? "",
      }),
      extent: link => [container(link)],
    }),
  },
});
`;

/** The router's table, shared by both templates: one route; any other URL shows the website. */
const ROUTES = `import type { RouterRoute } from "@genesis/sdk/router";

/**
 * Routes in match order. A URL without a route shows the website itself in the same session, and
 * the custom screen comes back when the page becomes one the applet knows.
 */
export const ROUTES: RouterRoute[] = [
  { id: "home", pattern: "/", screen: "home", context: "primary" },
];

/** The watch reads only on the pages its screen shows. */
export const HOME_PAGES = [{ pattern: "/" }];
`;

const REACT_MAIN = `import { memo } from "react";
import { record } from "@genesis/sdk";
import { mount, useGenesis, usePending, useRecord, useRouter, useWatch, ScrollMemory } from "@genesis/sdk/react";
import type { Link } from "./page";
import { HOME_PAGES, ROUTES } from "./routes";
import "./theme.css";

const LINKS = "home:links";

/** One row; it re-renders only when its own record or its pending inputs change. */
const LinkRow = memo(function LinkRow({ id }: { id: string }) {
  const genesis = useGenesis();
  const link = useRecord<Link>(LINKS, id);
  const target = record(LINKS, id);
  const pending = usePending(target, "primary").length > 0;
  if (!link) return null;
  // A click on the website's own link; the destination's route decides what shows.
  const open = () => void genesis.context("primary").click(target, { navigates: true });
  return (
    <li>
      <button type="button" disabled={pending} onClick={open}>{link.text || link.url}</button>
    </li>
  );
});

function Home() {
  const links = useWatch<never, Link>(LINKS, { reader: "links" }, { context: "primary", when: HOME_PAGES });
  if (links.status === "error") return <p role="alert" className="notice">This page couldn't be read. {links.error?.message}</p>;
  if (links.status === "loading") return <p role="status" className="notice">Loading…</p>;
  if (links.order.length === 0) return <p role="status" className="notice">No links on this page.</p>;
  return (
    <ScrollMemory className="screen">
      <h1>Links</h1>
      <ul className="links">
        {links.order.map(key => <LinkRow key={key} id={key} />)}
      </ul>
    </ScrollMemory>
  );
}

/** A URL without a route shows the website itself, so only routed screens render here. */
function App() {
  const { screen } = useRouter();
  return screen?.id === "home" ? <Home /> : null;
}

void mount(<App />, { router: { routes: ROUTES } });
`;

const VANILLA_MAIN = `import { connect, record, type WatchValue } from "@genesis/sdk";
import { createRouter } from "@genesis/sdk/router";
import type { Link } from "./page";
import { HOME_PAGES, ROUTES } from "./routes";
import "./theme.css";

const LINKS = "home:links";
const root = document.getElementById("root") ?? document.body.appendChild(document.createElement("div"));

function notice(text: string, role: "status" | "alert") {
  const p = document.createElement("p");
  p.className = "notice";
  p.setAttribute("role", role);
  p.textContent = text;
  return p;
}

/** Loading, empty and failure each read differently. */
function home(value: WatchValue<never, Link>, click: (key: string) => Promise<unknown>): HTMLElement {
  if (value.status === "error") return notice(\`This page couldn't be read. \${value.error?.message ?? ""}\`.trim(), "alert");
  if (value.status === "loading") return notice("Loading…", "status");
  if (value.order.length === 0) return notice("No links on this page.", "status");
  const screen = document.createElement("div");
  screen.className = "screen";
  const title = document.createElement("h1");
  title.textContent = "Links";
  const list = document.createElement("ul");
  list.className = "links";
  for (const key of value.order) {
    const link = value.records[key];
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = link.text || link.url;
    button.onclick = () => {
      button.disabled = true;
      void click(key).finally(() => { button.disabled = false; });
    };
    const item = document.createElement("li");
    item.append(button);
    list.append(item);
  }
  screen.append(title, list);
  return screen;
}

async function start() {
  const genesis = await connect();
  const router = createRouter(genesis, { routes: ROUTES });
  const primary = genesis.context("primary");
  const links = primary.watch<never, Link>(LINKS, { reader: "links" }, { when: HOME_PAGES });
  // A click on the website's own link; the destination's route decides what shows.
  const click = (key: string) => primary.click(record(LINKS, key), { navigates: true });

  /** A URL without a route shows the website itself, so only routed screens render here. */
  const render = () => {
    const screen = router.screen();
    root.replaceChildren(...(screen?.id === "home" ? [home(links.get(), click)] : []));
  };
  router.subscribe(render);
  links.subscribe(render);
  genesis.onRetired(() => {
    links.close();
    router.destroy();
  });
  render();
  // Reports the first layout; the shell then shows the UI.
  genesis.ready();
}

void start();
`;

const THEME = `:root { color-scheme: light dark; --paper: #ffffff; --ink: #182026; --line: #e6e9ec; }
@media (prefers-color-scheme: dark) { :root { --paper: #171a1c; --ink: #e7e9ea; --line: #303438; } }
html, body { margin: 0; height: 100%; background: var(--paper); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
#root, .screen { height: 100%; }
.screen { overflow-y: auto; padding: 16px; box-sizing: border-box; }
/* The shell's floating menu button covers the top-right corner. */
.screen::before { content: ""; float: right; width: 44px; height: 44px; }
.notice { padding: 16px; }
.links { list-style: none; margin: 0; padding: 0; }
.links li { border-bottom: 1px solid var(--line); }
.links button { all: unset; display: block; width: 100%; padding: 12px 0; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--genesis-accent, #2f6fde); }
`;

const TEMPLATES = {
  react: {
    entry: 'src/main.tsx',
    main: REACT_MAIN,
    dependencies: { react: '19.3.1', 'react-dom': '19.3.1' },
    devDependencies: { '@types/react': '19.3.0', '@types/react-dom': '19.3.0' },
    compilerOptions: { jsx: 'react-jsx' },
    ui: 'React, through `mount` and the hooks of `@genesis/sdk/react`',
  },
  vanilla: {
    entry: 'src/main.ts',
    main: VANILLA_MAIN,
    dependencies: {},
    devDependencies: {},
    compilerOptions: {},
    ui: 'TypeScript without a framework, through `connect` from `@genesis/sdk` and `createRouter` from `@genesis/sdk/router`',
  },
};

/** The versions the applet is built against, as the Identity section lists them. */
function compatTable() {
  return '| Version | Value |\n| --- | --- |\n'
    + `| Manifest schema | ${COMPAT.manifestSchema} |\n| Bundle format | ${COMPAT.bundleFormat} |\n`
    + `| Protocol | ${COMPAT.protocol} |\n| Page control API (\`adapterApi\`) | ${COMPAT.adapterApi} |\n`
    + `| SDK and tools | ${FRAMEWORK_VERSION} |\n| Kit | ${FRAMEWORK_VERSION} (see \`factory/kit.json\`) |`;
}

/**
 * Scaffolds a schema 6 applet from a template (`react` by default, or `vanilla`): one context, a
 * page module with one reader, one routed screen that shows one watch and runs one input.
 */
export async function createApplet(directory, options) {
  let origin;
  try { origin = new URL(options.origin ?? ''); } catch { throw toolError('USAGE', 'create requires --origin <https://host>'); }
  if (origin.protocol !== 'https:' || origin.origin !== options.origin.replace(/\/$/, '')) throw toolError('USAGE', '--origin must be an exact https://host origin');
  const templateName = options.template ?? 'react';
  const template = Object.hasOwn(TEMPLATES, templateName) ? TEMPLATES[templateName] : null;
  if (!template) throw toolError('USAGE', `--template must be one of ${Object.keys(TEMPLATES).join(', ')}`);
  const id = options.id ?? path.basename(path.resolve(directory)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9-]+$/.test(id)) throw toolError('USAGE', 'Pass --id <id> matching [a-z0-9-]+');
  const name = (options.name ?? origin.hostname).trim();
  const manifest = {
    schemaVersion: COMPAT.manifestSchema, id, name, origins: [origin.origin],
    foreground: { kind: 'web', entry: 'index.html' },
    contexts: [{ id: 'primary', startUrl: origin.origin + '/' }],
    capabilities: {},
    build: { foreground: { entry: template.entry }, page: 'src/page.ts' },
  };
  const output = await emptyDirectory(directory);
  const { local, file: stamp } = localStamp(new Date());
  const label = markdownValue(name), site = markdownValue(origin.origin);
  const packageJson = {
    name: id, version: '0.1.0', private: true, type: 'module', engines: { node: '24.15.0' },
    scripts: { check: 'genesis-applet check .', build: 'genesis-applet build .' },
    dependencies: { '@genesis/sdk': FRAMEWORK_VERSION, ...template.dependencies },
    devDependencies: { '@genesis/applet-tools': FRAMEWORK_VERSION, ...template.devDependencies },
  };
  const tsconfig = { compilerOptions: { strict: true, noEmit: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM', 'DOM.Iterable'], ...template.compilerOptions, skipLibCheck: true }, include: ['src'] };
  const files = {
    'applet.json': JSON.stringify(manifest, null, 2) + '\n',
    'package.json': JSON.stringify(packageJson, null, 2) + '\n',
    'tsconfig.json': JSON.stringify(tsconfig, null, 2) + '\n',
    '.gitignore': 'node_modules/\ndist/\n.env\n.env.*\n*.sqlite3\n*.sqlite3-*\n*.pem\n',
    'src/page.ts': PAGE,
    'src/routes.ts': ROUTES,
    [template.entry]: template.main,
    'src/theme.css': THEME,
    'src/css.d.ts': 'declare module "*.css";\n',
    'AGENTS.md': '# Applet workspace\n\nFollow [factory/AGENTS.md](factory/AGENTS.md) for every change. Read [.specs/current.md](.specs/current.md) first and keep `.specs` and `.changelog` current.\n',
    'README.md': `# ${label}\n\nA Genesis applet over ${site}. The current state is in [.specs/current.md](.specs/current.md).\n\n## Build\n\n\`\`\`sh\nnpm install\nnpm run check\nnpm run build\nnpx genesis-applet dev install . --device <serial>\n\`\`\`\n\nSetup is described in [factory/guides/getting-started.md](factory/guides/getting-started.md).\n`,
    '.specs/current.md': `# Current specification\n\n## Identity\n\nName ${label}, id \`${id}\`, origin ${site}. Created ${local}. Template \`${templateName}\`: the UI is ${template.ui}.\n\n${compatTable()}\n\n## Product scope\n\nNot established yet. Record the user's goals, preserved website workflows and exclusions here.\n\n## Contexts\n\n| Context | Start URL |\n| --- | --- |\n| primary | ${site}/ |\n\n## Routes\n\nThe router table is in \`src/routes.ts\`.\n\n| Route id | Pattern and example URL | Screen | Context | Ready reader | Loading, empty, sign-in and error | Back | Status | Evidence |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| home | \`/\`, ${site}/ | home | primary | none: ready once bound | loading, empty and error notices; no sign-in | leaves the applet from the start page | implemented | none: scaffold, not verified |\n\nAny other URL shows the website.\n\n## Page module\n\n\`src/page.ts\`: list reader \`links\`, keyed by URL and occurrence, extent the surrounding list item or paragraph. No commands. Screen \`home\` watches it as \`home:links\` and clicks a link through the page agent, by its record.\n\n## Verification\n\nNot run.\n`,
    '.specs/decisions.md': `# Decisions\n\n## decision-0001: Scaffold\n\n- Date: ${local}.\n- Choice: template \`${templateName}\`, one context \`primary\`, one route \`home\` to screen \`home\`, no storage or services.\n- Evidence: generated by \`genesis-applet create\`; nothing verified yet.\n`,
    [`.changelog/${stamp}-scaffold.md`]: `# Scaffold\n\n- Goal: start applet \`${id}\` for ${site}.\n- Changes: manifest, page module, router table, one screen, records, from the \`${templateName}\` template.\n- Verification: not run.\n`,
  };
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(output, name)), { recursive: true });
    await writeFile(path.join(output, name), content, { flag: 'wx' });
  }
  await exportKit(path.join(output, 'factory'));
  return { output, appletId: id };
}
