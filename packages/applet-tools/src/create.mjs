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

const ADAPTER = `import { collection, defineAdapter } from "@genesis/sdk/adapter";

/** One link on the home page. Replace it with the records your applet needs. */
export interface Link {
  text: string;
  url: string;
  /** Text of the list item or paragraph around the link. */
  around: string;
}

/** The list item or paragraph a link sits in: part of what \`read\` reads, so it is the link's extent. */
const container = (link: Element) => link.closest("li, p");

/**
 * A link's key: its URL plus its occurrence among the page's links to that URL, so two links to
 * the same address keep distinct keys.
 */
function linkKey(link: Element): string {
  const href = (link as HTMLAnchorElement).href;
  const same = [...link.ownerDocument.querySelectorAll("a[href]")].filter(other => (other as HTMLAnchorElement).href === href);
  return \`\${href}#\${same.indexOf(link)}\`;
}

export default defineAdapter({
  pages: {
    home: {
      /** Positive evidence that the page has rendered what the regions read. */
      ready: doc => doc.readyState !== "loading" && doc.body !== null,
      regions: {
        links: collection<Link>({
          root: "body",
          items: "a[href]",
          // Keys must be unique in the region: a repeated key makes the region ephemeral and
          // refuses record actions. Choose items and keys the site keeps stable.
          key: linkKey,
          read: link => ({
            text: link.textContent?.trim() ?? "",
            url: (link as HTMLAnchorElement).href,
            around: container(link)?.textContent?.trim().slice(0, 200) ?? "",
          }),
          extent: link => [container(link)],
          actions: {
            /** Follows the link in the website; the destination's route decides what shows. */
            open: link => ({ steps: [{ navigate: (link as HTMLAnchorElement).href }] }),
          },
        }),
      },
    },
  },
});
`;

const MAIN = `import { memo } from "react";
import { mountForeground, useAction, useNavigation, usePage, usePending, useRecord, useRegion, ScrollMemory, type PageView } from "@genesis/sdk/react";
import type { Link } from "./adapter";
import "./theme.css";

/** One row; it re-renders only when its own record or its pending actions change. */
const LinkRow = memo(function LinkRow({ id }: { id: string }) {
  const link = useRecord<Link>("links", id);
  const open = useAction("open", "links");
  const pending = usePending("links", id).length > 0;
  if (!link) return null;
  return (
    <li>
      <button type="button" disabled={pending} onClick={() => void open(id)}>{link.data.text || link.data.url}</button>
    </li>
  );
});

/** Loading, empty, sign-in, unsupported and failure each read differently. */
function statusText(page: PageView): string {
  switch (page.status) {
    case "ready": return "No links on this page.";
    case "error": return \`This page couldn't be read. \${page.error?.message ?? ""}\`.trim();
    case "auth": return "Sign in on the website to see this page.";
    case "unsupported": return "This page isn't supported here.";
    default: return "Loading…";
  }
}

function Home() {
  const page = usePage();
  const links = useRegion<Link>("links");
  if (links.order.length === 0) {
    return <p role={page.status === "error" ? "alert" : "status"} className="notice">{statusText(page)}</p>;
  }
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
  const { screen } = useNavigation();
  return screen?.id === "home" ? <Home /> : null;
}

void mountForeground(<App />);
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

/** The versions the applet is built against, as the Identity section lists them. */
function compatTable() {
  return '| Version | Value |\n| --- | --- |\n'
    + `| Manifest schema | ${COMPAT.manifestSchema} |\n| Bundle format | ${COMPAT.bundleFormat} |\n`
    + `| Protocol | ${COMPAT.protocol} |\n| Adapter API | ${COMPAT.adapterApi} |\n`
    + `| SDK and tools | ${FRAMEWORK_VERSION} |\n| Kit | ${FRAMEWORK_VERSION} (see \`factory/kit.json\`) |`;
}

