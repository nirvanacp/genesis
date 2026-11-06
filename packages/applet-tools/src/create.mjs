import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_SCHEMA_VERSION } from '@genesis/core';
import { emptyDirectory, exportKit, VERSIONS } from './kit.mjs';
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

const ADAPTER = `import { defineSource } from "@genesis/sdk/source";

/** What the home screen shows. Replace it with the data your applet needs. */
export interface HomeData {
  title: string;
  links: { text: string; url: string }[];
}

export default defineSource({
  id: "main",
  routes: {
    home: {
      extract(doc): HomeData | null {
        if (doc.readyState === "loading") return null;
        const links = [...doc.querySelectorAll<HTMLAnchorElement>("a[href]")]
          .filter(a => a.textContent?.trim())
          .slice(0, 20)
          .map(a => ({ text: a.textContent!.trim(), url: a.href }));
        return { title: doc.title, links };
      },
    },
  },
});
`;

const MAIN = `import { mountForeground, useNavigation, useScreenSource, ScrollMemory } from "@genesis/sdk/react";
import type { HomeData } from "./sources/main";
import "./theme.css";

function Home() {
  const page = useScreenSource<HomeData>();
  const { navigate } = useNavigation();
  if (page.status === "error") return <p role="alert" className="notice">{page.error?.message}</p>;
  if (!page.data) return <p role="status" className="notice">Loading…</p>;
  return (
    <ScrollMemory className="screen">
      <h1>{page.data.title}</h1>
      <ul className="links">
        {page.data.links.map(link => (
          <li key={link.url}>
            <button type="button" onClick={() => navigate({ kind: "route", url: link.url })}>{link.text}</button>
          </li>
        ))}
      </ul>
    </ScrollMemory>
  );
}

function Unsupported() {
  const { screen, navigate } = useNavigation();
  const url = screen.params.url;
  return (
    <main className="screen notice">
      <p>This page has no custom screen yet.</p>
      {url && <button type="button" onClick={() => navigate({ kind: "website", url })}>Open the website</button>}
    </main>
  );
}

function App() {
  const { screen } = useNavigation();
  return screen.id === "home" ? <Home /> : <Unsupported />;
}

void mountForeground(<App />);
`;

const THEME = `:root { color-scheme: light dark; --paper: #ffffff; --ink: #182026; --line: #e6e9ec; }
@media (prefers-color-scheme: dark) { :root { --paper: #171a1c; --ink: #e7e9ea; --line: #303438; } }
html, body { margin: 0; height: 100%; background: var(--paper); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
#root, .screen { height: 100%; }
.screen { overflow-y: auto; padding: 16px; box-sizing: border-box; }
.notice { padding: 16px; }
.links { list-style: none; margin: 0; padding: 0; }
.links li { border-bottom: 1px solid var(--line); }
.links button { all: unset; display: block; width: 100%; padding: 12px 0; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--genesis-accent, #2f6fde); }
`;

/** Scaffolds an applet with one source, its adapter and two screens. */
export async function createApplet(directory, options) {
  let origin;
  try { origin = new URL(options.origin ?? ''); } catch { throw toolError('USAGE', 'create requires --origin <https://host>'); }
  if (origin.protocol !== 'https:' || origin.origin !== options.origin.replace(/\/$/, '')) throw toolError('USAGE', '--origin must be an exact https://host origin');
  const id = options.id ?? path.basename(path.resolve(directory)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9-]+$/.test(id)) throw toolError('USAGE', 'Pass --id <id> matching [a-z0-9-]+');
  const name = (options.name ?? origin.hostname).trim();
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION, id, name, origins: [origin.origin],
    foreground: { entry: 'src/main.tsx', screens: ['home', 'unsupported'] },
    sources: [{ id: 'main', startUrl: origin.origin + '/', adapter: 'src/sources/main.ts' }],
    routes: [{ id: 'home', pattern: '/', kind: 'adapted', source: 'main', screen: 'home' }],
    capabilities: {},
  };
  const output = await emptyDirectory(directory);
  const { local, file: stamp } = localStamp(new Date());
  const label = markdownValue(name), site = markdownValue(origin.origin);
  const packageJson = {
    name: id, version: '0.1.0', private: true, type: 'module', engines: { node: '24.15.0' },
    scripts: { check: 'genesis-applet check .', build: 'genesis-applet build .' },
    dependencies: { '@genesis/sdk': VERSIONS.sdkVersion, react: '19.3.1', 'react-dom': '19.3.1' },
    devDependencies: { '@genesis/applet-tools': VERSIONS.toolsVersion, '@types/react': '19.3.0', '@types/react-dom': '19.3.0' },
  };
  const tsconfig = { compilerOptions: { strict: true, noEmit: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM', 'DOM.Iterable'], jsx: 'react-jsx', skipLibCheck: true }, include: ['src'] };
  const files = {
    'applet.json': JSON.stringify(manifest, null, 2) + '\n',
    'package.json': JSON.stringify(packageJson, null, 2) + '\n',
    'tsconfig.json': JSON.stringify(tsconfig, null, 2) + '\n',
    '.gitignore': 'node_modules/\ndist/\n.env\n.env.*\n*.sqlite3\n*.sqlite3-*\n*.pem\n',
    'src/sources/main.ts': ADAPTER,
    'src/main.tsx': MAIN,
    'src/theme.css': THEME,
    'src/css.d.ts': 'declare module "*.css";\n',
    'AGENTS.md': '# Applet workspace\n\nFollow [factory/AGENTS.md](factory/AGENTS.md) for every change. Read [.specs/current.md](.specs/current.md) first and keep `.specs` and `.changelog` current.\n',
    'README.md': `# ${label}\n\nA Genesis applet over ${site}. The current state is in [.specs/current.md](.specs/current.md).\n\n## Build\n\n\`\`\`sh\nnpm install\nnpm run check\nnpm run build\nnpx genesis-applet dev install . --device <serial>\n\`\`\`\n\nSetup is described in [factory/guides/getting-started.md](factory/guides/getting-started.md).\n`,
    '.specs/current.md': `# Current specification\n\n## Identity\n\nName ${label}, id \`${id}\`, origin ${site}. Created ${local}. Manifest schema ${MANIFEST_SCHEMA_VERSION}, SDK ${VERSIONS.sdkVersion}.\n\n## Product scope\n\nNot established yet. Record the user's goals, preserved website workflows and exclusions here.\n\n## Routes\n\n| Route | Pattern | Screen | Status |\n| --- | --- | --- | --- |\n| home | / | home | scaffold, not verified |\n\nAny other URL shows the \`unsupported\` screen, which offers the website.\n\n## Verification\n\nNot run.\n`,
    '.specs/decisions.md': `# Decisions\n\n## decision-0001: Scaffold\n\n- Date: ${local}.\n- Choice: one source \`main\`, screens \`home\` and \`unsupported\`, no storage or services.\n- Evidence: generated by \`genesis-applet create\`; nothing verified yet.\n`,
    [`.changelog/${stamp}-scaffold.md`]: `# Scaffold\n\n- Goal: start applet \`${id}\` for ${site}.\n- Changes: manifest, adapter, two screens, records.\n- Verification: not run.\n`,
  };
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(output, name)), { recursive: true });
    await writeFile(path.join(output, name), content, { flag: 'wx' });
  }
  await exportKit(path.join(output, 'factory'));
  return { output, appletId: id };
}