/** Scaffolds a schema 6 applet with one context, one route, its adapter and one screen. */
export async function createApplet(directory, options) {
  let origin;
  try { origin = new URL(options.origin ?? ''); } catch { throw toolError('USAGE', 'create requires --origin <https://host>'); }
  if (origin.protocol !== 'https:' || origin.origin !== options.origin.replace(/\/$/, '')) throw toolError('USAGE', '--origin must be an exact https://host origin');
  const id = options.id ?? path.basename(path.resolve(directory)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9-]+$/.test(id)) throw toolError('USAGE', 'Pass --id <id> matching [a-z0-9-]+');
  const name = (options.name ?? origin.hostname).trim();
  const manifest = {
    schemaVersion: COMPAT.manifestSchema, id, name, origins: [origin.origin],
    foreground: { entry: 'src/main.tsx', screens: ['home'] },
    adapter: 'src/adapter.ts',
    contexts: [{ id: 'primary', startUrl: origin.origin + '/' }],
    routes: [{ id: 'home', pattern: '/', page: 'home', screen: 'home' }],
    capabilities: {},
  };
  const output = await emptyDirectory(directory);
  const { local, file: stamp } = localStamp(new Date());
  const label = markdownValue(name), site = markdownValue(origin.origin);
  const packageJson = {
    name: id, version: '0.1.0', private: true, type: 'module', engines: { node: '24.15.0' },
    scripts: { check: 'genesis-applet check .', build: 'genesis-applet build .' },
    dependencies: { '@genesis/sdk': FRAMEWORK_VERSION, react: '19.3.1', 'react-dom': '19.3.1' },
    devDependencies: { '@genesis/applet-tools': FRAMEWORK_VERSION, '@types/react': '19.3.0', '@types/react-dom': '19.3.0' },
  };
  const tsconfig = { compilerOptions: { strict: true, noEmit: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM', 'DOM.Iterable'], jsx: 'react-jsx', skipLibCheck: true }, include: ['src'] };
  const files = {
    'applet.json': JSON.stringify(manifest, null, 2) + '\n',
    'package.json': JSON.stringify(packageJson, null, 2) + '\n',
    'tsconfig.json': JSON.stringify(tsconfig, null, 2) + '\n',
    '.gitignore': 'node_modules/\ndist/\n.env\n.env.*\n*.sqlite3\n*.sqlite3-*\n*.pem\n',
    'src/adapter.ts': ADAPTER,
    'src/main.tsx': MAIN,
    'src/theme.css': THEME,
    'src/css.d.ts': 'declare module "*.css";\n',
    'AGENTS.md': '# Applet workspace\n\nFollow [factory/AGENTS.md](factory/AGENTS.md) for every change. Read [.specs/current.md](.specs/current.md) first and keep `.specs` and `.changelog` current.\n',
    'README.md': `# ${label}\n\nA Genesis applet over ${site}. The current state is in [.specs/current.md](.specs/current.md).\n\n## Build\n\n\`\`\`sh\nnpm install\nnpm run check\nnpm run build\nnpx genesis-applet dev install . --device <serial>\n\`\`\`\n\nSetup is described in [factory/guides/getting-started.md](factory/guides/getting-started.md).\n`,
    '.specs/current.md': `# Current specification\n\n## Identity\n\nName ${label}, id \`${id}\`, origin ${site}. Created ${local}.\n\n${compatTable()}\n\n## Product scope\n\nNot established yet. Record the user's goals, preserved website workflows and exclusions here.\n\n## Contexts\n\n| Context | Start URL |\n| --- | --- |\n| primary | ${site}/ |\n\n## Routes\n\n| Route | Pattern | Page | Screen | Status |\n| --- | --- | --- | --- | --- |\n| home | / | home | home | scaffold, not verified |\n\nAny other URL shows the website.\n\n## Adapter\n\nPage \`home\`: collection region \`links\` keyed by URL and occurrence, extent the surrounding list item or paragraph, action \`open\`.\n\n## Verification\n\nNot run.\n`,
    '.specs/decisions.md': `# Decisions\n\n## decision-0001: Scaffold\n\n- Date: ${local}.\n- Choice: one context \`primary\`, one route \`home\` to page and screen \`home\`, no storage or services.\n- Evidence: generated by \`genesis-applet create\`; nothing verified yet.\n`,
    [`.changelog/${stamp}-scaffold.md`]: `# Scaffold\n\n- Goal: start applet \`${id}\` for ${site}.\n- Changes: manifest, adapter, one screen, records.\n- Verification: not run.\n`,
  };
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(output, name)), { recursive: true });
    await writeFile(path.join(output, name), content, { flag: 'wx' });
  }
  await exportKit(path.join(output, 'factory'));
  return { output, appletId: id };
}
